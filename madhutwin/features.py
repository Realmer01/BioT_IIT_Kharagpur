"""Feature engineering: fusing static EHR, wearable streams, meals and the twin.

Every feature is computed causally (only information available at the
prediction minute) and tagged with the data stream it comes from, so the same
table drives (a) the fusion ablation study and (b) per-alert explanations
grouped by stream ("62 % of this alert comes from the meal you just logged").
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from madhutwin.config import HORIZONS
from madhutwin.physiology import model as M

TWIN_HORIZONS = (30, 60, 90, 120)

EHR_FEATURES = [
    "age", "sex_male", "bmi", "hba1c", "fpg", "fasting_insulin", "homa_ir", "homa_b", "tg", "hdl", "tg_hdl",
    # extended Indian-cohort record (NaN where a source does not provide it)
    "diabetes_years", "egfr", "sbp", "prs_percentile", "tcf7l2_risk_alleles",
    "rx_metformin", "rx_sulfonylurea", "rx_dpp4", "rx_sglt2", "rx_agi", "rx_insulin",
]


def _roll(s: pd.Series, w: int, fn: str, minp: int | None = None) -> pd.Series:
    r = s.rolling(w, min_periods=minp or max(1, w // 3))
    return getattr(r, fn)()


def _since_last(event_mask: np.ndarray, cap: float) -> np.ndarray:
    idx = np.where(event_mask, np.arange(len(event_mask)), np.nan)
    last = pd.Series(idx).ffill().to_numpy()
    out = np.arange(len(event_mask)) - last
    return np.where(np.isnan(out), cap, np.minimum(out, cap))


def build_features(minute: pd.DataFrame, meals: pd.DataFrame, ehr: dict, arrays: dict,
                   twin=None, states: np.ndarray | None = None, every: int = 5) -> pd.DataFrame:
    """Return one row per native CGM sample (thinned to ``every`` minutes).

    Columns: ``minute``, ``time``, ``g0``, features (prefixed by stream), targets
    ``y_<h>`` (glucose at +h min) and event labels.
    """
    n = len(minute)
    t = pd.to_datetime(minute["time"]).reset_index(drop=True)
    native = minute["cgm"].to_numpy(float)
    locf = pd.Series(native).ffill(limit=30)

    rows = np.flatnonzero(np.isfinite(native))
    if every > 5 and len(rows):
        rows = rows[np.r_[True, np.diff(rows // every) > 0]]
    F: dict[str, np.ndarray] = {}

    # ------------------------------------------------------------------ CGM stream
    g0 = native
    for lag in (5, 10, 15, 20, 30, 45, 60, 90, 120):
        F[f"cgm_d{lag}"] = g0 - locf.shift(lag).to_numpy()
    F["cgm_g0"] = g0
    F["cgm_accel"] = (g0 - locf.shift(15).to_numpy()) - (locf.shift(15).to_numpy() - locf.shift(30).to_numpy())
    for w in (60, 180):
        F[f"cgm_mean{w}"] = _roll(locf, w, "mean").to_numpy()
        F[f"cgm_std{w}"] = _roll(locf, w, "std").to_numpy()
        F[f"cgm_max{w}"] = _roll(locf, w, "max").to_numpy() - g0
        F[f"cgm_min{w}"] = _roll(locf, w, "min").to_numpy() - g0
    F["cgm_mean24h"] = _roll(locf, 1440, "mean", 240).to_numpy()
    F["cgm_p10_24h"] = locf.rolling(1440, min_periods=240).quantile(0.10).to_numpy()
    F["cgm_above_base"] = g0 - F["cgm_p10_24h"]

    # ------------------------------------------------------------------ wearable stream
    hr = minute["hr"].astype(float) if "hr" in minute else pd.Series(np.full(n, np.nan))
    hr = hr.reset_index(drop=True)
    F["wear_hr5"] = _roll(hr, 5, "mean").to_numpy()
    F["wear_hr30"] = _roll(hr, 30, "mean").to_numpy()
    F["wear_hr_std60"] = _roll(hr, 60, "std").to_numpy()
    hr_rest = hr.rolling(1440, min_periods=240).quantile(0.05)
    F["wear_hr_rel"] = F["wear_hr30"] - hr_rest.to_numpy()
    mets = minute["mets"].astype(float).reset_index(drop=True) if "mets" in minute else pd.Series(np.full(n, np.nan))
    for w in (15, 30, 60, 120):
        F[f"wear_mets{w}"] = _roll(mets, w, "mean").to_numpy()
    F["wear_active_min60"] = _roll((mets > 3.0).astype(float), 60, "sum").to_numpy()
    F["wear_active_min180"] = _roll((mets > 3.0).astype(float), 180, "sum").to_numpy()
    if "steps" in minute:
        steps = minute["steps"].astype(float).reset_index(drop=True)
        F["wear_steps60"] = _roll(steps, 60, "sum").to_numpy()
        F["wear_steps_today"] = steps.groupby(t.dt.date.values).cumsum().to_numpy()
    for col in ("sleep_last_h", "sleep_deep_frac", "hrv_rmssd"):
        F[f"wear_{col}"] = minute[col].to_numpy(float) if col in minute else np.full(n, np.nan)

    # ------------------------------------------------------------------ meal stream
    carbs = np.zeros(n)
    kcal = np.zeros(n)
    fat = np.zeros(n)
    fiber = np.zeros(n)
    prot = np.zeros(n)
    if len(meals):
        mm = ((pd.to_datetime(meals["time"]) - t.iloc[0]).dt.total_seconds() // 60).astype(int).to_numpy()
        ok = (mm >= 0) & (mm < n)
        np.add.at(carbs, mm[ok], meals["carbs"].to_numpy(float)[ok])
        np.add.at(kcal, mm[ok], meals["kcal"].fillna(0).to_numpy(float)[ok])
        np.add.at(fat, mm[ok], meals["fat"].to_numpy(float)[ok])
        np.add.at(fiber, mm[ok], meals["fiber"].to_numpy(float)[ok])
        np.add.at(prot, mm[ok], meals["protein"].to_numpy(float)[ok])
    is_meal = (carbs + fat + prot) > 0
    F["meal_min_since"] = _since_last(is_meal, 720.0)
    for name, arr in (("carbs", carbs), ("fat", fat), ("fiber", fiber), ("protein", prot), ("kcal", kcal)):
        s = pd.Series(arr)
        F[f"meal_{name}_60"] = s.rolling(60, min_periods=1).sum().to_numpy()
        F[f"meal_{name}_180"] = s.rolling(180, min_periods=1).sum().to_numpy()
    F["meal_carbs_360"] = pd.Series(carbs).rolling(360, min_periods=1).sum().to_numpy()
    last_c = pd.Series(np.where(is_meal, carbs, np.nan)).ffill().fillna(0).to_numpy()
    F["meal_last_carbs"] = last_c
    F["meal_count_today"] = pd.Series(is_meal.astype(float)).groupby(t.dt.date.values).cumsum().to_numpy()

    # ------------------------------------------------------------------ context
    hour = (t.dt.hour + t.dt.minute / 60.0).to_numpy()
    F["ctx_hour_sin"] = np.sin(2 * np.pi * hour / 24)
    F["ctx_hour_cos"] = np.cos(2 * np.pi * hour / 24)

    # ------------------------------------------------------------------ twin stream
    if twin is not None and states is not None:
        st = states[rows]
        F_tw = {
            "twin_X": st[:, M.S_X] * 1e3,
            "twin_I": st[:, M.S_I],
            "twin_gut_carbs": st[:, M.S_Q1F] + st[:, M.S_Q2F] + st[:, M.S_Q1S] + st[:, M.S_Q2S],
            "twin_gut_fast": st[:, M.S_Q1F] + st[:, M.S_Q2F],
            "twin_E": st[:, M.S_E],
        }
        p = twin.params
        F_tw["twin_ra"] = p[M.P["f"]] * (M.K_FAST * p[M.P["k_scale"]] * st[:, M.S_Q2F]
                                         + M.K_SLOW * p[M.P["k_scale"]] * st[:, M.S_Q2S]) * 1000 / (M.VG * p[M.P["BW"]])
        fc = twin.forecast(arrays, states, rows.astype(np.int64), native[rows])
        for h in TWIN_HORIZONS:
            F_tw[f"twin_d{h}"] = fc[:, h] - native[rows]
        F_tw["twin_peak120"] = fc[:, 1:121].max(axis=1) - native[rows]
        F_tw["twin_trough120"] = fc[:, 1:121].min(axis=1) - native[rows]
        ph = twin.phenotype()
        for k in ("insulin_sensitivity", "beta_cell_response", "disposition_index", "glucose_effectiveness",
                  "basal_glucose", "absorption_speed", "exercise_response"):
            F_tw[f"twin_p_{k}"] = np.full(len(rows), ph[k])
    else:
        F_tw = {}

    df = pd.DataFrame({k: v[rows] for k, v in F.items()})
    for k, v in F_tw.items():
        df[k] = v

    # ------------------------------------------------------------------ static EHR
    for k in EHR_FEATURES:
        if k == "sex_male":
            v = 1.0 if str(ehr.get("sex", "")).upper().startswith("M") else 0.0
        else:
            v = ehr.get(k, np.nan)
            v = np.nan if v is None else float(v)
        df[f"ehr_{k}"] = v

    df.insert(0, "minute", rows)
    df.insert(1, "time", t.iloc[rows].to_numpy())
    df.insert(2, "g0", native[rows])

    # ------------------------------------------------------------------ targets / labels
    for h in HORIZONS:
        tgt = np.full(len(rows), np.nan)
        for tol in (0, -1, 1, -2, 2):
            j = rows + h + tol
            ok = (j >= 0) & (j < n)
            cand = np.full(len(rows), np.nan)
            cand[ok] = native[j[ok]]
            fill = np.isnan(tgt) & np.isfinite(cand)
            tgt[fill] = cand[fill]
        df[f"y_{h}"] = tgt
    s_nat = pd.Series(native)
    fut_max = s_nat[::-1].rolling(120, min_periods=18).max()[::-1].shift(-1).to_numpy()
    fut_min60 = s_nat[::-1].rolling(60, min_periods=9).min()[::-1].shift(-1).to_numpy()
    df["fut_max120"] = fut_max[rows]
    df["fut_min60"] = fut_min60[rows]
    g = df["g0"].to_numpy()
    fm = df["fut_max120"].to_numpy()
    fn = df["fut_min60"].to_numpy()
    df["ev_hyper"] = np.where(np.isfinite(fm) & (g <= 180), (fm > 180).astype(float), np.nan)
    df["ev_spike"] = np.where(np.isfinite(fm), (fm - g >= 50).astype(float), np.nan)
    df["ev_hypo"] = np.where(np.isfinite(fn) & (g >= 70), (fn < 70).astype(float), np.nan)
    return df


def feature_groups(columns) -> dict[str, list[str]]:
    groups = {"cgm": [], "wearable": [], "meal": [], "ehr": [], "context": [], "twin": []}
    prefix = {"cgm_": "cgm", "wear_": "wearable", "meal_": "meal", "ehr_": "ehr", "ctx_": "context", "twin_": "twin"}
    for c in columns:
        for p, gname in prefix.items():
            if c.startswith(p):
                groups[gname].append(c)
    return groups
