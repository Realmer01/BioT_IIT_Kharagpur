"""Personalisation of the physiological twin (EHR prior  x  sensor likelihood).

1. **Prior from the EHR.** Labs that every Indian diabetes clinic already orders
   (HbA1c, fasting glucose, fasting insulin -> HOMA-IR / HOMA-B, body weight)
   are mapped to log-normal priors on the patient's physiology.
2. **Likelihood from the streams.** The twin is synchronised to the CGM via the
   observer and asked to forecast 30-120 min ahead from hundreds of start
   points in the onboarding window; its forecast error is the likelihood
   (a prediction-error-method fit, robust to model drift).
3. **MAP estimate** via L-BFGS-B in log-parameter space.

The result is a *personal* parameter vector: insulin sensitivity, beta-cell
responsiveness, glucose effectiveness, absorption speed, exercise response,
dawn effect and circadian pattern. These are clinically interpretable and are
the twin's "phenotype".
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import minimize

from madhutwin.physiology import model as M

CALIB = ("Gb", "SG", "SI", "beta", "k_scale", "f", "alpha_ex", "dawn", "circ")
_LOG = CALIB[:-1]  # strictly positive parameters, optimised in log space
CIRC_MAX = 0.4
OBS_GAIN = 1.0
# Disturbance (integral) gain. Grid search on CGMacros onboarding/test splits showed no
# benefit (the ML residual layer captures unexplained trends better), so it is off by
# default; the state is kept for what-if "unexplained input" scenarios.
OBS_GAIN_D = 0.0
FIT_HORIZONS = np.array([30, 60, 90, 120])
SIGMA_CGM = 20.0  # mg/dL, residual scale for the likelihood

BOUNDS = {
    "Gb": (60.0, 320.0),
    "SG": (0.003, 0.05),
    "SI": (2e-5, 3e-3),
    "beta": (0.005, 0.8),
    "k_scale": (0.3, 3.0),
    "f": (0.2, 1.4),
    "alpha_ex": (2e-4, 0.03),
    "dawn": (1e-3, 0.6),
}


def ehr_prior(ehr: dict) -> tuple[dict, dict]:
    """Map routine labs to prior means and log-sd for each twin parameter."""
    a1c = float(ehr.get("hba1c") or 6.5)
    fpg = ehr.get("fpg")
    fpg = float(fpg) if fpg and np.isfinite(fpg) else max(28.7 * a1c - 46.7, 80.0) * 0.92
    fi = ehr.get("fasting_insulin")
    fi = float(fi) if fi and np.isfinite(fi) else 10.0
    homa_ir = max(fpg * fi / 405.0, 0.3)
    homa_b = np.clip(360.0 * fi / max(fpg - 63.0, 5.0), 10.0, 400.0)
    excess = max(a1c - 5.3, 0.0)
    mean = {
        "Gb": fpg,
        "SI": float(np.clip(6e-4 / homa_ir, 4e-5, 1.5e-3)),
        "SG": float(np.clip(0.022 - 0.003 * excess, 0.006, 0.03)),
        "beta": float(0.30 * np.exp(-0.9 * excess) * np.clip(homa_b / 100.0, 0.3, 3.0) ** 0.3),
        "k_scale": 1.0,
        "f": 0.7,
        "alpha_ex": 0.004,
        "dawn": 0.02 + 0.02 * max(a1c - 6.0, 0.0),
        "circ": 0.0,
    }
    sd = {"Gb": 0.12, "SI": 0.6, "SG": 0.35, "beta": 0.7, "k_scale": 0.35, "f": 0.3,
          "alpha_ex": 0.6, "dawn": 0.8, "circ": 0.15}
    return mean, sd


def _pack(values: dict) -> np.ndarray:
    z = [np.log(values[k]) for k in _LOG]
    z.append(np.arctanh(np.clip(values["circ"] / CIRC_MAX, -0.99, 0.99)))
    return np.array(z)


def _unpack(z: np.ndarray, base: np.ndarray) -> np.ndarray:
    p = base.copy()
    for i, k in enumerate(_LOG):
        p[M.P[k]] = np.exp(z[i])
    p[M.P["circ"]] = CIRC_MAX * np.tanh(z[-1])
    return p


@dataclass
class CalibrationResult:
    params: np.ndarray
    prior_params: np.ndarray
    fit_rmse: dict = field(default_factory=dict)  # twin-only forecast RMSE on onboarding window
    prior_rmse: dict = field(default_factory=dict)
    n_starts: int = 0
    success: bool = True

    def named(self) -> dict:
        return {k: float(self.params[M.P[k]]) for k in M.PARAM_NAMES}


def _fit_targets(cgm: np.ndarray, every: int = 15, horizon: int = 120):
    """Start minutes (native samples) with valid targets at the fit horizons."""
    idx = np.flatnonzero(np.isfinite(cgm))
    idx = idx[idx + horizon < len(cgm)]
    if every > 1 and len(idx):
        keep = [idx[0]]
        for i in idx[1:]:
            if i - keep[-1] >= every:
                keep.append(i)
        idx = np.array(keep)
    tgt = np.stack([cgm[idx + h] for h in FIT_HORIZONS], axis=1) if len(idx) else np.zeros((0, 4))
    return idx.astype(np.int64), tgt


def twin_forecast_rmse(p, arrays, starts, targets) -> dict:
    states = M.observe(p, arrays["cgm"], arrays["in_f"], arrays["in_s"], arrays["u_ex"],
                       arrays["si"], arrays["egp"], arrays["hour0"], OBS_GAIN, OBS_GAIN_D)
    fc = M.forecast_from(p, states, arrays["cgm"][starts], starts, int(FIT_HORIZONS.max()),
                         arrays["si"], arrays["egp"], arrays["hour0"])
    pred = fc[:, FIT_HORIZONS]
    err = pred - targets
    return {int(h): float(np.sqrt(np.nanmean(err[:, i] ** 2))) for i, h in enumerate(FIT_HORIZONS)}


def calibrate(arrays: dict, ehr: dict, base_params: np.ndarray | None = None,
              prior_weight: float = 1.0, maxiter: int = 120) -> CalibrationResult:
    """MAP-personalise the twin on an onboarding window.

    ``arrays`` holds minute-resolution inputs (see ``madhutwin.twin.prepare_arrays``)
    restricted to the onboarding period. ``base_params`` carries fixed values
    (body weight, drug regimen); calibrated entries are overwritten.
    """
    mean, sd = ehr_prior(ehr)
    base = M.default_params() if base_params is None else base_params.copy()
    base[M.P["BW"]] = float(ehr.get("weight_kg") or base[M.P["BW"]])
    z0 = _pack(mean)
    zsd = np.array([sd[k] for k in CALIB])
    prior_p = _unpack(z0, base)

    starts, targets = _fit_targets(arrays["cgm"])
    if len(starts) < 20:
        return CalibrationResult(prior_p, prior_p, n_starts=len(starts), success=False)

    n_eff = max(len(starts) / 2.0, 1.0)  # overlapping forecasts are autocorrelated
    valid = np.isfinite(targets)
    cgm = arrays["cgm"]
    hz = int(FIT_HORIZONS.max())

    def loss(z):
        p = _unpack(z, base)
        states = M.observe(p, cgm, arrays["in_f"], arrays["in_s"], arrays["u_ex"],
                           arrays["si"], arrays["egp"], arrays["hour0"], OBS_GAIN, OBS_GAIN_D)
        fc = M.forecast_from(p, states, cgm[starts], starts, hz, arrays["si"], arrays["egp"], arrays["hour0"])
        err = (fc[:, FIT_HORIZONS] - targets)[valid]
        nll = 0.5 * n_eff * np.mean((err / SIGMA_CGM) ** 2)
        prior = 0.5 * prior_weight * np.sum(((z - z0) / zsd) ** 2)
        return nll + prior

    lo = np.array([np.log(BOUNDS[k][0]) for k in _LOG] + [-3.0])
    hi = np.array([np.log(BOUNDS[k][1]) for k in _LOG] + [3.0])
    z_init = np.clip(z0, lo + 1e-6, hi - 1e-6)
    res = minimize(loss, z_init, method="L-BFGS-B", bounds=list(zip(lo, hi)),
                   options={"maxiter": maxiter, "eps": 1e-4})
    p_hat = _unpack(res.x, base)
    return CalibrationResult(
        params=p_hat,
        prior_params=prior_p,
        fit_rmse=twin_forecast_rmse(p_hat, arrays, starts, targets),
        prior_rmse=twin_forecast_rmse(prior_p, arrays, starts, targets),
        n_starts=len(starts),
        success=bool(res.success) or res.nit > 5,
    )
