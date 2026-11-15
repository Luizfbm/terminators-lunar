"""`GET /terrain`, the Slope around a Site (the requirement), through the HTTP API only.

The synthetic DEMs are written here with rasterio and the expected slopes come from
heights and ground distances worked out in the test (its own projection formulas and
great-circle distances), not from the app's map-scale factors.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.synthetic_dem import (
    EQC,
    eqc_latlon,
    eqc_xy,
    great_circle_m,
    polar_latlon,
    polar_xy,
    write_dem,
)

client = TestClient(app)
# A plane rising 1 m every 20 m: atan(0.05) = 2.8624°. Tolerance from the spec (the implementation).
PLANE_DEG = math.degrees(math.atan(0.05))
PLANE_TOLERANCE_DEG = 0.01
NEAR_POLE = (-89.9, 45.0)


def terrain(params: dict[str, Any]) -> dict[str, Any]:
    response = client.get("/terrain", params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def problem(params: dict[str, Any]) -> tuple[int, str]:
    response = client.get("/terrain", params=params)
    return response.status_code, response.json().get("code", "")


@pytest.fixture
def dem_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    return tmp_path


def custom(site: tuple[float, float], **extra: Any) -> dict[str, Any]:
    return {"latitude_deg": site[0], "longitude_deg": site[1], **extra}


@pytest.mark.parametrize("direction_deg", [0.0, 90.0, 30.0, 225.0])
def test_a_plane_rising_1_m_every_20_m_is_atan_0_05_everywhere(
    dem_dir: Path, direction_deg: float
) -> None:
    ux, uy = math.sin(math.radians(direction_deg)), math.cos(math.radians(direction_deg))
    write_dem(
        dem_dir / "LDEM_80S_20MPP_ADJ.TIF",
        polar_xy(*NEAR_POLE),
        20.0,
        41,
        lambda x, y: 0.05 * (ux * x + uy * y),
    )
    payload = terrain(custom(NEAR_POLE))
    stats = payload["slope"]
    for key in ("median_deg", "p95_deg", "max_deg"):
        assert abs(stats[key] - PLANE_DEG) <= PLANE_TOLERANCE_DEG, (key, stats[key])
    assert stats["share_below_limit"] == 1.0
    assert payload["dem"] == {"product": "LDEM_80S_20MPP_ADJ", "resolution_m": 20.0}


def test_a_level_plane_is_zero_and_all_of_it_is_under_the_limit(dem_dir: Path) -> None:
    write_dem(
        dem_dir / "LDEM_80S_20MPP_ADJ.TIF",
        polar_xy(*NEAR_POLE),
        20.0,
        41,
        lambda x, y: np.full(np.broadcast(x, y).shape, 1234.5),
    )
    stats = terrain(custom(NEAR_POLE))["slope"]
    assert stats["median_deg"] == 0.0
    assert stats["p95_deg"] == 0.0
    assert stats["max_deg"] == 0.0
    assert stats["share_below_limit"] == 1.0


def test_the_share_under_the_limit_counts_cells_strictly_under_it(dem_dir: Path) -> None:
    write_dem(
        dem_dir / "LDEM_80S_20MPP_ADJ.TIF",
        polar_xy(*NEAR_POLE),
        20.0,
        41,
        lambda x, y: 0.05 * x + 0.0 * y,
    )
    assert terrain(custom(NEAR_POLE, slope_limit_deg=2.8))["slope"]["share_below_limit"] == 0.0
    payload = terrain(custom(NEAR_POLE, slope_limit_deg=2.9))
    assert payload["slope"]["share_below_limit"] == 1.0
    assert payload["slope"]["limit_deg"] == 2.9


def test_the_defaults_are_nasas_10_degrees_over_100_m() -> None:
    payload = terrain({"site_id": "001"})
    assert payload["radius_m"] == 100
    assert payload["slope"]["limit_deg"] == 10
    # Numbers only: no verdict word anywhere in the answer.
    assert set(payload) == {"site", "radius_m", "slope", "dem"}
    assert set(payload["slope"]) == {
        "cells",
        "median_deg",
        "p95_deg",
        "max_deg",
        "limit_deg",
        "share_below_limit",
    }


def brute_force_cells(
    site: tuple[float, float], origin: tuple[float, float], cell_m: float, size: int, radius: float
) -> int:
    """Cell centres within `radius` of the Site by great-circle distance, one by one."""
    count = 0
    for row in range(size):
        for col in range(size):
            x = origin[0] + (col + 0.5) * cell_m
            y = origin[1] - (row + 0.5) * cell_m
            if great_circle_m(site, polar_latlon(x, y)) <= radius:
                count += 1
    return count


def test_100_m_on_the_20_m_grid_at_site_001_is_about_pi_r2_over_a_cell() -> None:
    payload = terrain({"site_id": "001"})
    cells = payload["slope"]["cells"]
    assert payload["dem"] == {"product": "LDEM_80S_20MPP_ADJ", "resolution_m": 20.0}
    expected = math.pi * 100.0**2 / 20.0**2
    assert abs(cells - expected) <= 0.12 * expected, cells
    # The fixture is a ±25 km window of the 20 m DEM with its first cell at (-25 km, 25 km).
    site = (payload["site"]["latitude_deg"], payload["site"]["longitude_deg"])
    x, y = polar_xy(*site)
    col, row = int((x + 25_000) // 20), int((25_000 - y) // 20)
    origin = (-25_000 + (col - 10) * 20.0, 25_000 - (row - 10) * 20.0)
    assert cells == brute_force_cells(site, origin, 20.0, 21, 100.0)


@pytest.mark.parametrize("radius", [40.0, 100.0, 333.0])
def test_the_cells_are_the_centres_within_the_radius_on_the_ground(
    dem_dir: Path, radius: float
) -> None:
    # Off the cell grid on purpose, at 80.5°S where the map is 0.7 % larger than the ground.
    site = (-80.5, 30.0)
    x, y = polar_xy(*site)
    centre = (x + 7.3, y - 3.1)
    size = 61
    origin = write_dem(
        dem_dir / "LDEM_80S_20MPP_ADJ.TIF", centre, 20.0, size, lambda x, y: 0.0 * x * y
    )
    cells = terrain(custom(site, radius_m=radius))["slope"]["cells"]
    assert cells == brute_force_cells(site, origin, 20.0, size, radius)


@pytest.mark.parametrize("axis", ["x", "y"])
def test_the_stereographic_map_scale_is_taken_out_at_the_sites_latitude(
    dem_dir: Path, axis: str
) -> None:
    site = (-80.5, 30.0)
    x, y = polar_xy(*site)
    write_dem(
        dem_dir / "LDEM_80S_20MPP_ADJ.TIF",
        (x, y),
        20.0,
        41,
        (lambda x, y: 0.05 * x + 0.0 * y) if axis == "x" else (lambda x, y: 0.0 * x + 0.05 * y),
    )
    # Two map neighbours 40 m apart on the map rise 2 m; on the ground they are closer.
    a = polar_latlon(x - 20, y) if axis == "x" else polar_latlon(x, y - 20)
    b = polar_latlon(x + 20, y) if axis == "x" else polar_latlon(x, y + 20)
    expected = math.degrees(math.atan(2.0 / great_circle_m(a, b)))
    stats = terrain(custom(site))["slope"]
    assert abs(stats["median_deg"] - expected) <= 0.001
    # Leaving the scale out would read the map slope, about 0.02° flatter here.
    assert expected - PLANE_DEG > 0.015


@pytest.mark.parametrize("axis", ["x", "y"])
def test_the_cylindrical_map_scale_stretches_only_the_parallels(dem_dir: Path, axis: str) -> None:
    # Blue Ghost 1 is at 18.6°N, on SLDEM2015 in its own folder.
    site = client.get("/sites/BG1").json()
    where = (site["latitude_deg"], site["longitude_deg"])
    x, y = eqc_xy(*where)
    cell = 59.2
    write_dem(
        dem_dir / "offpole" / "BG1" / "SLDEM2015_512.TIF",
        (x, y),
        cell,
        41,
        (lambda x, y: 0.05 * x + 0.0 * y) if axis == "x" else (lambda x, y: 0.0 * x + 0.05 * y),
        crs=EQC,
    )
    a = eqc_latlon(x - cell, y) if axis == "x" else eqc_latlon(x, y - cell)
    b = eqc_latlon(x + cell, y) if axis == "x" else eqc_latlon(x, y + cell)
    expected = math.degrees(math.atan(0.05 * 2 * cell / great_circle_m(a, b)))
    payload = terrain({"site_id": "BG1"})
    assert payload["dem"]["product"] == "SLDEM2015_512"
    assert abs(payload["slope"]["median_deg"] - expected) <= 0.001
    if axis == "y":
        assert abs(expected - PLANE_DEG) < 1e-6


def test_a_dem_that_does_not_reach_the_radius_gives_way_to_the_next(dem_dir: Path) -> None:
    centre = polar_xy(*NEAR_POLE)
    # 140 m across: too small for 100 m around the Site.
    write_dem(dem_dir / "LDEM_80S_20MPP_ADJ.TIF", centre, 20.0, 7, lambda x, y: 0.0 * x * y)
    write_dem(dem_dir / "LDEM_80S_80MPP_ADJ.TIF", centre, 80.0, 21, lambda x, y: 0.05 * x + 0 * y)
    payload = terrain(custom(NEAR_POLE))
    assert payload["dem"] == {"product": "LDEM_80S_80MPP_ADJ", "resolution_m": 80.0}
    assert abs(payload["slope"]["median_deg"] - PLANE_DEG) <= PLANE_TOLERANCE_DEG


def test_a_hole_in_the_finest_dem_gives_way_to_the_next(dem_dir: Path) -> None:
    centre = polar_xy(*NEAR_POLE)

    def holed(x: Any, y: Any) -> Any:
        z = 0.0 * x * y
        z[20, 21] = np.nan
        return z

    write_dem(dem_dir / "LDEM_80S_20MPP_ADJ.TIF", centre, 20.0, 41, holed)
    write_dem(dem_dir / "LDEM_80S_80MPP_ADJ.TIF", centre, 80.0, 21, lambda x, y: 0.05 * x + 0 * y)
    assert terrain(custom(NEAR_POLE))["dem"]["product"] == "LDEM_80S_80MPP_ADJ"


def test_no_dem_under_the_site_is_outside_coverage(dem_dir: Path) -> None:
    assert problem({"site_id": "001"}) == (422, "outside_coverage")
    # A DEM somewhere else does not cover it either.
    write_dem(
        dem_dir / "LDEM_80S_20MPP_ADJ.TIF",
        polar_xy(-85.0, 0.0),
        20.0,
        41,
        lambda x, y: 0.0 * x * y,
    )
    assert problem(custom(NEAR_POLE)) == (422, "outside_coverage")


def test_a_dem_with_no_cell_centre_in_the_radius_is_outside_coverage(dem_dir: Path) -> None:
    # An even grid centred on the Site puts it on a cell corner: the nearest centres are
    # 170 m away on a 240 m grid, so nothing is within 40 m.
    write_dem(
        dem_dir / "LDEM_60S_240MPP_ADJ.TIF",
        polar_xy(*NEAR_POLE),
        240.0,
        10,
        lambda x, y: 0.0 * x * y,
    )
    response = client.get("/terrain", params=custom(NEAR_POLE, radius_m=40))
    assert response.status_code == 422
    assert response.json()["code"] == "outside_coverage"
    assert "LDEM_60S_240MPP_ADJ" in response.json()["detail"]


@pytest.mark.parametrize(
    ("site_id", "product", "resolution"),
    [
        ("APOLLO11", "SLDEM2015_512", 59.2),
        ("BG1", "SLDEM2015_512", 59.2),
        ("CH3", "LDEM_60S_60MPP_ADJ", 60.0),
    ],
)
def test_the_offpole_sites_are_measured_on_their_own_windows(
    site_id: str, product: str, resolution: float
) -> None:
    payload = terrain({"site_id": site_id})
    assert payload["dem"] == {"product": product, "resolution_m": resolution}
    stats = payload["slope"]
    assert stats["cells"] >= 1
    assert 0 <= stats["median_deg"] <= stats["p95_deg"] <= stats["max_deg"] < 90
    assert payload["site"]["id"] == site_id


@pytest.mark.parametrize(
    ("params", "status", "code"),
    [
        ({}, 422, "missing_site"),
        ({"site_id": "001", "latitude_deg": -89.5, "longitude_deg": 0}, 422, "ambiguous_site"),
        ({"site_id": "001", "latitude_deg": -89.5}, 422, "ambiguous_site"),
        ({"latitude_deg": -89.5}, 422, "ambiguous_site"),
        ({"longitude_deg": 10}, 422, "ambiguous_site"),
        ({"site_id": "NOPE"}, 404, "missing_site"),
        ({"latitude_deg": -79.9, "longitude_deg": 0}, 422, "outside_coverage"),
        ({"site_id": "001", "radius_m": 39}, 422, "invalid_parameter"),
        ({"site_id": "001", "radius_m": 2001}, 422, "invalid_parameter"),
        ({"site_id": "001", "slope_limit_deg": 0}, 422, "invalid_parameter"),
        ({"site_id": "001", "slope_limit_deg": 45.1}, 422, "invalid_parameter"),
    ],
)
def test_the_site_rules_and_problems_are_those_of_visibility(
    params: dict[str, Any], status: int, code: str
) -> None:
    assert problem(params) == (status, code)
    if "radius_m" in params or "slope_limit_deg" in params:
        return
    # The same request to /visibility, with a Window, gets the same problem.
    same = client.get("/visibility", params={**params, "start": "2026-11-14T00:00:00Z"})
    assert (same.status_code, same.json()["code"]) == (status, code)


def test_a_custom_site_at_80_s_exactly_is_accepted(dem_dir: Path) -> None:
    site = (-80.0, 0.0)
    write_dem(dem_dir / "LDEM_80S_20MPP_ADJ.TIF", polar_xy(*site), 20.0, 41, lambda x, y: 0 * x * y)
    assert terrain(custom(site))["site"]["latitude_deg"] == -80
