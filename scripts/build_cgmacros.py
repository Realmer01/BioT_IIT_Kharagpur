"""Parse CGMacros, personalise a twin per participant, and build the feature table.

Usage:  python scripts/build_cgmacros.py
Output: data/processed/cgmacros_features.parquet, data/processed/cgmacros_twins.parquet
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from madhutwin.config import PROCESSED  # noqa: E402
from madhutwin.data import cgmacros  # noqa: E402
from madhutwin.pipeline import process_many  # noqa: E402


def main():
    t = time.time()
    if not (cgmacros.OUT / "ehr.parquet").exists():
        cgmacros.build()
    ehr = cgmacros.load_ehr()
    items = []
    for _, row in ehr.iterrows():
        minute, meals = cgmacros.load_subject(row["subject_id"])
        items.append((row["subject_id"], minute, meals, row.to_dict(), None))
    feats, info = process_many(items)
    feats = feats.merge(ehr[["subject_id", "group"]].rename(columns={"subject_id": "patient_id"}), on="patient_id")
    info = info.merge(ehr.rename(columns={"subject_id": "patient_id"}), on="patient_id")
    feats.to_parquet(PROCESSED / "cgmacros_features.parquet", index=False)
    info.to_parquet(PROCESSED / "cgmacros_twins.parquet", index=False)
    print(f"{len(feats):,} rows x {feats.shape[1]} cols from {feats.patient_id.nunique()} participants "
          f"in {time.time() - t:.0f}s")
    print(info[[c for c in info.columns if c.startswith(("fit_rmse", "prior_rmse"))]].mean().round(1).to_string())


if __name__ == "__main__":
    main()
