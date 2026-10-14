"""Backend service: loads the cohort, twins and models once and answers dashboard queries.

Design choices worth knowing when defending the demo:
* Every ML number shown for a patient comes from the cross-validation fold model
  that never saw that patient (out-of-fold), never from an in-sample fit.
* The forecast curve blends the twin's minute-level trajectory (shape) with the
  ML horizon predictions (level): curve = twin(t) + interpolated ML residual.
* What-if: ML provides the expected path, physiology provides the counterfactual
  difference between scenarios (the part ML cannot learn from observational data).
"""
from __future__ import annotations

import json
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

from madhutwin import agp as AGP
from madhutwin import copilot
from madhutwin.config import HORIZONS, MODELS, PROCESSED, REPORTS
from madhutwin.data import fhir
from madhutwin.data import synth_cohort as S
from madhutwin.data.indian_foods import BY_ID, FOODS, SWAPS
from madhutwin.explain_text import STREAM_LABEL, stream_shares, top_drivers
from madhutwin.physiology import model as M
from madhutwin.twin import DigitalTwin, prepare_arrays

GROUP_LABEL = {"t2d": "Type 2 diabetes", "prediabetes": "Prediabetes", "normal": "Normoglycaemic"}
HYPER_THR, HYPO_THR, SPIKE_THR = 0.5, 0.25, 0.6
GLUCOSE_TABS = {"carbs": 15.0, "protein": 0, "fat": 0, "fiber": 0, "gi": 100}


