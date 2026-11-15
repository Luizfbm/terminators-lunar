"""The DSN link (the requirement), driven through HTTP.

The answer is checked against things the route does not compute the same way: the
Earth's periods from `/visibility`, the station coordinates printed in the stations'
frames kernel (from DSN 810-005 module 301), and the Moon's elevation worked out here
from the station's position and the Earth's orientation, without the topocentric frames
the route uses.
"""

from __future__ import annotations

import itertools
import json
import math
import subprocess
import sys
import textwrap
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
import spiceypy as spice
from fastapi.testclient import TestClient

from app import dsn, ephemeris
from app.main import app
from tests.test_ladder import same

client = TestClient(app)

# Site 001 over two days of the validation window: the Earth rises and sets inside it.
WEEKEND = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 48}
# The default Window at Site 001 from the same day: the Earth is up for about 329 h.
DEFAULT_WINDOW = {"site_id": "001", "start": "2026-11-14T00:00:00Z"}

# Geodetic coordinates printed in earth_topo_260814.tf for each antenna (WGS-84 spheroid).
DOCUMENTED = {
    "DSS-14": (35.4258999225138, -116.8895431330483, 1.001384087429),
    "DSS-43": (-35.4024141881635, 148.9812726938012, 0.6888431941637),
    "DSS-63": (40.4312138842194, -4.2480020535013, 0.8648448375319),
}
WGS84_RADIUS_KM = 6378.137
WGS84_FLATTENING = 1.0 / 298.2572236


