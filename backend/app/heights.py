"""`GET /terrain/heights`: the DEM's own heights around a Site, for the view from the ground.

The grid is a square window of pixels of the finest DEM the engine reads near the Site (the
same choice as the Slope, `horizon.slope_bands`): the 20 m PGDA DEM at the south pole, the
off-pole window of a Curated Site, LOLA's LDEM_128 (237 m) between 70°S and 70°N, and LOLA's
polar stereographic 240 m products within 20° of either pole. Nothing is resampled: every
value is one pixel of the file, in the file's own projection, so the frontend draws the
Moon's measured ground and not a guess of it.

The heights are sent as the published ground maps of `/moon/` are: integers 0 to 65535, row
by row from the top left, that stand for heights in metres above the 1737.4 km sphere from
`at_0_m` (the lowest pixel) to `at_65535_m` (the highest). The step between two integers is
`quantum_m`, a few centimetres for a few kilometres of relief, far under LOLA's own error.

A window that runs off the DEM, or over a pixel without data, is never filled in: the next,
coarser DEM is tried, and with none left the answer is a 422.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import rasterio  # type: ignore[import-untyped]

from . import horizon, slope
from .constants import MOON_RADIUS_M

# How far from the Site the grid reaches on the ground, at least, by default and at most.
HALF_EXTENT_MIN_M = 1_000.0
HALF_EXTENT_DEFAULT_M = 20_000.0
HALF_EXTENT_MAX_M = 30_000.0
# At most 255 pixels on each side of the Site's own: 511 x 511, about 260 000 heights. With a
# DEM finer than ~120 m the grid then reaches less far than asked (5.1 km on the 20 m DEM),
# and on the simple cylindrical maps near 70° it is narrower east to west than north to south.
MAX_HALF_PX = 255
# The engine's projection names, as the contract spells them.
PROJECTIONS = {
    "polar": "south_polar_stereographic",
    "polar_north": "north_polar_stereographic",
    "eqc": "equirectangular",
}
# Every simple cylindrical DEM of the engine is centred on 180°E (SLDEM2015, LDEM_128); the
# polar ones have 0°E along their central meridian.
CENTRE_LONGITUDE_DEG = {"polar": 0.0, "polar_north": 0.0, "eqc": 180.0}


@dataclass(frozen=True)
class Grid:
    product: str
    resolution_m: float
    projection: str
    metres_per_pixel: float
    x_min_m: float
    y_max_m: float
    heights: npt.NDArray[np.float64]


def grid(
    latitude_deg: float, longitude_deg: float, half_extent_m: float, site_id: str | None
) -> Grid:
    """The grid around a Site, on the finest DEM that holds all of it.

    Raises `horizon.DemUnavailable`, with every DEM's reason, when none does.
    """
    folder, bands = horizon.slope_bands(site_id, latitude_deg)
    return _grid(str(folder), bands, round(latitude_deg, 7), round(longitude_deg, 7), half_extent_m)


@lru_cache(maxsize=32)
def _grid(
    folder: str,
    bands: tuple[horizon.Band, ...],
    latitude_deg: float,
    longitude_deg: float,
    half_extent_m: float,
) -> Grid:
    reasons: list[str] = []
    tried: set[str] = set()
    for band in bands:
        # A DEM walked as two bands (GLOBAL's near and far) is one file.
        if band.product in tried:
            continue
        tried.add(band.product)
        path = Path(folder) / f"{band.product}.TIF"
        if not path.is_file():
            reasons.append(f"{band.product} not found in {folder}")
            continue
        found = _window(path, band, latitude_deg, longitude_deg, half_extent_m)
        if isinstance(found, Grid):
            return found
        reasons.append(f"{band.product}: {found}")
    raise horizon.DemUnavailable(bands[0].product, "; ".join(reasons))


def _window(
    path: Path, band: horizon.Band, latitude_deg: float, longitude_deg: float, half_m: float
) -> Grid | str:
    """The square of pixels around the Site on one DEM, or why that DEM does not hold it."""
    if band.projection == "eqc" and abs(latitude_deg) > 89.0:
        return "a simple cylindrical map has no square of ground at the pole"
    site_x, site_y = horizon._project(band, np.array([latitude_deg]), np.array([longitude_deg]))
    x0, y0 = float(site_x[0]), float(site_y[0])
    # Map metres per ground metre: 1/cos(lat) east to west on a simple cylindrical map.
    scale = max(slope.map_scale(band.projection, latitude_deg))
    with horizon._LOCK, rasterio.open(path) as dataset:
        transform = dataset.transform
        if (
            transform.b != 0
            or transform.d != 0
            or transform.a <= 0
            or transform.e >= 0
            or not math.isclose(transform.a, -transform.e, rel_tol=1e-9)
        ):
            return "the grid is not north up with square pixels"
        cell = float(transform.a)
        column = (x0 - transform.c) / transform.a - 0.5
        row = (y0 - transform.f) / transform.e - 0.5
        reach = half_m * scale / cell
        half_px = MAX_HALF_PX if reach >= MAX_HALF_PX else max(1, math.ceil(reach))
        col0 = round(column) - half_px
        row0 = round(row) - half_px
        size = 2 * half_px + 1
        col1, row1 = col0 + size, row0 + size
        outside_cols = col0 < 0 or col1 > dataset.width
        if row0 < 0 or row1 > dataset.height or (outside_cols and not band.wraps):
            return "the grid runs past the edge of the DEM"
        # Across 0°E the global map reads on from its other edge (horizon.read_window).
        heights = horizon.read_window(dataset, col0, row0, col1, row1, band.wraps)
        nodata = dataset.nodata
    if nodata is not None and not math.isnan(nodata):
        heights[heights == nodata] = np.nan
    if not np.all(np.isfinite(heights)):
        return "the DEM has no data under part of the grid"
    return Grid(
        product=band.product,
        resolution_m=band.resolution_m,
        projection=band.projection,
        metres_per_pixel=cell,
        # The corner of the first pixel read. Past 0°E on the global map it runs on beyond
        # -pi R or +pi R, so x stays continuous across the grid, as the rays' x does.
        x_min_m=float(transform.c + col0 * transform.a),
        y_max_m=float(transform.f + row0 * transform.e),
        heights=heights,
    )


def encode(heights: npt.NDArray[np.float64]) -> dict[str, Any]:
    """The contract's `HeightGrid`: integers 0..65535 between the lowest and highest pixel."""
    low = float(heights.min())
    high = float(heights.max())
    # Flat ground has no span; one metre keeps the scale finite and every value at 0.
    span = high - low if high > low else 1.0
    codes = np.rint((heights - low) / span * 65535.0).astype(np.uint16)
    return {
        "at_0_m": low,
        "at_65535_m": low + span,
        "quantum_m": span / 65535.0,
        "values": codes.ravel().tolist(),
    }


def as_json(found: Grid, half_extent_m: float) -> dict[str, Any]:
    """The contract's `TerrainHeights` without its `site`."""
    size = int(found.heights.shape[0])
    return {
        "dem": {"product": found.product, "resolution_m": found.resolution_m},
        "projection": PROJECTIONS[found.projection],
        "center_longitude_deg": CENTRE_LONGITUDE_DEG[found.projection],
        "sphere_radius_m": MOON_RADIUS_M,
        "size_px": size,
        "metres_per_pixel": found.metres_per_pixel,
        "x_min_m": found.x_min_m,
        "y_max_m": found.y_max_m,
        "half_extent_m": half_extent_m,
        "heights": encode(found.heights),
    }
