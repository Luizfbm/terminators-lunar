"""The route API answers as Eduardo's own engine does (the requirement).

Every expected number comes from `tests/data/eduardo_route/ref_<case>.json`: the output of his
`rover_tese_engine.js` (commit 2195fcb) run under Node by `make_references.js` on the cases in
`cases.json`. Nothing here is computed by the code under test. The plans' paths agree to 1e-6 m
(they agree to the bit); the swarm's points are served rounded to 0.1 m, so they agree to 0.05 m.
The contract example `contract/examples/route-ar06.example.json` is the first case, printed at
0.1 m by the same run.
"""

from __future__ import annotations

import itertools
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import hazard_data, route, rovers
from app.main import app
from app.route import ASSUMPTIONS, _tile_for, sun_direction_in_plane_deg

client = TestClient(app)

DATA = Path(__file__).parent / "data" / "eduardo_route"
REPO = next(p for p in Path(__file__).resolve().parents if (p / "contract").is_dir())
ALL_CASES: list[dict[str, Any]] = json.loads((DATA / "cases.json").read_text("utf-8"))["cases"]
CASES = [c for c in ALL_CASES if not c.get("synthetic")]
# His catalogue says "perse"; the contract's id is the full name.
ROVER_ID = {"perse": "perseverance"}


def _ref(case_id: str) -> dict[str, Any]:
    ref: dict[str, Any] = json.loads((DATA / f"ref_{case_id}.json").read_text("utf-8"))
    return ref


def _params(case: dict[str, Any], **extra: Any) -> dict[str, Any]:
    params: dict[str, Any] = {
        "rover_id": ROVER_ID.get(case["rover"], case["rover"]),
        "start_x_m": case["start"][0],
        "start_y_m": case["start"][1],
        "goal_x_m": case["goal"][0],
        "goal_y_m": case["goal"][1],
        "coarse_m": case["coarse_m"],
        "confidence_level": case["confidence_level"],
        "sun_fraction": case["sun_fraction"],
        "swarm": "true",
        **case.get("overrides", {}),
    }
    if "sun_azimuth_deg" in case:
        params["sun_azimuth_deg"] = case["sun_azimuth_deg"]
    params.update(extra)
    return params


def _get(case: dict[str, Any], **extra: Any) -> dict[str, Any]:
    response = client.get(f"/sites/{case['site_id']}/route", params=_params(case, **extra))
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_plans_match_eduardos_engine(case: dict[str, Any]) -> None:
    ref = _ref(case["id"])
    body = _get(case)
    assert body["site_id"] == case["site_id"] and body["grid_id"] == case["tile"]
    normal, multi = body["plans"]
    assert (normal["navigation"], multi["navigation"]) == ("normal", "multiresolution")

    for plan, key in ((normal, "base"), (multi, "tese")):
        want = ref[key]
        assert len(plan["path"]) == len(want["path"])
        for i, waypoint in enumerate(plan["path"]):
            x, y = want["path"][i]
            assert waypoint["x_m"] == pytest.approx(x, abs=1e-6), (key, i)
            assert waypoint["y_m"] == pytest.approx(y, abs=1e-6), (key, i)
            assert waypoint["slope_5m_deg"] == want["slp5"][i], (key, i)
            assert waypoint["hazard"] is want["hazard"][i], (key, i)
            assert waypoint["veto"] is want["veto"][i], (key, i)
            assert waypoint["battery_fraction"] == pytest.approx(want["soc"][i] / 100, abs=1e-9)
        assert plan["reached"] is want["reached"]
        assert plan["hazards_hit"] == want["hazardsHit"]
        assert plan["vetoes"] == want["vetoes"]
        assert plan["distance_m"] == want["distanceM"]
        assert plan["duration_hours"] == want["timeH"]
        assert plan["battery_min_fraction"] == pytest.approx(want["socMin"] / 100, abs=1e-9)
    assert body["hazards_avoided"] == ref["hazardsAvoided"]


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_swarm_matches_eduardos_engine(case: dict[str, Any]) -> None:
    ref = _ref(case["id"])
    swarm = _get(case)["swarm"]
    assert swarm["illustration"] is True and swarm["agents_per_generation"] == 100
    assert [g["generation"] for g in swarm["generations"]] == [1, 2, 3, 4, 5]
    for got, want in zip(swarm["generations"], ref["swarm"], strict=True):
        assert got["survivors"] == want["survivors"]
        assert [a["dead"] for a in got["agents"]] == want["dead"]
        assert [len(a["path"]) for a in got["agents"]] == want["lengths"]
        assert sum(1 for a in got["agents"] if not a["dead"]) == got["survivors"]
        for agent, points in zip(got["agents"], want["pts"], strict=True):
            if points is None:
                continue
            for (x, y), (rx, ry) in zip(agent["path"], points, strict=True):
                assert abs(x - rx) <= 0.05 + 1e-9 and abs(y - ry) <= 0.05 + 1e-9


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_solar_points_match_eduardos_hillshade_rule(case: dict[str, Any]) -> None:
    ref = _ref(case["id"])
    body = _get(case)
    want = ref.get("solar")
    if want is None:
        # No Sun azimuth in the Query, so no Sun to face.
        assert body["solar_points"] == []
        return
    got = [(p["x_m"], p["y_m"]) for p in body["solar_points"]]
    assert len(got) == len(want) > 0
    for (x, y), (rx, ry) in zip(got, want, strict=True):
        assert x == pytest.approx(rx, abs=1e-6) and y == pytest.approx(ry, abs=1e-6)
    # Without the swarm in the answer the points are the same: they only borrow one swarm path.
    assert _get(case, swarm="false")["solar_points"] == body["solar_points"]
    assert _get(case, swarm="false")["swarm"] is None


