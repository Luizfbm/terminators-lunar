"""The nearest permanently shadowed region to a Site (the requirement).

The map is PGDA product 69, `LPSR_85S_060M_201608` (LOLA team, Mazarico et al. 2011,
Icarus 211, doi:10.1016/j.icarus.2010.10.030): 60 m cells in south polar stereographic on
the 1737.4 km sphere, true scale at the pole, 5058 × 5058 cells (±151.7 km), complete to
85°S and partial to about 82.9°S. Its PDS label says each cell is binary, permanent shadow
(DN +20000, scaling to 1) or not (DN −20000, scaling to 0), with a scaling factor of
0.000025 and an offset of 0.5. Neither the label, the README nor the product page says
anything about very small patches, so we treat every shadowed cell as part of a PSR,
a single isolated cell included, and filter nothing.

`LUNAR_PSR_MAP` is the path of the map's GeoTIFF. Without it, or without the file, there
is no answer and `/terrain` leaves `permanent_shadow` out.

What the answer is, exactly: the shadowed cell whose centre is nearest the Site on the
ground (great circle on the 1737.4 km sphere), its distance and the azimuth of the great
circle that leaves the Site towards it, clockwise from north. A Site that sits in a
shadowed cell gets that cell, under 43 m away. The search reaches `SEARCH_RADIUS_M`; with
no shadowed cell that close the answer is null. When the map's edge is nearer than the
answer could be, the map does not cover the Site and there is no answer.
"""

from __future__ import annotations

import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import rasterio  # type: ignore[import-untyped]

from . import horizon
from .constants import MOON_RADIUS_M

PSR_MAP_ENV = "LUNAR_PSR_MAP"
# Far enough for anything a lander or a rover near the Site could reach, and short of
# the whole map, so "none in range" can be said. Searched in growing squares, so the
# usual case reads a few thousand cells.
SEARCH_RADIUS_M = 50_000.0
SEARCH_STEPS_M = (2_000.0, 10_000.0, SEARCH_RADIUS_M)
# The map's edge is measured with the local map scale; this keeps the coverage test on
# the safe side of the scale's change across the search (0.2 % at most inside 85°S).
EDGE_MARGIN = 0.99

Mask = npt.NDArray[np.bool_]


class _Absent:
    """No map on this server, or the map does not cover the Site."""


ABSENT = _Absent()


@dataclass(frozen=True)
class _Map:
    product: str
    shadowed: Mask
    west: float
    north: float
    cell_m: float


def map_path() -> Path | None:
    raw = os.environ.get(PSR_MAP_ENV)
    if not raw:
        return None
    path = Path(raw)
    return path if path.is_file() else None


@lru_cache(maxsize=1)
def _load(path: str, modified_ns: int) -> _Map:
    """The whole map as one boolean grid (25 MB for the 60 m product), read once."""
    with horizon._LOCK, rasterio.open(path) as dataset:
        transform = dataset.transform
        if transform.b != 0 or transform.d != 0 or transform.a != -transform.e:
            raise ValueError(f"{path}: expected a north-up grid of square cells")
        raw = dataset.read(1)
        scale = dataset.scales[0] if dataset.scales else 1.0
        offset = dataset.offsets[0] if dataset.offsets else 0.0
    # The GeoTIFF may hold the label's DN (±20000) with or without the scaling tags, or
    # the scaled 0/1 flag: after the tags, shadow is the only value above one half.
    values = raw.astype(np.float64) * (scale if scale else 1.0) + (offset or 0.0)
    shadowed: Mask = np.asarray(values > 0.5)
    return _Map(Path(path).stem, shadowed, transform.c, transform.f, transform.a)


def nearest(latitude_deg: float, longitude_deg: float) -> dict[str, Any] | None | _Absent:
    """The contract's `PermanentShadow`, null with none in range, or ABSENT."""
    path = map_path()
    if path is None:
        return ABSENT
    found = _load(str(path), path.stat().st_mtime_ns)
    return _search(found, latitude_deg, longitude_deg)


