"""The hazard routes answer what Eduardo's work says (the requirement), through the HTTP API.

The contract examples came from his files, not from `app.hazard`; the cell values are the ones his
`decodePGDA` printed in Node (see test_hazard_data.py); the steep-cell counts are redone here from
the grid the API serves, cell by cell, without `hazard_data`.
"""

from __future__ import annotations

import base64
import csv
import json
import math
import struct
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import catalog, hazard, hazard_data
from app.main import app

# row, column, surf, slp5, slp20, slp60, slperr, ldec density, ldec any: what his decodePGDA printed
# in Node for DM1 (the same cells as test_hazard_data.py).
EDUARDO_DM1 = [
    (100, 100, 401.13, 8.5, 5.5, 4.0, 3.0, 0.015748, True),
    (76, 112, 387.93, 2.5, 1.5, 1.0, 2.75, 0.007874, True),
    (0, 0, 59.43, 15.5, 12.5, 7.0, 2.75, 0.007874, True),
    (157, 164, 81.43, 20.0, 19.5, 19.5, 2.5, 0.015748, False),
]
client = TestClient(app)
EXAMPLES = Path(__file__).resolve().parents[2] / "contract" / "examples"


def example(name: str) -> dict[str, Any]:
    with (EXAMPLES / f"{name}.example.json").open(encoding="utf-8") as handle:
        value: dict[str, Any] = json.load(handle)["value"]
    return value


def get(path: str, **params: Any) -> Any:
    return client.get(path, params=params)


def test_ar06_hazard_is_the_contract_example() -> None:
    response = get("/sites/AR06/hazard")
    assert response.status_code == 200
    assert response.json() == example("site-hazard-ar06")


def test_ar06_grid_is_the_contract_example() -> None:
    response = get("/sites/AR06/hazard/grid")
    assert response.status_code == 200
    assert response.json() == example("hazard-grid-ar06")


def test_ar06_around_is_the_contract_example() -> None:
    response = get("/sites/AR06/hazard/around")
    assert response.status_code == 200
    assert response.json() == example("hazard-around-ar06")


def test_grid_cells_decode_to_the_values_eduardos_engine_printed() -> None:
    body = get("/sites/AR06/hazard/grid").json()
    n = body["n"]
    elevation = struct.unpack(f"<{n * n}h", base64.b64decode(body["elevation_i16"]))
    slope_5m = base64.b64decode(body["slope_5m_u8"])
    slope_20m = base64.b64decode(body["slope_20m_u8"])
    slope_60m = base64.b64decode(body["slope_60m_u8"])
    slope_error = base64.b64decode(body["slope_error_u8"])
    ldec = base64.b64decode(body["ldec_u8"])
    for row, col, surf, s5, s20, s60, serr, den, anyshot in EDUARDO_DM1:
        i = row * n + col
        assert body["z_mid_m"] + elevation[i] * 0.1 == pytest.approx(surf, abs=1e-3)
        assert slope_5m[i] / 2 == pytest.approx(s5)
        assert slope_20m[i] / 2 == pytest.approx(s20)
        assert slope_60m[i] / 2 == pytest.approx(s60)
        assert slope_error[i] / 4 == pytest.approx(serr)
        assert (ldec[i] & 127) / 127 == pytest.approx(den, abs=1e-6)
        assert bool(ldec[i] & 128) is anyshot


def test_a_site_without_a_grid_says_so() -> None:
    # PCB04 is a Wueller Site, 108 km from the nearest tile.
    body = get("/sites/PCB04/hazard").json()
    assert body["site_id"] == "PCB04"
    assert body["slope_limit_deg"] == 15
    assert body["grid"] is None
    assert body["stats"] is None
    assert body["runs"] == []
    assert body["measured"] == {"ellipse_fraction": None, "grid_fraction": None}
    assert body["source_reference"]
    for path in ("grid", "around"):
        response = get(f"/sites/PCB04/hazard/{path}")
        assert response.status_code == 422
        assert response.headers["content-type"].startswith("application/problem+json")
        problem = response.json()
        assert problem["code"] == "no_hazard_grid"
        assert problem["status"] == 422
        assert "PCB04" in problem["detail"]


def test_the_ellipse_share_does_not_need_a_grid() -> None:
    # HW10 has Eduardo's LDEC share inside the ellipse but no PGDA 78 tile within 15 km.
    body = get("/sites/HW10/hazard").json()
    assert body["grid"] is None
    assert body["measured"] == {"ellipse_fraction": 0.141607, "grid_fraction": None}


