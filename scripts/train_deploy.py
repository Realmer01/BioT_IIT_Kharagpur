"""Train the deployed hybrid forecaster (real CGMacros + synthetic Bharat cohort).

* 5 folds over Bharat patients; every fold trains on ALL CGMacros participants plus
  4/5 of the Bharat cohort, and predicts the held-out Bharat patients.
* The dashboard shows, for each patient, predictions from the fold model that
  never saw that patient, so nothing on screen is in-sample.
* Metrics on held-out Bharat patients are reported separately and labelled
  SYNTHETIC (they add drug-induced hypoglycaemia, sleep and step streams that
  CGMacros does not contain).

Usage:  python scripts/train_deploy.py
Output: models/fold_{k}.joblib, models/assignments.json, reports/metrics_bharat.json,
        data/processed/bharat_predictions.parquet
"""
import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from madhutwin.config import HORIZONS, MODELS, PROCESSED, RANDOM_SEED, REPORTS  # noqa: E402
from madhutwin.features import feature_groups  # noqa: E402
from madhutwin.ml import metrics as MT  # noqa: E402
from madhutwin.ml.models import HybridForecaster, fit_classifier, fit_regressor  # noqa: E402


def main():
    t0 = time.time()
    real = pd.read_parquet(PROCESSED / "cgmacros_features.parquet")
    syn = pd.read_parquet(PROCESSED / "bharat_features.parquet")
    real["source"] = "real"
    syn["source"] = "synthetic"
    df = pd.concat([real, syn], ignore_index=True)
    feats = [c for c in df.columns if c.startswith(("cgm_", "wear_", "meal_", "ehr_", "ctx_", "twin_"))]
    feats = [c for c in feats if df[c].notna().any()]
    g = feature_groups(feats)
    no_twin = [c for c in feats if not c.startswith("twin_")]

    syn_groups = syn.groupby("patient_id")["group"].first()
    pids = syn_groups.index.to_numpy()
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=RANDOM_SEED)
    folds = list(sgkf.split(pids, syn_groups.to_numpy(), groups=pids))
    real_train = df[(df["source"] == "real") & df["phase"].eq("monitor")]

    preds, assign = [], {}
    for k, (tr_i, te_i) in enumerate(folds):
        t = time.time()
        tr_p, te_p = set(pids[tr_i]), set(pids[te_i])
        tr = pd.concat([real_train, df[df["patient_id"].isin(tr_p) & df["phase"].eq("monitor")]], ignore_index=True)
        te = df[df["patient_id"].isin(te_p)].copy()
        hf = HybridForecaster(features=feats).fit(tr)
        hf.meta.update(fold=k, test_patients=sorted(te_p))
        out = hf.predict(te)
        te = pd.concat([te, out], axis=1)
        # ablation comparators on the same rows (monitor period only, evaluated below)
        for h in HORIZONS:
            dy = tr[f"y_{h}"].to_numpy() - tr["g0"].to_numpy()
            dy = np.where(tr["next_meal_min"].to_numpy() > h, dy, np.nan)  # conditional, like the deployed model
            m = fit_regressor(tr[no_twin], dy)
            te[f"notwin_{h}"] = te["g0"].to_numpy() + m.predict(te[no_twin])
        for ev in ("ev_hyper", "ev_hypo"):
            m = fit_classifier(tr[no_twin], tr[ev].to_numpy())
            te[f"notwin_p_{ev}"] = m.predict_proba(te[no_twin])[:, 1] if m is not None else np.nan
        joblib.dump(hf, MODELS / f"fold_{k}.joblib")
        for p in te_p:
            assign[p] = k
        preds.append(te)
        print(f"fold {k}: trained on {len(tr):,} rows ({tr.patient_id.nunique()} pts), "
              f"predicted {len(te):,} rows ({len(te_p)} pts) in {time.time() - t:.0f}s")
    P = pd.concat(preds, ignore_index=True)

    ev = P[P["phase"].eq("monitor")]
    res = {"note": "SYNTHETIC Bharat cohort, held-out patients, monitor period; forecasts are conditional "
                   "('if no new food') and scored on windows without a logged meal",
           "regression": {}, "events": {}, "episodes": {}}
    for name, col in (("Persistence", None), ("Fusion (no twin)", "notwin_{h}"), ("MadhuTwin hybrid", "pred_{h}")):
        res["regression"][name] = {}
        for h in HORIZONS:
            free = ev["next_meal_min"].to_numpy() > h
            p = ev["g0"].to_numpy() if col is None else ev[col.format(h=h)].to_numpy()
            res["regression"][name][h] = MT.regression_report(ev[f"y_{h}"].to_numpy()[free], p[free])
    for e in ("ev_hyper", "ev_spike", "ev_hypo"):
        res["events"][e] = {"MadhuTwin hybrid": MT.classification_report(ev[e].to_numpy(), ev[f"p_{e}"].to_numpy())}
        if f"notwin_p_{e}" in ev:
            res["events"][e]["Fusion (no twin)"] = MT.classification_report(ev[e].to_numpy(), ev[f"notwin_p_{e}"].to_numpy())
    res["episodes"]["MadhuTwin hybrid"] = MT.episode_lead_times(ev, "p_ev_hyper")
    res["episodes"]["Fusion (no twin)"] = MT.episode_lead_times(ev, "notwin_p_ev_hyper")
    # hypoglycaemia episodes (onset < 70 mg/dL)
    hyp = ev.copy()
    hyp["g0_neg"] = -hyp["g0"]
    hyp_eval = hyp.rename(columns={"g0": "g0_orig", "g0_neg": "g0"})
    res["episodes_hypo"] = {
        "MadhuTwin hybrid": MT.episode_lead_times(hyp_eval, "p_ev_hypo", level=-70.0, window=60, min_lead=10),
        "Fusion (no twin)": MT.episode_lead_times(hyp_eval, "notwin_p_ev_hypo", level=-70.0, window=60, min_lead=10),
    }
    res["episodes_hypo_by_threshold"] = {str(t): MT.episode_lead_times(hyp_eval, "p_ev_hypo", thr=t, level=-70.0, window=60, min_lead=10)
                                         for t in (0.25, 0.5)}
    res["hypo_alert_threshold_dashboard"] = 0.25
    res["intervals"] = {}
    for h in HORIZONS:
        y = np.where(ev["next_meal_min"].to_numpy() > h, ev[f"y_{h}"].to_numpy(), np.nan)
        ok = np.isfinite(y)
        res["intervals"][h] = {"coverage": float(np.mean((y[ok] >= ev[f"lo_{h}"].to_numpy()[ok]) & (y[ok] <= ev[f"hi_{h}"].to_numpy()[ok]))),
                               "mean_width": float(np.mean(ev[f"hi_{h}"].to_numpy()[ok] - ev[f"lo_{h}"].to_numpy()[ok]))}
    res["n_patients"] = int(ev["patient_id"].nunique())
    res["n_rows"] = int(len(ev))
    res["runtime_s"] = round(time.time() - t0, 1)
    with open(REPORTS / "metrics_bharat.json", "w") as f:
        json.dump(res, f, indent=2, default=float)
    with open(MODELS / "assignments.json", "w") as f:
        json.dump({"features": feats, "patient_fold": assign}, f, indent=1)
    keep = ["patient_id", "minute", "time", "g0", "phase", "next_meal_min"] + [c for c in P.columns if c.startswith(
        ("pred_", "lo_", "hi_", "p_ev_", "y_", "ev_"))]
    P[keep].to_parquet(PROCESSED / "bharat_predictions.parquet", index=False)

    print("\nSYNTHETIC held-out RMSE:")
    print(pd.DataFrame({n: {h: v[h]["rmse"] for h in HORIZONS} for n, v in res["regression"].items()}).T.round(1).to_string())
    for e, d in res["events"].items():
        print(e, {n: round(r.get("auroc", float("nan")), 3) for n, r in d.items()}, "prev", round(d["MadhuTwin hybrid"].get("prevalence", 0), 4))
    print("hyper episodes:", res["episodes"])
    print("hypo episodes:", res["episodes_hypo"])
    print("intervals:", {h: (round(v["coverage"], 3), round(v["mean_width"], 1)) for h, v in res["intervals"].items()})
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
