"""The Landing scatter (the requirement), through the HTTP API.

The Windows are short (one or two days): each scatter is 19 engine runs, and what costs
is the 19 Horizon masks, which the engine keeps per coordinate. Most tests ask about the
same Site and radius, so they pay for those masks once.
"""

import math
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import cache, engine, scatter
from app.main import app

client = TestClient(app)
MOON_RADIUS_M = 1_737_400.0
METRICS = (
    "sun_and_earth_hours",
    "sunlit_hours",
    "earth_visible_hours",
    "lcip_hours",
    "lcsp_hours",
    "mean_sun_fraction",
)
# Site 001 over two days of late November 2026: the Site keeps the Sun and the Earth the
# whole time, while 250 m to the west and to the west-north-west the Sun is gone.
SITE_001 = {"site_id": "001", "start": "2026-11-26T00:00:00Z", "duration_hours": 48}
# Blue Ghost 1, in Mare Crisium at 18.6°N: far off the polar DEMs, with its own DEM crop.
BLUE_GHOST = {
    "site_id": "BG1",
    "start": "2026-11-26T00:00:00Z",
    "duration_hours": 24,
    "radius_m": 100,
}
EXPECTED_OFFSETS = (
    [(0.0, 0.0)]
    + [(125.0, float(b)) for b in range(0, 360, 60)]
    + [(250.0, float(b)) for b in range(0, 360, 30)]
)


def get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    response = client.get(path, params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


@pytest.fixture(scope="module")
def site_001() -> dict[str, Any]:
    return get("/visibility/scatter", SITE_001)


def great_circle(
    lat1_deg: float, lon1_deg: float, lat2_deg: float, lon2_deg: float
) -> tuple[float, float]:
    """Distance (haversine) and initial bearing between two points on the 1737.4 km sphere.

    The engine places points with the forward (destination) formula; this is the inverse
    one, written out here so the test does not share the engine's arithmetic.
    """
    phi1, phi2 = math.radians(lat1_deg), math.radians(lat2_deg)
    dlon = math.radians(lon2_deg - lon1_deg)
    h = math.sin((phi2 - phi1) / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlon / 2) ** 2
    distance = 2 * MOON_RADIUS_M * math.asin(math.sqrt(h))
    bearing = math.degrees(
        math.atan2(
            math.sin(dlon) * math.cos(phi2),
            math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlon),
        )
    )
    return distance, bearing % 360.0


