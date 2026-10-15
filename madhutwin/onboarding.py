"""Onboard a new patient: a CGM/wearable CSV export plus a short health-record form.

The record sets the twin's prior (usable on day zero); the uploaded streams
personalise it on the first part of the recording; the rest is forecast by a
model that never saw this patient. Recordings are placed on the clinic's
14-day window by whole days, so time of day is preserved.

CSV columns (case-insensitive; common export names are recognised):
    timestamp      required   e.g. 2026-10-05 07:35
    glucose        required   mg/dL (mmol/L is detected and converted)
    heart_rate     optional   bpm
    steps          optional   steps from this row's time until the next row
    carbs_g        optional   meal carbohydrate (g) on the row the meal starts
    protein_g, fat_g, fiber_g, meal   optional meal details
"""
from __future__ import annotations

import io
import re

import numpy as np
import pandas as pd

from madhutwin.data.indian_foods import FOODS
from madhutwin.data.synth_cohort import ATC, CLASS, DAYS, START
from madhutwin.features import build_features
from madhutwin.physiology import model as M
from madhutwin.physiology.calibrate import fasting_target
from madhutwin.twin import DigitalTwin, prepare_arrays, slice_arrays

ALIASES = {
    "time": ["timestamp", "time", "datetime", "date_time", "device timestamp", "timestamp (yyyy-mm-ddthh:mm:ss)", "datestring", "date"],
    "glucose": ["glucose", "glucose_mgdl", "glucose_mg_dl", "glucose (mg/dl)", "sensor glucose (mg/dl)",
                "historic glucose mg/dl", "historic glucose (mg/dl)", "glucose value (mg/dl)", "cgm", "sgv",
                "glucose_mmol", "historic glucose mmol/l", "glucose value (mmol/l)"],
    "hr": ["heart_rate", "heartrate", "hr", "heart rate", "bpm"],
    "steps": ["steps", "step_count", "steps_count"],
    "carbs": ["carbs_g", "carbs", "carbohydrate", "carbohydrates", "carbs (g)"],
    "protein": ["protein_g", "protein"],
    "fat": ["fat_g", "fat"],
    "fiber": ["fiber_g", "fibre_g", "fiber", "fibre"],
    "meal": ["meal", "meal_name", "food", "notes"],
}
MIN_HOURS = 24
FOOD_BY_NAME = {f["name"].lower(): f["id"] for f in FOODS}
DRUGS = {  # name -> (class, unit)
    "Metformin": ("biguanide", "mg"), "Glimepiride": ("sulfonylurea", "mg"), "Gliclazide": ("sulfonylurea", "mg"),
    "Teneligliptin": ("dpp4", "mg"), "Sitagliptin": ("dpp4", "mg"), "Vildagliptin": ("dpp4", "mg"),
    "Dapagliflozin": ("sglt2", "mg"), "Empagliflozin": ("sglt2", "mg"), "Voglibose": ("agi", "mg"),
    "Pioglitazone": ("tzd", "mg"), "Insulin glargine": ("basal_insulin", "U"),
}


class OnboardingError(ValueError):
    """A user-facing problem with the uploaded data or form."""


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s).strip().lower())


