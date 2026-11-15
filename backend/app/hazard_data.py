"""Eduardo's 5 m hazard grids and Monte Carlo results, read once (the requirement).

The data is built by `validation/hazard/import_eduardo_bundle.py` from his branch at a fixed
commit and lives in `data/hazard/`: `grids.npz` holds the 26 PGDA 78 grids as his bundle stores
them, `tiles.json` everything else. This module only reads and decodes; the routes that serve it
(`/sites/{id}/hazard...`, `/sites/{id}/route`) live elsewhere.

Grid geometry: `n` x `n` cells of `cell_m`, centred on the tile's centre in the south polar
stereographic plane (sphere of 1737.4 km). Row 0 is the +y edge, column 0 the -x edge, as in
Eduardo's `sampleGrid`.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray

DATA = Path(__file__).parent / "data" / "hazard"
MOON_RADIUS_M = 1737400.0
MAX_TILE_DISTANCE_KM = 15.0


@dataclass(frozen=True)
class Grid:
    """One tile's grid, decoded to physical units (metres and degrees)."""

    tile_id: str
    n: int
    cell_m: float
    elevation_m: NDArray[np.float32]
    slope_5m_deg: NDArray[np.float32]
    slope_20m_deg: NDArray[np.float32]
    slope_60m_deg: NDArray[np.float32]
    slope_error_deg: NDArray[np.float32]
    ldec_density: NDArray[np.float32]
    ldec_any: NDArray[np.bool_]

    @property
    def half_m(self) -> float:
        return self.n * self.cell_m / 2

    def index(self, x_m: float, y_m: float) -> tuple[int, int]:
        """(row, column) of the cell holding a point, clamped to the grid as Eduardo's sampleGrid."""
        col = min(max(math.floor((x_m + self.half_m) / self.cell_m), 0), self.n - 1)
        row = min(max(math.floor((self.half_m - y_m) / self.cell_m), 0), self.n - 1)
        return row, col

    def contains(self, x_m: float, y_m: float) -> bool:
        return abs(x_m) <= self.half_m and abs(y_m) <= self.half_m


@cache
def _doc() -> dict[str, Any]:
    with (DATA / "tiles.json").open(encoding="utf-8") as handle:
        doc: dict[str, Any] = json.load(handle)
    return doc


def source() -> dict[str, str]:
    return dict(_doc()["source"])


def tiles() -> dict[str, dict[str, Any]]:
    """Every tile's metadata, stats and Monte Carlo runs, keyed by tile id."""
    return dict(_doc()["tiles"])


def site_entry(site_id: str) -> dict[str, Any] | None:
    """Eduardo's row for a Wueller Site: nearest tile, its distance and the ellipse's shot share."""
    entry = _doc()["sites"].get(site_id)
    return dict(entry) if entry is not None else None


def polar_xy(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    """South polar stereographic (x, y) in metres on the 1737.4 km sphere."""
    rho = 2 * MOON_RADIUS_M * math.tan(math.radians(90 + latitude_deg) / 2)
    lon = math.radians(longitude_deg)
    return rho * math.sin(lon), rho * math.cos(lon)


def offset_in_tile(tile_id: str, latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    """Where a point falls in a tile's plane, metres from the tile's centre."""
    t = tiles()[tile_id]
    tx, ty = polar_xy(t["latitude_deg"], t["longitude_deg"])
    x, y = polar_xy(latitude_deg, longitude_deg)
    return x - tx, y - ty


@cache
def _npz() -> Any:
    return np.load(DATA / "grids.npz")


@cache
def grid(tile_id: str) -> Grid:
    """Decode one tile with the scales stored in the bundle (Eduardo's decodePGDA)."""
    t = tiles()[tile_id]
    z = _npz()
    scales = t["scales"]

    def u8(key: str, scale: float) -> NDArray[np.float32]:
        out: NDArray[np.float32] = (
            z[f"{tile_id}/{key}"].astype(np.float32) / np.float32(scale)
        ).astype(np.float32)
        return out

    ldec = z[f"{tile_id}/ldec_u8"]
    return Grid(
        tile_id=tile_id,
        n=int(t["n"]),
        cell_m=float(t["cell_m"]),
        elevation_m=(
            np.float32(t["z_mid_m"])
            + z[f"{tile_id}/surf_i16"].astype(np.float32) * np.float32(scales["surf"])
        ).astype(np.float32),
        slope_5m_deg=u8("slp5_u8", 1 / scales["slp"]),
        slope_20m_deg=u8("slp20_u8", 1 / scales["slp"]),
        slope_60m_deg=u8("slp60_u8", 1 / scales["slp"]),
        slope_error_deg=u8("slperr_u8", 1 / scales["slperr"]),
        ldec_density=((ldec & 127).astype(np.float32) / np.float32(127.0)).astype(np.float32),
        ldec_any=(ldec & 128) != 0,
    )


def raw_layer(tile_id: str, key: str) -> NDArray[Any]:
    """A stored layer as is (`surf_i16`, `slp5_u8`, `slp20_u8`, `slp60_u8`, `slperr_u8`, `ldec_u8`)."""
    arr: NDArray[Any] = _npz()[f"{tile_id}/{key}"]
    return arr
