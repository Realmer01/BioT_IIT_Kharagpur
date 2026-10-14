"""Bharat cohort: synthetic Indian patients with a full EHR and 14 days of wearables.

Why synthetic *and* real data?  CGMacros (real) proves the models work on real
physiology; it cannot show Indian diets, the Indian prescription mix, sleep
stages, step counts or medication-induced hypoglycaemia. The Bharat cohort fills
those gaps. Generation is physiology-first and deliberately imperfect, so the
twin has to *infer* what it is not told:

* each patient has hidden "true" physiology sampled from status-specific
  distributions (insulin sensitivity, beta-cell response, TCF7L2 effect, ...)
* glucose is simulated minute-by-minute with the true parameters, true meals,
  true activity, sleep debt, illness and medication adherence
* the twin only sees what a real deployment would: noisy lagged CGM samples,
  logged meals (carb-estimation error, some snacks unlogged), the prescribed
  regimen (not the doses actually taken), wearable data and the EHR
* labs (FPG, HbA1c, HOMA) are derived from the simulated glucose so the EHR is
  internally consistent

Population parameters follow ICMR-INDIAB (Anjana et al., Lancet Diabetes
Endocrinol 2023), Asian-Indian BMI/waist cut-offs, the Indian Diabetes Risk
Score (Mohan et al., JAPI 2005) and common RSSDI-era prescribing patterns.
All people are fictional; any resemblance to real persons is coincidental.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd

from madhutwin.config import SYNTHETIC
from madhutwin.data.indian_foods import BY_ID, foods_for
from madhutwin.physiology import model as M
from madhutwin.twin import drug_params

OUT = SYNTHETIC / "bharat"
START = pd.Timestamp("2026-09-30 00:00")
DAYS = 14

# ----------------------------------------------------------------------------- geography
CITIES = {
    "S": [("Bengaluru", "Karnataka", "Kannada"), ("Mysuru", "Karnataka", "Kannada"), ("Chennai", "Tamil Nadu", "Tamil"),
          ("Coimbatore", "Tamil Nadu", "Tamil"), ("Hyderabad", "Telangana", "Telugu"), ("Vijayawada", "Andhra Pradesh", "Telugu"),
          ("Kochi", "Kerala", "Malayalam"), ("Thiruvananthapuram", "Kerala", "Malayalam")],
    "N": [("New Delhi", "Delhi", "Hindi"), ("Lucknow", "Uttar Pradesh", "Hindi"), ("Jaipur", "Rajasthan", "Hindi"),
          ("Chandigarh", "Punjab", "Punjabi"), ("Patna", "Bihar", "Hindi")],
    "W": [("Mumbai", "Maharashtra", "Marathi"), ("Pune", "Maharashtra", "Marathi"), ("Ahmedabad", "Gujarat", "Gujarati"),
          ("Panaji", "Goa", "Konkani")],
    "E": [("Kolkata", "West Bengal", "Bengali"), ("Bhubaneswar", "Odisha", "Odia")],
}
REGION_P = {"S": 0.45, "N": 0.25, "W": 0.18, "E": 0.12}
NAMES = {
    "S": (["Ramesh", "Suresh", "Venkatesh", "Prakash", "Manjunath", "Karthik", "Senthil", "Srinivas", "Mohan", "Arun", "Ganesh", "Naveen", "Raghu", "Thomas"],
          ["Lakshmi", "Kavitha", "Meena", "Shanthi", "Radha", "Divya", "Sujatha", "Anitha", "Padma", "Revathi", "Geetha", "Vani", "Mary"],
          ["Rao", "Reddy", "Iyer", "Nair", "Gowda", "Pillai", "Shetty", "Naidu", "Murthy", "Krishnan", "Hegde", "Menon", "Varghese", "Kumar"]),
    "N": (["Rajesh", "Amit", "Sunil", "Vikram", "Anil", "Sanjay", "Rakesh", "Manoj", "Gurpreet", "Harish", "Deepak", "Imran", "Ashok"],
          ["Sunita", "Neha", "Pooja", "Anjali", "Rekha", "Seema", "Priya", "Kiran", "Manju", "Asha", "Simran", "Nazia"],
          ["Sharma", "Verma", "Gupta", "Singh", "Yadav", "Agarwal", "Mishra", "Chauhan", "Saxena", "Kapoor", "Khan", "Tiwari"]),
    "W": (["Mahesh", "Nilesh", "Sachin", "Hitesh", "Paresh", "Ajay", "Salman", "Joseph"],
          ["Snehal", "Hetal", "Swati", "Madhuri", "Jyoti", "Ayesha", "Annie"],
          ["Patil", "Deshmukh", "Patel", "Shah", "Joshi", "Kulkarni", "Desai", "Mehta", "Sheikh", "D'Souza"]),
    "E": (["Subhash", "Debashis", "Arindam", "Sourav", "Partha", "Biswajit"],
          ["Mousumi", "Rina", "Sharmistha", "Puja", "Ananya", "Sabita"],
          ["Banerjee", "Chatterjee", "Das", "Ghosh", "Mukherjee", "Sen", "Roy", "Bose", "Mohanty"]),
}

OCCUPATIONS = {
    #                    wake  dinner sleep  steps/min-awake  short-sleep-p  morning-walk-p
    "IT professional": (7.5, 21.9, 24.6, 2.0, 0.30, 0.15),
    "Bank officer": (6.6, 21.0, 23.3, 2.6, 0.12, 0.25),
    "School teacher": (6.0, 20.7, 22.8, 3.4, 0.08, 0.25),
    "Shop owner": (6.5, 21.6, 23.6, 3.6, 0.12, 0.10),
    "Homemaker": (5.8, 20.8, 22.6, 4.2, 0.08, 0.30),
    "Retired": (5.6, 20.3, 22.4, 3.6, 0.10, 0.55),
    "Auto-rickshaw driver": (6.0, 22.0, 23.8, 1.8, 0.20, 0.05),
    "Farmer": (5.0, 19.8, 21.8, 7.5, 0.05, 0.05),
}

ATC = {"Metformin": "A10BA02", "Glimepiride": "A10BB12", "Gliclazide": "A10BB09", "Teneligliptin": "A10BH08",
       "Sitagliptin": "A10BH01", "Vildagliptin": "A10BH02", "Dapagliflozin": "A10BK01", "Empagliflozin": "A10BK03",
       "Voglibose": "A10BF03", "Pioglitazone": "A10BG03", "Insulin glargine": "A10AE04",
       "Telmisartan": "C09CA07", "Amlodipine": "C08CA01", "Atorvastatin": "C10AA05", "Rosuvastatin": "C10AA07",
       "Aspirin": "B01AC06", "Levothyroxine": "H03AA01"}
CLASS = {"Metformin": "biguanide", "Glimepiride": "sulfonylurea", "Gliclazide": "sulfonylurea", "Teneligliptin": "dpp4",
         "Sitagliptin": "dpp4", "Vildagliptin": "dpp4", "Dapagliflozin": "sglt2", "Empagliflozin": "sglt2",
         "Voglibose": "agi", "Pioglitazone": "tzd", "Insulin glargine": "basal_insulin"}

# Featured personas: deterministic clinical stories for the demo.
PERSONAS = [
    dict(pid="BH-0001", first="Ramesh", last="Gowda", sex="M", age=61, region="S", city=("Mysuru", "Karnataka", "Kannada"),
         occupation="Retired", status="t2d", dm_years=14, ckd=True, bmi=23.4, phys=dict(Gb=150.0, SI=2.6e-4),
         rx=[("Metformin", 1000), ("Glimepiride", 3)], story="skip_lunch_walk",
         headline="Sulfonylurea + CKD: skips lunch and walks to the market on day 12 -> afternoon hypoglycaemia"),
    dict(pid="BH-0002", first="Lakshmi", last="Iyer", sex="F", age=54, region="S", city=("Chennai", "Tamil Nadu", "Tamil"),
         occupation="Homemaker", status="t2d", dm_years=8, rx=[("Metformin", 2000), ("Teneligliptin", 20)],
         story="rice_spikes", headline="Rice-heavy lunches drive repeated post-lunch spikes > 250 mg/dL"),
    dict(pid="BH-0003", first="Arjun", last="Reddy", sex="M", age=36, region="S", city=("Bengaluru", "Karnataka", "Kannada"),
         occupation="IT professional", status="prediabetes", rx=[], story="late_dinner_short_sleep", tcf7l2=2, prs=88,
         headline="Prediabetes: late dinners and 5-h deadline nights -> next-day insulin resistance"),
    dict(pid="BH-0004", first="Gurpreet", last="Singh", sex="M", age=66, region="N", city=("Chandigarh", "Punjab", "Punjabi"),
         occupation="Retired", status="t2d", dm_years=18, rx=[("Metformin", 2000), ("Dapagliflozin", 10), ("Insulin glargine", 18)],
         story="dawn", headline="Long-standing T2D on basal insulin: marked dawn phenomenon, fasting highs"),
    dict(pid="BH-0005", first="Fatima", last="Sheikh", sex="F", age=49, region="S", city=("Hyderabad", "Telangana", "Telugu"),
         occupation="School teacher", status="t2d", dm_years=5, bmi=24.6, phys=dict(Gb=134.0, SI=3.0e-4),
         rx=[("Metformin", 1000), ("Gliclazide", 120)],
         story="fasting_day", headline="Sulfonylurea during a day-long religious fast -> late-afternoon hypoglycaemia risk"),
    dict(pid="BH-0006", first="Sourav", last="Banerjee", sex="M", age=45, region="E", city=("Kolkata", "West Bengal", "Bengali"),
         occupation="Bank officer", status="t2d", dm_years=1, rx=[("Metformin", 1000)], story="wedding_feast",
         headline="Newly diagnosed: wedding feast with sweets on day 9 -> prolonged hyperglycaemia"),
]


@dataclass
class DayPlan:
    wake: float
    sleep_start: float  # hours after this day's midnight (may exceed 24)
    meals: list  # dicts: hour, food_id, portion, slot, logged
    walks: list  # (start_hour, minutes, steps_per_min)
    illness: bool = False
    meds_taken: bool = True
    note: str = ""


def _choice(rng, seq, p=None):
    return seq[rng.choice(len(seq), p=p)]


# ----------------------------------------------------------------------------- patient
def sample_patient(rng: np.random.Generator, idx: int, persona: dict | None = None) -> dict:
    pr = persona or {}
    region = pr.get("region") or _choice(rng, list(REGION_P), p=list(REGION_P.values()))
    city, state, language = pr.get("city") or _choice(rng, CITIES[region])
    sex = pr.get("sex") or ("M" if rng.random() < 0.55 else "F")
    males, females, surnames = NAMES[region]
    first = pr.get("first") or _choice(rng, males if sex == "M" else females)
    last = pr.get("last") or _choice(rng, surnames)
    status = pr.get("status") or _choice(rng, ["t2d", "prediabetes", "normal"], p=[0.66, 0.28, 0.06])
    age = pr.get("age") or int(np.clip(rng.normal({"t2d": 55, "prediabetes": 44, "normal": 38}[status], 10), 28, 82))
    occupation = pr.get("occupation") or (
        "Retired" if age >= 62 else _choice(rng, [o for o in OCCUPATIONS if o != "Retired"]))
    height = rng.normal(166 if sex == "M" else 153, 6)
    bmi = float(pr.get("bmi") or np.clip(rng.normal({"t2d": 27.0, "prediabetes": 26.3, "normal": 23.2}[status], 3.6), 18.5, 42))
    weight = bmi * (height / 100) ** 2
    waist = float(np.clip((86 if sex == "M" else 80) + 2.3 * (bmi - 24) + rng.normal(0, 4), 62, 135))
    fam = int(_choice(rng, [0, 1, 2], p=[0.35, 0.5, 0.15] if status != "normal" else [0.6, 0.35, 0.05]))
    tcf7l2 = pr.get("tcf7l2", int(rng.binomial(2, 0.30)))  # rs7903146 T-allele, freq ~0.3 in Indians
    prs = float(pr.get("prs", np.clip(rng.normal({"t2d": 68, "prediabetes": 60, "normal": 40}[status], 22), 1, 99)))
    dm_years = float(pr.get("dm_years", np.clip(rng.exponential(7) + 0.5, 0.5, 28) if status == "t2d" else 0.0))

    # ------------------------------------------------ hidden physiology (drug-free)
    base = {"t2d": (1.8e-4, 0.060, 0.011), "prediabetes": (3.4e-4, 0.14, 0.016), "normal": (6.5e-4, 0.28, 0.021)}[status]
    si = base[0] * np.exp(rng.normal(0, 0.30)) * np.exp(-0.035 * (bmi - 24)) * np.exp(-0.004 * (prs - 50))
    beta = base[1] * np.exp(rng.normal(0, 0.30)) * 0.88 ** tcf7l2 * np.exp(-0.035 * dm_years)
    sg = base[2] * np.exp(rng.normal(0, 0.2))
    di = si * 1e4 * beta * 10
    gb = float(np.clip(82 + 110 * np.exp(-0.3 * di) + rng.normal(0, 8), 75, 290))
    if status == "normal":
        gb = float(np.clip(rng.normal(88, 5), 78, 99))
    elif status == "prediabetes":
        gb = float(np.clip(gb, 100, 125))
    ckd = bool(pr.get("ckd", status == "t2d" and rng.random() < 0.10 + 0.012 * dm_years))
    p = M.default_params(
        Gb=gb, SG=sg, SI=si, beta=beta, k_scale=float(np.exp(rng.normal(0, 0.22))), f=float(0.72 * np.exp(rng.normal(0, 0.12))),
        alpha_ex=float(0.004 * np.exp(rng.normal(0, 0.3))),
        dawn=float((0.06 if status == "t2d" else 0.015) * np.exp(rng.normal(0, 0.5))),
        circ=float(np.clip(rng.normal(-0.05, 0.08), -0.3, 0.3)), BW=weight, n=0.14 * (0.72 if ckd else 1.0),
    )
    for k, v in pr.get("phys", {}).items():
        p[M.P[k]] = v
    if status == "t2d" and not pr and rng.random() < 0.35:
        # a subset is tightly controlled (often the patients hypoglycaemia catches out)
        p[M.P["Gb"]] *= 0.88
        p[M.P["SI"]] *= 1.3
    if pr.get("story") == "dawn":
        p[M.P["dawn"]] = 0.28
    if pr.get("story") == "rice_spikes":
        p[M.P["k_scale"]] = 1.35
        p[M.P["beta"]] *= 0.75

    # ------------------------------------------------ comorbidities & regimen
    htn = rng.random() < {"t2d": 0.55, "prediabetes": 0.35, "normal": 0.12}[status] + 0.004 * (age - 50)
    dyslip = rng.random() < {"t2d": 0.62, "prediabetes": 0.45, "normal": 0.2}[status]
    nafld = rng.random() < {"t2d": 0.42, "prediabetes": 0.3, "normal": 0.1}[status] + 0.01 * (bmi - 25)
    retino = status == "t2d" and rng.random() < 0.02 * dm_years
    neuro = status == "t2d" and rng.random() < 0.015 * dm_years
    hypothyroid = sex == "F" and rng.random() < 0.11
    cad = status == "t2d" and rng.random() < 0.004 * (age - 35)
    if "rx" in pr:
        rx = list(pr["rx"])
    elif status == "t2d":
        rx = []
        if rng.random() < 0.92:
            rx.append(("Metformin", 500 if ckd else int(_choice(rng, [1000, 1500, 2000], p=[0.35, 0.3, 0.35]))))
        if rng.random() < 0.40:
            rx.append(_choice(rng, [("Glimepiride", int(_choice(rng, [1, 2, 3, 4]))), ("Gliclazide", int(_choice(rng, [60, 80, 120])))]))
        if rng.random() < 0.45:
            rx.append(_choice(rng, [("Teneligliptin", 20), ("Sitagliptin", 100), ("Vildagliptin", 100)], p=[0.5, 0.3, 0.2]))
        if rng.random() < 0.25 and not ckd:
            rx.append(_choice(rng, [("Dapagliflozin", 10), ("Empagliflozin", 25)]))
        if rng.random() < 0.10:
            rx.append(("Voglibose", 0.6))
        if rng.random() < 0.07:
            rx.append(("Pioglitazone", 15))
        if rng.random() < 0.06 + 0.012 * dm_years:
            rx.append(("Insulin glargine", int(rng.integers(10, 30))))
    elif status == "prediabetes" and rng.random() < 0.3:
        rx = [("Metformin", 500)]
    else:
        rx = []
    regimen = [{"drug": d, "class": CLASS[d], "atc": ATC[d],
                ("daily_units" if d == "Insulin glargine" else "daily_dose_mg"): dose,
                "frequency": "once daily (bedtime)" if d == "Insulin glargine" else
                ("twice daily" if d in ("Metformin", "Vildagliptin") and dose > 500 else
                 "thrice daily with meals" if d == "Voglibose" else "once daily")} for d, dose in rx]
    other_rx = []
    if htn:
        other_rx.append({"drug": "Telmisartan", "atc": ATC["Telmisartan"], "daily_dose_mg": 40, "frequency": "once daily"})
    if dyslip:
        other_rx.append({"drug": "Atorvastatin", "atc": ATC["Atorvastatin"], "daily_dose_mg": 20, "frequency": "once daily"})
    if cad:
        other_rx.append({"drug": "Aspirin", "atc": ATC["Aspirin"], "daily_dose_mg": 75, "frequency": "once daily"})
    if hypothyroid:
        other_rx.append({"drug": "Levothyroxine", "atc": ATC["Levothyroxine"], "daily_dose_mg": 0.05, "frequency": "once daily"})

    occ = OCCUPATIONS[occupation]
    lifestyle = {
        "occupation": occupation, "wake": occ[0], "dinner": occ[1], "sleep": occ[2], "steps_rate": occ[3] * np.exp(rng.normal(0, 0.25)),
        "short_sleep_p": occ[4], "morning_walk": rng.random() < occ[5] * (1.4 if status != "normal" else 1.0),
        "post_dinner_walk": rng.random() < 0.18, "chai_sugar": rng.random() < 0.7, "chai_per_day": int(_choice(rng, [1, 2, 3], p=[0.25, 0.5, 0.25])),
        "healthy_choice": float(np.clip(rng.normal(0.35, 0.2), 0, 0.9)), "portion": float(np.clip(rng.normal(1.0 + 0.02 * (bmi - 25), 0.12), 0.7, 1.4)),
        "adherence": float(np.clip(rng.normal(0.88, 0.08), 0.6, 1.0)) if rx else 1.0,
        "hr_rest": float(np.clip(rng.normal(76 if status == "t2d" else 70, 7), 55, 95)),
        "hrv_base": float(np.clip(rng.normal(34 - 0.25 * (age - 40) - (5 if status == "t2d" else 0), 7), 10, 70)),
        "diet_region": region,
    }
    if occupation == "Farmer":
        lifestyle["morning_walk"] = False

    return dict(
        pid=pr.get("pid") or f"BH-{idx:04d}", first=first, last=last, sex=sex, age=age, region=region, city=city, state=state,
        language=language, status=status, height_cm=float(height), weight_kg=float(weight), bmi=bmi, waist_cm=waist,
        family_history=fam, tcf7l2=int(tcf7l2), prs=prs, dm_years=dm_years, ckd=ckd,
        comorb=dict(hypertension=bool(htn), dyslipidaemia=bool(dyslip), nafld=bool(nafld), retinopathy=bool(retino),
                    neuropathy=bool(neuro), hypothyroidism=bool(hypothyroid), cad=bool(cad), ckd=ckd),
        regimen=regimen, other_rx=other_rx, true_params=p, lifestyle=lifestyle,
        story=pr.get("story"), headline=pr.get("headline"), featured=bool(persona),
    )


# ----------------------------------------------------------------------------- daily plans
def _pick_food(rng, slot, region, healthy):
    opts = foods_for(slot, region)
    gl = np.array([f["gi"] * f["carbs"] / 100 for f in opts])
    w = np.exp(-healthy * 3.0 * (gl - gl.min()) / max(gl.ptp(), 1e-9))
    return opts[rng.choice(len(opts), p=w / w.sum())]["id"]


def plan_days(rng: np.random.Generator, pt: dict) -> list[DayPlan]:
    ls = pt["lifestyle"]
    region = ls["diet_region"]
    story = pt["story"]
    feast_day = 8 if story == "wedding_feast" else (int(rng.integers(3, DAYS)) if rng.random() < 0.45 else -1)
    ill_day = int(rng.integers(2, DAYS - 1)) if (rng.random() < 0.10 and not pt["featured"]) else -1
    plans = []
    for d in range(DAYS):
        weekday = (START + pd.Timedelta(days=d)).dayofweek
        weekend = weekday >= 5
        wake = ls["wake"] + rng.normal(0, 0.3) + (0.8 if weekend else 0)
        short = rng.random() < ls["short_sleep_p"]
        if story == "late_dinner_short_sleep" and d in (3, 4, 9, 10):
            short = True
        sleep = ls["sleep"] + rng.normal(0, 0.35) + (0.5 if weekend else 0) + (1.8 if short else 0)
        meals = []
        hp = ls["healthy_choice"]
        por = ls["portion"]

        def add(hour, fid, slot, portion=1.0, logged_p=0.97):
            meals.append(dict(hour=hour, food_id=fid, slot=slot, portion=portion * por * np.exp(rng.normal(0, 0.12)),
                              logged=rng.random() < logged_p))

        # morning beverage
        add(wake + 0.25, "chai_sugar" if ls["chai_sugar"] else "chai_nosugar", "drink", logged_p=0.8)
        if rng.random() > 0.07:
            add(wake + 1.0 + rng.normal(0, 0.25), _pick_food(rng, "breakfast", region, hp), "breakfast")
        lunch_h = 13.2 + rng.normal(0, 0.4)
        irregular = ls["occupation"] in ("Shop owner", "Auto-rickshaw driver", "School teacher", "Bank officer")
        if irregular and rng.random() < 0.2:
            lunch_h = 15.0 + rng.uniform(0, 0.8)  # delayed lunch on busy days
        skip_lunch = rng.random() < (0.08 if irregular else 0.04)
        if story == "skip_lunch_walk" and d == 11:
            skip_lunch = True
        fasting = story == "fasting_day" and d == 10
        if fasting:
            meals = [m for m in meals if m["slot"] != "breakfast" and m["slot"] != "drink"]
            add(4.6, "dal_khichdi", "breakfast", 0.6)  # pre-dawn meal
        elif not skip_lunch:
            if story == "rice_spikes":
                fid = _choice(rng, ["rice_sambar", "rice_rasam_curd", "south_meals", "curd_rice"])
            elif weekend and rng.random() < 0.4:
                fid = _choice(rng, ["chicken_biryani", "veg_biryani"] + (["chole_bhature", "north_thali"] if region == "N" else ["south_meals"]))
            else:
                fid = _pick_food(rng, "lunch", region, hp)
            add(lunch_h, fid, "lunch", 1.15 if story == "rice_spikes" else 1.0)
        if not fasting:
            add(17.0 + rng.normal(0, 0.4), "chai_sugar" if ls["chai_sugar"] else "chai_nosugar", "drink", logged_p=0.75)
            if rng.random() < 0.6:
                add(17.1 + rng.normal(0, 0.4), _pick_food(rng, "snack", region, hp), "snack", logged_p=0.8)
        dinner_h = ls["dinner"] + rng.normal(0, 0.4) + (0.4 if weekend else 0)
        if story == "late_dinner_short_sleep":
            dinner_h = 22.4 + rng.normal(0, 0.3)
        if fasting:
            add(18.4, "dal_khichdi", "dinner", 0.6)
            add(18.5, "banana", "snack")
            add(19.8, "chicken_biryani", "dinner")
        else:
            add(dinner_h, _pick_food(rng, "dinner", region, hp), "dinner")
        if d == feast_day:
            meals = [m for m in meals if m["slot"] not in ("lunch",)]
            add(13.5, "north_thali" if region in ("N", "W") else ("macher_jhol" if region == "E" else "south_meals"), "lunch", 1.3)
            add(14.2, _choice(rng, ["gulab_jamun", "payasam", "jalebi", "mysore_pak"]), "sweet", 1.2, 0.85)
            add(14.3, "besan_laddoo", "sweet", 1.0, 0.7)
        elif rng.random() < 0.12:
            add(lunch_h + 0.6, _choice(rng, ["gulab_jamun", "payasam", "besan_laddoo", "mysore_pak"]), "sweet", 1.0, 0.75)

        walks = []
        if ls["morning_walk"] and rng.random() < 0.8:
            walks.append((wake + 0.4, int(rng.integers(25, 45)), float(rng.normal(105, 8))))
        if ls["post_dinner_walk"] and rng.random() < 0.7:
            walks.append((dinner_h + 0.6, int(rng.integers(10, 20)), float(rng.normal(95, 8))))
        for _ in range(rng.poisson(2.5)):
            walks.append((float(rng.uniform(wake + 1, sleep - 1)), int(rng.integers(4, 15)), float(rng.normal(90, 10))))
        if story == "skip_lunch_walk" and d == 11:
            walks.append((14.4, 75, 98.0))  # long walk to the market in the afternoon
        if story == "fasting_day" and d == 10:
            walks.append((15.2, 40, 92.0))
        taken = rng.random() < ls["adherence"]
        if story in ("skip_lunch_walk", "fasting_day"):
            taken = True
        plans.append(DayPlan(wake=wake, sleep_start=sleep, meals=meals, walks=walks, illness=(d in (ill_day, ill_day + 1)),
                             meds_taken=taken, note="feast" if d == feast_day else ""))
    return plans


# ----------------------------------------------------------------------------- simulation
def _hypnogram(rng, minutes: int) -> np.ndarray:
    """0 wake, 1 light, 2 deep, 3 REM — ~90-min cycles, deep early, REM late."""
    st = np.ones(minutes, dtype=np.int8)
    t = 0
    cycle = 0
    while t < minutes:
        L = int(rng.normal(92, 10))
        frac = cycle / 5.0
        deep = int(L * max(0.28 - 0.22 * frac, 0.03))
        rem = int(L * min(0.10 + 0.22 * frac, 0.35))
        light_a = int((L - deep - rem) * 0.6)
        seq = [1] * light_a + [2] * deep + [1] * (L - deep - rem - light_a) + [3] * rem
        seq = np.array(seq[: max(0, minutes - t)], dtype=np.int8)
        st[t:t + len(seq)] = seq
        t += max(len(seq), 1)
        cycle += 1
    wakes = rng.random(minutes) < 0.006
    for i in np.flatnonzero(wakes):
        st[i:i + int(rng.integers(1, 6))] = 0
    st[: int(rng.integers(8, 20))] = 0  # sleep latency
    return st


def simulate_patient(rng: np.random.Generator, pt: dict, plans: list[DayPlan]) -> dict:
    n = DAYS * 1440
    minutes = np.arange(n)
    hour_of_day = (minutes % 1440) / 60.0
    in_f = np.zeros(n)
    in_s = np.zeros(n)
    steps = np.zeros(n)
    asleep = np.zeros(n, bool)
    si_true = np.ones(n)
    egp_true = np.ones(n)
    hr_extra = np.zeros(n)
    true_meals, logged_meals = [], []
    sleep_hours = np.full(DAYS, 7.0)
    deep_frac = np.full(DAYS, 0.18)
    stage = np.full(n, -1, dtype=np.int8)
    ls = pt["lifestyle"]

    for d, pl in enumerate(plans):
        day0 = d * 1440
        # sleep window from this day's sleep_start to next day's wake
        s0 = day0 + int(pl.sleep_start * 60)
        nxt_wake = plans[d + 1].wake if d + 1 < DAYS else plans[d].wake
        s1 = (d + 1) * 1440 + int(nxt_wake * 60)
        if d == 0:  # night before the record starts
            pre = int(pl.wake * 60)
            asleep[:pre] = True
            stage[:pre] = _hypnogram(rng, pre)
        s0c, s1c = min(s0, n), min(s1, n)
        if s1c > s0c:
            asleep[s0c:s1c] = True
            hyp = _hypnogram(rng, s1 - s0)[: s1c - s0c]
            stage[s0c:s1c] = hyp
            if d + 1 < DAYS:
                sleep_hours[d + 1] = float(np.sum(hyp > 0) / 60.0) if s1 <= n else (s1 - s0) / 60.0 * 0.9
                deep_frac[d + 1] = float(np.mean(hyp == 2)) if len(hyp) else 0.18
        # awake steps
        awake = ~asleep[day0:day0 + 1440]
        rate = ls["steps_rate"] * (0.4 if pl.illness else 1.0)
        steps[day0:day0 + 1440] += np.where(awake, rng.poisson(rate, 1440), 0)
        for (h, dur, spm) in pl.walks:
            a = day0 + int(h * 60)
            b = min(a + dur, n)
            if a < n:
                steps[a:b] = rng.normal(spm, 6, b - a).clip(40, 140)
        if pl.illness:
            si_true[day0:day0 + 1440] *= 0.72
            egp_true[day0:day0 + 1440] *= 1.22
            hr_extra[day0:day0 + 1440] += 13
        for m in pl.meals:
            food = BY_ID[m["food_id"]]
            t = day0 + int(m["hour"] * 60)
            if t >= n:
                continue
            c = food["carbs"] * m["portion"]
            ff = float(M.fast_fraction(c, food["protein"] * m["portion"], food["fat"] * m["portion"],
                                       food["fiber"] * m["portion"], np.array([food["gi"] * np.exp(rng.normal(0, 0.08))]))[0])
            in_f[t] += c * ff
            in_s[t] += c * (1 - ff)
            hr_extra[t:t + 60] += 3
            rec = dict(time=START + pd.Timedelta(minutes=t), meal_type=m["slot"], name=food["name"], food_id=food["id"],
                       carbs=c, protein=food["protein"] * m["portion"], fat=food["fat"] * m["portion"],
                       fiber=food["fiber"] * m["portion"], kcal=food["kcal"] * m["portion"], gi=food["gi"], portion=m["portion"])
            true_meals.append(rec)
            if m["logged"]:
                err = float(np.exp(rng.normal(0, 0.18)))  # carb-estimation error of self-logging
                logged_meals.append({**rec, "carbs": rec["carbs"] * err, "kcal": rec["kcal"] * err})

    # sleep debt from the previous night lowers today's insulin sensitivity (true physiology)
    day_idx = minutes // 1440
    debt = np.clip(7.0 - sleep_hours[day_idx], 0, 4)
    si_true *= 1.0 - 0.06 * debt  # same direction as the twin's model, different magnitude/shape

    mets = np.where(asleep, 0.95, 1.25 + 0.028 * steps)
    u_ex = np.clip(mets - 1.5, 0, 12)

    # simulate day by day with that day's medication adherence
    G = np.empty(n)
    base_p = pt["true_params"].copy()
    dp_full = drug_params(pt["regimen"])
    x = None
    for d, pl in enumerate(plans):
        p = base_p.copy()
        if pl.meds_taken:
            for k, v in dp_full.items():
                p[M.P[k]] = v
        if x is None:
            x = M.steady_state(p)
            sl = slice(0, 1440)  # burn-in day
            M.simulate(p, x, in_f[sl], in_s[sl], u_ex[sl], si_true[sl], egp_true[sl], 0.0)
        sl = slice(d * 1440, (d + 1) * 1440)
        tr = M.simulate(p, x, in_f[sl], in_s[sl], u_ex[sl], si_true[sl], egp_true[sl], 0.0)
        G[sl] = tr[1:, 0]
        x = tr[-1].copy()

    # ------------------------------------------------ CGM sensor model
    ig = np.empty(n)
    ig[0] = G[0]
    for t in range(1, n):
        ig[t] = ig[t - 1] + (G[t] - ig[t - 1]) / 8.0  # ~8 min interstitial lag
    phase = int(rng.integers(0, 5))
    samp = np.flatnonzero((minutes % 5) == phase)
    e = np.zeros(len(samp))
    for k in range(1, len(samp)):
        e[k] = 0.7 * e[k - 1] + rng.normal(0, 3.3)
    cgm = np.full(n, np.nan)
    gain = rng.normal(1.0, 0.03)
    cgm[samp] = np.clip(ig[samp] * gain + e, 40, 400)
    for _ in range(rng.poisson(1.5)):
        a = int(rng.integers(0, n - 300))
        cgm[a:a + int(rng.integers(40, 220))] = np.nan
    drop = rng.random(n) < 0.008
    cgm[drop] = np.nan

    # ------------------------------------------------ heart rate & HRV
    hr = ls["hr_rest"] + 0.55 * (mets - 1.0) * 12 + 2.5 * np.sin(2 * np.pi * (hour_of_day - 16) / 24) + hr_extra
    hr = np.where(asleep, ls["hr_rest"] - 8 + hr_extra * 0.6, hr)
    ar = np.zeros(n)
    noise = rng.normal(0, 1.4, n)
    for t in range(1, n):
        ar[t] = 0.95 * ar[t - 1] + noise[t]
    hr = np.clip(hr + ar, 42, 185)
    hr[rng.random(n) < 0.01] = np.nan
    hrv = ls["hrv_base"] * np.exp(rng.normal(0, 0.12, DAYS)) * (1 - 0.04 * np.clip(7 - sleep_hours, 0, 4))

    t_index = START + pd.to_timedelta(minutes, unit="min")
    minute_df = pd.DataFrame({
        "time": t_index, "cgm": cgm, "hr": hr, "mets": mets, "kcal": mets * pt["weight_kg"] / 60.0, "steps": steps,
        "sleep_stage": np.where(stage >= 0, stage, np.nan),
        # daily wearable summaries become available at wake-up (causal)
        "sleep_last_h": sleep_hours[day_idx], "sleep_deep_frac": deep_frac[day_idx], "hrv_rmssd": hrv[day_idx],
        "true_glucose": G, "true_si_mult": si_true, "true_egp_mult": egp_true,
    })
    meals_df = pd.DataFrame(logged_meals).sort_values("time").reset_index(drop=True)
    true_df = pd.DataFrame(true_meals).sort_values("time").reset_index(drop=True)
    wake_min = [d * 1440 + int(pl.wake * 60) for d, pl in enumerate(plans)]
    return {"minute": minute_df, "meals": meals_df, "meals_true": true_df, "sleep_hours": sleep_hours, "wake_min": wake_min}


# ----------------------------------------------------------------------------- EHR
def build_ehr(rng: np.random.Generator, pt: dict, sim: dict) -> dict:
    G = sim["minute"]["true_glucose"].to_numpy()
    # fasting plasma glucose: the hour before waking (before the first chai), averaged over days
    fasting = np.concatenate([G[max(w - 60, 0):w] for w in sim["wake_min"]])
    fpg = float(np.mean(fasting) + rng.normal(0, 4))
    a1c = float(np.clip((np.mean(G) + 46.7) / 28.7 + rng.normal(0, 0.15), 4.6, 13.5))
    si = pt["true_params"][M.P["SI"]]
    homa_ir = float(6e-4 / si * np.exp(rng.normal(0, 0.25)))
    fi = homa_ir * 405 / fpg
    ir_idx = np.clip(homa_ir / 2.5, 0.2, 3)
    tg = float(np.clip(110 + 45 * ir_idx + rng.normal(0, 30), 50, 600))
    hdl = float(np.clip((42 if pt["sex"] == "M" else 48) - 4 * ir_idx + rng.normal(0, 5), 22, 90))
    ldl = float(np.clip(rng.normal(108 if not pt["comorb"]["dyslipidaemia"] else 128, 28), 40, 230))
    egfr = float(np.clip(108 - 0.8 * (pt["age"] - 30) - (40 if pt["ckd"] else 0) + rng.normal(0, 8), 18, 125))
    htn = pt["comorb"]["hypertension"]
    sbp = float(rng.normal(138 if htn else 122, 10))
    dbp = float(rng.normal(86 if htn else 78, 7))
    met_years = pt["dm_years"] if any(r["drug"] == "Metformin" for r in pt["regimen"]) else 0
    b12 = float(np.clip(rng.normal(380 - 25 * min(met_years, 10), 80), 90, 900))
    cpep = float(0.6 + 5 * pt["true_params"][M.P["beta"]] * np.exp(rng.normal(0, 0.15)))
    alt = float(np.clip(rng.normal(48 if pt["comorb"]["nafld"] else 26, 10), 8, 140))
    acr = float(np.clip(rng.lognormal(np.log(45 if pt["ckd"] else 12), 0.6), 2, 900))

    # IDRS (Mohan et al. 2005)
    idrs = (0 if pt["age"] < 35 else 20 if pt["age"] < 50 else 30)
    w_lo, w_hi = (90, 100) if pt["sex"] == "M" else (80, 90)
    idrs += 0 if pt["waist_cm"] < w_lo else 10 if pt["waist_cm"] < w_hi else 20
    act = pt["lifestyle"]["occupation"]
    idrs += 0 if act == "Farmer" else 10 if pt["lifestyle"]["morning_walk"] else 20 if act in ("Homemaker", "Shop owner") else 30
    idrs += [0, 10, 20][pt["family_history"]]

    # HbA1c history (quarterly, 2 years back), drifting toward current value
    hist = []
    v = a1c + (rng.normal(0.6, 0.5) if pt["status"] == "t2d" else rng.normal(-0.15, 0.15))
    for q in range(8, 0, -1):
        date = (START - pd.Timedelta(days=91 * q)).date().isoformat()
        v = v + (a1c - v) * 0.25 + rng.normal(0, 0.18)
        if pt["status"] == "t2d" and pt["dm_years"] * 4 < q:
            continue
        hist.append({"date": date, "hba1c": round(float(v), 1)})
    hist.append({"date": (START - pd.Timedelta(days=2)).date().isoformat(), "hba1c": round(a1c, 1)})

    dx = []
    onset = START - pd.Timedelta(days=int(365 * max(pt["dm_years"], 0.3)))
    if pt["status"] == "t2d":
        dx.append({"code": "E11", "snomed": "44054006", "display": "Type 2 diabetes mellitus", "onset": onset.date().isoformat()})
    elif pt["status"] == "prediabetes":
        dx.append({"code": "R73.03", "snomed": "714628002", "display": "Prediabetes",
                   "onset": (START - pd.Timedelta(days=int(rng.integers(60, 900)))).date().isoformat()})
    cm = pt["comorb"]
    for flag, icd, sn, disp in [("hypertension", "I10", "38341003", "Essential hypertension"),
                                ("dyslipidaemia", "E78.5", "55822004", "Dyslipidaemia"),
                                ("nafld", "K76.0", "197321007", "Non-alcoholic fatty liver disease"),
                                ("ckd", "N18.3", "433144002", "Chronic kidney disease stage 3"),
                                ("retinopathy", "E11.3", "4855003", "Diabetic retinopathy"),
                                ("neuropathy", "E11.4", "230572002", "Diabetic peripheral neuropathy"),
                                ("hypothyroidism", "E03.9", "40930008", "Hypothyroidism"),
                                ("cad", "I25.1", "53741008", "Coronary artery disease")]:
        if cm.get(flag):
            dx.append({"code": icd, "snomed": sn, "display": disp,
                       "onset": (START - pd.Timedelta(days=int(rng.integers(90, 3000)))).date().isoformat()})
    if pt["bmi"] >= 25:
        dx.append({"code": "E66.9", "snomed": "414916001", "display": "Obesity (Asian-Indian BMI >= 25)", "onset": None})
    if b12 < 200:
        dx.append({"code": "D51.9", "snomed": "190634004", "display": "Vitamin B12 deficiency (metformin-associated?)", "onset": None})

    rxflags = {c: any(r["class"] == c for r in pt["regimen"]) for c in
               ("biguanide", "sulfonylurea", "dpp4", "sglt2", "agi", "basal_insulin")}
    return {
        "patient_id": pt["pid"], "name": f"{pt['first']} {pt['last']}", "sex": pt["sex"], "age": pt["age"],
        "city": pt["city"], "state": pt["state"], "language": pt["language"], "occupation": pt["lifestyle"]["occupation"],
        "group": pt["status"], "featured": pt["featured"], "headline": pt["headline"], "story": pt["story"],
        "source": "Bharat synthetic cohort (fictional patient)",
        "height_cm": round(pt["height_cm"], 1), "weight_kg": round(pt["weight_kg"], 1), "bmi": round(pt["bmi"], 1),
        "waist_cm": round(pt["waist_cm"], 1), "sbp": round(sbp), "dbp": round(dbp),
        "hba1c": round(a1c, 1), "fpg": round(fpg), "fasting_insulin": round(fi, 1), "c_peptide": round(cpep, 2),
        "homa_ir": round(homa_ir, 2), "homa_b": round(360 * fi / max(fpg - 63, 5), 1),
        "tg": round(tg), "hdl": round(hdl), "ldl": round(ldl), "tg_hdl": round(tg / hdl, 2),
        "total_chol": round(ldl + hdl + tg / 5), "egfr": round(egfr), "urine_acr": round(acr, 1), "alt": round(alt),
        "vitamin_b12": round(b12), "diabetes_years": round(pt["dm_years"], 1),
        "family_history_t2d": ["none", "one parent", "both parents"][pt["family_history"]],
        "tcf7l2_rs7903146": ["CC", "CT", "TT"][pt["tcf7l2"]], "tcf7l2_risk_alleles": pt["tcf7l2"],
        "prs_percentile": round(pt["prs"]), "idrs": idrs,
        "diagnoses": dx, "regimen": pt["regimen"], "other_medications": pt["other_rx"], "hba1c_history": hist,
        "rx_metformin": float(rxflags["biguanide"]), "rx_sulfonylurea": float(rxflags["sulfonylurea"]),
        "rx_dpp4": float(rxflags["dpp4"]), "rx_sglt2": float(rxflags["sglt2"]), "rx_agi": float(rxflags["agi"]),
        "rx_insulin": float(rxflags["basal_insulin"]),
        "lifestyle": {k: (round(v, 2) if isinstance(v, float) else v) for k, v in pt["lifestyle"].items()},
        "consent": {"purpose": "Remote glycaemic monitoring and clinical decision support",
                    "granted": (START - pd.Timedelta(days=1)).date().isoformat(), "dpdp_notice_language": pt["language"],
                    "data_shared_with": ["Treating endocrinologist", "Care coordinator"], "retention_days": 365},
    }


def generate(n_patients: int = 80, seed: int = 2026, verbose: bool = True) -> pd.DataFrame:
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n_patients):
        persona = PERSONAS[i] if i < len(PERSONAS) else None
        prng = np.random.default_rng(seed * 1000 + i)
        pt = sample_patient(prng, i + 1, persona)
        plans = plan_days(prng, pt)
        sim = simulate_patient(prng, pt, plans)
        ehr = build_ehr(prng, pt, sim)
        pid = pt["pid"]
        sim["minute"].to_parquet(OUT / f"{pid}_minute.parquet", index=False)
        sim["meals"].to_parquet(OUT / f"{pid}_meals.parquet", index=False)
        sim["meals_true"].to_parquet(OUT / f"{pid}_meals_true.parquet", index=False)
        truth = {k: float(pt["true_params"][M.P[k]]) for k in M.PARAM_NAMES}
        with open(OUT / f"{pid}_ehr.json", "w", encoding="utf-8") as f:
            json.dump(ehr, f, indent=1, ensure_ascii=False)
        with open(OUT / f"{pid}_truth.json", "w") as f:
            json.dump({"true_params": truth, "days": [p.__dict__ for p in plans]}, f, default=float)
        G = sim["minute"]["true_glucose"].to_numpy()
        flat = {k: v for k, v in ehr.items() if not isinstance(v, (list, dict))}
        flat.update(tir=float(np.mean((G >= 70) & (G <= 180)) * 100), tbr=float(np.mean(G < 70) * 100),
                    tar=float(np.mean(G > 180) * 100), mean_g=float(G.mean()), cv=float(G.std() / G.mean() * 100))
        rows.append(flat)
        if verbose:
            print(f"{pid} {ehr['name']:22s} {pt['status']:11s} A1c {ehr['hba1c']:4.1f}  TIR {flat['tir']:5.1f}%  "
                  f"TBR {flat['tbr']:4.1f}%  meals {len(sim['meals'])}  rx {[r['drug'] for r in pt['regimen']]}")
    cohort = pd.DataFrame(rows)
    cohort.to_parquet(OUT / "cohort.parquet", index=False)
    return cohort


def load_patient(pid: str):
    minute = pd.read_parquet(OUT / f"{pid}_minute.parquet")
    meals = pd.read_parquet(OUT / f"{pid}_meals.parquet")
    with open(OUT / f"{pid}_ehr.json", encoding="utf-8") as f:
        ehr = json.load(f)
    return minute, meals, ehr


def load_cohort() -> pd.DataFrame:
    return pd.read_parquet(OUT / "cohort.parquet")


if __name__ == "__main__":
    generate()
