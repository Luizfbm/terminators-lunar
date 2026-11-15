"""Slope of the ground around a Site, from the finest DEM that covers it (the requirement).

The defaults are NASA's Artemis III landing requirement: slope under 10° over 100 m
(NASA, "Artemis Human Landing System Overview", NASA Space Apps Challenge 2025,
NTRS 20250009323). The answer is numbers only, with no verdict word: we don't know yet
whether NASA's "over 100 m" means a 100 m baseline or a 100 m area, and the slope between
neighbouring cells of a 20 m DEM is the stricter reading.

Slope is measured by central differences at every DEM cell whose centre lies within the
radius of the Site, on that DEM's own grid, so it says nothing about rocks or craters
smaller than its cells.

Map scale. The DEM grids are regular on the map, not on the ground, so a cell's map size
is not its ground size and the height step between neighbours must be divided by the
ground distance between them:

- South polar stereographic (the PGDA products) is conformal and true to scale only at the
  pole. At colatitude c from the pole the map is k = 1 / cos²(c / 2) = 2 / (1 − sin φ)
  times larger than the ground, the same in every direction: 1.0077 at 80°S, so ignoring it
  would add about 0.08° to a 10° slope there.
- SLDEM2015's simple cylindrical keeps meridians true (k = 1 along y) and stretches
  parallels by k = 1 / cos φ along x, so the two axes get different factors.

Both factors are taken at the Site's latitude and held over the radius: across 2 km at
80°S the stereographic factor changes by under 1e-4, far below the DEM's own error.
Distances from the Site to cell centres use the same local scale.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import rasterio  # type: ignore[import-untyped]
from rasterio.windows import Window  # type: ignore[import-untyped]

from . import horizon

Array = npt.NDArray[np.float64]

# NASA's Artemis III landing requirement as presented at Space Apps 2025: slope under 10°
# over 100 m (Artemis Human Landing System Overview, NTRS 20250009323). Defaults only:
# the route takes any radius and limit inside the contract's bounds.
NASA_SLOPE_LIMIT_DEG = 10.0
NASA_SLOPE_RADIUS_M = 100.0


@dataclass(frozen=True)
class Slope:
    product: str
    resolution_m: float
    cells: int
    median_deg: float
    p95_deg: float
    max_deg: float
    limit_deg: float
    share_below_limit: float


class NoCellInRadius(Exception):
    """The finest DEM that covers the Site has no cell centre within the radius."""

    def __init__(self, product: str, resolution_m: float, radius_m: float) -> None:
        super().__init__(
            f"no cell centre of {product} ({resolution_m:g} m) lies within {radius_m:g} m"
        )
        self.product = product


def map_scale(projection: str, latitude_deg: float) -> tuple[float, float]:
    """How many map metres one ground metre spans, along x and along y, at a latitude."""
    phi = math.radians(latitude_deg)
    if projection == "eqc":
        return 1.0 / math.cos(phi), 1.0
    k = 2.0 / (1.0 - math.sin(phi))
    return k, k


def measure(
    latitude_deg: float,
    longitude_deg: float,
    radius_m: float,
    limit_deg: float,
    site_id: str | None = None,
) -> Slope:
    """Slope statistics on the finest DEM of the Site's ladder that covers the whole radius.

    A DEM covers it when its file is there, the cells within the radius and their
    neighbours are all inside the raster, and none of them is missing data. Raises
    `horizon.DemUnavailable` when no DEM does.
    """
    folder, ladder = horizon.ladder_for(site_id)
    reasons: list[str] = []
    for band in ladder:
        path = folder / f"{band.product}.TIF"
        if not path.is_file():
            reasons.append(f"{band.product} not found in {folder}")
            continue
        found = _measure(path, band, latitude_deg, longitude_deg, radius_m, limit_deg)
        if isinstance(found, Slope):
            return found
        reasons.append(f"{band.product}: {found}")
    raise horizon.DemUnavailable(ladder[0].product, "; ".join(reasons))


def _measure(
    path: Path,
    band: horizon.Band,
    latitude_deg: float,
    longitude_deg: float,
    radius_m: float,
    limit_deg: float,
) -> Slope | str:
    """The statistics on one DEM, or why that DEM does not cover the Site."""
    site_x, site_y = horizon._project(band, np.array([latitude_deg]), np.array([longitude_deg]))
    x0, y0 = float(site_x[0]), float(site_y[0])
    kx, ky = map_scale(band.projection, latitude_deg)
    with horizon._LOCK, rasterio.open(path) as dataset:
        transform = dataset.transform
        if transform.b != 0 or transform.d != 0:
            return "the grid is rotated"
        step_x, step_y = abs(transform.a), abs(transform.e)
        # Fractional column and row of the Site, counted from the first cell's centre.
        col = (x0 - transform.c) / transform.a - 0.5
        row = (y0 - transform.f) / transform.e - 0.5
        reach_cols = radius_m * kx / step_x
        reach_rows = radius_m * ky / step_y
        # One more cell on each side for the neighbours the central differences read.
        col0 = math.floor(col - reach_cols) - 1
        row0 = math.floor(row - reach_rows) - 1
        col1 = math.ceil(col + reach_cols) + 2
        row1 = math.ceil(row + reach_rows) + 2
        if col0 < 0 or row0 < 0 or col1 > dataset.width or row1 > dataset.height:
            return "the radius runs past the edge of the DEM"
        window = Window(col0, row0, col1 - col0, row1 - row0)
        grid = dataset.read(1, window=window).astype(np.float64)
        nodata = dataset.nodata
    if nodata is not None:
        grid[grid == nodata] = np.nan

    cols = np.arange(col0, col1, dtype=np.float64)
    rows = np.arange(row0, row1, dtype=np.float64)
    # Ground offsets of every cell centre from the Site, through the local map scale.
    east = (transform.c + transform.a * (cols + 0.5) - x0) / kx
    north = (transform.f + transform.e * (rows + 0.5) - y0) / ky
    distance = np.hypot(east[np.newaxis, :], north[:, np.newaxis])
    inside = (distance <= radius_m)[1:-1, 1:-1]

    # Central differences over the ground distance between the two neighbours.
    dz_dx = (grid[1:-1, 2:] - grid[1:-1, :-2]) / (2.0 * step_x / kx)
    dz_dy = (grid[2:, 1:-1] - grid[:-2, 1:-1]) / (2.0 * step_y / ky)
    slopes: Array = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))[inside]
    if slopes.size == 0:
        raise NoCellInRadius(band.product, band.resolution_m, radius_m)
    if not np.all(np.isfinite(slopes)):
        return "the DEM has no data under part of the radius"
    return Slope(
        product=band.product,
        resolution_m=band.resolution_m,
        cells=int(slopes.size),
        median_deg=float(np.median(slopes)),
        p95_deg=float(np.percentile(slopes, 95)),
        max_deg=float(slopes.max()),
        limit_deg=limit_deg,
        share_below_limit=float(np.count_nonzero(slopes < limit_deg) / slopes.size),
    )


def as_json(found: Slope) -> dict[str, Any]:
    """The contract's `SlopeStats`."""
    return {
        "cells": found.cells,
        "median_deg": found.median_deg,
        "p95_deg": found.p95_deg,
        "max_deg": found.max_deg,
        "limit_deg": found.limit_deg,
        "share_below_limit": found.share_below_limit,
    }
