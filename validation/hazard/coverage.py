"""How much of the LOLA 5 m raster was measured, at 5, 10, 20, 40 and 60 m (the requirement).

A port of the multiscale-coverage part of `multirresolucao/analise_cobertura_lola.py` (Eduardo's
commit 2195fcb): without the site table, the tile matching and the figures. The raster is
`LDEC_875S_5M.IMG` of the PGDA (the number of LOLA shots in each 5 m cell, uint8, 30336 x 30336
cells, polar stereographic, from 87.5 deg S to the pole). A cell of 5, 10, 20, 40 or 60 m counts
as measured when any 5 m cell inside it has at least one shot; the share is taken over the
cells whose centre is inside the 87.5 deg S circle (the stereographic radius 2 R tan((90 + lat) /
2) of the 1737.4 km sphere). His file `docs/tabelas_tese/cobertura_multiescala.csv` prints
7.29, 25.90, 67.97, 95.93 and 99.40 %; rules.py holds the tolerance, decided before any run.

It reads the raster in strips of 96 rows (divisible by 2, 4, 8 and 12), as he does, so the
memory stays small. The raster is about 920 MB, so the coordinator runs it on the server:

    uv run --project backend python validation/hazard/coverage.py \\
        --raster /data/pgda78/LDEC_875S_5M.IMG --out /tmp/hazard/hazard_coverage.json

`--strips N` reads only the first N strips; the output then says `"smoke": true` and
test_hazard_mc.py refuses it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rules

Array = npt.NDArray[Any]

MOON_RADIUS_M = 1_737_400.0
CELL_M = 5.0
FACTORS = {5: 1, 10: 2, 20: 4, 40: 8, 60: 12}  # cell size in m: 5 m cells per side


def stereographic_radius_m(latitude_deg: float) -> float:
    """Radius from the south pole in the polar stereographic plane (his `lat2r`)."""
    return 2 * MOON_RADIUS_M * math.tan(math.radians(90.0 + latitude_deg) / 2)


def coverage_counts(
    ldec: Array,
    *,
    size: int,
    strip: int,
    centre: float,
    radius_m: float,
    strips: int | None = None,
) -> dict[int, tuple[int, int]]:
    """(measured, total) cells per resolution, over the cells whose centre is inside the circle.

    `ldec` is a (size, size) array indexable by row slices (an array or a memmap); `centre` is
    the position of the pole in 5 m cells, from the raster's corner (15167.5 for the real one).
    """
    measured = {res: 0 for res in FACTORS}
    total = {res: 0 for res in FACTORS}
    nb = size // strip
    for i in range(nb if strips is None else min(strips, nb)):
        block = np.asarray(ldec[i * strip : (i + 1) * strip, :]) > 0
        for res, k in FACTORS.items():
            cells = block.reshape(strip // k, k, size // k, k).any(axis=(1, 3))
            rows = np.arange(i * strip, (i + 1) * strip, k) + k / 2.0
            cols = np.arange(0, size, k) + k / 2.0
            yv = (centre - rows) * CELL_M
            xv = (cols - centre) * CELL_M
            inside = np.hypot(xv[None, :], yv[:, None]) <= radius_m
            measured[res] += int(cells[inside].sum())
            total[res] += int(inside.sum())
    return {res: (measured[res], total[res]) for res in FACTORS}


def percentages(counts: dict[int, tuple[int, int]]) -> dict[int, float]:
    return {res: 100.0 * m / t for res, (m, t) in counts.items()}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--raster", type=Path, required=True, help="LDEC_875S_5M.IMG")
    ap.add_argument("--out", type=Path, required=True, help="the coverage file to write (JSON)")
    ap.add_argument("--strips", type=int, default=0, help="read only the first N strips (smoke)")
    a = ap.parse_args()

    n = rules.D_RASTER_SIZE
    expected = n * n
    if a.raster.stat().st_size != expected:
        raise SystemExit(f"{a.raster}: {a.raster.stat().st_size} bytes, expected {expected}")
    ldec = np.memmap(a.raster, dtype="u1", mode="r", shape=(n, n))
    counts = coverage_counts(
        ldec,
        size=n,
        strip=rules.D_STRIP,
        centre=15167.5,
        radius_m=stereographic_radius_m(rules.D_CAP_LATITUDE_DEG),
        strips=a.strips or None,
    )
    pct = percentages(counts)
    out = {
        "rule": rules.rule(),
        "smoke": bool(a.strips),
        "raster": {"file": a.raster.name, "bytes": expected, "sha256": sha256(a.raster)},
        "coverage_pct": {str(res): pct[res] for res in FACTORS},
        "cells": {str(res): {"measured": m, "total": t} for res, (m, t) in counts.items()},
    }
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(out, indent=1) + "\n", "utf-8")
    print(json.dumps(out["coverage_pct"]))
    print(f"wrote {a.out}" + (" (smoke run: the check refuses it)" if a.strips else ""))


if __name__ == "__main__":
    main()
