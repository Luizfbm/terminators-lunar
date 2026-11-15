"""Sub-solar and sub-Earth points, the Sun's radius and provenance (the requirement), via HTTP."""

import math
from datetime import datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
QUERY = {"site_id": "CR01", "start": "2026-11-20T12:00:00Z", "duration_hours": 30.5}


def get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    response = client.get(path, params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def angle_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    a, b, d = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    cos = math.sin(a) * math.sin(b) + math.cos(a) * math.cos(b) * math.cos(d)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def test_sub_points_run_hourly_over_the_window_and_close_on_its_end() -> None:
    payload = get("/visibility", QUERY)
    series = payload["sub_points"]
    assert (series["step_hours"], series["frame"]) == (1, "MOON_ME")
    stamps = [datetime.fromisoformat(s["t"]) for s in series["samples"]]
    start = datetime.fromisoformat(payload["query"]["start"])
    assert stamps[:-1] == [start + timedelta(hours=h) for h in range(31)]
    assert stamps[-1] == datetime.fromisoformat(payload["query"]["end"])
    for sample in series["samples"]:
        for body in ("sun", "earth"):
            assert -90 <= sample[body]["latitude_deg"] <= 90
            assert -180 <= sample[body]["longitude_deg"] <= 180
        # The Sun stays near the Moon's equator, the Earth near the Moon's near side.
        assert abs(sample["sun"]["latitude_deg"]) < 1.6
        assert abs(sample["earth"]["latitude_deg"]) < 7
        assert abs(sample["earth"]["longitude_deg"]) < 9


def test_the_sun_overhead_point_agrees_with_the_sun_seen_from_the_site() -> None:
    """Two SPICE paths: Moon centre to the Sun, and the Site's own azimuth and elevation.

    A body's elevation at the Site is 90° minus its angular distance from the overhead
    point. From the Site instead of the centre the Sun shifts by 1737 km / 1 AU, 0.0007°.
    """
    payload = get("/visibility", QUERY)
    site = payload["query"]["site"]
    timeline = {s["t"]: s for s in payload["timeline"]["samples"]}
    checked = 0
    for point in payload["sub_points"]["samples"]:
        sample = timeline.get(point["t"])
        if sample is None:
            continue
        sun = point["sun"]
        distance = angle_between(
            site["latitude_deg"], site["longitude_deg"], sun["latitude_deg"], sun["longitude_deg"]
        )
        assert abs((90 - distance) - sample["sun"]["elevation_deg"]) < 0.005
        checked += 1
    assert checked >= 30


def test_the_earth_point_differs_from_the_site_view_by_the_parallax_only() -> None:
    """From the Site the Earth sits lower than the centre-based estimate, by up to the
    Moon's radius over the Earth distance (about 0.26°), and never by more than 0.3°."""
    payload = get("/visibility", QUERY)
    site = payload["query"]["site"]
    timeline = {s["t"]: s for s in payload["timeline"]["samples"]}
    gaps = []
    for point in payload["sub_points"]["samples"]:
        sample = timeline.get(point["t"])
        if sample is None:
            continue
        earth = point["earth"]
        distance = angle_between(
            site["latitude_deg"],
            site["longitude_deg"],
            earth["latitude_deg"],
            earth["longitude_deg"],
        )
        gaps.append((90 - distance) - sample["earth"]["elevation_deg"])
    assert gaps and all(0.1 < gap < 0.3 for gap in gaps)


def test_sun_radius_and_synthetic_flag() -> None:
    payload = get("/visibility", QUERY)
    assert 0.261 < payload["timeline"]["sun_radius_deg"] < 0.272
    assert payload["provenance"]["synthetic"] is False


def test_the_ladder_and_visibility_share_one_query_shape() -> None:
    plain = get("/visibility", QUERY)
    ladder = get("/visibility/ladder", QUERY)
    assert ladder["query"] == plain["query"]
