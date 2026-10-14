"""Plain-language rendering of model explanations for clinicians."""
from __future__ import annotations

import math

STREAM_LABEL = {
    "cgm": "Glucose trend (CGM)",
    "wearable": "Wearable: activity, heart rate, sleep",
    "meal": "Logged meals",
    "ehr": "Health record (EHR)",
    "twin": "Physiological twin",
    "context": "Time of day",
}


def _f(v, nd=0):
    return "n/a" if v is None or (isinstance(v, float) and math.isnan(v)) else f"{v:.{nd}f}"


def describe(feature: str, value) -> str:
    """Human-readable statement of a feature's current value."""
    v = value
    table = {
        "cgm_g0": lambda: f"Current glucose {_f(v)} mg/dL",
        "cgm_d15": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last 15 min",
        "cgm_d30": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last 30 min",
        "cgm_d60": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last hour",
        "cgm_accel": lambda: f"Trend {'accelerating' if v > 0 else 'decelerating'} ({_f(v)} mg/dL per 15 min)",
        "cgm_mean24h": lambda: f"24-h mean glucose {_f(v)} mg/dL",
        "cgm_above_base": lambda: f"{_f(v)} mg/dL above the patient's 24-h baseline",
        "cgm_std180": lambda: f"3-h glucose variability SD {_f(v)} mg/dL",
        "meal_carbs_60": lambda: f"{_f(v)} g carbohydrate logged in the last hour",
        "meal_carbs_180": lambda: f"{_f(v)} g carbohydrate logged in the last 3 h",
        "meal_min_since": lambda: f"{_f(v)} min since the last logged meal" if v < 700 else "No meal logged in the last 12 h",
        "meal_last_carbs": lambda: f"Last meal contained {_f(v)} g carbohydrate",
        "meal_fat_180": lambda: f"{_f(v)} g fat in the last 3 h (slows absorption)",
        "meal_fiber_180": lambda: f"{_f(v)} g fibre in the last 3 h",
        "wear_mets30": lambda: f"Activity last 30 min: {_f(v, 1)} METs ({'active' if v > 2.5 else 'sedentary'})",
        "wear_mets60": lambda: f"Activity last hour: {_f(v, 1)} METs",
        "wear_mets120": lambda: f"Activity last 2 h: {_f(v, 1)} METs",
        "wear_active_min60": lambda: f"{_f(v)} active minutes in the last hour",
        "wear_steps60": lambda: f"{_f(v)} steps in the last hour",
        "wear_steps_today": lambda: f"{_f(v)} steps so far today",
        "wear_hr30": lambda: f"Heart rate {_f(v)} bpm (30-min mean)",
        "wear_hr_rel": lambda: f"Heart rate {_f(v)} bpm above resting",
        "wear_sleep_last_h": lambda: f"Slept {_f(v, 1)} h last night",
        "wear_sleep_deep_frac": lambda: f"Deep sleep {_f(v * 100)} % of last night",
        "wear_hrv_rmssd": lambda: f"Overnight HRV (RMSSD) {_f(v)} ms",
        "twin_gut_carbs": lambda: f"Twin: ~{_f(v)} g carbohydrate still being absorbed",
        "twin_ra": lambda: f"Twin: glucose entering blood at {_f(v, 1)} mg/dL/min",
        "twin_I": lambda: f"Twin: insulin {_f(v)} uU/mL above basal",
        "twin_X": lambda: f"Twin: insulin action {_f(v, 2)} (x1e-3/min)",
        "twin_d30": lambda: f"Physiology forecasts {'+' if v >= 0 else ''}{_f(v)} mg/dL in 30 min",
        "twin_d60": lambda: f"Physiology forecasts {'+' if v >= 0 else ''}{_f(v)} mg/dL in 60 min",
        "twin_d120": lambda: f"Physiology forecasts {'+' if v >= 0 else ''}{_f(v)} mg/dL in 2 h",
        "twin_peak120": lambda: f"Physiology predicts a peak {_f(v)} mg/dL above now",
        "twin_trough120": lambda: f"Physiology predicts a dip of {_f(-v)} mg/dL",
        "twin_p_insulin_sensitivity": lambda: f"Twin insulin sensitivity {_f(v, 1)} (x1e-4)",
        "twin_p_beta_cell_response": lambda: f"Twin beta-cell response {_f(v, 3)}",
        "twin_p_disposition_index": lambda: f"Twin disposition index {_f(v, 1)}",
        "ehr_hba1c": lambda: f"HbA1c {_f(v, 1)} %",
        "ehr_fpg": lambda: f"Fasting glucose {_f(v)} mg/dL",
        "ehr_homa_ir": lambda: f"HOMA-IR {_f(v, 1)} (insulin resistance)",
        "ehr_bmi": lambda: f"BMI {_f(v, 1)} kg/m2",
        "ehr_age": lambda: f"Age {_f(v)}",
        "ehr_egfr": lambda: f"eGFR {_f(v)} mL/min/1.73m2",
        "ehr_rx_sulfonylurea": lambda: "On a sulfonylurea" if v else "No sulfonylurea",
        "ehr_rx_insulin": lambda: "On basal insulin" if v else "No insulin",
        "ehr_diabetes_years": lambda: f"Diabetes for {_f(v)} years",
        "ehr_prs_percentile": lambda: f"Polygenic risk {_f(v)}th percentile",
        "cgm_d5": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last 5 min",
        "cgm_d10": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last 10 min",
        "cgm_d20": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last 20 min",
        "cgm_d45": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last 45 min",
        "cgm_d90": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last 90 min",
        "cgm_d120": lambda: f"Glucose {'rose' if v >= 0 else 'fell'} {_f(abs(v))} mg/dL in the last 2 h",
        "cgm_mean60": lambda: f"1-h mean glucose {_f(v)} mg/dL",
        "cgm_mean180": lambda: f"3-h mean glucose {_f(v)} mg/dL",
        "cgm_std60": lambda: f"1-h glucose variability SD {_f(v)} mg/dL",
        "cgm_max60": lambda: f"1-h peak {_f(v)} mg/dL above now",
        "cgm_max180": lambda: f"3-h peak {_f(v)} mg/dL above now",
        "cgm_min60": lambda: f"1-h low {_f(-v)} mg/dL below now",
        "cgm_min180": lambda: f"3-h low {_f(-v)} mg/dL below now",
        "cgm_p10_24h": lambda: f"24-h baseline (10th percentile) {_f(v)} mg/dL",
        "meal_carbs_360": lambda: f"{_f(v)} g carbohydrate logged in the last 6 h",
        "meal_kcal_60": lambda: f"{_f(v)} kcal logged in the last hour",
        "meal_kcal_180": lambda: f"{_f(v)} kcal logged in the last 3 h",
        "meal_protein_60": lambda: f"{_f(v)} g protein in the last hour",
        "meal_protein_180": lambda: f"{_f(v)} g protein in the last 3 h",
        "meal_fat_60": lambda: f"{_f(v)} g fat in the last hour",
        "meal_fiber_60": lambda: f"{_f(v)} g fibre in the last hour",
        "meal_count_today": lambda: f"{_f(v)} meals logged today",
        "wear_hr5": lambda: f"Heart rate {_f(v)} bpm now",
        "wear_hr_std60": lambda: f"Heart-rate variability over the last hour (SD {_f(v)} bpm)",
        "wear_mets15": lambda: f"Activity last 15 min: {_f(v, 1)} METs ({'active' if v > 2.5 else 'at rest'})",
        "wear_active_min180": lambda: f"{_f(v)} active minutes in the last 3 h",
        "twin_gut_fast": lambda: f"Twin: ~{_f(v)} g fast-absorbing carbohydrate in the gut",
        "twin_E": lambda: f"Twin: exercise effect {_f(v, 1)} (recent activity still lowering glucose)" if v > 0.2 else "Twin: no residual exercise effect",
        "twin_d90": lambda: f"Physiology forecasts {'+' if v >= 0 else ''}{_f(v)} mg/dL in 90 min",
        "twin_p_glucose_effectiveness": lambda: f"Twin glucose effectiveness {_f(v, 2)} %/min",
        "twin_p_basal_glucose": lambda: f"Twin basal glucose {_f(v)} mg/dL",
        "twin_p_absorption_speed": lambda: f"Twin meal-absorption speed {_f(v, 2)}x",
        "twin_p_exercise_response": lambda: f"Twin exercise response {_f(v, 2)}",
        "ehr_fasting_insulin": lambda: f"Fasting insulin {_f(v, 1)} uU/mL",
        "ehr_homa_b": lambda: f"HOMA-B {_f(v)} % (beta-cell function)",
        "ehr_tg": lambda: f"Triglycerides {_f(v)} mg/dL",
        "ehr_hdl": lambda: f"HDL {_f(v)} mg/dL",
        "ehr_tg_hdl": lambda: f"TG/HDL ratio {_f(v, 1)} (insulin-resistance marker)",
        "ehr_sex_male": lambda: "Male" if v else "Female",
        "ehr_sbp": lambda: f"Systolic BP {_f(v)} mmHg",
        "ehr_tcf7l2_risk_alleles": lambda: f"TCF7L2 risk alleles: {_f(v)}",
        "ehr_rx_metformin": lambda: "On metformin" if v else "No metformin",
        "ehr_rx_dpp4": lambda: "On a DPP-4 inhibitor" if v else "No DPP-4 inhibitor",
        "ehr_rx_sglt2": lambda: "On an SGLT2 inhibitor" if v else "No SGLT2 inhibitor",
        "ehr_rx_agi": lambda: "On an alpha-glucosidase inhibitor" if v else "No AGI",
        "ctx_hour_sin": lambda: "Time of day",
        "ctx_hour_cos": lambda: "Time of day",
    }
    fn = table.get(feature)
    if fn is None:
        return feature.replace("_", " ")
    try:
        return fn()
    except (TypeError, ValueError):
        return feature.replace("_", " ")


def top_drivers(contrib: dict, values: dict, k: int = 5) -> list[dict]:
    """Top-|SHAP| features with plain-language descriptions, merged where duplicated."""
    items = sorted(((f, c) for f, c in contrib.items() if f != "_bias"), key=lambda x: -abs(x[1]))
    out, seen = [], set()
    for f, c in items:
        text = describe(f, values.get(f))
        if text in seen:
            continue
        seen.add(text)
        out.append({"feature": f, "text": text, "impact": float(c),
                    "direction": "raises risk" if c > 0 else "lowers risk"})
        if len(out) >= k:
            break
    return out


def stream_shares(group_contrib: dict) -> list[dict]:
    tot = sum(abs(v) for v in group_contrib.values()) or 1.0
    rows = [{"stream": g, "label": STREAM_LABEL.get(g, g), "share": abs(v) / tot, "signed": float(v)}
            for g, v in group_contrib.items()]
    return sorted(rows, key=lambda r: -r["share"])
