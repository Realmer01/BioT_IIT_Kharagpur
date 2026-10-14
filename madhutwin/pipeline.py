"""End-to-end per-patient processing: onboarding -> personalised twin -> features."""
from __future__ import annotations

import numpy as np
import pandas as pd
from joblib import Parallel, delayed

from madhutwin.features import build_features
from madhutwin.physiology import model as M
from madhutwin.twin import DigitalTwin, prepare_arrays, slice_arrays

ONBOARD_FRAC = 0.4
ONBOARD_MAX_DAYS = 4


def onboarding_minutes(n: int) -> int:
    return int(min(ONBOARD_FRAC * n, ONBOARD_MAX_DAYS * 1440))


def process_patient(pid: str, minute: pd.DataFrame, meals: pd.DataFrame, ehr: dict,
                    regimen: list | None = None) -> tuple[pd.DataFrame, dict]:
    """Personalise on the onboarding window, then sync and featurise the whole record.

    Rows in the onboarding window are tagged ``phase='onboard'``; later rows are
    ``phase='monitor'`` and are the only rows used for evaluation (the twin never
    saw them during personalisation).
    """
    arrays = prepare_arrays(minute, meals)
    n_on = onboarding_minutes(arrays["n"])
    twin = DigitalTwin.from_ehr(pid, ehr, regimen)
    res = twin.personalise(slice_arrays(arrays, 0, n_on))
    states = twin.sync(arrays)
    feats = build_features(minute, meals, ehr, arrays, twin=twin, states=states)
    feats.insert(0, "patient_id", pid)
    feats["phase"] = np.where(feats["minute"] < n_on, "onboard", "monitor")
    info = {
        "patient_id": pid,
        "onboard_minutes": n_on,
        **{f"param_{k}": float(twin.params[M.P[k]]) for k in M.PARAM_NAMES},
        **{f"prior_{k}": float(res.prior_params[M.P[k]]) for k in ("Gb", "SG", "SI", "beta")},
        **{f"fit_rmse_{h}": v for h, v in res.fit_rmse.items()},
        **{f"prior_rmse_{h}": v for h, v in res.prior_rmse.items()},
        **{f"pheno_{k}": v for k, v in twin.phenotype().items()},
    }
    return feats, info


def process_many(items, n_jobs: int = -1):
    """``items``: iterable of (pid, minute, meals, ehr, regimen)."""
    out = Parallel(n_jobs=n_jobs, backend="loky", verbose=0)(
        delayed(process_patient)(*it) for it in items
    )
    feats = pd.concat([f for f, _ in out], ignore_index=True)
    info = pd.DataFrame([i for _, i in out])
    return feats, info
