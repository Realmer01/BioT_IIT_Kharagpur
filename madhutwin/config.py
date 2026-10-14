"""Central paths and constants for MadhuTwin."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW_CGMACROS = DATA / "raw" / "cgmacros" / "CGMacros"
PROCESSED = DATA / "processed"
SYNTHETIC = DATA / "synthetic"
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"
FIGURES = REPORTS / "figures"

for _p in (PROCESSED, SYNTHETIC, MODELS, REPORTS, FIGURES):
    _p.mkdir(parents=True, exist_ok=True)

# Glycaemic thresholds (international consensus on CGM time-in-range, Battelino et al. 2019)
HYPO_L2 = 54.0
HYPO = 70.0
HYPER = 180.0
HYPER_L2 = 250.0

# Forecast horizons in minutes (challenge asks for up to 2 h advance warning)
HORIZONS = (30, 60, 90, 120)
GRID_MIN = 5  # feature/label grid resolution (minutes)

RANDOM_SEED = 42
