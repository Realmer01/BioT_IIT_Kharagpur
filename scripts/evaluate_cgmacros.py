"""Validation study on REAL data (CGMacros, 45 adults: normal / prediabetes / T2D).

Protocol (no leakage):
* 5-fold leave-patients-out CV, stratified by glycaemic group. Test patients are
  never seen by the ML layer.
* Each test patient's twin is personalised only on their own onboarding window
  (first 40 % of the record, max 4 days); all metrics are computed on the later
  "monitor" period, which neither the twin nor the ML layer has seen.
* Identical rows and folds for every model, so differences are attributable to
  the data streams / components added (ablation).

Usage:  python scripts/evaluate_cgmacros.py
Output: reports/metrics_cgmacros.json, reports/oof_cgmacros.parquet, reports/meals_cgmacros.parquet
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.stats import pearsonr
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import StratifiedGroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from madhutwin.config import HORIZONS, PROCESSED, RANDOM_SEED, REPORTS  # noqa: E402
from madhutwin.data import cgmacros  # noqa: E402
from madhutwin.features import feature_groups  # noqa: E402
from madhutwin.ml import metrics as MT  # noqa: E402
from madhutwin.ml.models import (ALPHA, CLF_PARAMS, cqr_offset, fit_classifier, fit_quantiles,  # noqa: E402
                                 fit_regressor)


def feature_sets(cols):
    g = feature_groups(cols)
    ctx = g["context"]
    return {
        "EHR only": g["ehr"] + ctx,
        "CGM only": g["cgm"] + ctx,
        "CGM + EHR": g["cgm"] + g["ehr"] + ctx,
        "Wearable streams": g["cgm"] + g["wearable"] + g["meal"] + ctx,
        "Fusion (streams + EHR)": g["cgm"] + g["wearable"] + g["meal"] + g["ehr"] + ctx,
        "MadhuTwin hybrid": g["cgm"] + g["wearable"] + g["meal"] + g["ehr"] + ctx + g["twin"],
    }


REG_SETS = ["CGM only", "CGM + EHR", "Wearable streams", "Fusion (streams + EHR)", "MadhuTwin hybrid"]
COND_SETS = ["Fusion (streams + EHR)", "MadhuTwin hybrid"]
CLF_SETS = ["EHR only", "CGM only", "Wearable streams", "Fusion (streams + EHR)", "MadhuTwin hybrid"]


def meal_table(df: pd.DataFrame, ehr: pd.DataFrame) -> pd.DataFrame:
    """One row per isolated meal: features at meal time + observed 2-h response."""
    rows = []
    for pid, g in df.groupby("patient_id"):
        minute, meals = cgmacros.load_subject(pid)
        t0 = minute["time"].iloc[0]
        nat = minute["cgm"].to_numpy(float)
        locf = pd.Series(nat).ffill(limit=15).to_numpy()
        mm = ((pd.to_datetime(meals["time"]) - t0).dt.total_seconds() // 60).astype(int).to_numpy()
        gmin = g["minute"].to_numpy()
        for i, m in enumerate(mm):
            if meals["carbs"].iloc[i] < 10 or m + 125 >= len(nat):
                continue
            others = mm[(mm > m) & (mm <= m + 90)]
            if len(others):
                continue
            win = nat[m:m + 121]
            if np.isfinite(win).sum() < 20 or not np.isfinite(locf[m]):
                continue
            j = np.flatnonzero((gmin >= m) & (gmin <= m + 4))
            if len(j) == 0:
                continue
            r = g.iloc[j[0]]
            pre = locf[m]
            grid = pd.Series(win).ffill().to_numpy()[::5]
            rows.append({**r.to_dict(), "meal_minute": m, "g_pre": pre,
                         "peak_rise": float(np.nanmax(win) - pre),
                         "iauc": float(np.nansum(np.maximum(grid - pre, 0)) * 5),
                         "m_carbs": meals["carbs"].iloc[i], "m_protein": meals["protein"].iloc[i],
                         "m_fat": meals["fat"].iloc[i], "m_fiber": meals["fiber"].iloc[i],
                         "m_kcal": meals["kcal"].iloc[i]})
    return pd.DataFrame(rows)


def main():
    t_start = time.time()
    df = pd.read_parquet(PROCESSED / "cgmacros_features.parquet")
    df = df.dropna(axis=1, how="all")
    ehr = cgmacros.load_ehr()
    feat_cols = [c for c in df.columns if c.startswith(("cgm_", "wear_", "meal_", "ehr_", "ctx_", "twin_"))]
    FS = feature_sets(feat_cols)
    groups_by_pid = df.groupby("patient_id")["group"].first()
    pids = groups_by_pid.index.to_numpy()

    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    folds = list(sgkf.split(pids, groups_by_pid.to_numpy(), groups=pids))

    train_mask_phase = df["phase"].eq("monitor")  # train only on post-onboarding rows (same as test)
    oof = []
    for k, (tr_i, te_i) in enumerate(folds):
        tr_p, te_p = set(pids[tr_i]), set(pids[te_i])
        tr = df[df["patient_id"].isin(tr_p) & train_mask_phase]
        te = df[df["patient_id"].isin(te_p) & df["phase"].eq("monitor")].copy()
        g0_tr, g0_te = tr["g0"].to_numpy(), te["g0"].to_numpy()
        t = time.time()
        for h in HORIZONS:
            te[f"Persistence|{h}"] = g0_te
            te[f"Linear trend|{h}"] = np.clip(g0_te + te["cgm_d30"].to_numpy() / 30 * h, 40, 400)
            te[f"Twin only (physiology)|{h}"] = g0_te + te[f"twin_d{h}"].to_numpy()
            dy = tr[f"y_{h}"].to_numpy() - g0_tr
            for name in REG_SETS:
                m = fit_regressor(tr[FS[name]], dy)
                te[f"{name}|{h}"] = g0_te + m.predict(te[FS[name]])
            # conditional ("if no new food") forecasters: trained on windows without a logged meal
            dyc = np.where(tr["next_meal_min"].to_numpy() > h, dy, np.nan)
            for name in COND_SETS:
                m = fit_regressor(tr[FS[name]], dyc)
                te[f"{name} [conditional]|{h}"] = g0_te + m.predict(te[FS[name]])
            # conformalised quantile regression for the hybrid model
            rng = np.random.default_rng(RANDOM_SEED + k)
            tr_pids = np.array(sorted(tr_p))
            cal = set(rng.choice(tr_pids, size=len(tr_pids) // 4, replace=False))
            is_cal = tr["patient_id"].isin(cal).to_numpy()
            Xh = tr[FS["MadhuTwin hybrid"]]
            q = fit_quantiles(Xh[~is_cal], dyc[~is_cal])  # deployed intervals are conditional
            off = cqr_offset(q, Xh[is_cal], dyc[is_cal])
            qp = q.predict(te[FS["MadhuTwin hybrid"]])
            te[f"lo|{h}"] = g0_te + qp[:, 0] - off
            te[f"hi|{h}"] = g0_te + qp[:, 1] + off
        for ev in ("ev_hyper", "ev_spike", "ev_hypo"):
            for name in CLF_SETS:
                m = fit_classifier(tr[FS[name]], tr[ev].to_numpy())
                te[f"P[{ev}]|{name}"] = m.predict_proba(te[FS[name]])[:, 1] if m is not None else np.nan
        te["fold"] = k
        oof.append(te)
        print(f"fold {k}: train {len(tr):,} rows / {len(tr_p)} pts, test {len(te):,} rows / {len(te_p)} pts "
              f"({time.time() - t:.0f}s)")
    oof = pd.concat(oof, ignore_index=True)

    # ------------------------------------------------------------------ regression metrics
    reg_models = ["Persistence", "Linear trend", "Twin only (physiology)"] + REG_SETS
    results = {"regression": {}, "regression_by_group": {}, "regression_postprandial": {}}
    post = oof["meal_min_since"].to_numpy() <= 180
    for name in reg_models:
        results["regression"][name] = {h: MT.regression_report(oof[f"y_{h}"].to_numpy(), oof[f"{name}|{h}"].to_numpy())
                                       for h in HORIZONS}
        results["regression_postprandial"][name] = {
            h: MT.regression_report(oof[f"y_{h}"].to_numpy()[post], oof[f"{name}|{h}"].to_numpy()[post]) for h in HORIZONS}
        results["regression_by_group"][name] = {
            grp: {h: MT.regression_report(sub[f"y_{h}"].to_numpy(), sub[f"{name}|{h}"].to_numpy()) for h in HORIZONS}
            for grp, sub in oof.groupby("group")}

    # ------------------------------------------------------------------ conditional forecasts (meal-free windows)
    results["regression_conditional"] = {}
    cond_models = ["Persistence", "Twin only (physiology)", "Fusion (streams + EHR)", "MadhuTwin hybrid"]
    cond_models += [f"{n} [conditional]" for n in COND_SETS]
    for name in cond_models:
        results["regression_conditional"][name] = {}
        for h in HORIZONS:
            free = oof["next_meal_min"].to_numpy() > h
            results["regression_conditional"][name][h] = MT.regression_report(
                oof[f"y_{h}"].to_numpy()[free], oof[f"{name}|{h}"].to_numpy()[free])

    # ------------------------------------------------------------------ intervals (conditional, as deployed)
    results["intervals"] = {}
    for h in HORIZONS:
        y = np.where(oof["next_meal_min"].to_numpy() > h, oof[f"y_{h}"].to_numpy(), np.nan)
        ok = np.isfinite(y)
        lo, hi = oof[f"lo|{h}"].to_numpy()[ok], oof[f"hi|{h}"].to_numpy()[ok]
        results["intervals"][h] = {"nominal": 1 - ALPHA, "coverage": float(np.mean((y[ok] >= lo) & (y[ok] <= hi))),
                                   "mean_width": float(np.mean(hi - lo))}

    # ------------------------------------------------------------------ events
    results["events"] = {}
    for ev in ("ev_hyper", "ev_spike", "ev_hypo"):
        results["events"][ev] = {name: MT.classification_report(oof[ev].to_numpy(), oof[f"P[{ev}]|{name}"].to_numpy())
                                 for name in CLF_SETS}
    results["episodes"] = {name: MT.episode_lead_times(oof, f"P[ev_hyper]|{name}") for name in CLF_SETS}

    # ------------------------------------------------------------------ meal-level PPGR
    meals = meal_table(df, ehr)
    meals["fold"] = meals["patient_id"].map({p: k for k, (_, te_i) in enumerate(folds) for p in pids[te_i]})
    preds = {n: np.full(len(meals), np.nan) for n in ("Carbs only (linear)", "Macros (linear)", "Twin only (physiology)",
                                                       "Fusion ML (no twin)", "MadhuTwin hybrid")}
    reg_small = dict(n_estimators=250, learning_rate=0.04, max_depth=3, min_child_weight=10, subsample=0.8,
                     colsample_bytree=0.7, n_jobs=12, random_state=RANDOM_SEED)
    macro = ["m_carbs", "m_protein", "m_fat", "m_fiber", "m_kcal"]
    for k in range(5):
        tr, te = meals["fold"] != k, (meals["fold"] == k) & meals["phase"].eq("monitor")
        y = meals.loc[tr, "peak_rise"].to_numpy()
        preds["Carbs only (linear)"][te] = LinearRegression().fit(meals.loc[tr, ["m_carbs"]], y).predict(meals.loc[te, ["m_carbs"]])
        preds["Macros (linear)"][te] = LinearRegression().fit(meals.loc[tr, macro].fillna(0), y).predict(meals.loc[te, macro].fillna(0))
        lr = LinearRegression().fit(meals.loc[tr, ["twin_peak120"]], y)
        preds["Twin only (physiology)"][te] = lr.predict(meals.loc[te, ["twin_peak120"]])
        for name, fs in (("Fusion ML (no twin)", FS["Fusion (streams + EHR)"]), ("MadhuTwin hybrid", FS["MadhuTwin hybrid"])):
            m = xgb.XGBRegressor(**reg_small).fit(meals.loc[tr, fs], y)
            preds[name][te] = m.predict(meals.loc[te, fs])
    te_all = meals["phase"].eq("monitor").to_numpy()
    results["meal_ppgr"] = {"n_meals_test": int(te_all.sum()), "n_meals_total": int(len(meals)), "models": {}}
    for name, p in preds.items():
        y = meals["peak_rise"].to_numpy()[te_all]
        pp = p[te_all]
        r = pearsonr(y, pp)
        results["meal_ppgr"]["models"][name] = {"pearson_r": float(r.statistic), "p_value": float(r.pvalue),
                                                "mae": float(np.mean(np.abs(y - pp)))}
        meals[f"pred|{name}"] = p

    # ------------------------------------------------------------------ twin physiology
    twins = pd.read_parquet(PROCESSED / "cgmacros_twins.parquet")
    results["twin"] = {
        "prior_rmse": {h: float(twins[f"prior_rmse_{h}"].mean()) for h in (30, 60, 90, 120)},
        "personalised_rmse": {h: float(twins[f"fit_rmse_{h}"].mean()) for h in (30, 60, 90, 120)},
        "si_vs_homa_ir_spearman": float(twins["param_SI"].corr(twins["homa_ir"], method="spearman")),
        "di_vs_hba1c_spearman": float(twins["pheno_disposition_index"].corr(twins["hba1c"], method="spearman")),
        "gb_vs_fpg_spearman": float(twins["param_Gb"].corr(twins["fpg"], method="spearman")),
    }
    results["dataset"] = {
        "participants": int(df["patient_id"].nunique()),
        "groups": groups_by_pid.value_counts().to_dict(),
        "feature_rows": int(len(df)),
        "test_rows": int(len(oof)),
        "monitored_days": float(results["episodes"]["MadhuTwin hybrid"]["monitored_days"]),
        "n_features": {k: len(v) for k, v in FS.items()},
        "runtime_s": round(time.time() - t_start, 1),
    }
    with open(REPORTS / "metrics_cgmacros.json", "w") as f:
        json.dump(results, f, indent=2, default=float)
    keep = ["patient_id", "group", "minute", "time", "g0", "fold", "meal_min_since", "next_meal_min"] + \
           [c for c in oof.columns if "|" in c or c.startswith(("y_", "ev_"))]
    oof[keep].to_parquet(REPORTS / "oof_cgmacros.parquet", index=False)
    meals.to_parquet(REPORTS / "meals_cgmacros.parquet", index=False)

    # ------------------------------------------------------------------ console summary
    print("\nRMSE (mg/dL) on unseen patients, monitor period")
    tab = pd.DataFrame({n: {h: results["regression"][n][h]["rmse"] for h in HORIZONS} for n in reg_models}).T
    print(tab.round(1).to_string())
    print("\nCONDITIONAL RMSE on meal-free windows")
    print(pd.DataFrame({n: {h: results["regression_conditional"][n][h]["rmse"] for h in HORIZONS} for n in cond_models}).T.round(1).to_string())
    print("\nHyperglycaemia onset (>180 within 2h) AUROC / AUPRC")
    for n in CLF_SETS:
        r = results["events"]["ev_hyper"][n]
        e = results["episodes"][n]
        print(f"  {n:26s} AUROC {r['auroc']:.3f}  AUPRC {r['auprc']:.3f}  episodes detected>=15min "
              f"{e['episode_sensitivity']:.2f}  median lead {e['median_lead_min']:.0f} min  FA/day {e['false_alerts_per_day']:.2f}")
    print("\nSpike (+50 within 2h) AUROC:", {n: round(results['events']['ev_spike'][n].get('auroc', float('nan')), 3) for n in CLF_SETS})
    print("Hypo (<70 within 1h):", {n: round(results['events']['ev_hypo'][n].get('auroc', float('nan')), 3) for n in CLF_SETS},
          "prevalence", round(results["events"]["ev_hypo"]["CGM only"].get("prevalence", 0), 4))
    print("\nIntervals:", {h: (round(v['coverage'], 3), round(v['mean_width'], 1)) for h, v in results["intervals"].items()})
    print("\nMeal PPGR (peak rise) Pearson r:", {n: round(v['pearson_r'], 3) for n, v in results['meal_ppgr']['models'].items()},
          "n =", results["meal_ppgr"]["n_meals_test"])
    print("\nTwin:", json.dumps(results["twin"], indent=1))
    print(f"\nDone in {time.time() - t_start:.0f}s")


if __name__ == "__main__":
    main()