def angle_gap(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def test_the_site_first_then_the_inner_ring_then_the_outer(site_001: dict[str, Any]) -> None:
    points = site_001["points"]
    assert [(p["distance_m"], p["azimuth_deg"]) for p in points] == EXPECTED_OFFSETS
    assert site_001["radius_m"] == 250


def test_the_centre_is_the_visibility_answer(site_001: dict[str, Any]) -> None:
    plain = get("/visibility", SITE_001)
    centre = site_001["points"][0]
    assert site_001["query"] == plain["query"]
    assert centre["metrics"] == plain["metrics"]
    site = plain["query"]["site"]
    assert (centre["latitude_deg"], centre["longitude_deg"]) == (
        site["latitude_deg"],
        site["longitude_deg"],
    )


def test_every_point_is_visibility_asked_for_that_coordinate(site_001: dict[str, Any]) -> None:
    for point in site_001["points"][1:]:
        custom = get(
            "/visibility",
            {
                "latitude_deg": point["latitude_deg"],
                "longitude_deg": point["longitude_deg"],
                "start": SITE_001["start"],
                "duration_hours": SITE_001["duration_hours"],
            },
        )
        assert point["metrics"] == custom["metrics"], point


def test_each_point_is_where_it_says(site_001: dict[str, Any]) -> None:
    centre = site_001["points"][0]
    for point in site_001["points"][1:]:
        distance, bearing = great_circle(
            centre["latitude_deg"],
            centre["longitude_deg"],
            point["latitude_deg"],
            point["longitude_deg"],
        )
        assert abs(distance - point["distance_m"]) <= 0.1, point
        assert angle_gap(bearing, point["azimuth_deg"]) <= 0.05, point


def test_the_band_names_the_point_at_each_end(site_001: dict[str, Any]) -> None:
    points = site_001["points"]
    for name in METRICS:
        values = [p["metrics"][name] for p in points]
        band = site_001["band"][name]
        assert band["min"] == min(values) == values[band["min_point"]]
        assert band["max"] == max(values) == values[band["max_point"]]
        # The first point on a tie.
        assert band["min_point"] == values.index(min(values))
        assert band["max_point"] == values.index(max(values))


def test_a_250_m_miss_changes_the_answer_here(site_001: dict[str, Any]) -> None:
    """Not a check of the arithmetic: that this Query is worth asking at all."""
    band = site_001["band"]["sun_and_earth_hours"]
    assert band["max"] == 48 and band["max_point"] == 0
    assert band["min"] == 0
    # Two points tie at 0 h; the band names the first.
    assert band["min_point"] == 16


def test_an_off_pole_site_reads_its_own_dem_and_the_radius_sets_the_rings() -> None:
    scatter = get("/visibility/scatter", BLUE_GHOST)
    plain = get("/visibility", {k: v for k, v in BLUE_GHOST.items() if k != "radius_m"})
    centre = scatter["points"][0]
    assert scatter["radius_m"] == 100
    assert centre["metrics"] == plain["metrics"]
    for point in scatter["points"][1:]:
        assert point["distance_m"] in (50, 100)
        distance, bearing = great_circle(
            centre["latitude_deg"],
            centre["longitude_deg"],
            point["latitude_deg"],
            point["longitude_deg"],
        )
        assert abs(distance - point["distance_m"]) <= 0.1, point
        assert angle_gap(bearing, point["azimuth_deg"]) <= 0.05, point


def test_a_point_without_terrain_makes_the_whole_request_unprocessable() -> None:
    # 19.8 km from the pole the Site's own rays still fit in the 20 m DEM fixture (±25 km),
    # but the point 200 m to the north takes them past its edge.
    response = client.get(
        "/visibility/scatter",
        params={
            "latitude_deg": -89.347,
            "longitude_deg": 90,
            "start": "2026-11-26T00:00:00Z",
            "duration_hours": 24,
            "radius_m": 400,
        },
    )
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "outside_coverage"
    alone = client.get(
        "/visibility",
        params={"latitude_deg": -89.347, "longitude_deg": 90, "start": "2026-11-26T00:00:00Z"},
    )
    assert alone.status_code == 200


@pytest.mark.parametrize("radius", [39.9, 1000.1, "a"])
def test_a_radius_outside_the_contract_is_rejected(radius: Any) -> None:
    response = client.get("/visibility/scatter", params={**SITE_001, "radius_m": radius})
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_parameter"


def test_a_curated_scatter_is_cached() -> None:
    first = client.get("/visibility/scatter", params=SITE_001)
    again = client.get("/visibility/scatter", params=SITE_001)
    assert first.headers["cache-status"] == "lunar-api; fwd=miss"
    assert again.headers["cache-status"] == "lunar-api; hit"
    assert again.json() == first.json()


def test_another_radius_is_another_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    # Only the cache is under test here, so the 19 engine runs are left out: a radius
    # 0.1 mm longer moves most points enough to need new Horizon masks.
    computed: list[float] = []

    def stand_in(*args: Any) -> dict[str, Any]:
        computed.append(args[-1])
        return {"radius_m": args[-1]}

    monkeypatch.setattr(scatter, "compute", stand_in)
    statuses = [
        client.get("/visibility/scatter", params={**SITE_001, "radius_m": radius}).headers[
            "cache-status"
        ]
        for radius in (250, 250.0001, 250)
    ]
    assert statuses == ["lunar-api; fwd=miss", "lunar-api; fwd=miss", "lunar-api; hit"]
    assert computed == [250, 250.0001]


def test_a_custom_scatter_is_never_stored() -> None:
    custom = {
        "latitude_deg": -89.4661,
        "longitude_deg": -136.949,
        "start": SITE_001["start"],
        "duration_hours": SITE_001["duration_hours"],
    }
    for _ in range(2):
        response = client.get("/visibility/scatter", params=custom)
        assert response.headers["cache-status"] == "lunar-api; fwd=miss"


class RecordingGate(cache._Gate):
    def __init__(self, slots: int) -> None:
        super().__init__(slots)
        self.log: list[tuple[str, int]] = []

    def acquire(self, warming: bool, polite: bool = False) -> None:
        super().acquire(warming, polite)
        self.log.append(("acquire", threading.get_ident()))

    def release(self, warming: bool) -> None:
        self.log.append(("release", threading.get_ident()))
        super().release(warming)


def test_a_scatter_takes_one_engine_slot_and_lets_go_between_points(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    gate = RecordingGate(2)
    monkeypatch.setattr(cache, "_gate", gate)
    get("/visibility/scatter", SITE_001)
    # One acquire and one release per point, in turn: never two slots, never kept.
    assert [kind for kind, _ in gate.log] == ["acquire", "release"] * 19
    assert gate._free == 2


def test_a_visitor_queued_during_a_scatter_goes_before_its_next_point(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One engine slot: a /visibility asked while a point runs gets it before the next point."""
    gate = cache._Gate(1)
    monkeypatch.setattr(cache, "_gate", gate)
    real: Callable[..., dict[str, Any]] = engine.calculate
    runs: list[str] = []
    visitor_answer: list[int] = []
    visitor = {
        "latitude_deg": -89.4661,
        "longitude_deg": -136.949,
        "start": SITE_001["start"],
        "duration_hours": 24,
    }

    def ask() -> None:
        visitor_answer.append(client.get("/visibility", params=visitor).status_code)

    def recorded(site: Any, *args: Any, **kwargs: Any) -> dict[str, Any]:
        is_point = site["id"] == "001" and not site["curated"]
        runs.append("point" if is_point else "site" if site["curated"] else "visitor")
        if is_point and runs.count("point") == 1:
            threading.Thread(target=ask).start()
            deadline = time.monotonic() + 20
            while gate._visitors_waiting == 0 and time.monotonic() < deadline:
                time.sleep(0.01)
            assert gate._visitors_waiting == 1, "the visitor never queued"
        return real(site, *args, **kwargs)

    monkeypatch.setattr(engine, "calculate", recorded)
    get("/visibility/scatter", SITE_001)
    deadline = time.monotonic() + 20
    while not visitor_answer and time.monotonic() < deadline:
        time.sleep(0.01)
    assert visitor_answer == [200]
    assert runs[:4] == ["site", "point", "visitor", "point"]
    assert runs.count("point") == 18


def test_the_default_sites_scatter_is_warmed_after_the_curated_sites(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A one-day default Window keeps this cheap; years are left out, they have their test.
    monkeypatch.setenv("LUNAR_WARM_CACHE", "CR02,001")
    monkeypatch.setattr(cache, "DEFAULT_DURATION_HOURS", 24.0)
    monkeypatch.setattr(cache, "year", lambda *_: (b"{}", False))
    asked: list[str] = []
    memo = cache._memo

    def recorded(key: cache.Key, compute: Callable[[], bytes], **kwargs: Any) -> tuple[bytes, bool]:
        asked.append(key[0])
        return memo(key, compute, **kwargs)

    monkeypatch.setattr(cache, "_memo", recorded)
    today = cache.default_start()
    with TestClient(app) as warmed:
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            with cache._lock:
                if any(key[0] == "001/scatter/250.0" for key in cache._entries):
                    break
            time.sleep(0.2)
        answer = warmed.get(
            "/visibility/scatter",
            params={
                "site_id": "001",
                "start": today.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "duration_hours": 24,
            },
        )
    assert answer.status_code == 200
    assert answer.headers["cache-status"] == "lunar-api; hit"
    assert answer.json()["query"]["start"] == today.strftime("%Y-%m-%dT%H:%M:%SZ")
    scatter_at = asked.index("001/scatter/250.0")
    assert asked.index("001") < scatter_at
    assert asked.index("CR02") < scatter_at
    assert datetime.now(UTC) >= today