def test_the_contract_example_is_the_first_case_printed_at_a_tenth_of_a_metre() -> None:
    example = json.loads((REPO / "contract/examples/route-ar06.example.json").read_text("utf-8"))
    want = example["value"]
    case = CASES[0]
    assert case["id"] == "ar06-viper-60-p90"
    body = _get(case)

    for key in (
        "site_id",
        "grid_id",
        "rover",
        "coarse_m",
        "confidence_level",
        "sun_fraction",
        "start",
        "goal",
        "hazards_avoided",
        "solar_points",
    ):
        assert body[key] == want[key], key
    # Every name the example gives keeps its value; the answer adds the margin's z and the
    # other numbers of his that the example left out.
    assert {k: body["assumptions"][k] for k in want["assumptions"]} == want["assumptions"]
    assert set(body["assumptions"]) == set(ASSUMPTIONS) | {"margin_z"}
    assert body["assumptions"]["margin_z"] == 1.282

    for got_plan, want_plan in zip(body["plans"], want["plans"], strict=True):
        for key in want_plan:
            if key != "path":
                assert got_plan[key] == want_plan[key], key
        assert len(got_plan["path"]) == len(want_plan["path"])
        for got_wp, want_wp in zip(got_plan["path"], want_plan["path"], strict=True):
            assert abs(got_wp["x_m"] - want_wp["x_m"]) <= 0.05 + 1e-9
            assert abs(got_wp["y_m"] - want_wp["y_m"]) <= 0.05 + 1e-9
            for key in ("slope_5m_deg", "hazard", "veto", "battery_fraction"):
                assert got_wp[key] == want_wp[key], key

    assert body["swarm"]["illustration"] is True
    for got_gen, want_gen in zip(
        body["swarm"]["generations"], want["swarm"]["generations"], strict=True
    ):
        assert got_gen["survivors"] == want_gen["survivors"]
        assert got_gen["agents"] == want_gen["agents"]  # both rounded to 0.1 m


def test_defaults_start_at_the_site_and_aim_1400_east_1100_north() -> None:
    response = client.get("/sites/AR06/route")
    assert response.status_code == 200
    body = response.json()
    # (609.9, 1159.0) is AR06's offset in the DM1 plane (the contract example's start).
    assert body["start"]["x_m"] == pytest.approx(609.9, abs=0.05)
    assert body["start"]["y_m"] == pytest.approx(1159.0, abs=0.05)
    offset = hazard_data.offset_in_tile("DM1", -84.1965, 69.1606)
    assert body["start"]["x_m"] == pytest.approx(offset[0], abs=1e-3)
    assert body["goal"]["x_m"] - body["start"]["x_m"] == pytest.approx(1400.0, abs=1e-9)
    assert body["goal"]["y_m"] - body["start"]["y_m"] == pytest.approx(1100.0, abs=1e-9)
    assert (body["coarse_m"], body["confidence_level"], body["sun_fraction"]) == (60, "P90", 0.5)
    assert body["rover"]["rover_id"] == "viper"
    assert body["swarm"] is None and body["solar_points"] == []


