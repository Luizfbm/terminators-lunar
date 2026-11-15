"""The three hazard answers of Eduardo's multiresolution work (the requirement).

`SiteHazard`, `HazardGrid` and `HazardAround` of `contract/openapi.yaml`, built from the data
`hazard_data` reads: the PGDA 78 grids at 50 m and his Monte Carlo runs (`mc_lola.py`). Nothing
here depends on the Window, and nothing is computed over the Moon: the numbers were made offline.

A Site's grid is the 10 x 10 km tile nearest to it. For the 130 Wueller Sites that is the row
Eduardo matched himself (`site_entry`); any other Curated Site gets the tile whose centre is
nearest, if within 15 km. Distance and offset are recomputed here, not copied.
"""

from __future__ import annotations

import base64
import math
from typing import Any

import numpy as np
from numpy.typing import NDArray

from . import catalog, hazard_data
from .problems import ApiProblem, missing_site

SLOPE_LIMIT_DEG = 15.0
"""The slope Eduardo's Monte Carlo counted as a hazard, and the default of `/hazard/around`."""

_DECIMALS = 6

_ENCODING = {
    "elevation": "int16, decimetres from z_mid_m",
    "slope_5m": "uint8, half degrees; 90th percentile of the 5 m slope in the 50 m block",
    "slope_20m": "uint8, half degrees; mean slope of the 20 m grid in the block",
    "slope_60m": "uint8, half degrees; mean slope of the 60 m grid in the block",
    "slope_error": "uint8, quarter degrees; mean of NASA's slope error in the block",
    "ldec": "uint8; bit 7 = a real laser shot in the block, bits 0-6 = shot density x 127",
}

# Response key -> stored layer key, and the little-endian dtype the contract promises.
_LAYERS = (
    ("elevation_i16", "surf_i16", "<i2"),
    ("slope_5m_u8", "slp5_u8", "u1"),
    ("slope_20m_u8", "slp20_u8", "u1"),
    ("slope_60m_u8", "slp60_u8", "u1"),
    ("slope_error_u8", "slperr_u8", "u1"),
    ("ldec_u8", "ldec_u8", "u1"),
)


def _provenance() -> str:
    src = hazard_data.source()
    return f"branch {src['branch'].removeprefix('origin/')}, commit {src['commit']}"


def hazard_reference() -> str:
    return (
        "Eduardo's Monte Carlo mc_lola.py over PGDA product 78 (Barker et al. 2021), 5-fold "
        "cross-validation on the measured cells, 100 draws of Normal(slope, slperr), seed 2026 "
        f"({_provenance()}); ellipse share from LDEC_875S_5M by Eduardo's "
        "analise_cobertura_lola.py"
    )


def grid_reference() -> str:
    return (
        "PGDA product 78 (Barker et al. 2021, Planetary and Space Science 203, 105119), 5 m "
        "tiles surf, ldec, slp, slperr; central 10 x 10 km resampled to 50 m by Eduardo's "
        f"build_map_bundle.py ({_provenance()})"
    )


