"""Create the sample upload for the "New patient" page: a fictional patient the models never saw.

Generated with the Bharat physiology but a seed outside the cohort, then exported in the
documented CSV format (6 days of 5-minute CGM, heart rate, steps and logged meals).

Usage:  python scripts/make_sample_upload.py
Output: data/samples/sample_patient.csv, data/samples/sample_profile.json
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from madhutwin.config import DATA  # noqa: E402
from madhutwin.data import synth_cohort as S  # noqa: E402

OUT = DATA / "samples"
EXPORT_DAYS = 6
SAMPLE_NAME = "Sunita Verma"  # fictional; regionally coherent name for the demo


def candidate(k: int):
    rng = np.random.default_rng(777_000 + k)
    pt = S.sample_patient(rng, 900 + k)
    if pt["status"] != "t2d" or not any(r["class"] == "sulfonylurea" for r in pt["regimen"]):
        return None
    plans = S.plan_days(rng, pt)
    sim = S.simulate_patient(rng, pt, plans)
    g = sim["minute"]["true_glucose"].to_numpy()[-EXPORT_DAYS * 1440:]
    tar = np.mean(g > 180) * 100
    if not 20 <= tar <= 65:
        return None
    return rng, pt, sim, float(g.min())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # among sulfonylurea users with frequent highs, take the one with the deepest dip
    pool = []
    for k in range(300):
        got = candidate(k)
        if got:
            pool.append(got)
        if len(pool) >= 25:
            break
    if not pool:
        raise SystemExit("no suitable sample found")
    rng, pt, sim, gmin = min(pool, key=lambda c: c[3])
    print(f"picked from {len(pool)} candidates, lowest glucose {gmin:.0f} mg/dL")
    ehr = S.build_ehr(rng, pt, sim)
    m = sim["minute"]
    first = (S.DAYS - EXPORT_DAYS) * 1440
    m = m.iloc[first:].reset_index(drop=True)
    shift = pd.Timestamp("2026-10-08") - m["time"].iloc[0]
    rows = m[np.isfinite(m["cgm"].to_numpy())]
    steps = m["steps"].to_numpy()
    hr = m["hr"].to_numpy()
    idx = rows.index.to_numpy()
    out = pd.DataFrame({
        "timestamp": (rows["time"] + shift).dt.strftime("%Y-%m-%d %H:%M"),
        "glucose_mgdl": rows["cgm"].round(0).astype(int),
        "heart_rate": [np.nanmean(hr[i:i + 5]).round(0) for i in idx],
        "steps": [int(np.nansum(steps[i:i + 5])) for i in idx],
        "carbs_g": "", "protein_g": "", "fat_g": "", "fiber_g": "", "meal": "",
    })
    meals = sim["meals"]
    meals = meals[pd.to_datetime(meals["time"]) >= m["time"].iloc[0]]
    mrows = pd.DataFrame({
        "timestamp": (pd.to_datetime(meals["time"]) + shift).dt.strftime("%Y-%m-%d %H:%M"),
        "glucose_mgdl": "", "heart_rate": "", "steps": "",
        "carbs_g": meals["carbs"].round(0).astype(int), "protein_g": meals["protein"].round(0).astype(int),
        "fat_g": meals["fat"].round(0).astype(int), "fiber_g": meals["fiber"].round(0).astype(int),
        "meal": meals["name"].to_numpy(),
    })
    csv = pd.concat([out, mrows]).sort_values("timestamp", kind="stable")
    csv.to_csv(OUT / "sample_patient.csv", index=False)
    meds = [{"drug": r["drug"], "dose": r.get("daily_dose_mg", r.get("daily_units"))} for r in ehr["regimen"]]
    profile = {
        "name": SAMPLE_NAME, "age": ehr["age"], "sex": ehr["sex"], "city": ehr["city"], "state": ehr["state"],
        "language": ehr["language"], "weight_kg": ehr["weight_kg"], "height_cm": ehr["height_cm"], "hba1c": ehr["hba1c"],
        "fpg": ehr["fpg"], "fasting_insulin": ehr["fasting_insulin"], "egfr": ehr["egfr"],
        "diabetes_years": ehr["diabetes_years"], "sbp": ehr["sbp"], "dbp": ehr["dbp"], "medications": meds,
    }
    with open(OUT / "sample_profile.json", "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=1, ensure_ascii=False)
    print(f"sample: {SAMPLE_NAME}, {ehr['age']}{ehr['sex']}, HbA1c {ehr['hba1c']}, meds {[x['drug'] for x in meds]}, "
          f"{len(out)} readings, {len(mrows)} meals -> {OUT}")


if __name__ == "__main__":
    main()