def test_waypoints_are_at_most_50_m_apart_and_slopes_read_from_the_grid_another_way() -> None:
    body = _get(CASES[0])
    grid = hazard_data.grid("DM1")
    for plan in body["plans"]:
        path = plan["path"]
        steps = [
            math.hypot(b["x_m"] - a["x_m"], b["y_m"] - a["y_m"])
            for a, b in itertools.pairwise(path)
        ]
        # A step is 50 m along the planned path, so 50 m or less as the crow flies (less at
        # a turn); the last one is the stretch to the goal, added when it is over 8 m.
        assert all(0 < s <= 50 + 1e-6 for s in steps)
        assert steps[-1] > 8
        assert plan["distance_m"] == round(sum(steps))
        for waypoint in path:
            row, col = grid.index(waypoint["x_m"], waypoint["y_m"])
            slope = float(grid.slope_5m_deg[row, col])
            assert waypoint["slope_5m_deg"] == slope
            assert waypoint["hazard"] is (slope > 15)
        assert plan["hazards_hit"] == sum(1 for w in path[1:] if w["hazard"])
        assert plan["vetoes"] == sum(1 for w in path if w["veto"])
    normal = body["plans"][0]
    assert not any(w["veto"] for w in normal["path"]), "Normal navigation has no shield"


def test_battery_drains_in_shadow_and_stops_at_zero() -> None:
    drain = next(c for c in CASES if c["id"] == "011-mapp-battery-drain")
    body = _get(drain)
    for plan in body["plans"]:
        fractions = [w["battery_fraction"] for w in plan["path"]]
        assert min(fractions) == 0.0 == plan["battery_min_fraction"]
        assert all(0.0 <= f <= 1.0 for f in fractions)
        # No generation in the dark (sun_fraction 0, no RTG): never recharges.
        assert fractions == sorted(fractions, reverse=True)
    assert body["rover"] == {
        "rover_id": None,
        "slope_limit_deg": 14,
        "battery_wh": 100.0,
        "power_shadow_w": 120,
        "solar_w": 180,
        "rtg_w": 0,
    }


def test_an_rtg_rover_keeps_its_battery_in_the_dark() -> None:
    body = _get(next(c for c in CASES if c["rover"] == "curiosity"), sun_fraction=0)
    # 110 W of RTG against a 100 W draw (a little more on slopes above 5 degrees): the battery
    # holds near full.
    assert all(plan["battery_min_fraction"] > 0.9 for plan in body["plans"])


def test_the_rover_block_names_the_catalogue_only_while_its_numbers_are_unchanged() -> None:
    same = client.get("/sites/AR06/route", params={"rover_id": "viper", "battery_wh": 5420})
    assert same.json()["rover"]["rover_id"] == "viper"
    other = client.get("/sites/AR06/route", params={"rover_id": "viper", "slope_limit_deg": 10})
    rover = other.json()["rover"]
    assert rover["rover_id"] is None and rover["slope_limit_deg"] == 10
    assert (rover["battery_wh"], rover["power_shadow_w"]) == (5420, 95)
    # A lower limit counts more of the same ground as hazard.
    assert other.json()["plans"][0]["hazards_hit"] != same.json()["plans"][0]["hazards_hit"]


def test_rovers_are_the_contract_example() -> None:
    response = client.get("/rovers")
    assert response.status_code == 200
    example = json.loads((REPO / "contract/examples/rovers.example.json").read_text("utf-8"))
    assert response.json() == example["value"]


def test_rovers_numbers_are_the_ones_in_eduardos_catalogue() -> None:
    his = json.loads((DATA / "rovers_eduardo.json").read_text("utf-8"))
    ours = client.get("/rovers").json()["rovers"]
    assert [r["id"] for r in ours] == [ROVER_ID.get(r["model"], r["model"]) for r in his]
    names = {
        "massKg": "mass_kg",
        "batteryWh": "battery_wh",
        "solarW": "solar_w",
        "rtgW": "rtg_w",
        "powerShadowW": "power_shadow_w",
        "mastHeightM": "mast_height_m",
        "slopeLimitDeg": "slope_limit_deg",
    }
    for theirs, rover in zip(his, ours, strict=True):
        for his_name, our_name in names.items():
            assert rover[our_name] == theirs[his_name], (rover["id"], our_name)
        assert rover["estimated"] == [names[e] for e in theirs["est"]], rover["id"]
        assert rover["body"] == ("moon" if theirs["line"] == "Lua" else "mars")
        # His roverDarkHours: battery over the net draw, infinite when the RTG covers it.
        net = theirs["powerShadowW"] - theirs["rtgW"]
        expected = round(theirs["batteryWh"] / net, 2) if net > 0 else None
        assert rover["darkness_tolerance_hours"] == expected, rover["id"]
        assert rover["source_reference"].endswith("commit 2195fcb.")


def test_darkness_tolerance_is_null_when_the_rtg_covers_the_load() -> None:
    assert rovers.darkness_tolerance_hours(2350, 100, 110) is None
    assert rovers.darkness_tolerance_hours(2350, 100, 100) is None
    assert rovers.darkness_tolerance_hours(5420, 95, 0) == 57.05
    assert rovers.find("nope") is None