def parse_csv(text: str) -> tuple[pd.DataFrame, dict]:
    """Read an export into columns time, glucose, hr, steps, carbs, protein, fat, fiber, meal."""
    if not text or not text.strip():
        raise OnboardingError("The file is empty.")
    lines = text.splitlines()
    # some device exports put a title line above the header: find the header row
    start = 0
    for i, ln in enumerate(lines[:15]):
        cells = [_norm(c) for c in re.split(r"[,;\t]", ln)]
        if any(c in ALIASES["glucose"] for c in cells) and any(c in ALIASES["time"] for c in cells):
            start = i
            break
    raw = pd.read_csv(io.StringIO("\n".join(lines[start:])), sep=None, engine="python")
    cols = {_norm(c): c for c in raw.columns}
    found = {}
    for key, names in ALIASES.items():
        for n in names:
            if n in cols:
                found[key] = cols[n]
                break
    if "time" not in found or "glucose" not in found:
        raise OnboardingError("The file needs a timestamp column and a glucose column (see the format guide).")

    t = pd.to_datetime(raw[found["time"]], errors="coerce")
    if t.isna().mean() > 0.2:
        t = pd.to_datetime(raw[found["time"]], errors="coerce", dayfirst=True)
    g = pd.to_numeric(raw[found["glucose"]], errors="coerce")
    df = pd.DataFrame({"time": t, "glucose": g})
    for key in ("hr", "steps", "carbs", "protein", "fat", "fiber"):
        df[key] = pd.to_numeric(raw[found[key]], errors="coerce") if key in found else np.nan
    df["meal"] = raw[found["meal"]].astype(str) if "meal" in found else ""
    df = df.dropna(subset=["time"]).sort_values("time").reset_index(drop=True)
    info = {"columns": {k: str(v) for k, v in found.items()}, "rows": int(len(df)), "unit": "mg/dL"}
    gv = df["glucose"].dropna()
    if len(gv) and gv.median() < 25:  # mmol/L export
        df["glucose"] = df["glucose"] * 18.016
        info["unit"] = "mmol/L (converted)"
    df.loc[(df["glucose"] < 20) | (df["glucose"] > 600), "glucose"] = np.nan
    return df, info


