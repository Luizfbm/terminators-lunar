"""One test per bug we have shipped or nearly shipped. Each says what broke and when.

They drive the HTTP API only, and they check the answer against something the engine
did not compute the same way: the timeline samples, a second request, or a fixed date.
"""

import itertools
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import horizon
from app.main import app
from tests.assistant_stub import (
    call,
    completion,
    fresh_assistant,  # noqa: F401  used by usefixtures
    install,
    tool_results,
)

client = TestClient(app)

# Site 001 in March 2025: the Sun sets and rises again inside the Window.
MARCH_2025 = {"site_id": "001", "start": "2025-03-01T00:00:00Z"}
# Site 001 from the validation window: the Sun never sets, the Earth rises and sets.
NOVEMBER_2026 = {"site_id": "001", "start": "2026-11-14T00:00:00Z"}
# The total lunar eclipse of 14 March 2025, penumbra to penumbra, seen from a Site 18 km
# from the pole where the whole Sun stays clear of the terrain and the Earth passes in
# front of it. The DEM fixtures only reach about 20 km from the pole, so the Site that
# the independent work used (85°S) no longer has a Horizon mask in CI.
ECLIPSE_2025 = {
    "latitude_deg": -89.4,
    "longitude_deg": 90,
    "start": "2025-03-14T03:00:00Z",
    "duration_hours": 8,
}
# A Site inside the fixtures where the Sun sets for days and comes back in November 2026.
SETS_IN_NOVEMBER_2026 = {"latitude_deg": -89.6, "longitude_deg": 0, "start": "2026-11-14T00:00:00Z"}
# The floor of Shackleton crater, a permanently shadowed region.
SHACKLETON_FLOOR = {"latitude_deg": -89.67, "longitude_deg": 129.78}


