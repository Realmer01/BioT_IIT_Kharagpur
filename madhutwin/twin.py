"""The MadhuTwin digital twin of one patient.

Lifecycle
---------
1. ``DigitalTwin.from_ehr``      cold start from the static record (EHR prior).
2. ``twin.personalise(...)``     onboarding: fit physiology to the first days of
                                 CGM + wearable + meal data (MAP estimate).
3. ``twin.sync(...)``            keep the virtual patient in lock-step with the
                                 live streams (observer / state estimation).
4. ``twin.forecast(...)``        mechanistic 2-h glucose forecast from any moment.
5. ``twin.what_if(...)``         counterfactual simulation of meals, walks,
                                 medication and sleep changes.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from madhutwin.physiology import model as M
from madhutwin.physiology.calibrate import OBS_GAIN, OBS_GAIN_D, CalibrationResult, calibrate, ehr_prior

# Pharmacodynamic intensity per drug/dose (fraction of maximal effect in the model)
METFORMIN_EFFECT = {0: 0.0, 500: 0.08, 850: 0.11, 1000: 0.13, 1500: 0.17, 2000: 0.20, 2500: 0.22}


def drug_params(regimen: list[dict] | None) -> dict:
    """Translate a medication list into model modifiers."""
    out = {"met": 0.0, "su": 0.0, "dpp4": 0.0, "sglt2": 0.0, "agi": 0.0, "pio": 0.0, "ins_basal": 0.0}
    for rx in regimen or []:
        cls, dose = rx.get("class"), float(rx.get("daily_dose_mg") or rx.get("daily_units") or 0)
        if cls == "biguanide":
            keys = np.array(sorted(METFORMIN_EFFECT))
            out["met"] = float(np.interp(dose, keys, [METFORMIN_EFFECT[k] for k in keys]))
        elif cls == "sulfonylurea":
            max_dose = {"Glimepiride": 4.0, "Gliclazide": 160.0, "Glibenclamide": 10.0}.get(rx.get("drug"), 4.0)
            out["su"] = float(np.clip(dose / max_dose, 0.15, 1.0))
        elif cls == "dpp4":
            out["dpp4"] = 1.0
        elif cls == "sglt2":
            out["sglt2"] = 1.0
        elif cls == "agi":
            out["agi"] = 1.0
        elif cls == "tzd":
            out["pio"] = 1.0
        elif cls == "basal_insulin":
            out["ins_basal"] = dose
    return out


def sleep_si_multiplier(sleep_hours) -> np.ndarray:
    debt = np.clip(7.0 - np.nan_to_num(np.asarray(sleep_hours, float), nan=7.0), 0.0, 4.0)
    return 1.0 - 0.25 * debt / 4.0


def prepare_arrays(minute: pd.DataFrame, meals: pd.DataFrame) -> dict:
    """Minute-resolution arrays for the integrators from canonical frames."""
    t0 = pd.Timestamp(minute["time"].iloc[0])
    n = len(minute)
    if len(meals):
        mm = ((pd.to_datetime(meals["time"]) - t0).dt.total_seconds() // 60).astype(int).to_numpy()
        gi = meals["gi"].to_numpy(float) if "gi" in meals else None
        args = (mm, meals["carbs"].to_numpy(float), meals["protein"].to_numpy(float),
                meals["fat"].to_numpy(float), meals["fiber"].to_numpy(float), gi)
    else:
        args = (np.array([], int), [], [], [], [], None)
    # The twin's sleep model: observed short sleep lowers next-day insulin sensitivity
    # (~20-25 % after one 4-h night; Donga et al., JCEM 2010). Hidden simulator
    # modifiers (illness, missed doses) are deliberately NOT visible to the twin.
    si_mult = sleep_si_multiplier(minute["sleep_last_h"].to_numpy(float)) if "sleep_last_h" in minute else None
    in_f, in_s, u_ex, si, egp = M.build_inputs(
        n, *args,
        mets=minute["mets"].to_numpy(float) if "mets" in minute else None,
        si_mult=si_mult,
    )
    return {
        "cgm": minute["cgm"].to_numpy(float), "in_f": in_f, "in_s": in_s, "u_ex": u_ex,
        "si": si, "egp": egp, "hour0": t0.hour + t0.minute / 60.0, "t0": t0, "n": n,
    }


def slice_arrays(a: dict, start: int, stop: int) -> dict:
    out = {k: (v[start:stop] if isinstance(v, np.ndarray) else v) for k, v in a.items()}
    out["hour0"] = a["hour0"] + start / 60.0
    out["t0"] = a["t0"] + pd.Timedelta(minutes=start)
    out["n"] = stop - start
    return out


@dataclass
class DigitalTwin:
    patient_id: str
    ehr: dict
    params: np.ndarray
    regimen: list = field(default_factory=list)
    calibration: CalibrationResult | None = None

    # ------------------------------------------------------------------ creation
    @classmethod
    def from_ehr(cls, patient_id: str, ehr: dict, regimen: list | None = None) -> "DigitalTwin":
        mean, _ = ehr_prior(ehr)
        p = M.default_params(BW=float(ehr.get("weight_kg") or 70.0), **{k: v for k, v in mean.items()})
        for k, v in drug_params(regimen).items():
            p[M.P[k]] = v
        return cls(patient_id, ehr, p, list(regimen or []))

    def personalise(self, arrays: dict, **kw) -> CalibrationResult:
        res = calibrate(arrays, self.ehr, base_params=self.params, **kw)
        self.params = res.params
        self.calibration = res
        return res

    # ------------------------------------------------------------------ running
    def sync(self, arrays: dict) -> np.ndarray:
        return M.observe(self.params, arrays["cgm"], arrays["in_f"], arrays["in_s"], arrays["u_ex"],
                         arrays["si"], arrays["egp"], arrays["hour0"], OBS_GAIN, OBS_GAIN_D)

    def forecast(self, arrays: dict, states: np.ndarray, starts: np.ndarray, cgm_last: np.ndarray,
                 horizon: int = 120) -> np.ndarray:
        from madhutwin.physiology import calibrate as _cal
        return M.forecast_from(self.params, states, cgm_last.astype(float), starts.astype(np.int64), horizon,
                               arrays["si"], arrays["egp"], arrays["hour0"], arrays["u_ex"], _cal.ACT_PERSIST)

    def what_if(self, state: np.ndarray, hour: float, scenarios: list[dict], horizon: int = 240) -> np.ndarray:
        """Simulate several futures from the same synchronised state.

        Each scenario may contain: ``meals`` [{minute, carbs, protein, fat, fiber, gi}],
        ``activity`` [{minute, duration, mets}], ``regimen`` (replacement drug list),
        ``sleep_hours`` (last night, modulates insulin sensitivity), ``si_mult``.
        Returns glucose trajectories (len(scenarios), horizon + 1), 1-min resolution.
        """
        m = len(scenarios)
        Pm = np.repeat(self.params[None, :], m, axis=0)
        X0 = np.repeat(state[None, :], m, axis=0)
        in_f = np.zeros((m, horizon))
        in_s = np.zeros((m, horizon))
        u_ex = np.zeros((m, horizon))
        si = np.ones((m, horizon))
        eg = np.ones((m, horizon))
        for j, sc in enumerate(scenarios):
            if "regimen" in sc:
                for k, v in drug_params(sc["regimen"]).items():
                    Pm[j, M.P[k]] = v
            for meal in sc.get("meals", []):
                t = int(meal.get("minute", 0))
                if 0 <= t < horizon:
                    ff = float(M.fast_fraction(meal["carbs"], meal.get("protein", 0), meal.get("fat", 0),
                                               meal.get("fiber", 0), np.array([meal.get("gi", np.nan)]))[0])
                    in_f[j, t] += meal["carbs"] * ff
                    in_s[j, t] += meal["carbs"] * (1 - ff)
            for act in sc.get("activity", []):
                t0 = int(act.get("minute", 0))
                t1 = min(horizon, t0 + int(act.get("duration", 15)))
                u_ex[j, t0:t1] = max(float(act.get("mets", 3.5)) - 1.5, 0.0)
            if "sleep_hours" in sc:
                si[j, :] = sleep_si_multiplier([sc["sleep_hours"]])[0]
            if "si_mult" in sc:
                si[j, :] *= float(sc["si_mult"])
        return M.simulate_scenarios(Pm, X0, in_f, in_s, u_ex, si, eg, hour)

    # ------------------------------------------------------------------ insight
    def phenotype(self) -> dict:
        p = self.params
        si, beta = p[M.P["SI"]], p[M.P["beta"]]
        return {
            "insulin_sensitivity": float(si * 1e4),  # x1e-4 /min per uU/mL
            "beta_cell_response": float(beta),
            "disposition_index": float(si * 1e4 * beta * 10),
            "glucose_effectiveness": float(p[M.P["SG"]] * 100),  # %/min
            "basal_glucose": float(p[M.P["Gb"]]),
            "absorption_speed": float(p[M.P["k_scale"]]),
            "exercise_response": float(p[M.P["alpha_ex"]] * 1e3),
            "dawn_effect": float(p[M.P["dawn"]]),
            "circadian_si": float(p[M.P["circ"]]),
        }