def dsn_answer(params: dict[str, Any]) -> dict[str, Any]:
    response = client.get("/visibility/dsn", params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def instant(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


def spans(items: list[dict[str, Any]]) -> list[tuple[datetime, datetime]]:
    return [(instant(item["start"]), instant(item["end"])) for item in items]


def covered(when: datetime, intervals: list[tuple[datetime, datetime]]) -> bool:
    return any(a <= when <= b for a, b in intervals)


def elevation_by_hand(station_id: str, when: datetime) -> float:
    """The Moon's elevation from the station, without the station's topocentric frame.

    The zenith is the spheroid normal built here from the documented geodetic latitude and
    longitude, in ITRF93; the Moon comes from the Earth's centre in ITRF93 with the light
    time and aberration seen from the station.
    """
    dsn.ensure()
    latitude, longitude, altitude = DOCUMENTED[station_id]
    lat, lon = math.radians(latitude), math.radians(longitude)
    zenith = (math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat))
    site = spice.georec(lon, lat, altitude, WGS84_RADIUS_KM, WGS84_FLATTENING)
    state, _lt = spice.spkcpo(
        "MOON", ephemeris.et(when), "ITRF93", "OBSERVER", "LT+S", site, "EARTH", "ITRF93"
    )
    vector = [float(x) for x in state[:3]]
    up = sum(a * b for a, b in zip(vector, zenith, strict=True))
    return math.degrees(math.asin(up / math.sqrt(sum(x * x for x in vector))))


def test_stations_are_the_three_70m_antennas_where_the_dsn_documents_them() -> None:
    payload = dsn_answer(WEEKEND)
    assert payload["min_elevation_deg"] == 6.0
    assert [(s["id"], s["complex"]) for s in payload["stations"]] == [
        ("DSS-14", "goldstone"),
        ("DSS-43", "canberra"),
        ("DSS-63", "madrid"),
    ]
    for station in payload["stations"]:
        latitude, longitude, _altitude = DOCUMENTED[station["id"]]
        # The stations drift a few cm a year; 1e-6° is about 10 cm.
        assert abs(station["latitude_deg"] - latitude) < 1e-6
        assert abs(station["longitude_deg"] - longitude) < 1e-6


def test_pass_edges_are_where_the_moon_crosses_six_degrees() -> None:
    payload = dsn_answer(WEEKEND)
    start, end = instant(payload["query"]["start"]), instant(payload["query"]["end"])
    minute = timedelta(minutes=1)
    edges = 0
    for station in payload["stations"]:
        passes = spans(station["passes"])
        assert passes, station["id"]
        for a, b in passes:
            assert a < b
            assert elevation_by_hand(station["id"], a + minute) > 6.0
            assert elevation_by_hand(station["id"], b - minute) > 6.0
            for edge, outside in ((a, a - minute), (b, b + minute)):
                if start < edge < end:
                    edges += 1
                    assert abs(elevation_by_hand(station["id"], edge) - 6.0) < 0.01
                    assert elevation_by_hand(station["id"], outside) < 6.0
        # Between two passes the Moon is below the limit the whole time.
        for (_a, b), (c, _d) in itertools.pairwise(passes):
            middle = b + (c - b) / 2
            assert elevation_by_hand(station["id"], middle) < 6.0
    assert edges >= 9


def test_hours_add_up_and_the_earth_matches_visibility() -> None:
    payload = dsn_answer(DEFAULT_WINDOW)
    visibility = client.get("/visibility", params=DEFAULT_WINDOW).json()
    assert math.isclose(
        payload["earth_visible_hours"],
        visibility["metrics"]["earth_visible_hours"],
        abs_tol=1e-9,
    )
    # The tolerance of the spec, the requirement.
    total = payload["link_hours"] + payload["earth_without_station_hours"]
    assert abs(total - payload["earth_visible_hours"]) <= 0.01
    assert payload["query"] == visibility["query"]
    assert payload["provenance"]["dems"] == visibility["provenance"]["dems"]


def test_link_periods_are_earth_up_and_a_dish_in_view() -> None:
    payload = dsn_answer(DEFAULT_WINDOW)
    visibility = client.get("/visibility", params=DEFAULT_WINDOW).json()
    earth = [
        (instant(p["start"]), instant(p["end"]))
        for p in visibility["periods"]
        if p["body"] == "earth" and p["state"] == "visible"
    ]
    passes = [span for s in payload["stations"] for span in spans(s["passes"])]
    links = spans(payload["link_periods"])
    assert links == sorted(links)
    for a, b in links:
        assert a < b
        assert math.isclose(
            next(p for p in payload["link_periods"] if instant(p["start"]) == a)["duration_hours"],
            (b - a).total_seconds() / 3600,
        )
    # Every 10 minutes of the Window: a link exactly when the Earth is up and a dish sees it.
    start, end = instant(payload["query"]["start"]), instant(payload["query"]["end"])
    when = start + timedelta(minutes=5)
    while when < end:
        expected = covered(when, earth) and covered(when, passes)
        assert covered(when, links) == expected, when
        when += timedelta(minutes=10)


def test_provenance_lists_the_dsn_kernels_after_the_main_ones() -> None:
    payload = dsn_answer(WEEKEND)
    visibility = client.get("/visibility", params=WEEKEND).json()
    assert payload["provenance"]["kernels"] == [
        *visibility["provenance"]["kernels"],
        "earth_itrf93_2023_2032.bpc",
        "earthstns_itrf93_260814.bsp",
        "earth_topo_260814.tf",
    ]
    assert payload["provenance"]["synthetic"] is False
    assert payload["provenance"]["engine_version"] == visibility["provenance"]["engine_version"]


def test_meta_lists_the_dsn_kernels() -> None:
    kernels = client.get("/meta").json()["kernels"]
    assert kernels[-3:] == [
        "earth_itrf93_2023_2032.bpc",
        "earthstns_itrf93_260814.bsp",
        "earth_topo_260814.tf",
    ]
    assert kernels[:-3] == ephemeris.kernel_names()


def test_curated_answers_are_cached_and_custom_ones_are_not() -> None:
    first = client.get("/visibility/dsn", params=WEEKEND)
    second = client.get("/visibility/dsn", params=WEEKEND)
    assert first.headers["cache-status"] == "lunar-api; fwd=miss"
    assert second.headers["cache-status"] == "lunar-api; hit"
    assert first.content == second.content
    custom: dict[str, Any] = {
        "latitude_deg": -89.6,
        "longitude_deg": 0,
        "start": "2026-11-14T00:00:00Z",
        "duration_hours": 24,
    }
    for _ in range(2):
        response = client.get("/visibility/dsn", params=custom)
        assert response.status_code == 200, response.text
        assert response.headers["cache-status"] == "lunar-api; fwd=miss"


@pytest.mark.parametrize(
    ("params", "status", "code"),
    [
        ({"start": "2026-11-14T00:00:00Z"}, 422, "missing_site"),
        ({"site_id": "NOPE", "start": "2026-11-14T00:00:00Z"}, 404, "missing_site"),
        ({"site_id": "001", "start": "2033-01-10T00:00:00Z"}, 422, "window_out_of_range"),
        (
            {"latitude_deg": -70, "longitude_deg": 0, "start": "2026-11-14T00:00:00Z"},
            422,
            "outside_coverage",
        ),
    ],
)
def test_bad_queries_are_problems(params: dict[str, Any], status: int, code: str) -> None:
    response = client.get("/visibility/dsn", params=params)
    assert response.status_code == status, response.text
    assert response.json()["code"] == code


BACKEND = Path(__file__).resolve().parents[1]


def test_loading_the_dsn_kernels_leaves_visibility_byte_identical() -> None:
    """A fresh process answers /visibility and the ladder, loads the DSN kernels, asks again.

    A custom Site, so the answers are computed both times and never read from the cache.
    """
    script = textwrap.dedent(
        """
        import json, sys
        from fastapi.testclient import TestClient
        from app import dsn
        from app.main import app

        client = TestClient(app)
        params = {"latitude_deg": -89.4, "longitude_deg": 90,
                  "start": "2027-03-01T00:00:00Z", "duration_hours": 24}
        def ask():
            return [client.get(path, params=params).content
                    for path in ("/visibility", "/visibility/ladder")]
        before = ask()
        assert not dsn._loaded
        assert client.get("/visibility/dsn", params=params).status_code == 200
        assert dsn._loaded
        after = ask()
        json.dump({"same": before == after,
                   "kernels": json.loads(after[0])["provenance"]["kernels"]}, sys.stdout)
        """
    )
    run = subprocess.run(
        [sys.executable, "-c", script], cwd=BACKEND, capture_output=True, text=True, check=True
    )
    result = json.loads(run.stdout)
    assert result["same"] is True
    assert result["kernels"] == ephemeris.kernel_names()


def test_a_gap_between_dishes_counts_as_earth_without_a_station(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """On 22 March 2025 the Moon is near -28.7° of declination and twice no antenna sees it.

    Near the pole the Earth is then below the horizon, so the gap never shows at a Site in
    the DEM fixtures: this asks at 80°S on the near side, on the bare sphere, where the
    Earth stays up all day. The gaps are counted here minute by minute, by hand.
    """
    monkeypatch.setenv("LUNAR_FLAT_HORIZON_WITHOUT_DEM", "1")
    params: dict[str, Any] = {
        "latitude_deg": -80,
        "longitude_deg": 0,
        "start": "2025-03-22T00:00:00Z",
        "duration_hours": 24,
    }
    payload = dsn_answer(params)
    assert payload["earth_visible_hours"] == 24.0
    total = payload["link_hours"] + payload["earth_without_station_hours"]
    assert abs(total - payload["earth_visible_hours"]) <= 0.01
    start = instant(params["start"])
    minutes_without = sum(
        all(
            elevation_by_hand(station, start + timedelta(minutes=m, seconds=30)) < 6.0
            for station in DOCUMENTED
        )
        for m in range(24 * 60)
    )
    # Two gaps, of about 3 and 29 minutes; minute sampling is good to a minute per edge.
    assert minutes_without > 25
    assert abs(payload["earth_without_station_hours"] * 60 - minutes_without) <= 4
    assert len(payload["link_periods"]) == 3


EXAMPLE = BACKEND.parent / "contract" / "examples" / "visibility-dsn-001.example.json"


def test_the_contract_example_is_the_engine_answer() -> None:
    """The example in the contract was produced by the engine and still is its answer.

    Compared as the ladder test compares answers across machines: floats to 1e-6 relative,
    instants to a second, everything else exactly.
    """
    example = json.loads(EXAMPLE.read_text("utf-8"))["value"]
    payload = dsn_answer({"site_id": "001", "start": "2026-11-16T00:00:00Z", "duration_hours": 48})
    same(example, payload)
