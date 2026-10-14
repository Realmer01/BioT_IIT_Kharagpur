"""Generate the Bharat synthetic cohort and run it through the twin + feature pipeline.

Usage:  python scripts/build_bharat.py [--n 80]
Output: data/synthetic/bharat/*  and  data/processed/bharat_features.parquet / bharat_twins.parquet
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from madhutwin.config import PROCESSED  # noqa: E402
from madhutwin.data import synth_cohort as S  # noqa: E402
from madhutwin.pipeline import process_many  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=80)
    ap.add_argument("--seed", type=int, default=2026)
    args = ap.parse_args()
    t = time.time()
    cohort = S.generate(n_patients=args.n, seed=args.seed, verbose=False)
    print(f"generated {len(cohort)} patients in {time.time() - t:.0f}s")
    items = []
    for pid in cohort["patient_id"]:
        minute, meals, ehr = S.load_patient(pid)
        items.append((pid, minute, meals, ehr, ehr["regimen"]))
    feats, info = process_many(items)
    feats = feats.merge(cohort[["patient_id", "group"]], on="patient_id")
    feats.to_parquet(PROCESSED / "bharat_features.parquet", index=False)
    info.merge(cohort, on="patient_id").to_parquet(PROCESSED / "bharat_twins.parquet", index=False)
    print(f"{len(feats):,} feature rows from {feats.patient_id.nunique()} patients in {time.time() - t:.0f}s")
    print(info[[c for c in info.columns if c.startswith(("fit_rmse", "prior_rmse"))]].mean().round(1).to_string())


if __name__ == "__main__":
    main()
