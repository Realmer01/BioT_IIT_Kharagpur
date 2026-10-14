"""Where does the physiological twin (and the EHR) add value? Two pre-specified analyses.

A. Cold start — EHR fusion inside the twin.
   The EHR sets the Bayesian prior; the streams update it. We personalise each
   CGMacros twin with 0 / 0.5 / 1 / 2 / 4 days of onboarding data, using either
   the patient's own EHR prior or a one-size-fits-all population prior, and score
   the twin's 60/120-min forecasts on the same later test period.

B. Data efficiency — physics as an inductive bias.
   ML layers are trained on 6 / 12 / 24 / 36 patients (inside the same 5
   leave-patients-out folds) with and without twin features.

Usage:  python scripts/analysis_twin_value.py [--skip-learning-curve]
Output: reports/twin_value.json
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.model_selection import StratifiedGroupKFold

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from madhutwin.config import PROCESSED, RANDOM_SEED, REPORTS  # noqa: E402
from madhutwin.data import cgmacros  # noqa: E402
from madhutwin.physiology import calibrate as C  # noqa: E402
from madhutwin.pipeline import onboarding_minutes  # noqa: E402
from madhutwin.twin import DigitalTwin, prepare_arrays, slice_arrays  # noqa: E402

ONBOARD_DAYS = [0, 0.5, 1, 2, 4]


def _cold_start_one(pid, ehr_row, pop_ehr):
    minute, meals = cgmacros.load_subject(pid)
    A = prepare_arrays(minute, meals)
    test_start = onboarding_minutes(A["n"])
    starts, tg = C._fit_targets(A["cgm"], every=5)
    keep = starts >= test_start
    starts, tg = starts[keep], tg[keep]
    out = []
    for prior_name, ehr in (("EHR prior", ehr_row), ("Population prior", {**pop_ehr, "weight_kg": pop_ehr["weight_kg"]})):
        for d in ONBOARD_DAYS:
            tw = DigitalTwin.from_ehr(pid, ehr)
            n_on = int(d * 1440)
            if n_on > 0:
                tw.personalise(slice_arrays(A, 0, min(n_on, test_start)))
            st = tw.sync(A)
            fc = tw.forecast(A, st, starts, A["cgm"][starts])
            err = fc[:, C.FIT_HORIZONS] - tg
            out.append({"patient_id": pid, "prior": prior_name, "days": d,
                        "mse_60": float(np.nanmean(err[:, 1] ** 2)), "mse_120": float(np.nanmean(err[:, 3] ** 2))})
    return out


def cold_start():
    ehr = cgmacros.load_ehr()
    pop = {k: float(ehr[k].median()) for k in ("hba1c", "fpg", "fasting_insulin", "weight_kg")}
    rows = Parallel(n_jobs=-1)(delayed(_cold_start_one)(r["subject_id"], r.to_dict(), pop) for _, r in ehr.iterrows())
    df = pd.DataFrame([x for r in rows for x in r])
    summ = df.groupby(["prior", "days"])[["mse_60", "mse_120"]].mean().pipe(np.sqrt).round(2)
    summ.columns = ["rmse_60", "rmse_120"]
    # paired per-patient comparison at each onboarding length
    piv = df.pivot_table(index=["patient_id", "days"], columns="prior", values="mse_120").reset_index()
    wins = piv.groupby("days").apply(lambda g: float(np.mean(g["EHR prior"] < g["Population prior"])), include_groups=False)
    return {"table": {f"{p}|{d}": v for (p, d), v in summ.to_dict(orient="index").items()},
            "ehr_prior_better_share_120": wins.round(3).to_dict()}


def learning_curve():
    from madhutwin.ml.models import fit_regressor
    df = pd.read_parquet(PROCESSED / "cgmacros_features.parquet").dropna(axis=1, how="all")
    feats = [c for c in df.columns if c.startswith(("cgm_", "wear_", "meal_", "ehr_", "ctx_", "twin_"))]
    no_twin = [c for c in feats if not c.startswith("twin_")]
    grp = df.groupby("patient_id")["group"].first()
    pids = grp.index.to_numpy()
    folds = list(StratifiedGroupKFold(5, shuffle=True, random_state=RANDOM_SEED).split(pids, grp.to_numpy(), groups=pids))
    rng = np.random.default_rng(RANDOM_SEED)
    res = []
    for k, (tr_i, te_i) in enumerate(folds):
        te = df[df["patient_id"].isin(pids[te_i]) & df["phase"].eq("monitor")]
        for n in (6, 12, 24, 36):
            sub = rng.choice(pids[tr_i], size=min(n, len(tr_i)), replace=False)
            tr = df[df["patient_id"].isin(sub) & df["phase"].eq("monitor")]
            for h in (60, 120):
                dy = tr[f"y_{h}"].to_numpy() - tr["g0"].to_numpy()
                y = te[f"y_{h}"].to_numpy()
                ok = np.isfinite(y)
                for name, fs in (("Fusion (no twin)", no_twin), ("MadhuTwin hybrid", feats)):
                    p = te["g0"].to_numpy() + fit_regressor(tr[fs], dy).predict(te[fs])
                    res.append({"fold": k, "n_train": n, "h": h, "model": name, "mse": float(np.mean((p[ok] - y[ok]) ** 2))})
                tw = te["g0"].to_numpy() + te[f"twin_d{h}"].to_numpy()
                res.append({"fold": k, "n_train": n, "h": h, "model": "Twin only (physiology)", "mse": float(np.mean((tw[ok] - y[ok]) ** 2))})
        print(f"  learning-curve fold {k} done")
    r = pd.DataFrame(res)
    tab = r.groupby(["model", "h", "n_train"])["mse"].mean().pipe(np.sqrt).round(2)
    return {f"{m}|{h}|{n}": v for (m, h, n), v in tab.to_dict().items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-learning-curve", action="store_true")
    args = ap.parse_args()
    t = time.time()
    out_path = REPORTS / "twin_value.json"
    out = json.load(open(out_path)) if out_path.exists() else {}
    out["cold_start"] = cold_start()
    print("Cold start (twin-only RMSE, mg/dL):")
    for k, v in out["cold_start"]["table"].items():
        print(f"  {k:24s} 60min {v['rmse_60']:6.1f}   120min {v['rmse_120']:6.1f}")
    print("  share of patients where EHR prior beats population prior (120 min):", out["cold_start"]["ehr_prior_better_share_120"])
    if not args.skip_learning_curve:
        out["learning_curve"] = learning_curve()
        for k, v in out["learning_curve"].items():
            print(f"  {k:40s} {v:6.1f}")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"done in {time.time() - t:.0f}s")


if __name__ == "__main__":
    main()
