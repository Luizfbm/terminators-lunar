"""Small GeoTIFFs written for a test, in the projections and file names of the real DEMs."""

from __future__ import annotations

import math
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import rasterio  # type: ignore[import-untyped]
from rasterio.transform import from_origin  # type: ignore[import-untyped]

R = 1_737_400.0
POLAR = "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m"
EQC = "+proj=eqc +lat_ts=0 +lon_0=180 +x_0=0 +y_0=0 +R=1737400 +units=m"

Heights = Callable[[Any, Any], Any]


def polar_xy(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    """South polar stereographic, written out here rather than taken from the app."""
    rho = 2.0 * R * math.tan(math.pi / 4.0 + math.radians(latitude_deg) / 2.0)
    lon = math.radians(longitude_deg)
    return rho * math.sin(lon), rho * math.cos(lon)


def polar_latlon(x: float, y: float) -> tuple[float, float]:
    rho = math.hypot(x, y)
    latitude = 2.0 * math.degrees(math.atan(rho / (2.0 * R))) - 90.0
    return latitude, math.degrees(math.atan2(x, y))


def eqc_xy(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    shifted = (longitude_deg - 180.0 + 180.0) % 360.0 - 180.0
    return R * math.radians(shifted), R * math.radians(latitude_deg)


def eqc_latlon(x: float, y: float) -> tuple[float, float]:
    return math.degrees(y / R), (math.degrees(x / R) + 180.0 + 180.0) % 360.0 - 180.0


def great_circle_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat = lat2 - lat1
    dlon = math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2.0 * R * math.asin(math.sqrt(h))


def write_dem(
    path: Path,
    centre_xy: tuple[float, float],
    cell_m: float,
    size: int,
    heights: Heights,
    crs: str = POLAR,
) -> tuple[float, float]:
    """A `size` × `size` grid of `cell_m` cells centred on a map point; returns its origin.

    `heights(x, y)` gets the map coordinates of the cell centres.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    west = centre_xy[0] - size * cell_m / 2.0
    north = centre_xy[1] + size * cell_m / 2.0
    xs = west + (np.arange(size) + 0.5) * cell_m
    ys = north - (np.arange(size) + 0.5) * cell_m
    grid = heights(xs[np.newaxis, :], ys[:, np.newaxis]) * np.ones((size, size))
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=size,
        height=size,
        count=1,
        dtype="float64",
        crs=rasterio.crs.CRS.from_proj4(crs),
        transform=from_origin(west, north, cell_m, cell_m),
        nodata=np.nan,
    ) as dataset:
        dataset.write(grid.astype(np.float64), 1)
    return west, north