def test_a_curated_site_that_is_not_in_his_table_has_no_grid_when_far() -> None:
    # Apollo 11 is at 0.7°N, nowhere near a polar tile.
    body = get("/sites/APOLLO11/hazard").json()
    assert body["grid"] is None
    assert body["measured"]["ellipse_fraction"] is None


def fake_site(latitude_deg: float, longitude_deg: float) -> catalog.Site:
    return {
        "id": "X1",
        "name": "A Curated Site outside his table",
        "latitude_deg": latitude_deg,
        "longitude_deg": longitude_deg,
        "source": "clps",
        "source_reference": "test",
        "region_id": None,
        "curated": True,
        "has_5m_dem": False,
    }


def test_a_site_outside_his_table_takes_the_nearest_grid_within_15_km() -> None:
    dm1 = hazard_data.tiles()["DM1"]
    three_km = 3.0 / 1737.4 * 180 / math.pi
    found = hazard._tile_for(fake_site(dm1["latitude_deg"] + three_km, dm1["longitude_deg"]))
    assert found is not None
    assert found[0] == "DM1"
    assert found[1] == pytest.approx(3.0, abs=1e-6)
    assert hazard._tile_for(fake_site(-80.0, 0.0)) is None


def test_distance_to_the_grid_matches_eduardos_to_his_rounding() -> None:
    wueller = [s for s in catalog.SITES if hazard_data.site_entry(s["id"]) is not None]
    assert len(wueller) == 130
    tiles = hazard_data.tiles()
    largest = largest_served = 0.0
    with_grid = 0
    for s in wueller:
        entry = hazard_data.site_entry(s["id"])
        assert entry is not None
        grid = get(f"/sites/{s['id']}/hazard").json()["grid"]
        if entry["nearest_tile"] is None:
            # No grid in his table, and no tile within 15 km by our own distance either.
            assert grid is None
            assert all(
                hazard.great_circle_km(
                    s["latitude_deg"], s["longitude_deg"], t["latitude_deg"], t["longitude_deg"]
                )
                > 15
                for t in tiles.values()
            )
            continue
        with_grid += 1
        assert grid["id"] == entry["nearest_tile"]
        t = tiles[grid["id"]]
        recomputed = hazard.great_circle_km(
            s["latitude_deg"], s["longitude_deg"], t["latitude_deg"], t["longitude_deg"]
        )
        largest = max(largest, abs(recomputed - entry["nearest_tile_distance_km"]))
        largest_served = max(
            largest_served, abs(grid["distance_km"] - entry["nearest_tile_distance_km"])
        )
    assert with_grid == 103
    # His distance is rounded to 0.01 km: the exact one differs by half a step at most, and the
    # served one (also rounded) by one step.
    assert largest <= 0.005
    assert largest_served <= 0.0100001


def decoded(site_id: str) -> tuple[int, float, dict[str, list[int]]]:
    """The grid as the API serves it, one list of bytes per layer, read without hazard_data."""
    body = get(f"/sites/{site_id}/hazard/grid").json()
    layers = {
        key: list(base64.b64decode(body[key]))
        for key in ("slope_5m_u8", "slope_20m_u8", "slope_60m_u8")
    }
    return body["n"], body["cell_m"], layers


def count_by_hand(
    site_id: str, cx: float, cy: float, radius: float, limit: float
) -> tuple[int, int, int, int]:
    n, cell, layers = decoded(site_id)
    half = n * cell / 2
    cells = over5 = over20 = over60 = 0
    for row in range(n):
        for col in range(n):
            x = -half + (col + 0.5) * cell
            y = half - (row + 0.5) * cell
            if math.hypot(x - cx, y - cy) > radius:
                continue
            i = row * n + col
            cells += 1
            over5 += layers["slope_5m_u8"][i] / 2 > limit
            over20 += layers["slope_20m_u8"][i] / 2 > limit
            over60 += layers["slope_60m_u8"][i] / 2 > limit
    return cells, over5, over20, over60