def _place_on_clinic_window(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Shift by whole days so the recording ends on the clinic window's last day."""
    last_day = df["time"].max().normalize()
    target_last = START + pd.Timedelta(days=DAYS - 1)
    shift = target_last - last_day
    out = df.copy()
    out["time"] = out["time"] + shift
    out = out[(out["time"] >= START) & (out["time"] < START + pd.Timedelta(days=DAYS))]
    return out.reset_index(drop=True), int(shift.days)


def build_frames(df: pd.DataFrame, weight_kg: float) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Minute grid over the clinic window (NaN outside the recording) plus a meals table."""
    n = DAYS * 1440
    grid = START + pd.to_timedelta(np.arange(n), unit="min")
    m = ((df["time"] - START).dt.total_seconds() // 60).astype(int).to_numpy()

    cgm = np.full(n, np.nan)
    gl = df["glucose"].to_numpy(float)
    ok = np.isfinite(gl)
    cg = pd.Series(gl[ok]).groupby(m[ok]).mean()
    cgm[cg.index.to_numpy()] = cg.to_numpy()

    hr = np.full(n, np.nan)
    if df["hr"].notna().any():
        h = df[["hr"]].assign(m=m).dropna().groupby("m")["hr"].mean()
        hr[h.index.to_numpy()] = h.to_numpy()
        hr = pd.Series(hr).ffill(limit=10).to_numpy()

    steps = np.full(n, np.nan)
    mets = np.full(n, 1.2)
    has_steps = bool(df["steps"].notna().any())
    if has_steps:
        steps[:] = 0.0
        gap = np.diff(np.r_[m, m[-1] + 5]).clip(1, 15)
        s_per_min = df["steps"].fillna(0).to_numpy(float) / gap
        for start, g_, v in zip(m, gap, s_per_min):
            steps[start:start + g_] = v
        first, last = m.min(), m.max()
        steps[:first] = np.nan
        steps[last + 15:] = np.nan
        mets = np.where(np.isfinite(steps), 1.25 + 0.028 * steps, 1.2)
    minute = pd.DataFrame({
        "time": grid, "cgm": cgm, "hr": hr, "mets": mets, "kcal": mets * weight_kg / 60.0, "steps": steps,
        "sleep_stage": np.nan, "sleep_last_h": np.nan, "sleep_deep_frac": np.nan, "hrv_rmssd": np.nan,
    })

    mrows = df[df["carbs"].fillna(0) > 0]
    meals = pd.DataFrame({
        "time": mrows["time"].dt.floor("min").to_numpy(),
        "meal_type": [_slot(t) for t in mrows["time"]],
        "name": [s if s and s != "nan" else "Logged meal" for s in mrows["meal"]],
        "carbs": mrows["carbs"].to_numpy(float),
        "protein": mrows["protein"].fillna(0).to_numpy(float),
        "fat": mrows["fat"].fillna(0).to_numpy(float),
        "fiber": mrows["fiber"].fillna(0).to_numpy(float),
        "gi": np.nan,
    })
    meals["kcal"] = meals["carbs"] * 4 + meals["protein"] * 4 + meals["fat"] * 9
    meals["food_id"] = [_food_id(n, sl, c) for n, sl, c in zip(meals["name"], meals["meal_type"], meals["carbs"])]
    valid = np.isfinite(cgm)
    first_m, last_m = int(np.flatnonzero(valid)[0]), int(np.flatnonzero(valid)[-1])
    span_h = (last_m - first_m) / 60.0
    interval = float(np.median(np.diff(np.flatnonzero(valid)))) if valid.sum() > 2 else np.nan
    stats = {"readings": int(valid.sum()), "hours": round(span_h, 1), "days": round(span_h / 24, 1),
             "interval_min": interval, "meals": int(len(meals)), "has_heart_rate": bool(np.isfinite(hr).any()),
             "has_steps": has_steps, "first_minute": first_m, "last_minute": last_m,
             "coverage_pct": round(100 * valid.sum() * (interval or 5) / max((last_m - first_m), 1), 1)}
    return minute, meals, stats


def _food_id(name: str, slot: str, carbs: float) -> str:
    """Library dish for a logged meal (the what-if baseline): by name, else the closest-sized dish for that slot."""
    hit = FOOD_BY_NAME.get(str(name).strip().lower())
    if hit:
        return hit
    pool = [f for f in FOODS if slot in f["slots"]] or FOODS
    return min(pool, key=lambda f: abs(f["carbs"] - carbs))["id"]


def _slot(t: pd.Timestamp) -> str:
    h = t.hour + t.minute / 60
    return "breakfast" if 5 <= h < 11 else "lunch" if 11 <= h < 16 else "snack" if 16 <= h < 19 else "dinner"


def build_ehr(pid: str, profile: dict, minute: pd.DataFrame) -> tuple[dict, list]:
    def num(k):
        v = profile.get(k)
        try:
            v = float(v)
            return v if np.isfinite(v) else None
        except (TypeError, ValueError):
            return None

    age, weight, height, a1c = num("age"), num("weight_kg"), num("height_cm"), num("hba1c")
    if age is None or weight is None or a1c is None:
        raise OnboardingError("Age, weight and HbA1c are required.")
    sex = "F" if str(profile.get("sex", "M")).upper().startswith("F") else "M"
    bmi = round(weight / (height / 100) ** 2, 1) if height else None
    fpg = num("fpg")
    fpg_note = None
    if fpg is None:
        est = fasting_target({"cgm": minute["cgm"].to_numpy(float), "hour0": 0.0}, {})
        if est:
            fpg, fpg_note = round(est), "estimated from overnight CGM"
    insulin = num("fasting_insulin")
    homa_ir = round(fpg * insulin / 405.0, 2) if (fpg and insulin) else None
    homa_b = round(360 * insulin / max(fpg - 63, 5), 1) if (fpg and insulin) else None
    egfr = num("egfr")
    group = "t2d" if a1c >= 6.5 else "prediabetes" if a1c >= 5.7 else "normal"

    regimen = []
    for rx in profile.get("medications", []) or []:
        drug = rx.get("drug")
        if drug not in DRUGS:
            continue
        cls, unit = DRUGS[drug]
        dose = float(rx.get("dose") or 0)
        entry = {"drug": drug, "class": cls, "atc": ATC.get(drug), "frequency": "as prescribed"}
        entry["daily_units" if unit == "U" else "daily_dose_mg"] = dose
        regimen.append(entry)

    today = (START + pd.Timedelta(days=DAYS - 1)).date().isoformat()
    dx = []
    if group == "t2d":
        dx.append({"code": "E11", "snomed": "44054006", "display": "Type 2 diabetes mellitus", "onset": None})
    elif group == "prediabetes":
        dx.append({"code": "R73.03", "snomed": "714628002", "display": "Prediabetes", "onset": None})
    if egfr is not None and egfr < 60:
        dx.append({"code": "N18.3", "snomed": "433144002", "display": "Chronic kidney disease stage 3", "onset": None})
    if bmi and bmi >= 25:
        dx.append({"code": "E66.9", "snomed": "414916001", "display": "Obesity (Asian-Indian BMI >= 25)", "onset": None})
    classes = {r["class"] for r in regimen}
    ehr = {
        "patient_id": pid, "name": (profile.get("name") or pid).strip() or pid, "sex": sex, "age": int(age),
        "city": profile.get("city") or "—", "state": profile.get("state") or "", "language": profile.get("language") or "—",
        "occupation": profile.get("occupation") or "—", "group": group, "featured": False, "headline": None, "story": None,
        "source": "Uploaded by clinician (CSV)", "uploaded": True,
        "height_cm": height, "weight_kg": weight, "bmi": bmi, "waist_cm": None, "sbp": num("sbp"), "dbp": num("dbp"),
        "hba1c": a1c, "fpg": fpg, "fpg_note": fpg_note, "fasting_insulin": insulin, "c_peptide": None,
        "homa_ir": homa_ir, "homa_b": homa_b, "tg": None, "hdl": None, "ldl": None, "tg_hdl": None, "total_chol": None,
        "egfr": egfr, "urine_acr": None, "alt": None, "vitamin_b12": None, "diabetes_years": num("diabetes_years"),
        "family_history_t2d": "not recorded", "tcf7l2_rs7903146": None, "tcf7l2_risk_alleles": None,
        "prs_percentile": None, "idrs": None, "diagnoses": dx, "regimen": regimen, "other_medications": [],
        "hba1c_history": [{"date": today, "hba1c": a1c}],
        "rx_metformin": float("biguanide" in classes), "rx_sulfonylurea": float("sulfonylurea" in classes),
        "rx_dpp4": float("dpp4" in classes), "rx_sglt2": float("sglt2" in classes), "rx_agi": float("agi" in classes),
        "rx_insulin": float("basal_insulin" in classes), "lifestyle": {},
        "consent": {"purpose": "Remote glycaemic monitoring and clinical decision support", "granted": today,
                    "dpdp_notice_language": profile.get("language") or "English",
                    "data_shared_with": ["Treating clinician"], "retention_days": 365},
    }
    return ehr, regimen


def onboard(pid: str, profile: dict, csv_text: str, model) -> dict:
    """Build, personalise and score a new patient's twin. Returns everything the service stores."""
    df, info = parse_csv(csv_text)
    df, shift_days = _place_on_clinic_window(df)
    if df["glucose"].notna().sum() < 50:
        raise OnboardingError("Too few glucose readings were found in the file.")
    weight = float(profile.get("weight_kg") or 70)
    minute, meals, stats = build_frames(df, weight)
    if stats["hours"] < MIN_HOURS:
        raise OnboardingError(f"At least {MIN_HOURS} hours of CGM data are needed (found {stats['hours']} h).")
    ehr, regimen = build_ehr(pid, profile, minute)

    arrays = prepare_arrays(minute, meals)
    a, b = stats["first_minute"], stats["last_minute"]
    n_on = int(np.clip(0.4 * (b - a), 12 * 60, 4 * 1440))
    twin = DigitalTwin.from_ehr(pid, ehr, regimen)
    prior_pheno = twin.phenotype()
    res = twin.personalise(slice_arrays(arrays, a, a + n_on))
    states = twin.sync(arrays)
    feats = build_features(minute, meals, ehr, arrays, twin=twin, states=states)
    feats.insert(0, "patient_id", pid)
    feats["phase"] = np.where(feats["minute"] < a + n_on, "onboard", "monitor")
    pred = model.predict(feats)
    keep = ["patient_id", "minute", "time", "g0", "phase", "next_meal_min"] + [c for c in feats.columns if c.startswith(("y_", "ev_"))]
    preds = pd.concat([feats[keep].reset_index(drop=True), pred.reset_index(drop=True)], axis=1)
    summary = {
        **stats, **info, "shift_days": shift_days, "onboard_hours": round(n_on / 60, 1),
        "personalised": bool(res.success), "fit_rmse_120": res.fit_rmse.get(120), "prior_rmse_120": res.prior_rmse.get(120),
        "phenotype": twin.phenotype(), "prior_phenotype": prior_pheno, "fpg_note": ehr.get("fpg_note"),
        "open_minute": int(b),
    }
    return {"ehr": ehr, "minute": minute, "meals": meals, "feats": feats, "preds": preds,
            "params": twin.params, "summary": summary}
