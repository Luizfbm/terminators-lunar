"""The Resolution ladder (ADR 0003, the requirement), through the HTTP API only."""

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
METRICS = (
    "sun_and_earth_hours",
    "sunlit_hours",
    "earth_visible_hours",
    "lcip_hours",
    "lcsp_hours",
    "mean_sun_fraction",
)
# CR05 in late November 2026: the Sun sets and the Earth sets inside the Window.
CR05 = {"site_id": "CR05", "start": "2026-11-14T00:00:00Z", "duration_hours": 400}
SHACKLETON_FLOOR = {
    "latitude_deg": -89.67,
    "longitude_deg": 129.78,
    "start": "2025-11-15T00:00:00Z",
    "duration_hours": 400,
}


def get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    response = client.get(path, params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def first(events: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    return next((e for e in events if e["type"] == kind), None)


def test_the_finest_rung_is_the_visibility_answer() -> None:
    ladder = get("/visibility/ladder", CR05)
    plain = get("/visibility", CR05)
    assert [r["resolution_m"] for r in ladder["rungs"]] == [240, 80, 20]
    finest = ladder["rungs"][-1]
    assert ladder["query"] == plain["query"]
    assert finest["metrics"] == plain["metrics"]
    assert finest["dems"] == plain["provenance"]["dems"]
    assert finest["next_sunset"] == first(plain["events"], "sunset") is not None
    assert finest["next_earthset"] == first(plain["events"], "earthset") is not None


def test_each_rung_drops_the_finer_dems() -> None:
    rungs = get("/visibility/ladder", CR05)["rungs"]
    assert [[d["resolution_m"] for d in r["dems"]] for r in rungs] == [
        [240],
        [80, 240],
        [20, 80, 240],
    ]


def test_the_band_holds_every_rung_and_touches_its_ends() -> None:
    ladder = get("/visibility/ladder", CR05)
    for name in METRICS:
        values = [r["metrics"][name] for r in ladder["rungs"]]
        assert ladder["band"][name] == {"min": min(values), "max": max(values)}
    # On this Site the resolution does move the answer, so the band is not a point.
    assert ladder["band"]["sunlit_hours"]["max"] > ladder["band"]["sunlit_hours"]["min"]


def test_where_resolution_changes_nothing_the_rungs_agree() -> None:
    """Shackleton's floor sits under a rim 20° high: no DEM resolution lets the Sun in."""
    ladder = get("/visibility/ladder", SHACKLETON_FLOOR)
    metrics = [r["metrics"] for r in ladder["rungs"]]
    assert metrics[0] == metrics[1] == metrics[2]
    assert metrics[0]["sunlit_hours"] == 0
    assert all(r["next_sunset"] is None for r in ladder["rungs"])
    for name in METRICS:
        assert ladder["band"][name]["min"] == ladder["band"][name]["max"]


def test_the_ladder_rejects_what_visibility_rejects() -> None:
    past_dem = {"latitude_deg": -85, "longitude_deg": 0, "start": "2026-01-01T00:00:00Z"}
    for params, status, code in (
        (past_dem, 422, "outside_coverage"),
        ({"site_id": "XX99", "start": "2026-01-01T00:00:00Z"}, 404, "missing_site"),
        ({"start": "2026-01-01T00:00:00Z"}, 422, "missing_site"),
    ):
        response = client.get("/visibility/ladder", params=params)
        assert (response.status_code, response.json()["code"]) == (status, code)


# /visibility answers from main at 3107229, before the ladder, on the DEM fixtures. On the
# same machine the bytes were identical before and after this branch. Across machines the
# last bits of a float differ (libm, numpy builds), and the peak zoom can then settle a few
# millimetres away (seen on the CI runner: an Occluder 2.4 mm further out). So floats get
# 1e-6 relative and instants one second; any other field must match exactly. A rung change
# moves these answers by hours and tenths of a degree, far past that.
BEFORE_THE_LADDER = Path(__file__).parent / "data" / "visibility_before_ladder.json"


def same(before: Any, after: Any, where: str = "") -> None:
    if isinstance(before, float) or isinstance(after, float):
        assert math.isclose(before, after, rel_tol=1e-6, abs_tol=1e-9), where
    elif isinstance(before, str) and before.endswith("Z") and before[:2] == "20":
        gap = datetime.fromisoformat(before) - datetime.fromisoformat(after)
        assert abs(gap.total_seconds()) <= 1, where
    elif isinstance(before, dict):
        assert isinstance(after, dict) and before.keys() == after.keys(), where
        for key in before:
            same(before[key], after[key], f"{where}.{key}")
    elif isinstance(before, list):
        assert isinstance(after, list) and len(before) == len(after), where
        for index, (left, right) in enumerate(zip(before, after, strict=True)):
            same(left, right, f"{where}[{index}]")
    else:
        assert before == after, where


# Fields added since (the requirement). They are the only difference allowed.
ADDED_SINCE = (("sub_points",), ("timeline", "sun_radius_deg"), ("provenance", "synthetic"))


def without_added_fields(answer: dict[str, Any]) -> dict[str, Any]:
    for path in ADDED_SINCE:
        holder = answer
        for key in path[:-1]:
            holder = holder[key]
        assert path[-1] in holder, path
        del holder[path[-1]]
    return answer


def test_visibility_answers_what_it_did_before_the_ladder() -> None:
    for name, case in json.loads(BEFORE_THE_LADDER.read_text("utf-8")).items():
        after = without_added_fields(get("/visibility", case["params"]))
        same(case["answer"], after, name)