def great_circle_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Surface distance on the 1737.4 km sphere (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 2 * hazard_data.MOON_RADIUS_M / 1000 * math.asin(math.sqrt(a))


def _tile_for(site: catalog.Site) -> tuple[str, float] | None:
    """The grid of a Site and the distance to its centre, or None when no grid lies within 15 km."""
    entry = hazard_data.site_entry(site["id"])
    tiles = hazard_data.tiles()
    if entry is not None:
        # Eduardo's own match: a Wueller Site without one has no grid, whatever lies nearby.
        tile_id = entry["nearest_tile"]
        if tile_id is None:
            return None
    else:
        tile_id = min(
            tiles,
            key=lambda t: great_circle_km(
                site["latitude_deg"],
                site["longitude_deg"],
                tiles[t]["latitude_deg"],
                tiles[t]["longitude_deg"],
            ),
        )
    t = tiles[tile_id]
    distance = great_circle_km(
        site["latitude_deg"], site["longitude_deg"], t["latitude_deg"], t["longitude_deg"]
    )
    if distance > hazard_data.MAX_TILE_DISTANCE_KM:
        return None
    return tile_id, distance


def _site_or_404(site_id: str) -> catalog.Site:
    found = catalog.find_site(site_id)
    if found is None:
        raise missing_site(site_id)
    return found


def _grid_or_422(site: catalog.Site) -> tuple[str, float]:
    found = _tile_for(site)
    if found is None:
        raise ApiProblem(
            "no_hazard_grid",
            "No hazard grid",
            f"No 5 m grid lies within {hazard_data.MAX_TILE_DISTANCE_KM:g} km of Site "
            f"'{site['id']}'.",
        )
    return found


def _round(value: float) -> float:
    return round(value, _DECIMALS)


def _interval(raw: dict[str, float]) -> dict[str, float]:
    return {key: _round(raw[key]) for key in ("mean", "low", "high")}


def _method(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "navigation": raw["navigation"],
        "confidence_level": raw["confidence_level"],
        "missed_hazard": _interval(raw["missed_hazard"]),
        "false_alarm": _interval(raw["false_alarm"]),
        "coverage": _interval(raw["coverage"]),
        "mean_abs_error_deg": _interval(raw["mean_abs_error_deg"]),
    }


def _trade_off(points: list[dict[str, float]]) -> list[dict[str, float]]:
    return [
        {"false_alarm": _round(p["false_alarm"]), "missed_hazard": _round(p["missed_hazard"])}
        for p in points
    ]


def _run(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "coarse_m": raw["coarse_m"],
        "cells_checked": raw["cells_checked"],
        "draws": raw["draws"],
        "folds": raw["folds"],
        "seed": raw["seed"],
        "methods": [_method(m) for m in raw["methods"]],
        "trade_off": {
            "normal": _trade_off(raw["trade_off"]["normal"]),
            "multiresolution": _trade_off(raw["trade_off"]["multiresolution"]),
        },
        # Four decimals, as his bundle shows them; the stored ones carry float32 noise.
        "median_error_deg": {k: round(v, 4) for k, v in raw["median_error_deg"].items()},
        # The p-values are kept as stored: rounding would turn a tiny one into a plain zero.
        "paired_tests": dict(raw["paired_tests"]),
    }


def _stats(raw: dict[str, float]) -> dict[str, float]:
    return {key: _round(value) for key, value in raw.items()}


def _grid_ref(tile_id: str, site: catalog.Site, distance_km: float) -> dict[str, Any]:
    t = hazard_data.tiles()[tile_id]
    x, y = hazard_data.offset_in_tile(tile_id, site["latitude_deg"], site["longitude_deg"])
    return {
        "id": tile_id,
        "latitude_deg": t["latitude_deg"],
        "longitude_deg": t["longitude_deg"],
        "distance_km": round(distance_km, 2),
        "site_offset_m": {"x_m": round(x, 1), "y_m": round(y, 1)},
        "site_inside": hazard_data.grid(tile_id).contains(x, y),
        "lroc": dict(t["lroc"]),
    }


def site_hazard(site_id: str) -> dict[str, Any]:
    site = _site_or_404(site_id)
    entry = hazard_data.site_entry(site_id)
    ellipse = entry["ellipse_fraction"] if entry is not None else None
    ellipse_fraction = None if ellipse is None else _round(ellipse)
    found = _tile_for(site)
    if found is None:
        return {
            "site_id": site_id,
            "slope_limit_deg": SLOPE_LIMIT_DEG,
            "grid": None,
            "measured": {"ellipse_fraction": ellipse_fraction, "grid_fraction": None},
            "stats": None,
            "runs": [],
            "source_reference": hazard_reference(),
        }
    tile_id, distance = found
    t = hazard_data.tiles()[tile_id]
    return {
        "site_id": site_id,
        "slope_limit_deg": SLOPE_LIMIT_DEG,
        "grid": _grid_ref(tile_id, site, distance),
        "measured": {
            "ellipse_fraction": ellipse_fraction,
            "grid_fraction": _round(t["grid_fraction"]),
        },
        "stats": _stats(t["stats"]),
        "runs": [_run(r) for r in t["runs"]],
        "source_reference": hazard_reference(),
    }


def _b64(layer: NDArray[Any], dtype: str) -> str:
    # tobytes() writes C order; asking for the dtype by name pins the byte order to little-endian.
    return base64.b64encode(np.ascontiguousarray(layer.astype(dtype)).tobytes()).decode("ascii")


def site_hazard_grid(site_id: str) -> dict[str, Any]:
    site = _site_or_404(site_id)
    tile_id, distance = _grid_or_422(site)
    t = hazard_data.tiles()[tile_id]
    body: dict[str, Any] = {
        "site_id": site_id,
        "grid": _grid_ref(tile_id, site, distance),
        "n": t["n"],
        "cell_m": t["cell_m"],
        "span_m": t["span_m"],
        "z_mid_m": t["z_mid_m"],
        "z_min_m": t["z_min_m"],
        "z_max_m": t["z_max_m"],
        "encoding": dict(_ENCODING),
    }
    for key, stored, dtype in _LAYERS:
        body[key] = _b64(hazard_data.raw_layer(tile_id, stored), dtype)
    body["source_reference"] = grid_reference()
    return body


def site_hazard_around(
    site_id: str,
    x_m: float | None,
    y_m: float | None,
    radius_m: float,
    slope_limit_deg: float,
) -> dict[str, Any]:
    """Count the 50 m cells whose centre is within `radius_m` of a point, and the steep ones."""
    site = _site_or_404(site_id)
    tile_id, distance = _grid_or_422(site)
    offset = _grid_ref(tile_id, site, distance)["site_offset_m"]
    # The point is reported as given: the Site's offset is already rounded to a decimetre.
    cx = offset["x_m"] if x_m is None else x_m
    cy = offset["y_m"] if y_m is None else y_m
    grid = hazard_data.grid(tile_id)
    if not grid.contains(cx, cy):
        raise ApiProblem(
            "invalid_parameter",
            "Invalid parameter",
            f"The point ({cx:g}, {cy:g}) m is outside the {grid.n * grid.cell_m / 1000:g} km "
            f"grid {tile_id}.",
        )
    # Cell centres in the grid's plane: column 0 is the -x edge, row 0 the +y edge.
    centres = (np.arange(grid.n, dtype=np.float64) + 0.5) * grid.cell_m - grid.half_m
    xs = centres[np.newaxis, :]
    ys = -centres[:, np.newaxis]
    inside = (xs - cx) ** 2 + (ys - cy) ** 2 <= radius_m**2

    def over(slope: NDArray[np.float32]) -> int:
        return int(np.count_nonzero(inside & (slope.astype(np.float64) > slope_limit_deg)))

    return {
        "site_id": site_id,
        "grid_id": tile_id,
        "centre": {"x_m": cx, "y_m": cy},
        "radius_m": radius_m,
        "slope_limit_deg": slope_limit_deg,
        "cells": int(np.count_nonzero(inside)),
        "over_limit_5m": over(grid.slope_5m_deg),
        "over_limit_20m": over(grid.slope_20m_deg),
        "over_limit_60m": over(grid.slope_60m_deg),
    }
