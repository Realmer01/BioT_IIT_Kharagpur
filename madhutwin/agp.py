"""Standardised CGM reporting (International Consensus on Time in Range, Battelino et al.,
Diabetes Care 2019) and the Ambulatory Glucose Profile (AGP)."""
from __future__ import annotations

import numpy as np
import pandas as pd


def glycaemic_summary(times: pd.Series, glucose: np.ndarray, expected_interval_min: int = 5) -> dict:
    g = np.asarray(glucose, float)
    ok = np.isfinite(g)
    gv = g[ok]
    if len(gv) == 0:
        return {}
    span_min = (pd.Timestamp(times.iloc[-1]) - pd.Timestamp(times.iloc[0])).total_seconds() / 60 + expected_interval_min
    mean = float(gv.mean())
    return {
        "days": round(span_min / 1440, 1),
        "active_pct": float(min(100.0, len(gv) * expected_interval_min / span_min * 100)),
        "mean_glucose": mean,
        "gmi": 3.31 + 0.02392 * mean,  # Bergenstal et al., Diabetes Care 2018
        "cv": float(gv.std() / mean * 100),
        "tbr_l2": float(np.mean(gv < 54) * 100),
        "tbr_l1": float(np.mean((gv >= 54) & (gv < 70)) * 100),
        "tir": float(np.mean((gv >= 70) & (gv <= 180)) * 100),
        "tar_l1": float(np.mean((gv > 180) & (gv <= 250)) * 100),
        "tar_l2": float(np.mean(gv > 250) * 100),
        "tbr": float(np.mean(gv < 70) * 100),
        "tar": float(np.mean(gv > 180) * 100),
        "tight_tir": float(np.mean((gv >= 70) & (gv <= 140)) * 100),
    }


def targets_met(s: dict, older_or_high_risk: bool = False) -> dict:
    """Consensus targets for T2D (and the stricter hypo limits for older/high-risk adults)."""
    if not s:
        return {}
    if older_or_high_risk:
        return {"tir>50%": s["tir"] > 50, "tbr<1%": s["tbr"] < 1, "tar_l2<10%": s["tar_l2"] < 10, "cv<=36%": s["cv"] <= 36}
    return {"tir>70%": s["tir"] > 70, "tbr<4%": s["tbr"] < 4, "tbr_l2<1%": s["tbr_l2"] < 1,
            "tar<25%": s["tar"] < 25, "tar_l2<5%": s["tar_l2"] < 5, "cv<=36%": s["cv"] <= 36}


def agp_profile(times: pd.Series, glucose: np.ndarray, bin_minutes: int = 15) -> list[dict]:
    t = pd.to_datetime(times)
    g = pd.Series(np.asarray(glucose, float))
    tod = ((t.dt.hour * 60 + t.dt.minute) // bin_minutes) * bin_minutes
    df = pd.DataFrame({"tod": tod.to_numpy(), "g": g.to_numpy()}).dropna()
    out = []
    for m, grp in df.groupby("tod"):
        q = np.percentile(grp["g"], [5, 25, 50, 75, 95])
        out.append({"minute_of_day": int(m), "p5": q[0], "p25": q[1], "p50": q[2], "p75": q[3], "p95": q[4]})
    # light circular smoothing so the bands read like the standard AGP
    if len(out) > 4:
        arr = np.array([[o[k] for k in ("p5", "p25", "p50", "p75", "p95")] for o in out])
        sm = (np.roll(arr, 1, 0) + 2 * arr + np.roll(arr, -1, 0)) / 4
        for o, row in zip(out, sm):
            o.update({k: float(round(v, 1)) for k, v in zip(("p5", "p25", "p50", "p75", "p95"), row)})
    return out