def _search(
    found: _Map, latitude_deg: float, longitude_deg: float
) -> dict[str, Any] | None | _Absent:
    latitude_deg = max(latitude_deg, horizon.POLE_LATITUDE_DEG)
    x, y = horizon._stereographic(np.array([latitude_deg]), np.array([longitude_deg]))
    col = (float(x[0]) - found.west) / found.cell_m - 0.5
    row = (found.north - float(y[0])) / found.cell_m - 0.5
    rows, cols = found.shadowed.shape
    if not (-0.5 <= col <= cols - 0.5 and -0.5 <= row <= rows - 0.5):
        return ABSENT
    colatitude = math.radians(90.0 + latitude_deg)
    # Ground distance from the Site to the nearest edge of the map, at the Site's scale.
    edge_cells = min(col + 0.5, cols - 0.5 - col, row + 0.5, rows - 0.5 - row)
    edge_m = edge_cells * found.cell_m / _scale(colatitude) * EDGE_MARGIN
    for reach_m in SEARCH_STEPS_M:
        # The square must hold the whole disk on the ground, where the map is largest:
        # at its far edge from the pole.
        half = reach_m * _scale(colatitude + reach_m / MOON_RADIUS_M) / found.cell_m + 1.0
        c0, c1 = max(0, math.floor(col - half)), min(cols, math.ceil(col + half) + 1)
        r0, r1 = max(0, math.floor(row - half)), min(rows, math.ceil(row + half) + 1)
        hit_rows, hit_cols = np.nonzero(found.shadowed[r0:r1, c0:c1])
        if hit_rows.size:
            cell_x = found.west + (hit_cols + c0 + 0.5) * found.cell_m
            cell_y = found.north - (hit_rows + r0 + 0.5) * found.cell_m
            lat, lon = _inverse(cell_x, cell_y)
            distance = _great_circle(latitude_deg, longitude_deg, lat, lon)
            best = int(np.argmin(distance))
            closest = float(distance[best])
            if closest <= reach_m:
                if closest > edge_m:
                    return ABSENT
                return {
                    "distance_m": closest,
                    "azimuth_deg": _bearing(latitude_deg, longitude_deg, lat[best], lon[best]),
                    "latitude_deg": float(lat[best]),
                    "longitude_deg": float(lon[best]),
                    "product": found.product,
                }
    return None if SEARCH_RADIUS_M <= edge_m else ABSENT


def _scale(colatitude_rad: float) -> float:
    """Polar stereographic map scale at a colatitude from the pole: 1 / cos²(c / 2)."""
    return 1.0 / math.cos(colatitude_rad / 2.0) ** 2


def _inverse(x: Any, y: Any) -> tuple[Any, Any]:
    rho = np.hypot(x, y)
    latitude = np.degrees(2.0 * np.arctan(rho / (2.0 * MOON_RADIUS_M))) - 90.0
    return latitude, np.degrees(np.arctan2(x, y))


def _great_circle(lat1: float, lon1: float, lat2: Any, lon2: Any) -> Any:
    p1, p2 = math.radians(lat1), np.radians(lat2)
    dlat = p2 - p1
    dlon = np.radians(lon2 - lon1)
    h = np.sin(dlat / 2) ** 2 + math.cos(p1) * np.cos(p2) * np.sin(dlon / 2) ** 2
    return 2.0 * MOON_RADIUS_M * np.arcsin(np.sqrt(np.minimum(1.0, h)))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    east = math.sin(dlon) * math.cos(p2)
    north = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dlon)
    azimuth = math.degrees(math.atan2(east, north)) % 360.0
    # A value a hair under 360 rounds to 360.0 in floating point; the contract excludes it.
    return 0.0 if azimuth >= 360.0 else azimuth