def _minute_of(t: pd.Timestamp) -> int:
    return int((pd.Timestamp(t) - S.START).total_seconds() // 60)


def _time_of(m: int) -> pd.Timestamp:
    return S.START + pd.Timedelta(minutes=int(m))


def _iso(t) -> str:
    return pd.Timestamp(t).isoformat()


def _episodes(minutes: np.ndarray, active: np.ndarray, gap: int = 60) -> int:
    """Count alert episodes: an alert is new only after `gap` minutes without one."""
    n, last = 0, -10 ** 9
    for m, a in zip(minutes, active):
        if a:
            if m - last > gap:
                n += 1
            last = m
    return n


def _clean(x):
    """JSON-safe floats."""
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if isinstance(x, (np.floating, float)):
        return None if not np.isfinite(x) else float(x)
    if isinstance(x, np.integer):
        return int(x)
    if isinstance(x, np.bool_):
        return bool(x)
    return x


class TwinService:
    def __init__(self):
        self.cohort = S.load_cohort()
        self.pids = list(self.cohort["patient_id"])
        self.ehr, self.minute, self.meals = {}, {}, {}
        for pid in self.pids:
            minute, meals, ehr = S.load_patient(pid)
            for c in minute.columns:
                if minute[c].dtype == np.float64 and c != "time":
                    minute[c] = minute[c].astype(np.float32)
            self.minute[pid], self.meals[pid], self.ehr[pid] = minute, meals, ehr
        preds = pd.read_parquet(PROCESSED / "bharat_predictions.parquet")
        self.preds = {pid: g.sort_values("minute").reset_index(drop=True) for pid, g in preds.groupby("patient_id")}
        feats = pd.read_parquet(PROCESSED / "bharat_features.parquet")
        num = feats.select_dtypes(np.float64).columns
        feats[num] = feats[num].astype(np.float32)
        self.feats = {pid: g.sort_values("minute").reset_index(drop=True) for pid, g in feats.groupby("patient_id")}
        twins = pd.read_parquet(PROCESSED / "bharat_twins.parquet")
        self.twin_params = {r["patient_id"]: np.array([r[f"param_{k}"] for k in M.PARAM_NAMES]) for _, r in twins.iterrows()}
        with open(MODELS / "assignments.json") as f:
            a = json.load(f)
        self.features = a["features"]
        self.fold_of = a["patient_fold"]
        self.models = {k: joblib.load(MODELS / f"fold_{k}.joblib") for k in sorted(set(self.fold_of.values()))}
        self.end_minute = S.DAYS * 1440 - 5
        self.story_minutes = {pid: self._story_minute(pid) for pid in self.pids if self.ehr[pid].get("story")}
        self.default_minute = self.story_minutes.get("BH-0001", self.end_minute)

    # ------------------------------------------------------------------ helpers
    def twin(self, pid) -> DigitalTwin:
        e = self.ehr[pid]
        return DigitalTwin(pid, e, self.twin_params[pid].copy(), e.get("regimen", []))

    @lru_cache(maxsize=32)
    def _sync(self, pid):
        arrays = prepare_arrays(self.minute[pid], self.meals[pid])
        return arrays, self.twin(pid).sync(arrays)

    def _row_index(self, pid, minute: int) -> int:
        m = self.preds[pid]["minute"].to_numpy()
        i = int(np.searchsorted(m, minute, side="right") - 1)
        return max(i, 0)

    def clamp_minute(self, minute: int | None) -> int:
        if minute is None:
            return self.default_minute
        return int(np.clip(minute, 4 * 60, self.end_minute))

    def _story_minute(self, pid) -> int:
        """Replay start for each featured story, chosen from the data, not by hand.

        Hypoglycaemia stories start 15 min before the first moment the deployed
        model actually raises its alert ahead of the first CGM reading <70 mg/dL;
        meal stories start just before the meal is logged, so the replay shows
        the alert appearing as the clinician would have seen it.
        """
        e = self.ehr[pid]
        story = e["story"]
        cgm = self.minute[pid]["cgm"].to_numpy()
        P = self.preds[pid]
        meals = self.meals[pid]
        mm = ((pd.to_datetime(meals["time"]) - S.START).dt.total_seconds() // 60).astype(int).to_numpy()
        lunches = mm[meals["meal_type"].eq("lunch").to_numpy()]
        if story in ("skip_lunch_walk", "fasting_day"):
            day = 11 if story == "skip_lunch_walk" else 10
            win = np.arange(day * 1440 + 11 * 60, day * 1440 + 21 * 60)
            low = win[np.nan_to_num(cgm[win], nan=999) < 70]
            if len(low):
                onset = int(low[0])
                pw = P[(P["minute"] >= onset - 90) & (P["minute"] < onset) & (P["p_ev_hypo"] >= HYPO_THR)]
                first = int(pw["minute"].iloc[0]) if len(pw) else onset - 30
                return first - 15
            return day * 1440 + 14 * 60
        day = {"wedding_feast": 8, "late_dinner_short_sleep": 4, "dawn": 9}.get(story)
        if day is not None:
            cand = [m for m in lunches if m // 1440 == day]
            if cand:
                return int(cand[0] - 10)
        if story == "rice_spikes" and len(lunches):
            peaks = [np.nanmax(cgm[m:m + 150]) for m in lunches]
            return int(lunches[int(np.argmax(peaks))] - 10)
        return self.end_minute

    # ------------------------------------------------------------------ cohort
    def cohort_view(self, minute: int) -> dict:
        rows = []
        for pid in self.pids:
            e = self.ehr[pid]
            P = self.preds[pid]
            i = self._row_index(pid, minute)
            r = P.iloc[i]
            f = self.feats[pid].iloc[i]
            mn = self.minute[pid]
            cg = mn["cgm"].to_numpy()[max(0, minute - 7 * 1440):minute + 1]
            s7 = AGP.glycaemic_summary(mn["time"].iloc[max(0, minute - 7 * 1440):minute + 1], cg)
            win = P[(P["minute"] > minute - 1440) & (P["minute"] <= minute)]
            alerts24 = _episodes(win["minute"].to_numpy(), (win["p_ev_hyper"] >= HYPER_THR).to_numpy()) +                 _episodes(win["minute"].to_numpy(), (win["p_ev_hypo"] >= HYPO_THR).to_numpy())
            p_hypo, p_hyper = float(r["p_ev_hypo"]), float(r["p_ev_hyper"])
            g0 = float(r["g0"])
            status = "urgent" if (p_hypo >= HYPO_THR and g0 < 120) or g0 < 70 else "warning" if (p_hyper >= HYPER_THR or g0 > 250) else \
                "watch" if (s7.get("tir", 100) < 50 or s7.get("tbr", 0) > 4) else "stable"
            rows.append({
                "patient_id": pid, "name": e["name"], "age": e["age"], "sex": e["sex"], "city": e["city"],
                "group": e["group"], "group_label": GROUP_LABEL[e["group"]], "hba1c": e["hba1c"],
                "regimen": [x["drug"] for x in e.get("regimen", [])], "featured": e.get("featured", False),
                "headline": e.get("headline"), "glucose": g0, "slope": float(f["cgm_d15"]) / 15.0,
                "pred_60": float(r["pred_60"]), "p_hyper": p_hyper, "p_hypo": p_hypo, "p_spike": float(r["p_ev_spike"]),
                "tir_7d": s7.get("tir"), "tbr_7d": s7.get("tbr"), "gmi_7d": s7.get("gmi"), "alerts_24h": alerts24,
                "status": status, "priority": max(2.0 * p_hypo, p_hyper) + (0.5 if status == "urgent" else 0),
                "last_sample_min_ago": int(minute - r["minute"]),
            })
        rows.sort(key=lambda x: -x["priority"])
        k = {"monitored": len(rows), "urgent": sum(r["status"] == "urgent" for r in rows),
             "warning": sum(r["status"] == "warning" for r in rows),
             "mean_tir": float(np.nanmean([r["tir_7d"] for r in rows if r["tir_7d"] is not None])),
             "alerts_24h": sum(r["alerts_24h"] for r in rows)}
        return _clean({"time": _iso(_time_of(minute)), "minute": minute, "kpis": k, "patients": rows,
                       "stories": [{"patient_id": p, "minute": m, "time": _iso(_time_of(m)), "headline": self.ehr[p]["headline"],
                                    "name": self.ehr[p]["name"]} for p, m in self.story_minutes.items()]})

    # ------------------------------------------------------------------ patient
    def patient(self, pid: str) -> dict:
        e = dict(self.ehr[pid])
        tw = self.twin(pid)
        ph = tw.phenotype()
        pheno_all = pd.DataFrame([self.twin(p).phenotype() for p in self.pids])
        pct = {k: float((pheno_all[k] < v).mean() * 100) for k, v in ph.items()}
        e["group_label"] = GROUP_LABEL[e["group"]]
        e["phenotype"] = ph
        e["phenotype_percentile"] = pct
        e["fold"] = self.fold_of.get(pid)
        e["data_sources"] = [
            {"stream": "EHR", "detail": "Demographics, diagnoses (ICD-10/SNOMED), labs (LOINC), medications (ATC), genetics"},
            {"stream": "CGM", "detail": "5-min interstitial glucose (simulated sensor with lag, noise and dropouts)"},
            {"stream": "Smartwatch", "detail": "Heart rate (1-min), steps, METs, sleep stages, nightly HRV"},
            {"stream": "Meal log", "detail": "Self-logged Indian meals with estimated macros (photo-log style)"},
        ]
        e["story_minute"] = self.story_minutes.get(pid)
        e["usual_foods"] = {slot: self._usual_food(pid, slot) for slot in ("breakfast", "lunch", "dinner")}
        return _clean(e)

    def _forecast_curve(self, pid, minute, row, arrays, states, horizon=120):
        s = int(row["minute"])
        cg = float(row["g0"])
        tw = self.twin(pid)
        traj = tw.forecast(arrays, states, np.array([s]), np.array([cg]), horizon)[0]
        knots = np.array([0] + list(HORIZONS))
        resid = np.array([0.0] + [row[f"pred_{h}"] - traj[h] for h in HORIZONS])
        lo_w = np.array([0.0] + [row[f"pred_{h}"] - row[f"lo_{h}"] for h in HORIZONS])
        hi_w = np.array([0.0] + [row[f"hi_{h}"] - row[f"pred_{h}"] for h in HORIZONS])
        mins = np.arange(0, horizon + 1, 5)
        mid = traj[mins] + np.interp(mins, knots, resid)
        lo = mid - np.interp(mins, knots, lo_w)
        hi = mid + np.interp(mins, knots, hi_w)
        twin_only = traj[mins]
        return [{"t": _iso(_time_of(s + m)), "minute": int(m), "pred": float(a), "lo": float(b), "hi": float(c),
                 "twin": float(d)} for m, a, b, c, d in zip(mins, mid, lo, hi, twin_only)], traj, resid

    def timeline(self, pid: str, minute: int, hours: float = 24, reveal_future: bool = True) -> dict:
        mn = self.minute[pid]
        a = max(0, minute - int(hours * 60))
        win = mn.iloc[a:minute + 1]
        cgm = [{"t": _iso(t), "g": float(g)} for t, g in zip(win["time"], win["cgm"]) if np.isfinite(g)]
        agg = win.assign(b=(np.arange(len(win)) // 5)).groupby("b").agg(
            t=("time", "first"), hr=("hr", "mean"), steps=("steps", "sum"), mets=("mets", "mean"),
            sleep=("sleep_stage", lambda x: float(x.mode().iloc[0]) if x.notna().any() else np.nan))
        wear = [{"t": _iso(r.t), "hr": r.hr, "steps": r.steps, "mets": r.mets, "sleep": r.sleep} for r in agg.itertuples()]
        meals = self.meals[pid]
        mt = pd.to_datetime(meals["time"])
        msel = meals[(mt >= win["time"].iloc[0]) & (mt <= win["time"].iloc[-1])]
        meal_list = [{"t": _iso(r.time), "name": r.name, "slot": r.meal_type, "carbs": r.carbs, "kcal": r.kcal, "gi": r.gi}
                     for r in msel.itertuples()]
        P = self.preds[pid]
        i = self._row_index(pid, minute)
        row = P.iloc[i]
        arrays, states = self._sync(pid)
        curve, _, _ = self._forecast_curve(pid, minute, row, arrays, states)
        # what the model said 60 min before each moment (forecast track record)
        past = P[(P["minute"] >= a - 60) & (P["minute"] <= minute - 60)]
        track = [{"t": _iso(_time_of(m + 60)), "pred": float(p), "lo": float(lo), "hi": float(hi)}
                 for m, p, lo, hi in zip(past["minute"], past["pred_60"], past["lo_60"], past["hi_60"])]
        fut = []
        if reveal_future:
            fw = mn.iloc[minute + 1:minute + 181]
            fut = [{"t": _iso(t), "g": float(g)} for t, g in zip(fw["time"], fw["cgm"]) if np.isfinite(g)]
        return _clean({"patient_id": pid, "time": _iso(_time_of(minute)), "minute": minute, "cgm": cgm, "wearable": wear,
                       "meals": meal_list, "forecast": curve, "forecast_track_60": track, "future_actual": fut,
                       "thresholds": {"hypo": 70, "hyper": 180, "tir_low": 70, "tir_high": 180}})

    # ------------------------------------------------------------------ risk & alerts
    def risk(self, pid: str, minute: int) -> dict:
        P = self.preds[pid]
        i = self._row_index(pid, minute)
        row = P.iloc[i]
        frow = self.feats[pid].iloc[[i]]
        hf = self.models[self.fold_of[pid]]
        arrays, states = self._sync(pid)
        curve, traj, resid = self._forecast_curve(pid, minute, row, arrays, states)
        preds = np.array([c["pred"] for c in curve])
        mins = np.array([c["minute"] for c in curve])
        values = {k: (None if pd.isna(v) else float(v)) for k, v in frow[self.features].iloc[0].items()}

        def explain(target):
            per_feat, per_group = hf.explain(frow, target)
            contrib = per_feat.iloc[0].to_dict()
            return top_drivers(contrib, values, k=5), stream_shares(per_group.iloc[0].to_dict())

        alerts = []
        p_hypo, p_hyper, p_spike = float(row["p_ev_hypo"]), float(row["p_ev_hyper"]), float(row["p_ev_spike"])
        g0 = float(row["g0"])
        food_on_board = (values.get("twin_gut_carbs") or 0) >= 10 or (values.get("meal_min_since") or 999) <= 60
        hypo_actions = ["Patient nudge: take 15 g fast-acting carbohydrate if <70 mg/dL and recheck in 15 min (rule of 15)",
                        "Avoid further exercise until glucose is stable",
                        "Clinician: review sulfonylurea/insulin dose and meal regularity"]
        if g0 < 70:
            drivers, streams = explain("ev_hypo")
            alerts.append({"type": "low", "severity": "urgent", "probability": 1.0,
                           "title": f"Glucose below 70 mg/dL now ({g0:.0f} mg/dL)", "eta_min": 0,
                           "predicted_min": float(min(preds.min(), g0)), "drivers": drivers, "streams": streams,
                           "actions": hypo_actions})
        elif p_hypo >= HYPO_THR or preds.min() < 70:
            below = mins[preds < 70]
            drivers, streams = explain("ev_hypo")
            alerts.append({"type": "hypo", "severity": "urgent", "probability": p_hypo,
                           "title": "Hypoglycaemia predicted" + (f" in ~{int(below[0])} min" if len(below) else " within 1 h"),
                           "eta_min": int(below[0]) if len(below) else None, "predicted_min": float(preds.min()),
                           "drivers": drivers, "streams": streams, "actions": hypo_actions})
        hypo_active = bool(alerts)
        if not hypo_active and g0 <= 180 and (p_hyper >= HYPER_THR or preds.max() > 180):
            above = mins[preds > 180]
            drivers, streams = explain("ev_hyper")
            alerts.append({"type": "hyper", "severity": "warning", "probability": p_hyper,
                           "title": "Glucose predicted to exceed 180 mg/dL" + (f" in ~{int(above[0])} min" if len(above) else " within 2 h"),
                           "eta_min": int(above[0]) if len(above) else None, "predicted_peak": float(preds.max()),
                           "drivers": drivers, "streams": streams,
                           "actions": ["Patient nudge: a 15-min brisk walk now (twin-estimated effect below)",
                                       "Review meal composition: swap to lower-glycaemic options at the next meal"]})
        elif not hypo_active and g0 > 180:
            drivers, streams = explain("ev_spike")
            alerts.append({"type": "high", "severity": "warning", "probability": 1.0,
                           "title": f"Above range now ({g0:.0f} mg/dL), forecast {preds[-1]:.0f} mg/dL in 2 h",
                           "eta_min": 0, "predicted_peak": float(max(preds.max(), g0)), "drivers": drivers, "streams": streams,
                           "actions": ["Patient nudge: light activity and hydration", "Clinician: review if persistent (>25 % time above range)"]})
        elif not hypo_active and food_on_board and p_spike >= SPIKE_THR:
            drivers, streams = explain("ev_spike")
            alerts.append({"type": "spike", "severity": "info", "probability": p_spike,
                           "title": "Large post-meal rise (+50 mg/dL) likely within 2 h", "eta_min": None,
                           "predicted_peak": float(preds.max()), "drivers": drivers, "streams": streams,
                           "actions": ["Patient nudge: a short walk 15-30 min after the meal"]})
        return _clean({"patient_id": pid, "time": _iso(_time_of(int(row["minute"]))), "glucose": g0,
                       "slope": float(values.get("cgm_d15") or 0) / 15.0,
                       "probabilities": {"hyper_2h": p_hyper, "hypo_1h": p_hypo, "spike_2h": p_spike},
                       "forecast": {str(h): {"pred": float(row[f"pred_{h}"]), "lo": float(row[f"lo_{h}"]), "hi": float(row[f"hi_{h}"])}
                                    for h in HORIZONS},
                       "alerts": alerts, "stream_labels": STREAM_LABEL,
                       "context": {"sleep_last_h": values.get("wear_sleep_last_h"), "steps_today": values.get("wear_steps_today"),
                                   "minutes_since_meal": values.get("meal_min_since"), "carbs_last_3h": values.get("meal_carbs_180"),
                                   "gut_carbs": values.get("twin_gut_carbs")}})

    # ------------------------------------------------------------------ what-if
    def _expand_meal(self, m: dict) -> dict:
        if m.get("food_id"):
            f = BY_ID[m["food_id"]]
            por = float(m.get("portion", 1.0))
            return {"minute": int(m.get("minute", 0)), "carbs": f["carbs"] * por, "protein": f["protein"] * por,
                    "fat": f["fat"] * por, "fiber": f["fiber"] * por, "gi": f["gi"], "name": f["name"]}
        return {"minute": int(m.get("minute", 0)), "carbs": float(m.get("carbs", 0)), "protein": float(m.get("protein", 0)),
                "fat": float(m.get("fat", 0)), "fiber": float(m.get("fiber", 0)), "gi": float(m.get("gi", 62)),
                "name": m.get("name", "Custom meal")}

    def what_if(self, pid: str, minute: int, scenarios: list[dict], horizon: int = 240) -> dict:
        P = self.preds[pid]
        i = self._row_index(pid, minute)
        row = P.iloc[i]
        arrays, states = self._sync(pid)
        s = int(row["minute"])
        state = states[s].copy()
        state[M.S_G] = float(row["g0"])
        tw = self.twin(pid)
        e = self.ehr[pid]
        sims = []
        for sc in scenarios:
            sim = {"meals": [self._expand_meal(m) for m in sc.get("meals", [])], "activity": sc.get("activity", [])}
            if sc.get("sleep_hours") is not None:
                sim["sleep_hours"] = sc["sleep_hours"]
            if sc.get("regimen") is not None:
                sim["regimen"] = sc["regimen"]
            elif sc.get("add_drug"):
                sim["regimen"] = list(e.get("regimen", [])) + [sc["add_drug"]]
            elif sc.get("remove_class"):
                sim["regimen"] = [r for r in e.get("regimen", []) if r.get("class") != sc["remove_class"]]
            sims.append(sim)
        hour = (s % 1440) / 60.0
        G = tw.what_if(state, hour, [{}] + sims, horizon=horizon)
        # anchor to the ML expected path: add the hybrid residual (decays after 2 h)
        knots = np.array([0] + list(HORIZONS))
        nofut = G[0]
        resid = np.array([0.0] + [row[f"pred_{h}"] - nofut[h] for h in HORIZONS])
        mins = np.arange(horizon + 1)
        r = np.interp(mins, knots, resid)
        r[mins > 120] = resid[-1] * np.exp(-(mins[mins > 120] - 120) / 60.0)
        out = []
        for j, sc in enumerate(scenarios):
            g = np.clip(G[j + 1] + r, 40, 600)
            grid = g[::5]
            out.append({
                "label": sc.get("label", f"Scenario {j + 1}"),
                "curve": [{"minute": int(m), "t": _iso(_time_of(s + m)), "g": float(v)} for m, v in zip(range(0, horizon + 1, 5), grid)],
                "peak": float(g.max()), "min": float(g.min()),
                "time_above_180_min": int((g > 180).sum()), "time_below_70_min": int((g < 70).sum()),
                "iauc": float(np.clip(g - g[0], 0, None).sum()), "mean": float(g.mean()),
                "meals": sims[j]["meals"], "activity": sims[j]["activity"],
            })
        return _clean({"patient_id": pid, "time": _iso(_time_of(s)), "glucose": float(row["g0"]), "horizon": horizon,
                       "scenarios": out,
                       "method": "Physiological twin counterfactuals anchored to the hybrid ML expected path"})

    def _usual_food(self, pid, slot):
        m = self.meals[pid]
        sub = m[m["meal_type"] == slot]
        if len(sub) and "food_id" in sub:
            return sub["food_id"].mode().iloc[0]
        return {"lunch": "rice_sambar", "dinner": "roti_dal_sabzi", "breakfast": "idli_sambar"}.get(slot, "rice_sambar")

    def recommendations(self, pid: str, minute: int) -> dict:
        P = self.preds[pid]
        row = P.iloc[self._row_index(pid, minute)]
        f = self.feats[pid].iloc[self._row_index(pid, minute)]
        hod = (int(row["minute"]) % 1440) / 60
        since_meal = float(f["meal_min_since"])
        cands = []
        if float(row["p_ev_hypo"]) >= 0.15 or float(row["g0"]) < 85:
            cands.append({"label": "15 g fast-acting carbs now (3 glucose tablets)", "kind": "hypo",
                          "meals": [{"minute": 0, **GLUCOSE_TABS, "name": "Glucose tablets"}]})
            cands.append({"label": "Small snack now (banana)", "kind": "hypo", "meals": [{"minute": 0, "food_id": "banana"}]})
            base = {"label": "No action", "kind": "baseline"}
        elif since_meal <= 45:
            base = {"label": "No action", "kind": "baseline"}
            cands += [{"label": "15-min brisk walk now", "kind": "activity", "activity": [{"minute": 0, "duration": 15, "mets": 4.0}]},
                      {"label": "30-min walk now", "kind": "activity", "activity": [{"minute": 0, "duration": 30, "mets": 3.8}]},
                      {"label": "10-min stair climbing now", "kind": "activity", "activity": [{"minute": 0, "duration": 10, "mets": 6.0}]}]
        else:
            slot, start_h = ("breakfast", 8.0) if hod < 10 else ("lunch", 13.25) if hod < 15.5 else ("dinner", 20.75)
            lead = int(max(15, (start_h - hod) * 60)) if start_h > hod else 15
            usual = self._usual_food(pid, slot)
            meal = {"minute": lead, "food_id": usual}
            base = {"label": f"Usual {slot}: {BY_ID[usual]['name']}", "kind": "baseline", "meals": [meal]}
            for sw in SWAPS.get(usual, [])[:2]:
                cands.append({"label": f"Swap to {BY_ID[sw]['name']}", "kind": "food", "meals": [{**meal, "food_id": sw}]})
            cands.append({"label": f"Usual {slot}, 3/4 portion", "kind": "portion", "meals": [{**meal, "portion": 0.75}]})
            cands.append({"label": f"Usual {slot} + 15-min walk after", "kind": "activity", "meals": [meal],
                          "activity": [{"minute": lead + 20, "duration": 15, "mets": 4.0}]})
            cands.append({"label": f"Eat salad/dal first, then {slot} (fibre & protein preload)", "kind": "food",
                          "meals": [{**meal, "minute": lead}, {"minute": max(lead - 10, 0), "carbs": 5, "protein": 8, "fat": 3, "fiber": 6, "gi": 25, "name": "Preload"}]})
        res = self.what_if(pid, minute, [base] + cands, horizon=240)
        b = res["scenarios"][0]
        recs = []
        for sc, c in zip(res["scenarios"][1:], cands):
            recs.append({"label": sc["label"], "kind": c["kind"], "delta_peak": sc["peak"] - b["peak"],
                         "delta_tar_min": sc["time_above_180_min"] - b["time_above_180_min"],
                         "delta_tbr_min": sc["time_below_70_min"] - b["time_below_70_min"],
                         "peak": sc["peak"], "min": sc["min"]})
        key = (lambda r: (r["delta_tbr_min"], -r["min"])) if base["kind"] == "baseline" and cands and cands[0]["kind"] == "hypo" \
            else (lambda r: (r["delta_tar_min"], r["delta_peak"]))
        recs.sort(key=key)
        return _clean({"patient_id": pid, "time": res["time"], "baseline": {"label": b["label"], "peak": b["peak"], "min": b["min"],
                       "time_above_180_min": b["time_above_180_min"], "time_below_70_min": b["time_below_70_min"]},
                       "recommendations": recs, "scenarios": res["scenarios"]})

    # ------------------------------------------------------------------ reports
    def agp(self, pid: str, minute: int, days: int = 14) -> dict:
        mn = self.minute[pid]
        a = max(0, minute - days * 1440)
        win = mn.iloc[a:minute + 1]
        s = AGP.glycaemic_summary(win["time"], win["cgm"].to_numpy())
        e = self.ehr[pid]
        older = e["age"] >= 65 or any(d["code"].startswith("N18") for d in e.get("diagnoses", []))
        daily = []
        for d, g in win.groupby(win["time"].dt.date):
            ds = AGP.glycaemic_summary(g["time"], g["cgm"].to_numpy())
            if ds:
                daily.append({"date": str(d), **{k: ds[k] for k in ("tbr_l2", "tbr_l1", "tir", "tar_l1", "tar_l2", "mean_glucose")}})
        return _clean({"patient_id": pid, "summary": s, "targets": AGP.targets_met(s, bool(older)),
                       "profile": AGP.agp_profile(win["time"], win["cgm"].to_numpy()), "daily": daily})

    def copilot_context(self, pid: str, minute: int) -> dict:
        e = self.ehr[pid]
        rk = self.risk(pid, minute)
        ag = self.agp(pid, minute, days=7)
        rec = self.recommendations(pid, minute)
        ph = self.twin(pid).phenotype()
        return _clean({
            "patient": {"name": e["name"], "age": e["age"], "sex": e["sex"], "group_label": GROUP_LABEL[e["group"]],
                        "dm_years": e.get("diabetes_years"), "hba1c": e["hba1c"], "egfr": e.get("egfr"), "bmi": e.get("bmi"),
                        "vitamin_b12": e.get("vitamin_b12"), "regimen": e.get("regimen", []),
                        "diagnoses": [d["display"] for d in e.get("diagnoses", [])], "synthetic": True},
            "now": {"time_label": pd.Timestamp(rk["time"]).strftime("%a %d %b, %H:%M"), "glucose": rk["glucose"], "slope": rk["slope"]},
            "forecast": rk["forecast"], "risks": {"hyper": rk["probabilities"]["hyper_2h"], "hypo": rk["probabilities"]["hypo_1h"],
                                                  "spike": rk["probabilities"]["spike_2h"]},
            "alerts": rk["alerts"], "agp_7d": ag["summary"], "phenotype": ph, "dawn_effect": ph["dawn_effect"],
            "sleep_last_h": rk["context"]["sleep_last_h"], "steps_today": rk["context"]["steps_today"],
            "recommendations": rec["recommendations"][:3],
        })

    def copilot(self, pid: str, minute: int, question: str | None = None, engine: str = "auto") -> dict:
        ctx = self.copilot_context(pid, minute)
        return {**copilot.generate(ctx, question, engine), "llm_available": copilot.llm_available()}

    def fhir_bundle(self, pid: str, minute: int) -> dict:
        ag = self.agp(pid, minute)
        rk = self.risk(pid, minute)
        return fhir.to_bundle(self.ehr[pid], ag["summary"], {"time": rk["time"], "probabilities": rk["probabilities"]})

    def foods(self) -> list[dict]:
        return FOODS

    @lru_cache(maxsize=1)
    def validation(self) -> dict:
        out = {}
        for name in ("metrics_cgmacros", "metrics_bharat", "twin_value"):
            p = REPORTS / f"{name}.json"
            if p.exists():
                with open(p) as f:
                    out[name] = json.load(f)
        samples = REPORTS / "evidence_samples.json"
        if samples.exists():
            with open(samples) as f:
                out.update(json.load(f))
        return _clean(out)