@pytest.mark.parametrize("azimuth", [0.0, 37.0, 90.0, 180.0, 271.5])
def test_local_azimuth_is_turned_into_a_direction_on_the_grid_plane(azimuth: float) -> None:
    # Independent of the formula: step 50 m toward the bearing on the sphere, project both
    # ends with the plane the grids live in (hazard_data.polar_xy), and read the direction.
    lat, lon = -84.1965, 69.1606
    step_m = 50.0
    dlat = math.degrees(math.cos(math.radians(azimuth)) * step_m / hazard_data.MOON_RADIUS_M)
    dlon = math.degrees(
        math.sin(math.radians(azimuth))
        * step_m
        / (hazard_data.MOON_RADIUS_M * math.cos(math.radians(lat)))
    )
    x0, y0 = hazard_data.polar_xy(lat, lon)
    x1, y1 = hazard_data.polar_xy(lat + dlat, lon + dlon)
    measured = math.degrees(math.atan2(x1 - x0, y1 - y0))
    got = sun_direction_in_plane_deg(lon, azimuth)
    assert (got - measured + 180) % 360 - 180 == pytest.approx(0.0, abs=0.01)


def test_the_sun_azimuth_changes_which_spots_are_lit() -> None:
    case = next(c for c in CASES if c["id"] == "ar06-viper-60-p99-solar")
    lit = {
        azimuth: [(p["x_m"], p["y_m"]) for p in _get(case, sun_azimuth_deg=azimuth)["solar_points"]]
        for azimuth in (0.0, 100.0, 200.0, 300.0)
    }
    assert len({tuple(points) for points in lit.values()}) > 1
    for points in lit.values():
        assert len(points) <= 16
        # At least 160 m apart, as he spaces them.
        assert all(
            math.hypot(a[0] - b[0], a[1] - b[1]) >= 160
            for i, a in enumerate(points)
            for b in points[i + 1 :]
        )


def test_assumptions_name_every_number_of_his_that_is_not_a_measurement() -> None:
    assumptions = client.get("/sites/AR06/route").json()["assumptions"]
    for name, value in {
        "speed_m_s": 0.35,
        "waypoint_step_m": 50,
        "solar_efficiency": 0.7,
        "slope_power_per_deg_above_5": 0.04,
        "reached_within_m": 120,
        "heuristic_weight": 1.05,
        "veto_lookahead_m": 75,
        "normal_cost_over_limit": 1200,
        "multi_cost_over_limit_5m": 7500,
        "margin_weight": 0.55,
    }.items():
        assert assumptions[name] == value, name
    assert (
        client.get("/sites/AR06/route", params={"confidence_level": "P50"}).json()["assumptions"][
            "margin_z"
        ]
        == 0.0
    )
    assert (
        client.get("/sites/AR06/route", params={"confidence_level": "P99"}).json()["assumptions"][
            "margin_z"
        ]
        == 2.326
    )


def test_problems_follow_the_contract() -> None:
    missing = client.get("/sites/NOPE/route")
    assert missing.status_code == 404 and missing.json()["code"] == "missing_site"

    for site_id in ("PCB04", "APOLLO11", "MMP01"):
        none = client.get(f"/sites/{site_id}/route")
        assert none.status_code == 422, site_id
        assert none.json()["code"] == "no_hazard_grid"
        assert site_id in none.json()["detail"]

    unknown = client.get("/sites/AR06/route", params={"rover_id": "sputnik"})
    assert unknown.status_code == 422 and unknown.json()["code"] == "invalid_parameter"

    # AR01 sits 10.3 km from DM1's centre: its own offset is outside the 10 x 10 km grid.
    off = client.get("/sites/AR01/route")
    assert off.status_code == 422 and off.json()["code"] == "invalid_parameter"
    assert "start" in off.json()["detail"]
    inside = client.get("/sites/AR01/route", params={"start_x_m": 0, "start_y_m": 0})
    assert inside.status_code == 200

    # The default goal is 1400 m east of the start: at the grid's east edge it falls outside.
    edge = client.get("/sites/AR06/route", params={"start_x_m": 4900, "start_y_m": 0})
    assert edge.status_code == 422 and "goal" in edge.json()["detail"]

    for bad in (
        {"coarse_m": 5},
        {"confidence_level": "P95"},
        {"sun_fraction": 1.5},
        {"slope_limit_deg": 0},
        {"slope_limit_deg": 46},
        {"battery_wh": 0},
        {"start_x_m": 5001},
        {"sun_azimuth_deg": 360},
        {"swarm": "perhaps"},
    ):
        response = client.get("/sites/AR06/route", params=bad)
        assert response.status_code == 422, bad
        assert response.json()["code"] == "invalid_parameter", bad


