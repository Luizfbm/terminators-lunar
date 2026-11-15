"""Draw the points of the PGDA check from the two published maps, by the rule in pgda.py.

    uv run --project backend python validation/fetch_pgda_points.py MAPS_FOLDER

MAPS_FOLDER is where the two GeoTIFFs are, or are downloaded to; it must be outside the
repo, which never holds the maps. Each map is checked against its sha256 before use. The
output, `validation/data/pgda_points.json`, holds only the drawn points and their map
values, so anyone with the same two files gets the same points.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import httpx
import numpy as np
import rasterio  # type: ignore[import-untyped]

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pgda

REPO = Path(__file__).resolve().parents[1]
OUTPUT = Path(__file__).resolve().parent / "data" / "pgda_points.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch(folder: Path, name: str) -> Path:
    spec = pgda.MAPS[name]
    path: Path = folder / str(spec["file"])
    if not path.exists():
        with httpx.stream("GET", f"{pgda.BASE_URL}/{spec['file']}", timeout=300) as response:
            response.raise_for_status()
            with path.open("wb") as handle:
                for chunk in response.iter_bytes():
                    handle.write(chunk)
    found = sha256(path)
    if found != spec["sha256"]:
        raise SystemExit(f"{path}: sha256 {found}, expected {spec['sha256']}")
    return path


def smooth(values: np.ndarray) -> np.ndarray:
    """True where every one of the 8 neighbours is within pgda.SMOOTH of the pixel."""
    ok = np.zeros(values.shape, dtype=bool)
    inner = values[1:-1, 1:-1]
    good = np.ones(inner.shape, dtype=bool)
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            if dr == 0 and dc == 0:
                continue
            neighbour = values[1 + dr : values.shape[0] - 1 + dr, 1 + dc : values.shape[1] - 1 + dc]
            good &= np.abs(neighbour - inner) <= pgda.SMOOTH + 1e-9
    ok[1:-1, 1:-1] = good
    return ok


def draw(folder: Path) -> dict[str, Any]:
    paths = {name: fetch(folder, name) for name in pgda.MAPS}
    values: dict[str, np.ndarray] = {}
    for name, path in paths.items():
        with rasterio.open(path) as dataset:
            values[name] = dataset.read(1).astype(np.float64) * pgda.SCALE
            transform = dataset.transform
    west, north, cell = transform.c, transform.f, transform.a
    rows, cols = np.indices(values["sun"].shape)
    x = west + (cols + 0.5) * cell
    y = north - (rows + 0.5) * cell
    latitude = np.degrees(2.0 * np.arctan(np.hypot(x, y) / (2.0 * pgda.MOON_RADIUS_M))) - 90.0
    candidate = (
        (latitude <= pgda.LATITUDE_LIMIT_DEG) & smooth(values["sun"]) & smooth(values["earth"])
    )

    rng = np.random.default_rng(pgda.SEED)
    taken = np.zeros(candidate.shape, dtype=bool)
    width = candidate.shape[1]
    points: list[dict[str, Any]] = []
    for name, strata, per in (
        ("sun", pgda.SUN_STRATA, pgda.SUN_PER_STRATUM),
        ("earth", pgda.EARTH_STRATA, pgda.EARTH_PER_STRATUM),
    ):
        for low, high in strata:
            last = high >= (1.0 if name == "earth" else 0.9)
            inside = (values[name] >= low) & (
                (values[name] <= high) if last else (values[name] < high)
            )
            # Row-major order of the pixels, so the draw depends only on the maps and the seed.
            pool = np.flatnonzero(candidate & inside & ~taken)
            size = min(per, len(pool))
            chosen = rng.choice(len(pool), size=size, replace=False) if size else np.array([], int)
            for index in sorted(int(i) for i in chosen):
                row, col = divmod(int(pool[index]), width)
                taken[row, col] = True
                lat, lon = pgda.pixel_centre(row, col, west, north, cell)
                points.append(
                    {
                        "id": f"{name}-{low:.1f}-{len(points):03d}",
                        "drawn_for": name,
                        "stratum": [low, high],
                        "row": row,
                        "col": col,
                        "latitude_deg": lat,
                        "longitude_deg": lon,
                        "map_sun": float(values["sun"][row, col]),
                        "map_earth": float(values["earth"][row, col]),
                    }
                )
    # Bright ridges, for information only: Sun at 0.6 or more, no smoothness filter, a
    # generator of their own, so the judged points above are the same as before.
    bright_rng = np.random.default_rng(pgda.BRIGHT_SEED)
    south = latitude <= pgda.LATITUDE_LIMIT_DEG
    bright: list[dict[str, Any]] = []
    for low, high in pgda.BRIGHT_STRATA:
        last = high >= 0.9
        inside = (values["sun"] >= low) & (
            (values["sun"] <= high) if last else (values["sun"] < high)
        )
        pool = np.flatnonzero(south & inside)
        size = min(pgda.BRIGHT_PER_STRATUM, len(pool))
        chosen = (
            bright_rng.choice(len(pool), size=size, replace=False) if size else np.array([], int)
        )
        for index in sorted(int(i) for i in chosen):
            row, col = divmod(int(pool[index]), width)
            lat, lon = pgda.pixel_centre(row, col, west, north, cell)
            bright.append(
                {
                    "id": f"bright-{low:.1f}-{len(bright):03d}",
                    "drawn_for": "sun",
                    "stratum": [low, high],
                    "row": row,
                    "col": col,
                    "latitude_deg": lat,
                    "longitude_deg": lon,
                    "map_sun": float(values["sun"][row, col]),
                    "map_earth": float(values["earth"][row, col]),
                }
            )
    return {
        "maps": {
            name: {**spec, "url": f"{pgda.BASE_URL}/{spec['file']}"}
            for name, spec in pgda.MAPS.items()
        },
        "rule": {
            "seed": pgda.SEED,
            "latitude_limit_deg": pgda.LATITUDE_LIMIT_DEG,
            "smooth": pgda.SMOOTH,
            "sun_strata": pgda.SUN_STRATA,
            "earth_strata": pgda.EARTH_STRATA,
            "sun_per_stratum": pgda.SUN_PER_STRATUM,
            "earth_per_stratum": pgda.EARTH_PER_STRATUM,
            "candidates": int(candidate.sum()),
        },
        "points": points,
        "bright_rule": {
            "seed": pgda.BRIGHT_SEED,
            "latitude_limit_deg": pgda.LATITUDE_LIMIT_DEG,
            "sun_strata": pgda.BRIGHT_STRATA,
            "per_stratum": pgda.BRIGHT_PER_STRATUM,
            "smooth": None,
            "judged": False,
        },
        "bright_points": bright,
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    folder = Path(sys.argv[1]).resolve()
    if folder == REPO or REPO in folder.parents:
        raise SystemExit("Keep the maps outside the repo.")
    folder.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(draw(folder), indent=1) + "\n", "utf-8")
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
