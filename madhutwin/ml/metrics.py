"""Clinical and ML metrics for glucose forecasting and event prediction."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score


def clarke_zones(ref: np.ndarray, pred: np.ndarray) -> np.ndarray:
    """Clarke Error Grid zone (A-E) for each reference/prediction pair (mg/dL)."""
    ref = np.asarray(ref, float)
    pred = np.asarray(pred, float)
    z = np.full(len(ref), "B", dtype="<U1")
    a = (np.abs(pred - ref) <= 0.2 * ref) | ((ref < 70) & (pred < 70))
    e = ((ref <= 70) & (pred >= 180)) | ((ref >= 180) & (pred <= 70))
    d = ((ref >= 240) & (pred >= 70) & (pred <= 180)) | ((ref <= 70) & (pred >= 70) & (pred <= 180))
    c = ((ref >= 70) & (ref <= 290) & (pred >= ref + 110)) | ((ref >= 130) & (ref <= 180) & (pred <= (7 / 5) * ref - 182))
    z[c] = "C"
    z[d] = "D"
    z[e] = "E"
    z[a] = "A"
    return z


def regression_report(y: np.ndarray, p: np.ndarray) -> dict:
    ok = np.isfinite(y) & np.isfinite(p)
    y, p = y[ok], p[ok]
    if len(y) == 0:
        return {}
    err = p - y
    zones = clarke_zones(y, p)
    return {
        "n": int(len(y)),
        "rmse": float(np.sqrt(np.mean(err ** 2))),
        "mae": float(np.mean(np.abs(err))),
        "mard": float(np.mean(np.abs(err) / y) * 100),
        "clarke_a": float(np.mean(zones == "A") * 100),
        "clarke_ab": float(np.mean(np.isin(zones, ["A", "B"])) * 100),
    }


def classification_report(y: np.ndarray, prob: np.ndarray, thr: float = 0.5) -> dict:
    ok = np.isfinite(y) & np.isfinite(prob)
    y, prob = y[ok].astype(int), prob[ok]
    if len(np.unique(y)) < 2:
        return {"n": int(len(y)), "prevalence": float(y.mean()) if len(y) else 0.0}
    pred = prob >= thr
    tp = int(np.sum(pred & (y == 1)))
    fp = int(np.sum(pred & (y == 0)))
    fn = int(np.sum(~pred & (y == 1)))
    tn = int(np.sum(~pred & (y == 0)))
    return {
        "n": int(len(y)),
        "prevalence": float(y.mean()),
        "auroc": float(roc_auc_score(y, prob)),
        "auprc": float(average_precision_score(y, prob)),
        "sensitivity": tp / max(tp + fn, 1),
        "specificity": tn / max(tn + fp, 1),
        "ppv": tp / max(tp + fp, 1),
        "brier": float(np.mean((prob - y) ** 2)),
    }


def episode_lead_times(df: pd.DataFrame, prob_col: str, thr: float = 0.5, level: float = 180.0,
                       window: int = 120, min_lead: int = 15) -> dict:
    """Event-level evaluation: how early is each hyperglycaemic episode flagged?

    An episode starts when CGM crosses above ``level`` after >= 30 min below it.
    It counts as *detected* if an alert (prob >= thr) is raised between
    ``window`` and ``min_lead`` minutes before onset. Lead time is measured from
    the first alert in the window. False alerts are alert onsets that are not
    followed by an excursion within ``window`` minutes.
    """
    leads, detected, n_episodes, false_alerts, days = [], 0, 0, 0, 0.0
    for _, g in df.groupby("patient_id"):
        g = g.sort_values("minute")
        m = g["minute"].to_numpy()
        gl = g["g0"].to_numpy()
        pr = g[prob_col].to_numpy()
        days += (m[-1] - m[0]) / 1440.0 if len(m) > 1 else 0
        above = gl > level
        # episode onsets: first sample above level after >= 30 min below
        onset_idx = []
        last_above = -10 ** 9
        for i in range(len(m)):
            if above[i]:
                if m[i] - last_above >= 30 and i > 0 and not above[i - 1]:
                    onset_idx.append(i)
                last_above = m[i]
        for i in onset_idx:
            n_episodes += 1
            e = m[i]
            win = (m >= e - window) & (m < e)
            alerts = win & (pr >= thr) & ~above
            if np.any(alerts & (m <= e - min_lead)):
                detected += 1
                leads.append(e - m[np.flatnonzero(alerts)[0]])
        # false alerts: rising edges of alert state where no excursion follows
        alert = (pr >= thr) & ~above
        edges = np.flatnonzero(alert & ~np.r_[False, alert[:-1]])
        for i in edges:
            fut = (m > m[i]) & (m <= m[i] + window)
            if not np.any(above[fut]):
                false_alerts += 1
    return {
        "episodes": n_episodes,
        "detected_ge15min": detected,
        "episode_sensitivity": detected / max(n_episodes, 1),
        "median_lead_min": float(np.median(leads)) if leads else float("nan"),
        "false_alerts_per_day": false_alerts / max(days, 1e-9),
        "monitored_days": days,
    }
