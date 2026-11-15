"""The Flat horizon (the requirement), through the HTTP API only.

Each check reads the answer against something the flat code did not compute the same way:
the dip worked by hand, the Sun's and the Earth's positions on the `/visibility` timeline,
periods rebuilt from the events, or the real answer for the same Query.
"""

import functools
import itertools
import json
import math
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# Site 001 from the validation window: the Sun never sets in the Window, with or without terrain.
NOVEMBER_2026 = {"site_id": "001", "start": "2026-11-14T00:00:00Z"}
# Site 001 in March 2025: the Sun and the Earth both set and rise inside the Window.
MARCH_2025 = {"site_id": "001", "start": "2025-03-01T00:00:00Z"}
# Near the end of coverage: the search for events stops at the end of 2032.
LAST_MONTH = {"site_id": "001", "start": "2032-12-01T00:00:00Z", "duration_hours": 100}
# Mons Mouton's latitude, past the DEM fixtures: the Sun sets and rises every lunar day.
MOUTON = {"latitude_deg": -85.416, "longitude_deg": 31.8506, "start": "2027-01-01T00:00:00Z"}


def get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    response = client.get(path, params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


@functools.cache
def _flat(frozen: tuple[tuple[str, Any], ...]) -> str:
    response = client.get("/visibility/flat", params=dict(frozen))
    assert response.status_code == 200, response.text
    text: str = response.text
    return text


def flat(params: dict[str, Any]) -> dict[str, Any]:
    """One flat answer per Query for the whole module: each run walks 180 days."""
    payload: dict[str, Any] = json.loads(_flat(tuple(sorted(params.items()))))
    return payload


def when(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


def test_the_dip_is_worked_by_hand_and_zero_on_the_ground() -> None:
    # acos(R / (R + h)) with R = 1737.4 km and h = 2 m: acos(1737400 / 1737402)
    # = 0.0015173 rad = 0.08694°, the number in the requirement.
    assert flat(LAST_MONTH)["horizon_elevation_deg"] == pytest.approx(-0.08694, abs=0.00001)
    ground = client.get("/visibility/flat", params={**LAST_MONTH, "observer_height_m": 0})
    assert ground.json()["horizon_elevation_deg"] == 0
    # Exactly 0, not the -0.0 that minus a zero dip gives.
    assert b'"horizon_elevation_deg":0.0,' in ground.content


@pytest.mark.parametrize(
    ("params", "status", "code"),
    [
        ({"start": "2026-11-14T00:00:00Z"}, 422, "missing_site"),
        ({**NOVEMBER_2026, "latitude_deg": -89, "longitude_deg": 0}, 422, "ambiguous_site"),
        ({"latitude_deg": -89, "start": "2026-11-14T00:00:00Z"}, 422, "ambiguous_site"),
        ({"site_id": "nope", "start": "2026-11-14T00:00:00Z"}, 404, "missing_site"),
        (
            {"latitude_deg": -70, "longitude_deg": 0, "start": "2026-11-14T00:00:00Z"},
            422,
            "outside_coverage",
        ),
        ({"site_id": "001", "start": "2040-01-01T00:00:00Z"}, 422, "window_out_of_range"),
        ({"site_id": "001", "start": "2032-12-31T00:00:00Z"}, 422, "window_out_of_range"),
        ({"site_id": "001"}, 422, "invalid_parameter"),
        ({**NOVEMBER_2026, "duration_hours": 1441}, 422, "invalid_parameter"),
        ({**NOVEMBER_2026, "observer_height_m": -1}, 422, "invalid_parameter"),
    ],
)
def test_the_query_rules_and_problems_are_those_of_visibility(
    params: dict[str, Any], status: int, code: str
) -> None:
    ours = client.get("/visibility/flat", params=params)
    theirs = client.get("/visibility", params=params)
    assert ours.status_code == theirs.status_code == status, ours.text
    assert ours.json()["code"] == theirs.json()["code"] == code


def test_on_the_bare_sphere_it_is_the_visibility_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Past the DEM fixtures, with the switch the Horizons check uses, `/visibility` answers
    over the same bare sphere. Same engine, same definitions: the Window's metrics and
    events must be the same, to the bit."""
    monkeypatch.setenv("LUNAR_FLAT_HORIZON_WITHOUT_DEM", "1")
    plain = get("/visibility", MOUTON)
    ours = flat(MOUTON)
    assert ours["query"] == plain["query"]
    assert ours["metrics"] == plain["metrics"]
    end = plain["query"]["end"]
    inside = [e for e in ours["events"] if e["t"] <= end]
    assert inside == [
        {key: e[key] for key in ("type", "t", "azimuth_deg")} for e in plain["events"]
    ]
    assert len(inside) >= 4
    assert ours["provenance"] == plain["provenance"]
    assert ours["provenance"]["dems"] == []
    assert ours["horizon_elevation_deg"] == plain["horizon"]["samples"][0]["elevation_deg"]


def test_at_each_event_the_body_sits_on_the_flat_horizon(monkeypatch: pytest.MonkeyPatch) -> None:
    """At a Sunset or a Sunrise the top of the Sun is on the horizon; at an Earthset or an
    Earthrise, the Earth's centre. Read off the `/visibility` timeline (SPICE positions
    every 15 min, which don't depend on any horizon) by linear interpolation.

    The tolerance covers the one Sun radius per answer, the Window's mean (it moves about
    0.001° over a month, engine.py), and interpolating a curve that bends by about 0.00001°
    in 15 minutes. Measured on 2026-11-14: at most 0.00065° off.
    """
    monkeypatch.setenv("LUNAR_FLAT_HORIZON_WITHOUT_DEM", "1")
    timeline = get("/visibility", MOUTON)["timeline"]
    ours = flat(MOUTON)
    horizon = ours["horizon_elevation_deg"]
    checked = 0
    for event in ours["events"]:
        moment = when(event["t"])
        body = "sun" if event["type"] in ("sunrise", "sunset") else "earth"
        pairs = itertools.pairwise(timeline["samples"])
        around = next(((a, b) for a, b in pairs if when(a["t"]) <= moment <= when(b["t"])), None)
        if around is None:
            continue
        before, after = around
        span = (when(after["t"]) - when(before["t"])).total_seconds()
        weight = (moment - when(before["t"])).total_seconds() / span
        elevation = (1 - weight) * before[body]["elevation_deg"] + weight * after[body][
            "elevation_deg"
        ]
        if body == "sun":
            elevation += timeline["sun_radius_deg"]
        assert elevation == pytest.approx(horizon, abs=0.002), event
        checked += 1
    assert checked >= 4


def test_events_are_looked_for_180_days_past_the_window() -> None:
    ours = flat(NOVEMBER_2026)
    start, end = when(ours["query"]["start"]), when(ours["query"]["end"])
    assert when(ours["search_end"]) == end + timedelta(days=180)
    stamps = [when(e["t"]) for e in ours["events"]]
    assert stamps == sorted(stamps)
    assert all(start <= t <= when(ours["search_end"]) for t in stamps)
    # No Sunset in the Window, so the first one is past its end: what the screen reports.
    sunsets = [when(e["t"]) for e in ours["events"] if e["type"] == "sunset"]
    assert sunsets and sunsets[0] > end
    assert ours["metrics"]["lcsp_hours"] == 0
    for kinds in (("sunrise", "sunset"), ("earthrise", "earthset")):
        sequence = [e["type"] for e in ours["events"] if e["type"] in kinds]
        assert all(a != b for a, b in itertools.pairwise(sequence)), sequence


def test_the_search_stops_at_the_end_of_coverage() -> None:
    coverage_end = get("/meta", {})["coverage"]["window_max"]
    ours = flat(LAST_MONTH)
    assert ours["search_end"] == coverage_end
    assert all(e["t"] <= coverage_end for e in ours["events"])


def _rebuilt(ours: dict[str, Any], body: str) -> list[tuple[datetime, datetime, bool]]:
    """A body's periods over the Window, from the event list alone."""
    rise = "sunrise" if body == "sun" else "earthrise"
    events = [e for e in ours["events"] if e["type"] in (rise, rise.replace("rise", "set"))]
    start, end = when(ours["query"]["start"]), when(ours["query"]["end"])
    up = events[0]["type"] != rise  # it sets first, so it was up
    out: list[tuple[datetime, datetime, bool]] = []
    cursor = start
    for event in events:
        moment = when(event["t"])
        if moment >= end:
            break
        out.append((cursor, moment, up))
        cursor, up = moment, event["type"] == rise
    out.append((cursor, end, up))
    return out


def test_the_metrics_cover_the_window_and_follow_from_the_events() -> None:
    ours = flat(MARCH_2025)
    sun, earth = _rebuilt(ours, "sun"), _rebuilt(ours, "earth")

    def hours(a: datetime, b: datetime) -> float:
        return (b - a).total_seconds() / 3600

    lit = [hours(a, b) for a, b, up in sun if up]
    dark = [hours(a, b) for a, b, up in sun if not up]
    both = sum(
        max(0.0, hours(max(a1, a2), min(b1, b2)))
        for (a1, b1, s), (a2, b2, e) in itertools.product(sun, earth)
        if s and e
    )
    metrics = ours["metrics"]
    assert len(dark) >= 1 and len([1 for *_, up in earth if not up]) >= 1
    assert metrics["sunlit_hours"] == pytest.approx(sum(lit), abs=1e-9)
    assert metrics["lcip_hours"] == pytest.approx(max(lit), abs=1e-9)
    assert metrics["lcsp_hours"] == pytest.approx(max(dark), abs=1e-9)
    assert metrics["earth_visible_hours"] == pytest.approx(
        sum(hours(a, b) for a, b, up in earth if up), abs=1e-9
    )
    assert metrics["sun_and_earth_hours"] == pytest.approx(both, abs=1e-9)
    assert metrics["sunlit_hours"] + sum(dark) == pytest.approx(
        ours["query"]["duration_hours"], abs=1e-6
    )


def test_the_real_answer_can_have_more_sun_than_the_flat_one() -> None:
    """Site 001 sits on a ridge: in some directions its Horizon mask is below the dip, so it
    sees the Sun when the bare sphere would not. Nothing may assume flat means more Sun."""
    ours = flat(MARCH_2025)
    real = get("/visibility", MARCH_2025)
    lowest = min(s["elevation_deg"] for s in real["horizon"]["samples"])
    assert lowest < ours["horizon_elevation_deg"]
    assert real["metrics"]["lcip_hours"] > ours["metrics"]["lcip_hours"]
    assert real["metrics"]["earth_visible_hours"] > ours["metrics"]["earth_visible_hours"]


def test_curated_sites_are_cached_under_their_own_key() -> None:
    query = {"site_id": "001", "start": "2032-11-01T00:00:00Z", "duration_hours": 24}
    # The real answer for the same Query is in the cache first: the flat one must not be it.
    client.get("/visibility", params=query)
    first = client.get("/visibility/flat", params=query)
    second = client.get("/visibility/flat", params=query)
    assert first.headers["Cache-Status"] == "lunar-api; fwd=miss"
    assert second.headers["Cache-Status"] == "lunar-api; hit"
    assert first.content == second.content
    assert "horizon_elevation_deg" in first.json()


def test_custom_sites_are_never_cached() -> None:
    query = {"latitude_deg": -89.6, "longitude_deg": 0, "start": "2032-11-01T00:00:00Z"}
    query["duration_hours"] = 24
    for _ in range(2):
        response = client.get("/visibility/flat", params=query)
        assert response.status_code == 200, response.text
        assert response.headers["Cache-Status"] == "lunar-api; fwd=miss"
    assert math.isclose(response.json()["query"]["site"]["latitude_deg"], -89.6)
