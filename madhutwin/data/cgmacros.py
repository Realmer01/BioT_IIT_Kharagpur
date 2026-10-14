"""Loader for the CGMacros dataset (PhysioNet, CC BY-NC-SA 4.0).

Converts each participant into MadhuTwin's canonical schema:

* ``minute`` frame  - one row per minute: time, cgm (native sensor samples only,
  NaN elsewhere), hr, mets, kcal
* ``meals`` frame   - one row per logged meal: time, macros (scaled by % consumed)
* ``ehr`` table     - static/historical record per participant (demographics + labs)

Leakage note: the published 1-minute files linearly interpolate the Dexcom G6
(5-min) and Libre Pro (15-min) readings. Interpolated values at minute t depend on
the *next* native reading, which would leak the future into the model. We recover
the native sampling grid (interpolation knots) and keep only true sensor samples;
everything downstream is strictly causal (last-observation-carried-forward).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from madhutwin.config import PROCESSED, RAW_CGMACROS

OUT = PROCESSED / "cgmacros"


def _native_mask(values: np.ndarray, period: int = 5) -> np.ndarray:
    """Mark minutes that carry a genuine (non-interpolated) sensor reading.

    Within each contiguous non-NaN run, interpolation knots are where the second
    difference is non-zero. The dominant knot phase (minute mod period) is then
    applied to the whole run so flat stretches are not lost.
    """
    n = len(values)
    mask = np.zeros(n, dtype=bool)
    ok = ~np.isnan(values)
    if not ok.any():
        return mask
    # contiguous runs of valid values
    edges = np.flatnonzero(np.diff(np.r_[0, ok.astype(np.int8), 0]))
    for start, stop in zip(edges[::2], edges[1::2]):
        seg = values[start:stop]
        if len(seg) < 3:
            mask[start:stop] = True
            continue
        d2 = np.abs(np.diff(seg, 2))
        knots = np.flatnonzero(d2 > 1e-6) + 1
        if len(knots) == 0:
            phase = 0
        else:
            phase = np.bincount(knots % period, minlength=period).argmax()
        idx = np.arange(len(seg))
        mask[start:stop] = (idx % period) == phase
    return mask


def _load_bio() -> pd.DataFrame:
    bio = pd.read_csv(RAW_CGMACROS / "bio.csv")
    bio.columns = [c.strip() for c in bio.columns]
    out = pd.DataFrame(
        {
            "subject_id": bio["subject"].map(lambda s: f"CGM{int(s):03d}"),
            "age": bio["Age"].astype(float),
            "sex": bio["Gender"].str.strip(),
            "bmi": bio["BMI"].astype(float),
            "weight_kg": bio["Body weight"].astype(float) * 0.453592,
            "height_cm": bio["Height"].astype(float) * 2.54,
            "ethnicity": bio["Self-identify"].str.strip(),
            "hba1c": bio["A1c PDL (Lab)"].astype(float),
            "fpg": bio["Fasting GLU - PDL (Lab)"].astype(float),
            "fasting_insulin": bio["Insulin"].astype(float),
            "tg": bio["Triglycerides"].astype(float),
            "total_chol": bio["Cholesterol"].astype(float),
            "hdl": bio["HDL"].astype(float),
            "ldl": pd.to_numeric(bio["LDL (Cal)"], errors="coerce"),
        }
    )
    out.loc[out["ldl"] >= 800, "ldl"] = np.nan  # documented calculation error code
    out["homa_ir"] = out["fpg"] * out["fasting_insulin"] / 405.0
    out["homa_b"] = 360.0 * out["fasting_insulin"] / np.maximum(out["fpg"] - 63.0, 5.0)
    out["tg_hdl"] = out["tg"] / out["hdl"]
    out["group"] = pd.cut(
        out["hba1c"], [0, 5.7, 6.5, 20], right=False, labels=["normal", "prediabetes", "t2d"]
    ).astype(str)
    out["source"] = "CGMacros (PhysioNet, real, de-identified)"
    return out


def _load_subject(path, weight_kg: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    d = pd.read_csv(path)
    d.columns = [c.strip() for c in d.columns]
    d["Timestamp"] = pd.to_datetime(d["Timestamp"])
    d = d.sort_values("Timestamp").drop_duplicates("Timestamp")
    t0 = d["Timestamp"].min().floor("min")
    grid = pd.date_range(t0, d["Timestamp"].max().floor("min"), freq="1min")
    d = d.set_index(d["Timestamp"].dt.floor("min")).reindex(grid)

    dex = d["Dexcom GL"].to_numpy(float)
    lib = d["Libre GL"].to_numpy(float)
    # Dexcom G6 (5-min native) is the primary stream; Libre Pro (15-min) fills gaps.
    cgm = np.where(_native_mask(dex, 5), dex, np.nan)
    lib_native = np.where(_native_mask(lib, 15), lib, np.nan)
    if np.isnan(dex).mean() > 0.5:  # participant without usable Dexcom
        cgm = lib_native
    else:
        # fill long Dexcom gaps (> 30 min) with native Libre samples
        have = ~np.isnan(dex)
        gap = pd.Series(~have).groupby((have).cumsum()).transform("size").to_numpy() > 30
        fill = gap & ~np.isnan(lib_native) & ~have
        cgm[fill] = lib_native[fill]

    hr = d["HR"].to_numpy(float)
    kcal = d["Calories (Activity)"].to_numpy(float) if "Calories (Activity)" in d else np.full(len(d), np.nan)
    if "METs" in d:
        mets = d["METs"].to_numpy(float) / 10.0
    else:
        # 1 MET = 1 kcal/kg/h  ->  METs = kcal_per_min * 60 / body-weight(kg)
        mets = kcal * 60.0 / weight_kg
    mets = np.clip(mets, 0.8, 16.0)

    minute = pd.DataFrame(
        {"time": grid, "cgm": cgm, "hr": hr, "mets": mets, "kcal": kcal}
    )

    m = d[d["Meal Type"].notna()].copy()
    m["time"] = m.index
    frac = m["Amount Consumed"].fillna(100.0) / 100.0 if "Amount Consumed" in m else 1.0
    frac = np.where(np.asarray(frac) > 0, frac, 1.0)
    meals = pd.DataFrame(
        {
            "time": m["time"].to_numpy(),
            "meal_type": m["Meal Type"].astype(str).str.lower().str.replace(r"\s*\d+$", "", regex=True)
            .str.replace("snacks", "snack").to_numpy(),
            "kcal": (m["Calories"].astype(float) * frac).to_numpy(),
            "carbs": (m["Carbs"].astype(float) * frac).to_numpy(),
            "protein": (m["Protein"].astype(float) * frac).to_numpy(),
            "fat": (m["Fat"].astype(float) * frac).to_numpy(),
            "fiber": (m["Fiber"].astype(float) * frac).to_numpy(),
            "gi": np.nan,
            "name": m["Meal Type"].astype(str).str.title().to_numpy(),
        }
    )
    meals = meals.fillna({"carbs": 0, "protein": 0, "fat": 0, "fiber": 0})
    meals = meals[(meals["carbs"] + meals["protein"] + meals["fat"]) > 0].reset_index(drop=True)
    return minute, meals


def build(verbose: bool = True) -> pd.DataFrame:
    """Parse all participants into data/processed/cgmacros. Returns the EHR table."""
    OUT.mkdir(parents=True, exist_ok=True)
    ehr = _load_bio()
    keep = []
    for _, row in ehr.iterrows():
        num = int(row["subject_id"][3:])
        path = RAW_CGMACROS / f"CGMacros-{num:03d}" / f"CGMacros-{num:03d}.csv"
        if not path.exists():
            continue
        minute, meals = _load_subject(path, row["weight_kg"])
        minute.to_parquet(OUT / f"{row['subject_id']}_minute.parquet", index=False)
        meals.to_parquet(OUT / f"{row['subject_id']}_meals.parquet", index=False)
        keep.append(row["subject_id"])
        if verbose:
            print(
                f"{row['subject_id']}: {len(minute)/1440:5.1f} d, "
                f"{np.isfinite(minute['cgm']).sum():5d} CGM samples, {len(meals):3d} meals, group={row['group']}"
            )
    ehr = ehr[ehr["subject_id"].isin(keep)].reset_index(drop=True)
    ehr.to_parquet(OUT / "ehr.parquet", index=False)
    return ehr


def load_subject(subject_id: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    return (
        pd.read_parquet(OUT / f"{subject_id}_minute.parquet"),
        pd.read_parquet(OUT / f"{subject_id}_meals.parquet"),
    )


def load_ehr() -> pd.DataFrame:
    return pd.read_parquet(OUT / "ehr.parquet")


if __name__ == "__main__":
    build()
