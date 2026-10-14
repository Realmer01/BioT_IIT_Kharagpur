"""Hybrid ML layer: gradient-boosted residual learner on top of the physiological twin.

* Point forecasts: one XGBoost regressor per horizon predicting the glucose
  change from now (the twin's own forecast is an input feature, so the model
  learns *where and how much to trust physiology*).
* Uncertainty: Conformalised Quantile Regression (Romano et al., 2019) gives
  distribution-free 90 % prediction intervals with a coverage guarantee on
  exchangeable patients.
* Events: calibrated XGBoost classifiers for hyperglycaemia onset (>180 mg/dL
  within 2 h), large spikes (+50 mg/dL within 2 h) and hypoglycaemia (<70 mg/dL
  within 1 h).
* Explanations: exact TreeSHAP contributions, aggregated by data stream.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import xgboost as xgb

from madhutwin.config import HORIZONS, RANDOM_SEED
from madhutwin.features import feature_groups

REG_PARAMS = dict(n_estimators=450, learning_rate=0.04, max_depth=6, min_child_weight=25, subsample=0.8,
                  colsample_bytree=0.7, reg_lambda=2.0, tree_method="hist", n_jobs=12, random_state=RANDOM_SEED)
CLF_PARAMS = dict(n_estimators=350, learning_rate=0.04, max_depth=5, min_child_weight=25, subsample=0.8,
                  colsample_bytree=0.7, reg_lambda=2.0, tree_method="hist", n_jobs=12, random_state=RANDOM_SEED,
                  eval_metric="logloss")
EVENTS = ("ev_hyper", "ev_spike", "ev_hypo")
ALPHA = 0.10  # 90 % prediction intervals


def fit_regressor(X: pd.DataFrame, y: np.ndarray) -> xgb.XGBRegressor:
    ok = np.isfinite(y)
    return xgb.XGBRegressor(**REG_PARAMS).fit(X[ok], y[ok])


def fit_quantiles(X: pd.DataFrame, y: np.ndarray, alpha: float = ALPHA) -> xgb.XGBRegressor:
    ok = np.isfinite(y)
    params = {**REG_PARAMS, "n_estimators": 300, "objective": "reg:quantileerror",
              "quantile_alpha": np.array([alpha / 2, 1 - alpha / 2])}
    return xgb.XGBRegressor(**params).fit(X[ok], y[ok])


def fit_classifier(X: pd.DataFrame, y: np.ndarray) -> xgb.XGBClassifier | None:
    ok = np.isfinite(y)
    if ok.sum() < 50 or len(np.unique(y[ok])) < 2:
        return None
    return xgb.XGBClassifier(**CLF_PARAMS).fit(X[ok], y[ok].astype(int))


def cqr_offset(qmodel, X: pd.DataFrame, y: np.ndarray, alpha: float = ALPHA) -> float:
    ok = np.isfinite(y)
    q = qmodel.predict(X[ok])
    scores = np.maximum(q[:, 0] - y[ok], y[ok] - q[:, 1])
    n = len(scores)
    level = min(1.0, np.ceil((n + 1) * (1 - alpha)) / n)
    return float(np.quantile(scores, level))


@dataclass
class HybridForecaster:
    features: list[str]
    point: dict = field(default_factory=dict)
    quant: dict = field(default_factory=dict)
    offset: dict = field(default_factory=dict)
    clf: dict = field(default_factory=dict)
    meta: dict = field(default_factory=dict)

    def fit(self, df: pd.DataFrame, cal_patients: set | None = None, events: tuple = EVENTS):
        X = df[self.features]
        g0 = df["g0"].to_numpy()
        if cal_patients is None:
            pids = np.array(sorted(df["patient_id"].unique()))
            rng = np.random.default_rng(RANDOM_SEED)
            cal_patients = set(rng.choice(pids, size=max(2, len(pids) // 4), replace=False))
        is_cal = df["patient_id"].isin(cal_patients).to_numpy()
        for h in HORIZONS:
            dy = df[f"y_{h}"].to_numpy() - g0
            self.point[h] = fit_regressor(X, dy)
            self.quant[h] = fit_quantiles(X[~is_cal], dy[~is_cal])
            self.offset[h] = cqr_offset(self.quant[h], X[is_cal], dy[is_cal])
        for ev in events:
            m = fit_classifier(X, df[ev].to_numpy())
            if m is not None:
                self.clf[ev] = m
        self.meta["n_train_rows"] = int(len(df))
        self.meta["n_train_patients"] = int(df["patient_id"].nunique())
        return self

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        X = df[self.features]
        g0 = df["g0"].to_numpy()
        out = {}
        for h in HORIZONS:
            out[f"pred_{h}"] = g0 + self.point[h].predict(X)
            q = self.quant[h].predict(X)
            out[f"lo_{h}"] = g0 + q[:, 0] - self.offset[h]
            out[f"hi_{h}"] = g0 + q[:, 1] + self.offset[h]
        for ev, m in self.clf.items():
            out[f"p_{ev}"] = m.predict_proba(X)[:, 1]
        return pd.DataFrame(out, index=df.index)

    def explain(self, df: pd.DataFrame, target: str = "ev_hyper") -> tuple[pd.DataFrame, pd.DataFrame]:
        """Exact TreeSHAP contributions for a target model.

        Returns (per-feature contributions, per-stream contributions). For event
        models the unit is log-odds; for horizons (int) it is mg/dL.
        """
        model = self.clf.get(target) if isinstance(target, str) else self.point[target]
        dm = xgb.DMatrix(df[self.features], feature_names=self.features)
        contrib = model.get_booster().predict(dm, pred_contribs=True)
        per_feat = pd.DataFrame(contrib[:, :-1], columns=self.features, index=df.index)
        per_feat["_bias"] = contrib[:, -1]
        groups = feature_groups(self.features)
        per_group = pd.DataFrame({g: per_feat[cols].sum(axis=1) for g, cols in groups.items() if cols},
                                 index=df.index)
        return per_feat, per_group