def test_the_grid_of_a_site_is_its_wueller_row_or_the_nearest_centre_within_15_km() -> None:
    assert client.get("/sites/001/route").json()["grid_id"] == "Site01"
    assert client.get("/sites/HW02/route").json()["grid_id"] == "Haworth"

    def at(latitude_deg: float, longitude_deg: float) -> Any:
        return {"id": "zz", "latitude_deg": latitude_deg, "longitude_deg": longitude_deg}

    # No curated Site outside the Wueller list lies near a grid, so the rule is checked on
    # made-up ones: on DM1's centre, 12 km from it (still inside 15 km), 20 km from it.
    dm1 = hazard_data.tiles()["DM1"]
    centre = (dm1["latitude_deg"], dm1["longitude_deg"])
    assert _tile_for(at(*centre))[0] == "DM1"
    km_per_degree = math.radians(1) * hazard_data.MOON_RADIUS_M / 1000
    tile, km = _tile_for(at(centre[0] + 12 / km_per_degree, centre[1]))
    assert tile == "DM1" and km == pytest.approx(12.0, abs=0.01)
    assert _tile_for(at(centre[0] + 20 / km_per_degree, centre[1])) == (None, None)


def test_the_same_query_answers_the_same() -> None:
    case = CASES[0]
    assert _get(case) == _get(case)


def _flat_wall_layers() -> route.Layers:
    """The synthetic grid of `make_references.js` (`syntheticFlatWall`), built the same way."""
    n = 200
    slp5 = np.full((n, n), 4.0, dtype=np.float32)
    slp20 = slp5.copy()
    slp60 = slp5.copy()
    slp5[20:180, 90:100] = 30
    slp60[20:180, 88:103] = 30
    slp20[20:180, 88:103] = 30
    grid = hazard_data.Grid(
        tile_id="flat-wall",
        n=n,
        cell_m=50.0,
        elevation_m=np.zeros((n, n), dtype=np.float32),
        slope_5m_deg=slp5,
        slope_20m_deg=slp20,
        slope_60m_deg=slp60,
        slope_error_deg=np.full((n, n), 3.0, dtype=np.float32),
        ldec_density=np.zeros((n, n), dtype=np.float32),
        ldec_any=np.zeros((n, n), dtype=np.bool_),
    )

    def doubles(a: Any) -> list[float]:
        out: list[float] = a.astype(np.float64).ravel().tolist()
        return out

    return route.Layers(
        grid=grid,
        n=n,
        cell_m=50.0,
        half_m=grid.half_m,
        surf=doubles(grid.elevation_m),
        slp5=doubles(slp5),
        slp20=doubles(slp20),
        slp60=doubles(slp60),
        slperr=doubles(grid.slope_error_deg),
        ldec_density=doubles(grid.ldec_density),
        ldec_any=grid.ldec_any.ravel().tolist(),
    )


def test_on_uniform_ground_the_heap_breaks_ties_as_eduardos_does() -> None:
    # Over flat ground many steps cost exactly the same, so which one A* takes first is decided
    # by the heap's tie rule, not by the costs. His path around the wall is the reference.
    case = next(c for c in ALL_CASES if c["id"] == "synthetic-flat-wall")
    ref = _ref(case["id"])
    lay = _flat_wall_layers()
    start, goal = tuple(case["start"]), tuple(case["goal"])
    viper = route.RoverNumbers(15.0, 5420.0, 95.0, 450.0, 0.0)
    navigations: list[tuple[route.Navigation, str]] = [
        ("normal", "base"),
        ("multiresolution", "tese"),
    ]
    for navigation, key in navigations:
        raw = route._plan_grid_astar(lay, start, goal, navigation, 60, 1.282, 15.0)
        drive = route.evaluate_waypoints(
            lay, navigation, tuple(raw), goal, start, viper, 0.5, 60, 1.282
        )
        want = ref[key]
        assert len(drive.path) == len(want["path"]) > 100
        for (x, y), (rx, ry) in zip(drive.path, want["path"], strict=True):
            assert x == pytest.approx(rx, abs=1e-6) and y == pytest.approx(ry, abs=1e-6)
        assert (drive.hazards_hit, drive.vetoes) == (want["hazardsHit"], want["vetoes"])
        assert (drive.distance_m, drive.time_h) == (want["distanceM"], want["timeH"])
        assert drive.soc == want["soc"]
