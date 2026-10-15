"""Core correctness tests: physiology sanity, causality (no look-ahead), metrics."""
import numpy as np
import pandas as pd
import pytest

from madhutwin.data.cgmacros import _native_mask
from madhutwin.features import build_features
from madhutwin.ml.metrics import clarke_zones
from madhutwin.physiology import model as M
from madhutwin.twin import DigitalTwin, prepare_arrays


def _meal_response(p, mets=None, carbs=60.0):
    n = 360
    inputs = M.build_inputs(n, [30], [carbs], [10], [10], [3], [70], mets=mets)
    return M.simulate(p, M.steady_state(p), *inputs, 8.0)[:, M.S_G]


def test_steady_state_is_basal():
    p = M.default_params(Gb=120.0)
    x = M.steady_state(p)
    assert abs(x[M.S_G] - 120.0) < 0.5
    assert x[M.S_I] < 0.5  # only the tail of the dawn bump keeps insulin marginally above basal at 03:00


def test_meal_raises_and_returns():
    g = _meal_response(M.default_params(Gb=100.0, SI=4e-4, beta=0.15))
    assert g.max() > 130  # a 60 g carbohydrate meal produces an excursion
    assert abs(g[-1] - 100.0) < 15  # and glucose returns towards basal within hours


def test_insulin_resistance_raises_peak():
    healthy = _meal_response(M.default_params(Gb=90.0, SI=6e-4, beta=0.25))
    t2d = _meal_response(M.default_params(Gb=150.0, SI=1.5e-4, beta=0.05))
    assert (t2d.max() - t2d[0]) > (healthy.max() - healthy[0])


def test_post_meal_walk_lowers_peak():
    p = M.default_params(Gb=150.0, SI=1.6e-4, beta=0.05)
    mets = np.ones(360)
    mets[50:65] = 4.0
    assert _meal_response(p, mets=mets).max() < _meal_response(p).max() - 5


def test_sulfonylurea_lowers_fasting_glucose():
    base = M.default_params(Gb=140.0, SI=2.5e-4)
    su = base.copy()
    su[M.P["su"]] = 1.0
    assert M.steady_state(su)[M.S_G] < M.steady_state(base)[M.S_G] - 10


def test_native_mask_recovers_sensor_grid():
    native = np.arange(0, 60, 5)
    vals = 100 + 10 * np.sin(native / 7.0)
    interp = np.interp(np.arange(56), native, vals)
    mask = _native_mask(interp, 5)
    assert set(np.flatnonzero(mask)) == set(range(0, 56, 5))


def _toy_patient(days=3, seed=0):
    rng = np.random.default_rng(seed)
    n = days * 1440
    t = pd.date_range("2026-01-01", periods=n, freq="1min")
    cgm = np.full(n, np.nan)
    cgm[::5] = 110 + 25 * np.sin(np.arange(0, n, 5) / 180.0) + rng.normal(0, 3, len(cgm[::5]))
    minute = pd.DataFrame({"time": t, "cgm": cgm, "hr": 70 + rng.normal(0, 2, n), "mets": 1.2 + (rng.random(n) < 0.05) * 2.5})
    meal_times = [t[0] + pd.Timedelta(hours=h) for d in range(days) for h in (8 + 24 * d, 13 + 24 * d, 20 + 24 * d)]
    meals = pd.DataFrame({"time": meal_times, "carbs": 60.0, "protein": 15.0, "fat": 10.0, "fiber": 4.0, "kcal": 450.0, "gi": 65.0})
    return minute, meals


def test_features_are_causal():
    """Features at time t must not change when data after t is removed."""
    minute, meals = _toy_patient()
    ehr = {"hba1c": 6.8, "fpg": 125, "fasting_insulin": 11, "weight_kg": 70, "age": 50, "sex": "M"}
    twin = DigitalTwin.from_ehr("toy", ehr)
    cut = 2 * 1440 + 13 * 60  # mid-day on day 3
    full_arr = prepare_arrays(minute, meals)
    full = build_features(minute, meals, ehr, full_arr, twin, twin.sync(full_arr))
    m2, me2 = minute.iloc[:cut].copy(), meals[meals["time"] < minute["time"].iloc[cut]].copy()
    part_arr = prepare_arrays(m2, me2)
    part = build_features(m2, me2, ehr, part_arr, twin, twin.sync(part_arr))
    feat_cols = [c for c in full.columns if c.startswith(("cgm_", "wear_", "meal_", "ehr_", "ctx_", "twin_"))]
    a = full[full["minute"] < cut - 1].set_index("minute")[feat_cols]
    b = part.set_index("minute").loc[a.index, feat_cols]
    pd.testing.assert_frame_equal(a, b, check_exact=False, rtol=1e-9, atol=1e-9)


def test_clarke_zones():
    z = clarke_zones(np.array([100, 100, 60, 300]), np.array([105, 160, 65, 120]))
    assert list(z) == ["A", "B", "A", "D"]


@pytest.mark.parametrize("regimen,key", [([{"drug": "Metformin", "class": "biguanide", "daily_dose_mg": 1000}], "met"),
                                         ([{"drug": "Glimepiride", "class": "sulfonylurea", "daily_dose_mg": 2}], "su")])
def test_drug_mapping(regimen, key):
    tw = DigitalTwin.from_ehr("x", {"hba1c": 7.5, "weight_kg": 70}, regimen)
    assert tw.params[M.P[key]] > 0


def test_onboarding_reads_device_export():
    from madhutwin.onboarding import parse_csv
    # title line above the header, export column names, glucose in mmol/L
    text = ("Glucose Data,Generated on,2026-10-14\n"
            "Device,Serial Number,Device Timestamp,Record Type,Historic Glucose mmol/L\n"
            "FreeStyle,X1,2026-10-05 07:00,0,6.1\n"
            "FreeStyle,X1,2026-10-05 07:15,0,7.0\n")
    df, info = parse_csv(text)
    assert len(df) == 2 and info["unit"].startswith("mmol/L")
    assert df["glucose"].iloc[0] == pytest.approx(6.1 * 18.016)


def test_onboarding_matches_logged_meals_to_library():
    from madhutwin.onboarding import _food_id
    assert _food_id("Rajma chawal", "lunch", 85) == "rajma_chawal"
    assert _food_id("lunch at office", "lunch", 85) in {"rice_sambar", "rajma_chawal"}  # closest-sized lunch dish