@pytest.mark.parametrize(
    ("x", "y", "radius", "limit"),
    [
        (3210, -2875, 300, 15),  # the 20° cell Eduardo's engine printed, steep all around
        (-4975, 4975, 500, 15),  # the grid's corner, half the circle is outside
        (0, 0, 250, 15),
        (0, 0, 2000, 15),
        (0, 0, 2000, 20.5),
        (-1000, 2500, 777.7, 8),
        (1234.5, -2345.6, 50, 5),
    ],
)
def test_the_steep_cell_count_equals_a_count_by_hand(
    x: float, y: float, radius: float, limit: float
) -> None:
    body = get(
        "/sites/AR06/hazard/around", x_m=x, y_m=y, radius_m=radius, slope_limit_deg=limit
    ).json()
    cells, over5, over20, over60 = count_by_hand("AR06", x, y, radius, limit)
    assert body["centre"] == {"x_m": x, "y_m": y}
    assert body["radius_m"] == radius
    assert body["slope_limit_deg"] == limit
    assert body["grid_id"] == "DM1"
    assert body["cells"] == cells
    assert (body["over_limit_5m"], body["over_limit_20m"], body["over_limit_60m"]) == (
        over5,
        over20,
        over60,
    )


def test_the_test_radius_really_catches_steep_cells() -> None:
    body = get("/sites/AR06/hazard/around", x_m=3210, y_m=-2875, radius_m=300).json()
    assert body["over_limit_5m"] > 0
    assert body["over_limit_20m"] > 0
    assert body["over_limit_60m"] > 0


def test_one_coordinate_alone_keeps_the_sites_other_one() -> None:
    offset = get("/sites/AR06/hazard").json()["grid"]["site_offset_m"]
    body = get("/sites/AR06/hazard/around", x_m=-300).json()
    assert body["centre"] == {"x_m": -300, "y_m": offset["y_m"]}


def test_the_default_limit_is_15_degrees_and_the_default_radius_250_m() -> None:
    body = get("/sites/AR06/hazard/around", x_m=3210, y_m=-2875).json()
    assert body["slope_limit_deg"] == 15
    assert body["radius_m"] == 250


@pytest.mark.parametrize(
    "params",
    [
        {"x_m": 5001},
        {"y_m": -5000.5},
        {"radius_m": 49},
        {"radius_m": 2001},
        {"slope_limit_deg": 0},
        {"slope_limit_deg": 46},
        {"x_m": "west"},
    ],
)
def test_a_parameter_out_of_range_is_invalid(params: dict[str, Any]) -> None:
    response = get("/sites/AR06/hazard/around", **params)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_parameter"


def test_a_point_outside_the_grid_is_invalid() -> None:
    # MMA01 is 2.2 km from its tile and still inside; the default centre of a Site beyond the
    # 10 x 10 km square is not, and there is no point to count around.
    outside = [
        s["id"]
        for s in catalog.SITES
        if hazard_data.site_entry(s["id"]) is not None
        and (grid := get(f"/sites/{s['id']}/hazard").json()["grid"]) is not None
        and not grid["site_inside"]
    ]
    assert outside, "Eduardo's table has Sites outside their grid"
    response = get(f"/sites/{outside[0]}/hazard/around")
    assert response.status_code == 422
    problem = response.json()
    assert problem["code"] == "invalid_parameter"
    assert "outside" in problem["detail"]
    # The same Site is fine once the point is inside.
    assert get(f"/sites/{outside[0]}/hazard/around", x_m=0, y_m=0).status_code == 200


def test_site_inside_follows_the_offset() -> None:
    for s in catalog.SITES:
        entry = hazard_data.site_entry(s["id"])
        if entry is None or entry["nearest_tile"] is None:
            continue
        grid = get(f"/sites/{s['id']}/hazard").json()["grid"]
        offset = grid["site_offset_m"]
        assert grid["site_inside"] == (abs(offset["x_m"]) <= 5000 and abs(offset["y_m"]) <= 5000)


@pytest.mark.parametrize("path", ["hazard", "hazard/grid", "hazard/around"])
def test_an_unknown_site_is_404(path: str) -> None:
    response = get(f"/sites/NOPE/{path}")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "missing_site"


def test_every_curated_site_answers_with_a_consistent_shape() -> None:
    with (Path(catalog.DATA) / "sites.csv").open(newline="") as handle:
        ids = [row["id"] for row in csv.DictReader(handle)]
    assert len(ids) == len(catalog.SITES) == 151
    for site_id in ids:
        response = get(f"/sites/{site_id}/hazard")
        assert response.status_code == 200
        body = response.json()
        assert (body["grid"] is None) == (body["runs"] == []) == (body["stats"] is None)
        assert len(body["runs"]) in (0, 2)
