"""Download the PGDA product 78 tiles (and the LDEC raster) that Eduardo's Monte Carlo reads.

    uv run --project backend python validation/hazard/fetch_pgda78.py FOLDER [--with-ldec]

FOLDER must be outside the repo, which never holds the layers. It gets one directory per tile,
`<tile>/<tile>_final_adj_5mpp_<layer>.tif` for the four layers the Monte Carlo reads (surf,
ldec, slp, slperr), the layout mc_lola.py expects. The 26 tiles are the ones in
backend/app/data/hazard/tiles.json. `--with-ldec` also fetches `LDEC_875S_5M.IMG` (920,272,896
bytes) for coverage.py. This is gigabytes: the coordinator runs it on the server, never in CI
and never on an agent's machine.

Sources (public domain, NASA):
- PGDA product 78, Barker et al. 2021, Planetary and Space Science 203, 105119, https://pgda.gsfc.nasa.gov/products/78,
  files at https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/<tile>/ (the product page lists each tile's
  layers under that pattern);
- LDEC_875S_5M, the LOLA GDR of the south pole, https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/.

SHA-256. Each file's size and SHA-256 are kept in `validation/data/hazard_pgda78_sha256.json`.
The first run on a machine that has no entry for a file records it there (commit the file);
every later run, anywhere, refuses a file whose hash is not the recorded one. That is how a
rerun can be tied to the exact layers. An existing file is hashed, not downloaded again.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rules

ROOT = Path(__file__).resolve().parents[2]
TILES_JSON = ROOT / "backend" / "app" / "data" / "hazard" / "tiles.json"
MANIFEST = ROOT / "validation" / "data" / "hazard_pgda78_sha256.json"
PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp"
LDEC_URL = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEC_875S_5M.IMG"
LDEC_BYTES = rules.D_RASTER_SIZE * rules.D_RASTER_SIZE  # uint8
LAYERS = ("surf", "ldec", "slp", "slperr")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".part")
    with httpx.stream("GET", url, timeout=600, follow_redirects=True) as response:
        response.raise_for_status()
        with partial.open("wb") as handle:
            for chunk in response.iter_bytes(1 << 20):
                handle.write(chunk)
    partial.rename(path)


def tiles() -> list[str]:
    return sorted(json.loads(TILES_JSON.read_text("utf-8"))["tiles"])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("folder", type=Path, help="where the layers go (outside the repo)")
    ap.add_argument("--with-ldec", action="store_true", help="also fetch LDEC_875S_5M.IMG")
    ap.add_argument("--tiles", nargs="*", help="only these tiles")
    a = ap.parse_args()
    if ROOT in a.folder.resolve().parents or a.folder.resolve() == ROOT:
        raise SystemExit("the folder must be outside the repository")

    manifest: dict[str, dict[str, object]] = (
        json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.exists() else {}
    )
    wanted: list[tuple[str, str, Path]] = []  # (key, url, path)
    for tile in a.tiles or tiles():
        for layer in LAYERS:
            name = f"{tile}_final_adj_5mpp_{layer}.tif"
            wanted.append((f"{tile}/{name}", f"{PGDA}/{tile}/{name}", a.folder / tile / name))
    if a.with_ldec:
        wanted.append(("LDEC_875S_5M.IMG", LDEC_URL, a.folder / "LDEC_875S_5M.IMG"))

    recorded = 0
    for key, url, path in wanted:
        if not path.exists():
            print(f"fetching {url}", flush=True)
            download(url, path)
        found = {"bytes": path.stat().st_size, "sha256": sha256(path)}
        if key == "LDEC_875S_5M.IMG" and found["bytes"] != LDEC_BYTES:
            raise SystemExit(f"{path}: {found['bytes']} bytes, expected {LDEC_BYTES}")
        if key in manifest:
            if manifest[key] != found:
                raise SystemExit(f"{path}: {found}, but the manifest has {manifest[key]}")
            print(f"ok       {key}")
        else:
            manifest[key] = found
            recorded += 1
            print(f"recorded {key} {found['bytes']} {found['sha256']}")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(dict(sorted(manifest.items())), indent=1) + "\n", "utf-8")
    if recorded:
        print(f"{recorded} files recorded in {MANIFEST}: commit it")


if __name__ == "__main__":
    main()