def visibility(params: dict[str, Any]) -> dict[str, Any]:
    response = client.get("/visibility", params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def instant(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


def samples_around(payload: dict[str, Any], stamp: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """The timeline samples just before and just after an instant."""
    when = instant(stamp)
    samples = payload["timeline"]["samples"]
    for before, after in itertools.pairwise(samples):
        if instant(before["t"]) <= when <= instant(after["t"]):
            return before, after
    raise AssertionError(f"{stamp} is outside the timeline")


def mask_at(payload: dict[str, Any], azimuth_deg: float) -> float:
    """The returned Horizon mask between its samples, linear in azimuth."""
    samples = payload["horizon"]["samples"]
    step = payload["horizon"]["azimuth_step_deg"]
    position = azimuth_deg % 360 / step
    low = int(position) % len(samples)
    high = (low + 1) % len(samples)
    weight = position - int(position)
    return float(
        (1 - weight) * samples[low]["elevation_deg"] + weight * samples[high]["elevation_deg"]
    )


def highest_mask_under(payload: dict[str, Any], azimuth_deg: float, half_width: float) -> float:
    return max(
        mask_at(payload, azimuth_deg + offset / 10)
        for offset in range(-round(half_width * 10), round(half_width * 10) + 1)
    )


def sun_periods(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [p for p in payload["periods"] if p["body"] == "sun"]


def test_sunset_is_when_the_last_edge_of_the_disc_goes_under() -> None:
    """Regression: Sunset was reported when the lower edge of the Sun touched the
    horizon (5 March, Sun fraction still 0.9999) instead of when the last edge went
    under (11 March). At the pole that is six days early."""
    payload = visibility(MARCH_2025)
    sunsets = [e for e in payload["events"] if e["type"] == "sunset"]
    sunrises = [e for e in payload["events"] if e["type"] == "sunrise"]
    assert sunsets and sunrises
    for event in sunsets:
        before, after = samples_around(payload, event["t"])
        assert before["sun"]["fraction"] > 0
        assert after["sun"]["fraction"] == 0
    for event in sunrises:
        before, after = samples_around(payload, event["t"])
        assert before["sun"]["fraction"] == 0
        assert after["sun"]["fraction"] > 0
    # The bug put Sunset half a degree early, with the disc's lower edge on the horizon.
    # Over the terrain, the last edge goes under where the top of the disc meets the mask
    # at the Sun's azimuth (Sun radius 0.27°): the lower edge is 0.53° below that.
    for event in sunsets:
        before, after = samples_around(payload, event["t"])
        share = (instant(event["t"]) - instant(before["t"])) / (
            instant(after["t"]) - instant(before["t"])
        )
        elevation = before["sun"]["elevation_deg"] + share * (
            after["sun"]["elevation_deg"] - before["sun"]["elevation_deg"]
        )
        assert abs(elevation + 0.27 - mask_at(payload, event["azimuth_deg"])) < 0.1


def test_sunlit_hours_match_the_timeline() -> None:
    """Regression: with the Sun down for about two days the API still answered
    708.73 sunlit hours and an LCSP of zero, because no period ever came out hidden."""
    payload = visibility(SETS_IN_NOVEMBER_2026)
    samples = payload["timeline"]["samples"]
    step_hours = payload["timeline"]["step_minutes"] / 60
    lit_on_the_grid = sum(step_hours for s in samples[:-1] if s["sun"]["fraction"] > 0)
    dark_on_the_grid = sum(step_hours for s in samples[:-1] if s["sun"]["fraction"] == 0)
    assert lit_on_the_grid > 24 and dark_on_the_grid > 24
    events = [e for e in payload["events"] if e["type"] in ("sunrise", "sunset")]
    tolerance = step_hours * (len(events) + 1)
    assert abs(payload["metrics"]["sunlit_hours"] - lit_on_the_grid) <= tolerance
    hidden = [p["duration_hours"] for p in sun_periods(payload) if p["state"] == "hidden"]
    assert payload["metrics"]["lcsp_hours"] == max(hidden) > 0


def test_earth_events_do_not_cut_the_sun_periods() -> None:
    """Regression: every Earthrise and Earthset also split the Sun's periods, so
    a Sun that stayed up for the whole 708.73 h Window got an LCIP of 330.24 h."""
    payload = visibility(NOVEMBER_2026)
    assert [e["type"] for e in payload["events"]] == ["earthrise", "earthset"]
    periods = sun_periods(payload)
    assert [p["state"] for p in periods] == ["visible"]
    duration = payload["query"]["duration_hours"]
    assert abs(payload["metrics"]["lcip_hours"] - duration) < 1e-6
    assert abs(payload["metrics"]["sunlit_hours"] - duration) < 1e-6


def test_periods_alternate_and_tile_the_window_for_each_body() -> None:
    """Regression: consecutive periods of one body came out with the same state.
    Between two periods of a body there must be exactly one of its own events."""
    for params in (MARCH_2025, NOVEMBER_2026):
        payload = visibility(params)
        for body, names in (("sun", ("sunrise", "sunset")), ("earth", ("earthrise", "earthset"))):
            periods = [p for p in payload["periods"] if p["body"] == body]
            events = [e for e in payload["events"] if e["type"] in names]
            assert periods[0]["start"] == payload["query"]["start"]
            assert periods[-1]["end"] == payload["query"]["end"]
            assert len(periods) == len(events) + 1
            for (left, right), event in zip(itertools.pairwise(periods), events, strict=True):
                assert left["end"] == right["start"] == event["t"]
                assert left["state"] != right["state"]
                assert event["type"] == names[0 if right["state"] == "visible" else 1]
            total = sum(p["duration_hours"] for p in periods)
            assert abs(total - payload["query"]["duration_hours"]) < 1e-6


def test_short_shadow_is_only_on_sun_hidden_periods() -> None:
    """Regression: `short_shadow` was sent on every Sun period, visible ones
    included. The contract has it on Sun hidden periods only."""
    payload = visibility(MARCH_2025)
    limit = client.get("/meta").json()["short_shadow_max_hours"]
    for period in payload["periods"]:
        if period["body"] == "sun" and period["state"] == "hidden":
            assert period["short_shadow"] == (period["duration_hours"] < limit)
        else:
            assert "short_shadow" not in period


def test_a_lunar_eclipse_zeroes_the_sun_fraction_with_the_sun_above_the_horizon() -> None:
    """Regression: the eclipse test ran at a Site where the Sun was already
    under the horizon, so it passed with or without the eclipse code. Here the Sun
    is well up, and only the Earth in front of it can take the Sun fraction to zero.
    An eclipse is not a Sunset: the period stays visible and no event is raised."""
    payload = visibility(ECLIPSE_2025)
    samples = payload["timeline"]["samples"]
    # The whole disc, lower edge included, stays half a degree clear of the terrain.
    for s in samples:
        lower_edge = s["sun"]["elevation_deg"] - 0.27
        assert lower_edge - highest_mask_under(payload, s["sun"]["azimuth_deg"], 0.6) > 0.5
    fractions = [s["sun"]["fraction"] for s in samples]
    assert fractions[0] == 1 and fractions[-1] == 1
    assert min(fractions) == 0
    assert any(0 < f < 1 for f in fractions)
    assert [e for e in payload["events"] if e["type"] in ("sunrise", "sunset")] == []
    assert [p["state"] for p in sun_periods(payload)] == ["visible"]
    assert 0 < payload["metrics"]["mean_sun_fraction"] < 1


def test_no_site_at_all_is_missing_site_not_ambiguous() -> None:
    """Regression: a Query with neither `site_id` nor coordinates was answered
    `ambiguous_site`. the requirement says it is `missing_site`; both together is ambiguous."""
    start = {"start": "2026-01-01T00:00:00Z"}
    neither = client.get("/visibility", params=start)
    assert (neither.status_code, neither.json()["code"]) == (422, "missing_site")
    both = client.get(
        "/visibility", params={**start, "site_id": "001", "latitude_deg": -89, "longitude_deg": 20}
    )
    assert (both.status_code, both.json()["code"]) == (422, "ambiguous_site")


def test_concurrent_queries_answer_the_same_as_one_at_a_time() -> None:
    """Regression: the routes run in a thread pool and called CSPICE with no
    lock. CSPICE is not thread-safe, so two Queries at once could corrupt each other."""
    queries = [
        {
            "latitude_deg": -89.4 - 0.05 * (i % 10),
            "longitude_deg": (36 * i) % 360 - 180,
            "start": f"2026-{1 + i % 12:02d}-01T00:00:00Z",
            "duration_hours": 48,
        }
        for i in range(16)
    ]
    one_at_a_time = [visibility(q) for q in queries]

    def ask(query: dict[str, Any]) -> dict[str, Any]:
        with TestClient(app) as own_client:
            response = own_client.get("/visibility", params=query)
        assert response.status_code == 200, response.text
        answer: dict[str, Any] = response.json()
        return answer

    with ThreadPoolExecutor(max_workers=8) as pool:
        together = list(pool.map(ask, queries))
    assert together == one_at_a_time


def test_the_image_starts_without_dev_dependencies_or_a_floating_uv() -> None:
    """Regression: the Dockerfile copied `uv:latest` and started with `uv run`,
    which syncs the dev dependencies at container start and needs the network."""
    lines = (Path(__file__).resolve().parents[1] / "Dockerfile").read_text().splitlines()
    uv_image = next(line for line in lines if "ghcr.io/astral-sh/uv" in line)
    assert ":latest" not in uv_image and "uv:" in uv_image
    command = next(line for line in lines if line.startswith("CMD"))
    assert '"uv"' not in command and '"uvicorn"' in command


def test_the_mask_catches_the_top_of_a_bump_between_ray_samples() -> None:
    """regression: the rays took one sample per DEM pixel, at points
    that don't sit on pixel centres, so they stepped over the top of a 3 m bump 89 m
    north-west of Site 001. The mask came out 0.20° low at azimuth 344°, and since the
    Sun climbs about 0.005° an hour at the pole, Sunsets moved by up to 2.6 hours.

    The reference walks the same ray every 0.5 m over the bilinear 20 m DEM, read
    straight from the file with rasterio, and keeps the highest point.
    """
    import math

    import numpy as np
    import rasterio  # type: ignore[import-untyped]

    radius = 1_737_400.0
    lat0, lon0, azimuth = math.radians(-89.4661), math.radians(-136.949), math.radians(344.0)
    # Walk up to the repository: mutmut runs these tests from backend/mutants/.
    repo = next(p for p in Path(__file__).resolve().parents if (p / "contract").is_dir())
    path = repo / "fixtures" / "dem" / "LDEM_80S_20MPP_ADJ.TIF"

    def projected(lat: Any, lon: Any) -> tuple[Any, Any]:
        rho = 2 * radius * np.tan(np.pi / 4 + lat / 2)
        return rho * np.sin(lon), rho * np.cos(lon)

    with rasterio.open(path) as dem:
        grid = dem.read(1).astype(float)
        inverse = ~dem.transform

    def height(x: Any, y: Any) -> Any:
        col = inverse.a * x + inverse.c - 0.5
        row = inverse.e * y + inverse.f - 0.5
        c, r = np.floor(col).astype(int), np.floor(row).astype(int)
        fc, fr = col - c, row - r
        return (
            grid[r, c] * (1 - fc) * (1 - fr)
            + grid[r, c + 1] * fc * (1 - fr)
            + grid[r + 1, c] * (1 - fc) * fr
            + grid[r + 1, c + 1] * fc * fr
        )

    distance = np.arange(40.0, 200.0, 0.5)
    delta = distance / radius
    lat = np.arcsin(
        math.sin(lat0) * np.cos(delta) + math.cos(lat0) * np.sin(delta) * math.cos(azimuth)
    )
    lon = lon0 + np.arctan2(
        math.sin(azimuth) * np.sin(delta) * math.cos(lat0),
        np.cos(delta) - math.sin(lat0) * np.sin(lat),
    )
    terrain = height(*projected(lat, lon))
    site = height(*projected(np.array(lat0), np.array(lon0)))
    observer = radius + site + 2.0
    top = radius + terrain
    reference = float(
        np.degrees(np.arctan2(top * np.cos(delta) - observer, top * np.sin(delta))).max()
    )

    payload = visibility(MARCH_2025)
    sample = next(s for s in payload["horizon"]["samples"] if s["azimuth_deg"] == 344.0)
    # A mask can only be as high as the terrain it walks, so allow it a hair above too.
    assert abs(sample["elevation_deg"] - reference) < 0.005, (sample["elevation_deg"], reference)


def test_year_of_a_site_outside_the_dem_is_a_problem_not_a_500() -> None:
    # schemathesis got a 500 from /sites/AR02/year because the DEM error
    # escaped the route. /visibility answers the same Site with outside_coverage.
    response = client.get("/sites/AR02/year", params={"year": 2027})
    assert response.status_code == 422
    assert response.json()["code"] == "outside_coverage"
    same = client.get("/visibility", params={"site_id": "AR02", "start": "2027-01-01T00:00:00Z"})
    assert same.json()["code"] == response.json()["code"]


@pytest.mark.parametrize("route", ["/visibility", "/visibility/ladder"])
@pytest.mark.parametrize(
    "start",
    [
        # Midnight of year 1 at +02:03 is before year 1 in UTC.
        "0001-01-01T00:00:00+02:03",
        # The last hour of year 9999 at -05:00 is year 10000 in UTC.
        "9999-12-31T23:00:00-05:00",
        # Fits in UTC, but the end of the Window does not.
        "9999-12-31T00:00:00Z",
    ],
)
def test_a_start_at_the_edge_of_the_calendar_is_out_of_range_not_a_500(
    route: str, start: str
) -> None:
    # schemathesis got a 500 from /visibility?site_id=CRE05 with the first
    # start: turning it into UTC overflowed the calendar and the error escaped the route.
    # Any date outside 2023-2032 is a Window out of range, and these are no different.
    quiet = TestClient(app, raise_server_exceptions=False)
    response = quiet.get(route, params={"site_id": "CRE05", "start": start})
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "window_out_of_range"
    ordinary = quiet.get(route, params={"site_id": "CRE05", "start": "2040-01-01T00:00:00Z"})
    assert ordinary.json()["code"] == response.json()["code"]


def test_a_cached_answer_and_a_fresh_one_both_name_their_occluders() -> None:
    """Regression: the implementation made the cache hand the route JSON bytes and the implementation named the
    Occluders in the route, on a dict. Each change was green alone; together every
    `/visibility` raised a TypeError. The same Query asked twice must answer 200 both
    times, the second from the cache, with a `feature` key on every Occluder."""
    params = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 24}
    for _ in range(2):
        response = client.get("/visibility", params=params)
        assert response.status_code == 200, response.text
        payload = response.json()
        assert all("feature" in sample["occluder"] for sample in payload["horizon"]["samples"])
        assert all("feature" in event["occluder"] for event in payload["events"])
    assert "hit" in response.headers["Cache-Status"]


def test_light_routes_answer_while_the_engine_is_saturated() -> None:
    """regression: every engine run waits on a semaphore of 2, but it
    waits inside the server's thread pool, where /meta, /health and /sites also ran. A
    burst of uncached custom Sites filled the pool and /meta took 6 s locally; on the
    VPS, with 2 runs of 1.5 to 7 s, it would take minutes and fail the health check.

    42 custom Sites (more than the 40 threads) go in at once through the ASGI app with its real thread pool, then
    /meta and /health must answer within a second.
    """
    import asyncio
    import time

    import httpx

    async def burst() -> tuple[float, float]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as api:
            heavy = [
                asyncio.create_task(
                    api.get(
                        "/visibility",
                        params={
                            "latitude_deg": -89.3,
                            "longitude_deg": 7.0 * i - 170.0,
                            "start": "2025-03-01T00:00:00Z",
                            "duration_hours": 200,
                        },
                        timeout=600,
                    )
                )
                for i in range(42)
            ]
            await asyncio.sleep(1.0)
            began = time.monotonic()
            meta = await api.get("/meta")
            meta_seconds = time.monotonic() - began
            began = time.monotonic()
            health = await api.get("/health")
            health_seconds = time.monotonic() - began
            assert meta.status_code == 200 and health.status_code == 200
            await asyncio.gather(*heavy)
            return meta_seconds, health_seconds

    meta_seconds, health_seconds = asyncio.run(burst())
    assert meta_seconds < 1.0, meta_seconds
    assert health_seconds < 1.0, health_seconds


def test_meta_names_each_dem_product_once(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # after the implementation: /meta listed LDEM_60S_240MPP_ADJ twice on the VPS, once for the
    # polar ladder and once for Chandrayaan-3's own window of the same product.
    fixtures = Path(__file__).resolve().parents[2] / "fixtures" / "dem"
    for tif in fixtures.glob("*.TIF"):
        (tmp_path / tif.name).symlink_to(tif)
    window = tmp_path / "offpole" / "CH3"
    window.mkdir(parents=True)
    (window / "LDEM_60S_240MPP_ADJ.TIF").symlink_to(fixtures / "LDEM_60S_240MPP_ADJ.TIF")
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    products = [dem["product"] for dem in client.get("/meta").json()["dems"]]
    assert "LDEM_60S_240MPP_ADJ" in products
    assert len(products) == len(set(products)), products


def test_a_full_engine_queue_answers_503_busy_instead_of_waiting_forever(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # implementation check: with every engine slot taken, /visibility queued with no
    # limit until Cloudflare cut it at 100 s (524). Now a visitor that waits too long gets
    # 503 busy with Retry-After; cached answers, /meta and /health stay instant.
    import random
    import time
    from concurrent.futures import ThreadPoolExecutor

    monkeypatch.setenv("LUNAR_QUEUE_WAIT_SECONDS", "0.3")
    start = "2026-11-13T00:00:00Z"
    cached = {"site_id": "001", "start": start, "duration_hours": 24}
    assert client.get("/visibility", params=cached).status_code == 200

    def cold() -> Any:
        # A fresh coordinate each time, so no cached mask makes it quick.
        lon = random.uniform(-179, 179)
        return client.get(
            "/visibility",
            params={"latitude_deg": -89.4, "longitude_deg": lon, "start": start},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        runs = [pool.submit(cold) for _ in range(2)]
        time.sleep(0.15)
        third = cold()
        t0 = time.monotonic()
        meta = client.get("/meta")
        health = client.get("/health")
        hit = client.get("/visibility", params=cached)
        quick = time.monotonic() - t0
        assert all(run.result().status_code == 200 for run in runs)

    assert third.status_code == 503
    assert third.headers["retry-after"] == "10"
    assert third.headers["content-type"].startswith("application/problem+json")
    assert third.json()["code"] == "busy"
    assert meta.status_code == health.status_code == 200
    assert hit.status_code == 200 and hit.headers["cache-status"] == "lunar-api; hit"
    assert quick < 1.0


def test_the_exact_pole_casts_rays_in_every_direction() -> None:
    """regression: at latitude -90 exactly, the great-circle step has
    cos(lat) = 0, so every bearing left along the same meridian and the 720 rays fell on
    3 points. The mask max came out 10.86° against 11.37° 11 cm away.

    The Observer 0.11 m off the pole must see the same horizon as the pole itself.
    """
    params = {"longitude_deg": 0, "start": "2026-11-14T00:00:00Z", "duration_hours": 24}
    pole = visibility({**params, "latitude_deg": -90})
    near = visibility({**params, "latitude_deg": -89.999999})
    spots = {
        (round(s["occluder"]["latitude_deg"], 5), round(s["occluder"]["longitude_deg"], 2))
        for s in pole["horizon"]["samples"]
    }
    assert len(spots) > 600, len(spots)
    for a, b in zip(pole["horizon"]["samples"], near["horizon"]["samples"], strict=True):
        assert abs(a["elevation_deg"] - b["elevation_deg"]) < 0.05, (a, b)


def test_the_answer_cache_has_a_byte_budget(monkeypatch: Any) -> None:
    """regression: the cache was capped at 300 answers, not bytes, so
    300 Windows of 1440 h (1.7 MB each) at Curated Sites could hold about 510 MB in a
    container with no memory limit.

    With a budget of one answer, the second distinct Query pushes the first one out: asking
    the first again is a miss, which Cache-Status shows from outside.
    """
    from app import cache

    monkeypatch.setattr(cache, "MAX_BYTES", 1)
    first = {"site_id": "CR07", "start": "2026-11-09T00:00:00Z", "duration_hours": 24}
    second = {**first, "duration_hours": 25}
    assert client.get("/visibility", params=first).status_code == 200
    assert client.get("/visibility", params=second).status_code == 200
    again = client.get("/visibility", params=first)
    assert "fwd=miss" in again.headers["cache-status"], again.headers["cache-status"]


def test_shutdown_stops_the_warming_thread_between_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    # regression: the stop flag was only read after the thread had
    # warmed every Site in its list, so after shutdown it kept computing and held an
    # engine slot; the next test found the queue full and got 503.
    import threading

    from app import cache

    monkeypatch.setenv("LUNAR_WARM_CACHE", "CR04,CR05,CR01")
    with TestClient(app):
        pass
    for thread in threading.enumerate():
        if thread.name == "warm-cache":
            thread.join(timeout=120)
    with cache._lock:
        warmed = {key[0] for key in cache._entries}
    # At most the job that was running when the app stopped.
    assert len(warmed & {"CR04", "CR05", "CR01"}) <= 1


def test_one_address_over_the_per_ip_cap_gets_busy_and_others_do_not(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # nothing stopped one client from filling the
    # engine queue. Over the cap it gets the contract's 503 busy, with Retry-After and
    # CORS headers so the page can say so; another address is not affected.
    monkeypatch.setenv("LUNAR_IP_LIMIT_PER_MINUTE", "3")
    limited = TestClient(app)
    query = {**MARCH_2025, "duration_hours": 24}
    one = {"CF-Connecting-IP": "198.51.100.7", "Origin": "https://lunar.luizfbm.win"}
    answers = [limited.get("/visibility", params=query, headers=one) for _ in range(4)]
    # Under the cap the engine answers as usual (200 in CI; 422 where the DEM windows of
    # fixtures/ are missing); only the cap gives 503 here.
    assert [a.status_code == 503 for a in answers] == [False, False, False, True]
    assert answers[3].json()["code"] == "busy"
    assert 1 <= int(answers[3].headers["Retry-After"]) <= 61
    assert answers[3].headers["access-control-allow-origin"] == "https://lunar.luizfbm.win"
    other = limited.get("/visibility", params=query, headers={"CF-Connecting-IP": "203.0.113.9"})
    assert other.status_code != 503
    # The light routes never count.
    assert limited.get("/meta", headers=one).status_code == 200


def test_a_landing_scatter_at_the_pole_spreads_its_points_around_it() -> None:
    # during a regression, building the implementation (Landing scatter): from a Site at exactly -90° every
    # bearing of the great-circle step leaves along one meridian, so the 18 points fell
    # on a few longitudes. Each must sit at its distance from the pole and at its
    # azimuth from the Site as the engine places it, 1e-6° (3 cm) off the pole along
    # its longitude, where local north is defined (horizon.POLE_LATITUDE_DEG).
    import math

    response = client.get(
        "/visibility/scatter",
        params={
            "latitude_deg": -90,
            "longitude_deg": 0,
            "start": "2026-11-26T00:00:00Z",
            "duration_hours": 24,
            "radius_m": 40,
        },
    )
    assert response.status_code == 200, response.text
    phi1 = math.radians(-90.0 + 1e-6)
    for point in response.json()["points"][1:]:
        from_pole = 1_737_400.0 * math.radians(point["latitude_deg"] + 90.0)
        assert abs(from_pole - point["distance_m"]) <= 0.1, point
        # Initial bearing, the inverse of the engine's forward step.
        phi2 = math.radians(point["latitude_deg"])
        dlon = math.radians(point["longitude_deg"])
        bearing = math.degrees(
            math.atan2(
                math.sin(dlon) * math.cos(phi2),
                math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlon),
            )
        )
        gap = abs((bearing - point["azimuth_deg"] + 180.0) % 360.0 - 180.0)
        assert gap <= 0.05, point


def test_a_year_month_without_sun_and_earth_time_is_still_written_as_a_float() -> None:
    # during a regression, the implementation: moving the year's clipping into app/spans.py made an empty clip
    # sum to the int 0, so /sites/{site_id}/year wrote "sun_and_earth_hours":0 where it
    # had written 0.0. The answer must stay byte-identical. CR01 at ground level has no
    # Sun-and-Earth time in October 2024.
    raw = client.get("/sites/CR01/year", params={"year": 2024, "observer_height_m": 0}).text
    assert '"sun_and_earth_hours":0.0' in raw
    assert not any(f'_hours":0{end}' in raw for end in ",}")
    # And the committed example still comes out of the engine byte for byte.
    example = Path(__file__).resolve().parents[2] / "contract" / "examples"
    value = json.loads((example / "site-year-001-2027.example.json").read_text())["value"]
    year = client.get("/sites/001/year", params={"year": 2027})
    assert year.content == json.dumps(value, separators=(",", ":")).encode()


def test_typical_is_the_earliest_window_with_the_median_sun_and_earth_time() -> None:
    # during a regression, the implementation: typical was the lower median of the Windows sorted by hours, so
    # when several Windows shared the median value it could be a later one. At Site 001
    # from 14 November 2026 the Windows shifted -10 to 0 days all have the median value,
    # and ties go to the earlier Window.
    answer = client.get("/sites/001/windows", params={"start": "2026-11-14T00:00:00Z"}).json()
    rows = answer["windows"]
    median = sorted(w["sun_and_earth_hours"] for w in rows)[(len(rows) - 1) // 2]
    tied = [w["shift_days"] for w in rows if w["sun_and_earth_hours"] == median]
    assert len(tied) > 1
    assert answer["typical"]["shift_days"] == tied[0]


# --- /assistant (the requirement) --------------------------------------------------------------

ASSISTANT_QUERY = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 240}


def _ask_assistant(question: str) -> dict[str, Any]:
    body = {
        "messages": [{"role": "user", "content": question}],
        "lang": "en",
        "query": ASSISTANT_QUERY,
    }
    response = client.post("/assistant", json=body)
    assert response.status_code == 200, response.text
    reply: dict[str, Any] = response.json()
    return reply


@pytest.mark.usefixtures("fresh_assistant")
def test_a_count_out_of_a_total_is_two_numbers_not_a_date_in_october(monkeypatch: Any) -> None:
    # during a regression, while building the tracer: "out" is also the Portuguese short form of
    # October, so "8 out of 12 checks pass" was read as 8 October and reported untraced.
    def write(body: dict[str, Any]) -> dict[str, Any]:
        checks = tool_results(body)[0]
        return completion(f"{checks['passed']} out of {checks['total']} checks pass.")

    install(monkeypatch, completion(tool_calls=[call("list_validations", {})]), write)
    reply = _ask_assistant("Is this validated?")
    validations = client.get("/validations").json()
    passed = sum(1 for v in validations if v["status"] == "passed")
    assert reply["answer"] == f"{passed} out of {len(validations)} checks pass."
    assert reply["numbers"] == {"total": 2, "traced": 2, "untraced": []}


@pytest.mark.usefixtures("fresh_assistant")
def test_a_sentence_ending_in_set_does_not_make_the_next_number_a_date(monkeypatch: Any) -> None:
    # during a regression, same day: "set." is the Portuguese short form of September, so "the Sun
    # never set. 2 m is ..." was read as 2 September. The 2 m is the Observer height.
    install(
        monkeypatch, completion("Seen from the mast the Sun never set. 2 m is the Observer height.")
    )
    reply = _ask_assistant("Does the Sun set?")
    assert reply["numbers"] == {"total": 1, "traced": 1, "untraced": []}


@pytest.mark.usefixtures("fresh_assistant")
def test_the_offline_ladder_does_not_contrast_two_equal_numbers() -> None:
    # regression: at Site 001 every rung gives the same Sun-and-Earth time, and the offline
    # answer read "it is 9.9 days; with only the 240 m map it would be 9.9 days".
    ladder = client.get("/visibility/ladder", params=ASSISTANT_QUERY).json()
    hours = sorted(
        (rung["resolution_m"], rung["metrics"]["sun_and_earth_hours"]) for rung in ladder["rungs"]
    )
    fine, coarse = hours[0][1], hours[-1][1]
    reply = _ask_assistant("How much does the terrain resolution change the answer?")
    # Since the implementation the answer writes durations as the panel does ("9 d 23 h").
    same = _app_span(round(fine * 3600, 3)) == _app_span(round(coarse * 3600, 3))
    assert ("would be" in reply["answer"]) is not same


@pytest.mark.usefixtures("fresh_assistant")
def test_offline_durations_are_rounded_once_from_the_engine_value() -> None:
    # during a regression, while making the contract example: at CR01 the Sun sets 4.3511 h into
    # the Window, and the offline answer said "4.3 hours". The tool had rounded to 4.35
    # and the sentence rounded that again; the tracer let it through, since 4.3 is 4.35
    # shown to one decimal. Since the implementation the answer writes the panel's "4 h 21 min", taken
    # once from the engine's instant.
    query: dict[str, Any] = {
        "site_id": "CR01",
        "start": "2026-11-20T12:00:00Z",
        "duration_hours": 240,
    }
    events = visibility(query)["events"]
    sunset = next(e for e in events if e["type"] == "sunset")
    after = _app_span(
        (
            datetime.fromisoformat(sunset["t"]) - datetime.fromisoformat(query["start"])
        ).total_seconds()
    )
    body = {"messages": [{"role": "user", "content": "When does the Sun set?"}], "lang": "en"}
    reply = client.post("/assistant", json={**body, "query": query}).json()
    assert f", {after} after the start of the Window" in reply["answer"], (after, reply["answer"])


@pytest.mark.usefixtures("fresh_assistant")
def test_a_null_query_is_rejected_like_any_value_outside_the_schema() -> None:
    # during a regression, schemathesis (ST201): "query": null was taken as no Query, but the
    # contract allows the field to be left out, never to be null.
    body = {"messages": [{"role": "user", "content": "0"}], "lang": "en", "query": None}
    response = client.post("/assistant", json=body)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_parameter"


@pytest.mark.usefixtures("fresh_assistant")
def test_a_body_that_is_not_json_gets_the_contracts_422() -> None:
    # during a regression, schemathesis (ST103): bytes that are not JSON got FastAPI's own 400,
    # which the contract does not document for /assistant.
    for raw in (b"\xd8\xbbbH\xa9\x9a4\x03\r", b"{", b"[1, 2]", b"null"):
        response = client.post(
            "/assistant", content=raw, headers={"content-type": "application/json"}
        )
        assert response.status_code == 422, (raw, response.status_code)
        assert response.headers["content-type"] == "application/problem+json"
        assert response.json()["code"] == "invalid_parameter"


@pytest.mark.usefixtures("fresh_assistant")
def test_the_model_is_asked_with_no_sampling_parameter(monkeypatch: pytest.MonkeyPatch) -> None:
    # Validation check: every request carried `temperature: 0`.
    # OpenRouter's model list has no `temperature` among the supported parameters of the
    # Claude 5.5 models the server is set to use, and a provider that rejects it would
    # send every question to offline mode without a sound.
    model = install(monkeypatch, completion("The Sun is up for the whole Window."))
    body = {"messages": [{"role": "user", "content": "Is the Sun up?"}], "lang": "en"}
    reply = client.post("/assistant", json={**body, "query": NOVEMBER_2026}).json()
    assert reply["mode"] == "model", reply
    assert not {"temperature", "top_p", "top_k"} & set(model.bodies[0]), sorted(model.bodies[0])


# The routes that run the engine. Each one waits at the engine gate, so each one can be busy.
ENGINE_PATHS = (
    "/visibility",
    "/visibility/ladder",
    "/visibility/flat",
    "/visibility/scatter",
    "/visibility/energy",
    "/visibility/dsn",
    "/sites/{site_id}/year",
    "/sites/{site_id}/windows",
    "/terrain/heights",
)


def test_every_engine_route_in_the_contract_documents_the_busy_answer() -> None:
    # Validation check: merging main into a branch dropped the 503
    # `busy` answer from /visibility/energy in the contract. No gate noticed, because
    # schemathesis only checks the answers the server gives, and a test run is never busy.
    contract = Path(__file__).resolve().parents[2] / "contract" / "openapi.yaml"
    paths = contract.read_text("utf-8").split("\npaths:\n", 1)[1].split("\ncomponents:\n", 1)[0]
    blocks: dict[str, str] = {}
    for line in paths.splitlines():
        if line.startswith("  /") and line.endswith(":"):
            name = line.strip()[:-1]
            blocks[name] = ""
        elif blocks:
            blocks[name] += line + "\n"
    present = [path for path in ENGINE_PATHS if path in blocks]
    assert "/visibility" in present and "/visibility/energy" in present, sorted(blocks)
    silent = [path for path in present if "#/components/responses/Busy" not in blocks[path]]
    assert silent == []


def test_dsn_hours_with_nothing_to_add_are_still_floats() -> None:
    # during a regression, while building /visibility/dsn (the requirement): with no Earth-visible hour
    # left without a dish, `earth_without_station_hours` was Python's sum of nothing, the
    # integer 0, and went out as JSON `0` while every other hour field was a float. Read
    # in the raw bytes, since a JSON parser would hide the difference.
    response = client.get("/visibility/dsn", params={**NOVEMBER_2026, "duration_hours": 48})
    assert response.status_code == 200, response.text
    assert response.json()["earth_without_station_hours"] == 0
    assert b'"earth_without_station_hours":0.0,' in response.content


# --- /assistant tools (the requirement) --------------------------------------------------------

YEAR_QUESTION = {
    "messages": [{"role": "user", "content": "What is the best Window this year?"}],
    "lang": "en",
    "query": {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 24},
}


def _count_engine_runs(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    from app import engine

    runs: list[int] = []
    real = engine.calculate

    def counted(*args: Any, **kwargs: Any) -> Any:
        runs.append(1)
        return real(*args, **kwargs)

    monkeypatch.setattr(engine, "calculate", counted)
    return runs


@pytest.mark.usefixtures("fresh_assistant")
def test_a_question_about_a_cold_year_starts_no_engine_run(monkeypatch: pytest.MonkeyPatch) -> None:
    # during a regression, live run of the implementation: "which month is best" needed a cold year, the year took
    # the 20 s budget, the offline router asked for the same year again, and the answer
    # came after 36.9 s. A question now reads the year only if it is already computed.
    client.get("/visibility", params=YEAR_QUESTION["query"])
    runs = _count_engine_runs(monkeypatch)
    began = time.monotonic()
    reply = client.post("/assistant", json=YEAR_QUESTION).json()
    assert time.monotonic() - began < 2
    assert runs == []
    assert '"The year 2026 at this Site"' in reply["answer"]


@pytest.mark.usefixtures("fresh_assistant")
def test_a_question_does_not_wait_for_a_year_another_request_is_computing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # during a regression, same run: had the panel been computing that year, the question would
    # have waited on it all the same. It now says the number is not ready.
    from app import cache
    from app import year as year_module

    release = threading.Event()
    real = year_module.compute

    def slow(*args: Any, **kwargs: Any) -> Any:
        release.wait(10)
        return real(*args, **kwargs)

    monkeypatch.setattr(year_module, "compute", slow)
    panel = threading.Thread(
        target=lambda: TestClient(app).get("/sites/001/year", params={"year": 2026}), daemon=True
    )
    panel.start()
    for _ in range(200):
        if any(key[0] == "001/year" for key in list(cache._pending)):
            break
        time.sleep(0.01)
    timer = threading.Timer(5, release.set)
    timer.start()
    try:
        began = time.monotonic()
        reply = client.post("/assistant", json=YEAR_QUESTION).json()
        waited = time.monotonic() - began
    finally:
        release.set()
        timer.cancel()
        panel.join(60)
    assert waited < 2, waited
    assert '"The year 2026 at this Site"' in reply["answer"]


def test_the_cost_of_each_question_reaches_a_server_log_that_shows_only_warnings() -> None:
    # during a regression, live run of the implementation: the cost line was logged at INFO, and under uvicorn's
    # logging only warnings of app.* reached the server's log, so the run's cost was on
    # OpenRouter's page and not in ours. Run with uvicorn's own logging configuration.
    code = (
        "import logging.config, uvicorn.config\n"
        "logging.config.dictConfig(uvicorn.config.LOGGING_CONFIG)\n"
        "from fastapi.testclient import TestClient\n"
        "from app.main import app\n"
        "TestClient(app).post('/assistant', json={'messages': [{'role': 'user', "
        "'content': 'Is the ground flat enough?'}], 'lang': 'en', 'query': {'site_id': '001', "
        "'start': '2026-11-14T00:00:00Z', 'duration_hours': 24}})\n"
    )
    env = {**os.environ, "OPENROUTER_API_KEY": "", "LUNAR_ASSISTANT_IP_LIMIT_PER_MINUTE": "0"}
    run = subprocess.run(
        [sys.executable, "-c", code],
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )
    lines = [line for line in run.stderr.splitlines() if "assistant question" in line]
    assert len(lines) == 1, run.stderr
    assert "cost_usd=" in lines[0] and "tool_rounds=" in lines[0] and "mode=offline" in lines[0]


def test_a_page_on_another_origin_can_read_retry_after_on_a_busy_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # during a regression, found while mounting the assistant panel (the implementation): the app is served from
    # lunar.luizfbm.win and the API from lunar-api.luizfbm.win. The contract promises
    # Retry-After on every 503 busy and the server sent it, but a browser only lets a page
    # on another origin read the response headers named in Access-Control-Expose-Headers
    # (the Fetch standard's rule, nothing this code computes), and the server named none.
    monkeypatch.setenv("LUNAR_IP_LIMIT_PER_MINUTE", "1")
    limited = TestClient(app)
    query = {**MARCH_2025, "duration_hours": 24}
    page = {"CF-Connecting-IP": "198.51.100.23", "Origin": "https://lunar.luizfbm.win"}
    answers = [limited.get("/visibility", params=query, headers=page) for _ in range(2)]
    busy = answers[1]
    assert busy.status_code == 503
    assert busy.headers["Retry-After"]
    exposed = busy.headers.get("access-control-expose-headers", "")
    assert "retry-after" in {name.strip().lower() for name in exposed.split(",")}


# --- /assistant validation ------------------------------------------------
# Ten live questions on the default Query.

LIVE_QUERY = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 240}


def _ask_with(
    monkeypatch: pytest.MonkeyPatch,
    steps: list[Any],
    question: str = "?",
    lang: str = "en",
    query: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], Any]:
    scripted = install(monkeypatch, *steps)
    body = {
        "messages": [{"role": "user", "content": question}],
        "lang": lang,
        "query": query or LIVE_QUERY,
    }
    response = client.post("/assistant", json=body)
    assert response.status_code == 200, response.text
    reply: dict[str, Any] = response.json()
    return reply, scripted


@pytest.mark.usefixtures("fresh_assistant")
def test_a_portuguese_question_asks_the_model_for_the_portuguese_of_brazil(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # "E se o lançamento atrasar um mês?" came back with "arranque", "Janela planeada" and
    # "o utilizador": Portuguese from Portugal, in an app that speaks Brazilian Portuguese.
    _, scripted = _ask_with(monkeypatch, [completion("Ok.")], "E se atrasar?", "pt")
    system = scripted.bodies[0]["messages"][0]["content"]
    assert "Portuguese of Brazil" in system and "never the Portuguese of Portugal" in system
    for brazil, portugal in (("início", "arranque"), ("planejada", "planeada")):
        assert f'"{brazil}", not "{portugal}"' in system
    assert '"usuário", not "utilizador"' in system


@pytest.mark.usefixtures("fresh_assistant")
def test_the_windows_tool_reads_the_slip_the_user_names(monkeypatch: pytest.MonkeyPatch) -> None:
    # "What if the launch slips a month?" got "the tool does not return the value for the
    # start exactly one month later": +30 days is inside the route's -30 to +150, but the
    # tool gave only the best, typical and worst starts.
    truth = client.get("/sites/001/windows", params={**LIVE_QUERY, "observer_height_m": 2})
    assert truth.status_code == 200, truth.text
    month_late = next(w for w in truth.json()["windows"] if w["shift_days"] == 30)
    steps = [
        completion(tool_calls=[call("get_site_windows", {"shift_days": 30})]),
        completion("Ok."),
    ]
    _, scripted = _ask_with(monkeypatch, steps, "What if the launch slips a month?")
    result = tool_results(scripted.bodies[1])[0]
    assert result["at_shift"]["shift_days"] == 30
    assert result["at_shift"]["start"] == month_late["start"]
    assert result["at_shift"]["sun_and_earth_time"]["hours"] == round(
        month_late["sun_and_earth_hours"], 2
    )
    assert 30 in [row["shift_days"] for row in result["every_30_days"]]


def _decimals(value: Any) -> list[float]:
    """Every `hours` value in a tool's answer."""
    found: list[float] = []
    if isinstance(value, dict):
        for key, item in value.items():
            if key == "hours" and isinstance(item, float):
                found.append(item)
            else:
                found += _decimals(item)
    elif isinstance(value, list):
        for item in value:
            found += _decimals(item)
    return found


@pytest.mark.usefixtures("fresh_assistant")
def test_the_model_is_handed_durations_to_two_decimals(monkeypatch: pytest.MonkeyPatch) -> None:
    # The same answer wrote "390,0567 horas" and "224,7408 horas": the tools handed the
    # model four decimals, and every other answer rounds to two.
    client.get("/sites/001/windows", params={**LIVE_QUERY, "observer_height_m": 2})
    steps = [completion(tool_calls=[call("get_site_windows", {})]), completion("Ok.")]
    _, scripted = _ask_with(monkeypatch, steps)
    durations = _decimals(tool_results(scripted.bodies[1])[0])
    assert durations
    assert all(value == round(value, 2) for value in durations), durations


@pytest.mark.usefixtures("fresh_assistant")
def test_the_dish_size_in_a_dsn_answer_is_traced(monkeypatch: pytest.MonkeyPatch) -> None:
    # "all three 70 m dishes" flagged 70 as untraced: the dish size is a constant of the
    # route, so the tool must give it.
    steps = [
        completion(tool_calls=[call("get_visibility_dsn", {})]),
        completion("All three 70 m dishes can hear the Site."),
    ]
    reply, _ = _ask_with(monkeypatch, steps, "Can a dish on Earth hear this Site?")
    assert reply["numbers"] == {"total": 1, "traced": 1, "untraced": []}


@pytest.mark.usefixtures("fresh_assistant")
def test_the_nearest_shadow_says_it_comes_from_the_shadow_map(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # The nearest permanently shadowed region was explained as coming "from the terrain
    # analysis in a 100 m radius at 20 m": the distance and the azimuth come from the PSR
    # map (60 m cells), not from the Slope's radius or DEM. Each part now names its source.
    from tests.test_psr import PRODUCT, SITE, PsrMap, destination

    path = tmp_path / f"{PRODUCT}.TIF"
    monkeypatch.setenv("LUNAR_PSR_MAP", str(path))
    psr = PsrMap(950)
    psr.shade(destination(SITE, 137.0, 7_300.0))
    psr.write(path)
    query = {"latitude_deg": SITE[0], "longitude_deg": SITE[1], "start": LIVE_QUERY["start"]}
    steps = [completion(tool_calls=[call("get_terrain", {})]), completion("Ok.")]
    _, scripted = _ask_with(monkeypatch, steps, "How far is the ice?", query=query)
    result = tool_results(scripted.bodies[1])[0]
    shadow, ground = result["permanent_shadow"], result["slope"]
    assert shadow["map"] == PRODUCT and shadow["map_cell_m"] == 60.0
    assert "not the Slope" in shadow["source"]
    assert ground["dem"]["product"] != PRODUCT and ground["radius_m"] == 100


@pytest.mark.usefixtures("fresh_assistant")
def test_a_named_slip_gets_its_rank_not_the_count_of_start_days(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Validation check: "What if the launch slips by 45 days?" got "That
    # start day ranks 181st among the start days measured". 181 was start_days_ranked, the
    # count; the tool gave no rank, so the model made one and the tracer passed it.
    query = {"site_id": "001", "start": "2026-11-14T00:00:00Z", "duration_hours": 708.73}
    truth = client.get("/sites/001/windows", params={**query, "observer_height_m": 2})
    assert truth.status_code == 200, truth.text
    windows = truth.json()["windows"]
    named = next(w for w in windows if w["shift_days"] == 45)
    more = sum(1 for w in windows if w["sun_and_earth_hours"] > named["sun_and_earth_hours"])
    steps = [
        completion(tool_calls=[call("get_site_windows", {"shift_days": 45})]),
        completion("Ok."),
    ]
    _, scripted = _ask_with(monkeypatch, steps, "What if the launch slips by 45 days?", query=query)
    result = tool_results(scripted.bodies[1])[0]
    assert result["at_shift"]["rank"] == more + 1
    assert result["at_shift"]["out_of"] == len(windows)
    planned = next(w for w in windows if w["shift_days"] == 0)
    above = sum(1 for w in windows if w["sun_and_earth_hours"] > planned["sun_and_earth_hours"])
    assert result["as_planned"]["rank"] == above + 1
    assert "start_days_ranked" not in result


# --- The assistant counts like the screen (the requirement) -----------------------------------
# Validation check: asked when the Sun sets at Haworth HW03, the assistant said
# "19 November... 5.98 days after the start", while the panel writes "5 d 23 h" and the
# headline counts from the Cursor. Durations now come in the app's format, and every
# answer says it counts from the start of the Window.


def _app_span(seconds: float) -> str:
    """The panel's format (frontend formatSpan): whole minutes, rounded down."""
    days, rest = divmod(int(seconds // 60), 24 * 60)
    hours, minutes = divmod(rest, 60)
    if days:
        return f"{days} d {hours} h"
    return f"{hours} h {minutes} min" if hours else f"{minutes} min"


def _first_sunset_after_start(query: dict[str, Any]) -> str:
    payload = visibility(query)
    sunset = next(e for e in payload["events"] if e["type"] == "sunset")
    start = datetime.fromisoformat(payload["query"]["start"])
    return _app_span((datetime.fromisoformat(sunset["t"]) - start).total_seconds())


@pytest.mark.usefixtures("fresh_assistant")
@pytest.mark.parametrize(
    ("lang", "starting_point"),
    [("en", "after the start of the Window"), ("pt", "depois do início da Janela")],
)
def test_an_offline_duration_is_in_the_app_format_and_names_where_it_counts_from(
    lang: str, starting_point: str
) -> None:
    expected = _first_sunset_after_start(SETS_IN_NOVEMBER_2026)
    assert " d " in expected  # days long, the case represented as "5.98 days"
    question = "When does the Sun set?" if lang == "en" else "Quando o Sol se põe?"
    body = {"messages": [{"role": "user", "content": question}], "lang": lang}
    reply = client.post("/assistant", json={**body, "query": SETS_IN_NOVEMBER_2026}).json()
    assert reply["mode"] == "offline"
    assert f"{expected} {starting_point}" in reply["answer"], (expected, reply["answer"])
    assert not re.search(r"\d[.,]\d+\s*(days|dias)\b", reply["answer"]), reply["answer"]
    assert reply["numbers"]["untraced"] == [], reply


@pytest.mark.usefixtures("fresh_assistant")
def test_the_model_gets_durations_in_the_app_format_and_where_they_count_from(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = _first_sunset_after_start(SETS_IN_NOVEMBER_2026)

    def write(body: dict[str, Any]) -> dict[str, Any]:
        after = tool_results(body)[0]["first_sunset"]["after_window_start"]
        return completion(f"The Sun sets {after['text']} after the start of the Window.")

    steps = [completion(tool_calls=[call("get_visibility", {})]), write]
    reply, scripted = _ask_with(
        monkeypatch, steps, "When does the Sun set?", query=SETS_IN_NOVEMBER_2026
    )
    after = tool_results(scripted.bodies[1])[0]["first_sunset"]["after_window_start"]
    # No decimal days left for the model to copy; the app's own words instead.
    assert set(after) == {"hours", "text"} and after["text"] == expected
    assert reply["answer"] == f"The Sun sets {expected} after the start of the Window."
    assert reply["numbers"]["untraced"] == [] and reply["numbers"]["total"] >= 2
    rules = scripted.bodies[0]["messages"][0]["content"]
    assert "5 d 23 h" in rules and "never as decimal days" in rules
    assert "from the start of the Window" in rules and "Cursor" in rules


_MOON_RADIUS_M = 1_737_400.0


def _bilinear(grid: Any, transform: Any, x: Any, y: Any) -> Any:
    """Bilinear height at map points, written for this test (the engine has its own)."""
    import numpy as np

    col = (x - transform.c) / transform.a - 0.5
    row = (y - transform.f) / transform.e - 0.5
    c0, r0 = np.floor(col).astype(int), np.floor(row).astype(int)
    fc, fr = col - c0, row - r0
    return (
        grid[r0, c0] * (1 - fc) * (1 - fr)
        + grid[r0, c0 + 1] * fc * (1 - fr)
        + grid[r0 + 1, c0] * (1 - fc) * fr
        + grid[r0 + 1, c0 + 1] * fc * fr
    )


# 15/11/2026: a typed point past the 80 m DEM's square (here 81°S, 10°E) answered 422
# outside-coverage, though the API takes typed points up to 80°S: the 80 m DEM is ±304 km
# around the pole and the rays walk it out to 100 km. The 60 m DEM, which reaches 60°S, walks
# those 5 to 100 km now (horizon.POLAR_WIDE). It runs only where the DEM folder has the 60 m
# DEM (LUNAR_DEM_DIR on the full data); the fixtures and CI do not.
_WIDE_DEM = horizon.dem_dir() / f"{horizon.WIDE_PRODUCT}.TIF"
_PAST_THE_SQUARE = (-81.0, 10.0)


def _polar_xy(latitude: Any, longitude: Any) -> tuple[Any, Any]:
    """South polar stereographic on the 1737.4 km sphere, written for this test."""
    import numpy as np

    rho = 2.0 * _MOON_RADIUS_M * np.tan(np.pi / 4.0 + latitude / 2.0)
    return rho * np.sin(longitude), rho * np.cos(longitude)


@pytest.mark.skipif(
    not _WIDE_DEM.is_file(),
    reason=f"{horizon.WIDE_PRODUCT}.TIF is not in the DEM folder ({horizon.dem_dir()})",
)
def test_a_typed_point_past_the_80_m_square_is_answered_by_the_60_m_dem() -> None:
    import math

    import numpy as np
    import rasterio
    from rasterio.windows import from_bounds  # type: ignore[import-untyped]

    payload = visibility(
        {
            "latitude_deg": _PAST_THE_SQUARE[0],
            "longitude_deg": _PAST_THE_SQUARE[1],
            "start": "2026-11-15T00:00:00Z",
        }
    )
    samples = payload["horizon"]["samples"]
    assert len(samples) == 720
    assert all(math.isfinite(s["elevation_deg"]) for s in samples)
    products = [d["product"] for d in payload["provenance"]["dems"]]
    assert products == ["LDEM_80S_20MPP_ADJ", horizon.WIDE_PRODUCT, "LDEM_60S_240MPP_ADJ"]

    # The same walk, written here: 20 m to 5 km, 60 m to 100 km, 240 m to 300 km.
    lat0, lon0 = (math.radians(v) for v in _PAST_THE_SQUARE)
    site_xy = _polar_xy(np.array(lat0), np.array(lon0))
    windows: dict[str, Any] = {}
    for product, reach in (
        ("LDEM_80S_20MPP_ADJ", 6_000.0),
        (horizon.WIDE_PRODUCT, 105_000.0),
        ("LDEM_60S_240MPP_ADJ", 305_000.0),
    ):
        with rasterio.open(horizon.dem_dir() / f"{product}.TIF") as dataset:
            window = (
                from_bounds(
                    float(site_xy[0]) - reach,
                    float(site_xy[1]) - reach,
                    float(site_xy[0]) + reach,
                    float(site_xy[1]) + reach,
                    dataset.transform,
                )
                .round_offsets()
                .round_lengths()
            )
            grid = dataset.read(1, window=window).astype(np.float64)
            windows[product] = (grid, dataset.window_transform(window))
    grid, transform = windows["LDEM_80S_20MPP_ADJ"]
    ground = float(_bilinear(grid, transform, site_xy[0], site_xy[1]))
    observer = ground + payload["query"]["observer_height_m"]
    up = np.array(
        [math.cos(lat0) * math.cos(lon0), math.cos(lat0) * math.sin(lon0), math.sin(lat0)]
    )
    east = np.array([-math.sin(lon0), math.cos(lon0), 0.0])
    north = np.cross(up, east)

    def walk(azimuth: float) -> float:
        bearing = math.radians(azimuth)
        heading = math.cos(bearing) * north + math.sin(bearing) * east
        best = -math.inf
        for product, steps in (
            ("LDEM_80S_20MPP_ADJ", ((0.1, 0.1, 500.0), (1.0, 501.0, 5_000.0))),
            (horizon.WIDE_PRODUCT, ((10.0, 5_010.0, 100_000.0),)),
            ("LDEM_60S_240MPP_ADJ", ((50.0, 100_050.0, 300_000.0),)),
        ):
            g, t = windows[product]
            d = np.concatenate([np.arange(low, high, step) for step, low, high in steps])
            theta = d / _MOON_RADIUS_M
            point = up[None, :] * np.cos(theta)[:, None] + heading[None, :] * np.sin(theta)[:, None]
            x, y = _polar_xy(np.arcsin(point[:, 2]), np.arctan2(point[:, 1], point[:, 0]))
            r = _MOON_RADIUS_M + _bilinear(g, t, x, y)
            elevation = np.degrees(
                np.arctan2(r * np.cos(theta) - (_MOON_RADIUS_M + observer), r * np.sin(theta))
            )
            best = max(best, float(np.max(elevation)))
        return best

    # The walk can only miss a peak the engine's zoom finds: never above it, under it by little.
    for azimuth in (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0):
        engine = samples[round(azimuth / 0.5)]["elevation_deg"]
        independent = walk(azimuth)
        assert independent - 0.0005 <= engine <= independent + 0.003, (azimuth, engine, independent)


# 15/11/2026, the 17 mission Sites: Apollo 15 (3.6°E), Surveyor 6 (1.4°W) and Surveyor 7
# (11.5°W) answered 422 outside-coverage. SLDEM2015's map has its seam at 0°E, where x jumps
# by a whole Moon; a ray that crossed it read x a world away from the Site's window. The
# engine now keeps x continuous around the Site and deploy/crop_offpole.py cuts windows that
# run on past the seam, with the other side's pixels (the far window of the three was also
# labelled 275 km from where its heights were). The windows are cut data, not in git.
SEAM_SITES = {
    "APOLLO15": (26.13239, 3.6333),
    "SURVEYOR6": (0.4742, -1.4275),
    "SURVEYOR7": (-40.9812, -11.5127),
}
_OFFPOLE = Path(__file__).resolve().parents[2] / "fixtures" / "dem" / "offpole"
_SEAM_WINDOWS = [
    _OFFPOLE / site / f"{product}.TIF"
    for site in SEAM_SITES
    for product in ("SLDEM2015_512", "SLDEM2015_128")
]
_NO_WINDOWS = (
    "the off-pole DEM windows of Apollo 15, Surveyor 6 and Surveyor 7 are not in "
    f"{_OFFPOLE} (cut by deploy/crop_offpole.py, gitignored): "
    + ", ".join(str(w.relative_to(_OFFPOLE)) for w in _SEAM_WINDOWS if not w.is_file())
)


def _ray_elevation_deg(
    site: tuple[float, float], azimuth_deg: float, observer_m: float, windows: dict[str, Any]
) -> tuple[float, float]:
    """The horizon elevation along one azimuth, read straight off the windows, and its distance.

    A great circle built from 3-D vectors (not the engine's destination formula), sampled every
    0.1 m to 500 m, 1 m to 5 km and 10 m to 100 km on the 512 window, every 50 m to 300 km on
    the 128 one. Peaks of a bilinear DEM sit on its nodes and a ray's elevation changes fast
    near the Site (a 25 m walk was 0.04° under the engine's zoom, a 1 m walk 0.009°, both at
    ridges 140 to 450 m out). The x of each
    point is the Site's x plus the radians between the two longitudes, so it runs on past
    +-pi*R across the seam, as the windows do.
    """
    import math

    import numpy as np

    lat, lon = math.radians(site[0]), math.radians(site[1])
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.cross(up, east)
    bearing = math.radians(azimuth_deg)
    heading = math.cos(bearing) * north + math.sin(bearing) * east
    site_x = _MOON_RADIUS_M * math.radians((site[1] % 360.0) - 180.0)
    best, where = -math.inf, 0.0
    for product, steps in (
        (
            "SLDEM2015_512",
            ((0.1, 0.1, 500.0), (1.0, 501.0, 5_000.0), (10.0, 5_010.0, 100_000.0)),
        ),
        ("SLDEM2015_128", ((50.0, 100_050.0, 300_000.0),)),
    ):
        grid, transform = windows[product]
        d = np.concatenate([np.arange(low, high, step) for step, low, high in steps])
        theta = d / _MOON_RADIUS_M
        point = up[None, :] * np.cos(theta)[:, None] + heading[None, :] * np.sin(theta)[:, None]
        p_lat = np.arcsin(point[:, 2])
        p_lon = np.arctan2(point[:, 1], point[:, 0])
        dlon = (p_lon - lon + math.pi) % (2.0 * math.pi) - math.pi
        terrain = _bilinear(grid, transform, site_x + _MOON_RADIUS_M * dlon, _MOON_RADIUS_M * p_lat)
        r = _MOON_RADIUS_M + terrain
        elevation = np.degrees(
            np.arctan2(r * np.cos(theta) - (_MOON_RADIUS_M + observer_m), r * np.sin(theta))
        )
        k = int(np.argmax(elevation))
        if elevation[k] > best:
            best, where = float(elevation[k]), float(d[k])
    return best, where


@pytest.mark.skipif(not all(w.is_file() for w in _SEAM_WINDOWS), reason=_NO_WINDOWS)
@pytest.mark.parametrize("site_id", list(SEAM_SITES))
def test_sites_near_the_sldem_seam_answer_with_a_horizon_that_matches_the_dem(
    site_id: str,
) -> None:
    import math

    import numpy as np
    import rasterio

    payload = visibility({"site_id": site_id, "start": "2026-11-15T00:00:00Z"})
    samples = payload["horizon"]["samples"]
    assert len(samples) == 720
    assert all(math.isfinite(s["elevation_deg"]) for s in samples)
    assert all(0 < s["occluder"]["distance_m"] <= 300_000 for s in samples)

    windows: dict[str, Any] = {}
    for product in ("SLDEM2015_512", "SLDEM2015_128"):
        with rasterio.open(_OFFPOLE / site_id / f"{product}.TIF") as dataset:
            windows[product] = (dataset.read(1).astype(np.float64), dataset.transform)
    site = SEAM_SITES[site_id]
    # The Observer height of the default Query is 2 m; the Site's own ground comes from the
    # finest window, read at the Site.
    grid, transform = windows["SLDEM2015_512"]
    site_x = _MOON_RADIUS_M * math.radians((site[1] % 360.0) - 180.0)
    ground = float(_bilinear(grid, transform, site_x, _MOON_RADIUS_M * math.radians(site[0])))
    observer = ground + payload["query"]["observer_height_m"]

    # The walk can only miss a peak the engine's zoom finds, so it is never above the engine
    # and under it by little. Eight azimuths all round: some rays cross 0°E, some do not.
    for azimuth in (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0):
        sample = samples[round(azimuth / 0.5)]
        independent, _ = _ray_elevation_deg(site, azimuth, observer, windows)
        assert independent - 0.0005 <= sample["elevation_deg"] <= independent + 0.003, (
            azimuth,
            sample["elevation_deg"],
            independent,
        )


def test_every_route_that_answers_422_lets_schemathesis_expect_it() -> None:
    # Found on 15/11/2026 in the integration branch: /visibility/uncertainty (ADR 0006)
    # answers 422 for a Window outside the engine's coverage, as /visibility does, and the
    # contract documents it, but schemathesis.toml had no entry for the new route. JSON
    # Schema can't say "2025 to 2032", so schemathesis sent a Window in 2000, got the 422
    # and failed ST202 on CI. Every route whose contract documents the 422 needs the entry.
    import tomllib

    root = Path(__file__).resolve().parents[2]
    paths = (root / "contract" / "openapi.yaml").read_text("utf-8")
    paths = paths.split("\npaths:\n", 1)[1].split("\ncomponents:\n", 1)[0]
    documented: set[str] = set()
    path = method = ""
    for line in paths.splitlines():
        if line.startswith("  /") and line.endswith(":"):
            path = line.strip()[:-1]
        elif re.fullmatch(r"    (get|post|put|patch|delete):", line):
            method = line.strip()[:-1].upper()
        elif "#/components/responses/Unprocessable" in line:
            documented.add(f"{method} {path}")
    assert "GET /visibility" in documented and "GET /visibility/uncertainty" in documented

    config = tomllib.loads((root / "schemathesis.toml").read_text("utf-8"))
    expected = {
        operation["include-name"]: operation["checks"]["positive_data_acceptance"][
            "expected-statuses"
        ]
        for operation in config.get("operations", [])
        if "positive_data_acceptance" in operation.get("checks", {})
    }
    missing = sorted(name for name in documented if "422" not in expected.get(name, []))
    assert missing == []


# 15/11/2026: GET /terrain/heights reads up to 511 x 511 pixels and builds a JSON of about
# 260 000 integers (~900 MB at peak, in a container of 4.5 GB). It first went in with no per-IP
# cap and no engine slot, so one client could ask for ten grids at once beside a full set of
# engine runs. Over the cap it answers what every engine route does: 503 busy with Retry-After.
def test_terrain_heights_is_counted_by_the_per_ip_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LUNAR_IP_LIMIT_PER_MINUTE", "2")
    one = {"CF-Connecting-IP": "198.51.100.77", "Origin": "https://lunar.luizfbm.win"}
    params = {"site_id": "001", "half_extent_m": 1000}
    answers = [client.get("/terrain/heights", params=params, headers=one) for _ in range(3)]
    # Under the cap the route answers as usual (200 with the DEM windows of fixtures/, 422
    # without them); only the cap gives 503 here.
    assert [a.status_code == 503 for a in answers] == [False, False, True]
    assert answers[2].json()["code"] == "busy"
    assert 1 <= int(answers[2].headers["Retry-After"]) <= 61
    assert answers[2].headers["access-control-allow-origin"] == "https://lunar.luizfbm.win"
    other = {"CF-Connecting-IP": "203.0.113.77"}
    assert client.get("/terrain/heights", params=params, headers=other).status_code != 503
    # /terrain, which reads a small window, stays out of the cap.
    assert client.get("/terrain", params={"site_id": "001"}, headers=one).status_code != 503


def test_terrain_heights_waits_for_an_engine_slot(monkeypatch: pytest.MonkeyPatch) -> None:
    from app import cache

    # Every slot taken: the grid is not built, the visitor gets 503 busy once the wait is up.
    monkeypatch.setattr(cache, "_gate", cache._Gate(0))
    monkeypatch.setenv("LUNAR_QUEUE_WAIT_SECONDS", "0.1")
    answer = client.get("/terrain/heights", params={"site_id": "001", "half_extent_m": 1000})
    assert answer.status_code == 503
    assert answer.json()["code"] == "busy"
    assert answer.headers["Retry-After"]


# 15/11/2026: a typed point north of 80°S answered 422 outside-coverage, so the globe could
# not land anywhere but the curated Sites and the south polar cap. With LOLA's global LDEM_128
# on the server (237 m, simple cylindrical centred on 180°E), the rays of a typed point between
# 70°S and 70°N walk it out to 300 km, across 0°E too (horizon.GLOBAL). It runs only where the
# DEM folder has LDEM_128 (LUNAR_DEM_DIR on the full data); the fixtures and CI do not.
_GLOBAL_DEM = horizon.dem_dir() / f"{horizon.GLOBAL_PRODUCT}.TIF"
# On 0°E itself, where the map's first column meets its last, and in the northern hemisphere.
_GLOBAL_POINTS = ((0.0, 0.05), (45.0, -100.0))


def _global_grid(site: tuple[float, float], reach_m: float) -> tuple[Any, Any, int, int]:
    """The LDEM_128 pixels around a point, columns taken modulo the map width (written here)."""
    import math

    import numpy as np
    import rasterio

    with rasterio.open(_GLOBAL_DEM) as dataset:
        transform, width = dataset.transform, dataset.width
        pixel = transform.a
        rows_reach = reach_m / pixel + 4
        cols_reach = reach_m / (pixel * math.cos(math.radians(abs(site[0]) + 10.0))) + 4
        col = (_MOON_RADIUS_M * math.radians((site[1] % 360.0) - 180.0) - transform.c) / pixel
        row = (transform.f - _MOON_RADIUS_M * math.radians(site[0])) / pixel
        c0, c1 = int(col - cols_reach), int(col + cols_reach)
        r0, r1 = max(0, int(row - rows_reach)), min(dataset.height, int(row + rows_reach))
        # Read the band of rows once per side of the seam and pick the columns modulo the width.
        lo, hi = c0 % width, (c1 - 1) % width
        if lo <= hi:
            strip = dataset.read(1, window=((r0, r1), (lo, hi + 1)))
            grid = strip[:, np.arange(c0, c1) % width - lo]
        else:
            right = dataset.read(1, window=((r0, r1), (lo, width)))
            left = dataset.read(1, window=((r0, r1), (0, hi + 1)))
            joined = np.concatenate([right, left], axis=1)
            index = np.arange(c0, c1) % width
            grid = joined[:, np.where(index >= lo, index - lo, index + (width - lo))]
    return grid.astype(np.float64), transform, c0, r0


@pytest.mark.skipif(
    not _GLOBAL_DEM.is_file(),
    reason=f"{horizon.GLOBAL_PRODUCT}.TIF is not in the DEM folder ({horizon.dem_dir()})",
)
@pytest.mark.parametrize("site", _GLOBAL_POINTS)
def test_a_typed_point_north_of_80s_is_answered_by_the_global_dem(
    site: tuple[float, float],
) -> None:
    import math

    import numpy as np

    payload = visibility(
        {"latitude_deg": site[0], "longitude_deg": site[1], "start": "2026-11-15T00:00:00Z"}
    )
    samples = payload["horizon"]["samples"]
    assert len(samples) == 720
    assert all(math.isfinite(s["elevation_deg"]) for s in samples)
    assert [d["product"] for d in payload["provenance"]["dems"]] == [horizon.GLOBAL_PRODUCT]
    assert client.get("/meta").json()["coverage"]["custom_max_latitude_deg"] == 90.0

    grid, transform, c0, r0 = _global_grid(site, 305_000.0)
    pixel = transform.a

    def height(x: Any, y: Any) -> Any:
        col = (x - transform.c) / pixel - 0.5 - c0
        row = (transform.f - y) / pixel - 0.5 - r0
        i, j = np.floor(row).astype(int), np.floor(col).astype(int)
        fr, fc = row - i, col - j
        return (
            grid[i, j] * (1 - fc) * (1 - fr)
            + grid[i, j + 1] * fc * (1 - fr)
            + grid[i + 1, j] * (1 - fc) * fr
            + grid[i + 1, j + 1] * fc * fr
        )

    lat, lon = math.radians(site[0]), math.radians(site[1])
    site_x = _MOON_RADIUS_M * math.radians((site[1] % 360.0) - 180.0)
    observer = float(height(np.array(site_x), np.array(_MOON_RADIUS_M * lat)))
    observer += payload["query"]["observer_height_m"]
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.cross(up, east)

    def walk(azimuth: float) -> float:
        bearing = math.radians(azimuth)
        heading = math.cos(bearing) * north + math.sin(bearing) * east
        # 0.1 m to 500 m as in the seam test: near the Site the elevation changes fast, and
        # a bilinear DEM's kinks make a 1 m walk miss by a few thousandths of a degree.
        d = np.concatenate(
            [
                np.arange(0.1, 500.0, 0.1),
                np.arange(500.0, 5_000.0, 1.0),
                np.arange(5_000.0, 300_000.0, 10.0),
            ]
        )
        theta = d / _MOON_RADIUS_M
        point = up[None, :] * np.cos(theta)[:, None] + heading[None, :] * np.sin(theta)[:, None]
        p_lat = np.arcsin(point[:, 2])
        dlon = (np.arctan2(point[:, 1], point[:, 0]) - lon + math.pi) % (2 * math.pi) - math.pi
        r = _MOON_RADIUS_M + height(site_x + _MOON_RADIUS_M * dlon, _MOON_RADIUS_M * p_lat)
        elevation = np.degrees(
            np.arctan2(r * np.cos(theta) - (_MOON_RADIUS_M + observer), r * np.sin(theta))
        )
        return float(np.max(elevation))

    # Never above the engine (its zoom finds the peaks a fixed walk can miss), under it by
    # little; the same tolerance as the seam test. Rays at 270° from 0.05°E cross 0°E.
    for azimuth in (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0):
        engine = samples[round(azimuth / 0.5)]["elevation_deg"]
        independent = walk(azimuth)
        assert independent - 0.0005 <= engine <= independent + 0.003, (azimuth, engine, independent)


def test_the_uncertainty_of_a_global_point_names_each_unvaried_dem_once(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 15/11/2026, found checking /visibility/uncertainty for a typed point over LDEM_128: the
    # global map is walked as two bands (near and far), and `uncovered` listed the DEM once
    # per band, ["LDEM_128", "LDEM_128"]. It is one DEM, with no error raster to vary.
    from tests.test_global_dem import _write_global

    _write_global(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    response = client.get(
        "/visibility/uncertainty",
        params={
            "latitude_deg": 10.0,
            "longitude_deg": 20.0,
            "start": "2026-11-15T00:00:00Z",
            "duration_hours": 24,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["uncovered"] == [horizon.GLOBAL_PRODUCT]


def test_the_sampling_step_argument_leaves_the_horizon_mask_as_it_was() -> None:
    """regression guard, 15/11/2026: the convergence check (validation/test_convergence.py)
    needed `horizon._compute` to take a step scale. Its default has to be the engine's
    answer: 720 rays every 0.5°, half a pixel along each. The expected elevations are the
    Site 001 mask at 2 m, read off the code before the argument existed (every 30th ray).
    """
    expected = [
        0.7246977,
        -0.0390404,
        -1.2253873,
        -1.6225507,
        -2.0754625,
        -1.485687,
        -1.1593553,
        -2.2465989,
        -1.6714597,
        -1.5624739,
        -2.2112717,
        -1.250739,
        -1.2956555,
        -0.7432153,
        -0.1958176,
        -0.9819816,
        -0.9530123,
        -1.6000338,
        -0.8342478,
        -0.5363619,
        -0.0686374,
        0.2632918,
        0.6462246,
        0.97551,
    ]
    payload = visibility({**MARCH_2025, "observer_height_m": 2})
    samples = payload["horizon"]["samples"]
    assert len(samples) == 720
    assert payload["horizon"]["azimuth_step_deg"] == 0.5
    assert [samples[i]["elevation_deg"] for i in range(0, 720, 30)] == pytest.approx(
        expected, abs=1e-6
    )
