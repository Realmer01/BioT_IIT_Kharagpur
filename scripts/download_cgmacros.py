"""Download CGMacros v1.0.0 (PhysioNet, open access, CC BY-NC-SA 4.0) and extract the CSVs.

Tries PhysioNet's AWS open-data mirror first (much faster), then physionet.org.
Verifies the archive against PhysioNet's published SHA-256 before extracting.

Usage:  python scripts/download_cgmacros.py
Output: data/raw/cgmacros/CGMacros/*.csv  (meal photos are not extracted)
"""
import hashlib
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "data" / "raw" / "cgmacros"
ZIP = "CGMacros_dateshifted365.zip"
MIRRORS = ["https://physionet-open.s3.amazonaws.com/cgmacros/1.0.0/", "https://physionet.org/files/cgmacros/1.0.0/"]


def fetch(name: str, out: Path) -> None:
    last = None
    for base in MIRRORS:
        try:
            print(f"downloading {base}{name}")
            with urllib.request.urlopen(base + name, timeout=60) as r, open(out, "wb") as f:
                total = int(r.headers.get("Content-Length") or 0)
                done = 0
                while chunk := r.read(1 << 20):
                    f.write(chunk)
                    done += len(chunk)
                    if total:
                        print(f"\r  {done / 1e6:7.1f} / {total / 1e6:.1f} MB", end="", flush=True)
            print()
            return
        except Exception as e:  # noqa: BLE001 - try the next mirror
            last = e
            print(f"  failed: {e}")
    raise SystemExit(f"could not download {name}: {last}")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    if (DEST / "CGMacros" / "bio.csv").exists():
        print("CGMacros already present:", DEST / "CGMacros")
        return
    zpath = DEST / ZIP
    sums = DEST / "SHA256SUMS.txt"
    fetch("SHA256SUMS.txt", sums)
    fetch("LICENSE.txt", DEST / "LICENSE.txt")
    if not zpath.exists():
        fetch(ZIP, zpath)
    expected = next((ln.split()[0] for ln in sums.read_text().splitlines() if ln.strip().endswith(ZIP)), None)
    got = sha256(zpath)
    if expected and got != expected:
        zpath.unlink()
        sys.exit(f"checksum mismatch ({got} != {expected}); deleted the archive, please rerun")
    print("checksum ok" if expected else "warning: no published checksum found")
    with zipfile.ZipFile(zpath) as z:
        for n in z.namelist():
            if n.lower().endswith(".csv"):
                z.extract(n, DEST)
    print("extracted CSVs to", DEST / "CGMacros")


if __name__ == "__main__":
    main()
