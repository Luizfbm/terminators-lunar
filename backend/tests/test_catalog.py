"""The Curated Sites catalog and the cache, through the HTTP API only."""

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import cache
from app.main import app

client = TestClient(app)

# NASA's October 2024 list of nine Artemis III candidate regions, as named in
# Wueller et al. 2026, Table 1.
ARTEMIS_III_NINE = {"PCB", "HW", "MMA", "MMP", "MMO", "NR1", "NR2", "dGR2", "SP"}


def test_the_130_wueller_sites_and_16_regions() -> None:
    regions = client.get("/regions").json()
    sites = client.get("/sites").json()
    assert len(regions) == 16
    wueller = [site for site in sites if site["source"] == "wueller2026"]
    assert len(wueller) == 130
    assert len({site["id"] for site in sites}) == len(sites)
    assert {r["id"] for r in regions if r["artemis_iii_current"]} == ARTEMIS_III_NINE
    for region in regions:
        members = client.get("/sites", params={"region_id": region["id"]}).json()
        assert region["site_count"] == len(members) > 0
        assert all(site["region_id"] == region["id"] for site in members)
    assert sum(region["site_count"] for region in regions) == 130


def test_every_site_carries_its_citation_and_sits_near_the_pole() -> None:
    for site in client.get("/sites").json():
        assert site["curated"] is True
        assert site["source_reference"]
        if site["id"] in ("APOLLO11", "BG1", "CH3"):  # outside the pole on purpose (the requirement)
            assert site["region_id"] is None
            continue
        assert -90 <= site["latitude_deg"] <= -80
        if site["source"] == "wueller2026":
            assert "10.1029/2025JE009434" in site["source_reference"]


def test_default_site_and_the_5m_dem_flags() -> None:
    default = client.get("/meta").json()["defaults"]["site_id"]
    site = client.get(f"/sites/{default}").json()
    assert site["id"] == "001"
    assert site["latitude_deg"] == -89.4661
    assert site["region_id"] == "CR"
    # PGDA 78 has 5 m DEMs around NASA sites 001, 007 and 011, and none in Mons Mouton.
    for site_id in ("001", "007", "011"):
        assert client.get(f"/sites/{site_id}").json()["has_5m_dem"] is True
    assert client.get("/sites/MMO01").json()["has_5m_dem"] is False


def test_clps_landing_point_has_no_region() -> None:
    athena = client.get("/sites/IM2").json()
    assert athena["source"] == "clps"
    assert athena["region_id"] is None
    assert (athena["latitude_deg"], athena["longitude_deg"]) == (-84.7906, 29.1957)
    assert "lroc" in athena["source_reference"].casefold()


def test_text_filter_matches_id_and_name_without_case() -> None:
    by_name = {s["id"] for s in client.get("/sites", params={"q": "mons MOUTON"}).json()}
    assert by_name and all(i.startswith(("MMO", "MMP")) for i in by_name)
    assert [s["id"] for s in client.get("/sites", params={"q": "cr01"}).json()] == ["CR01"]
    assert client.get("/sites", params={"q": "nowhere"}).json() == []
    assert client.get("/sites", params={"region_id": "XX"}).json() == []
    assert client.get("/sites/XX99").status_code == 404


def test_curated_site_answers_from_cache_and_custom_does_not() -> None:
    query = {"site_id": "CR06", "start": "2026-11-12T00:00:00Z", "duration_hours": 24}
    first = client.get("/visibility", params=query)
    second = client.get("/visibility", params=query)
    assert "fwd=miss" in first.headers["cache-status"]
    assert second.headers["cache-status"] == "lunar-api; hit"
    assert first.json() == second.json()
    custom = {
        "latitude_deg": -89.5,
        "longitude_deg": 20,
        "start": query["start"],
        "duration_hours": 24,
    }
    for _ in range(2):
        assert "fwd=miss" in client.get("/visibility", params=custom).headers["cache-status"]


def test_warming_fills_the_default_window_without_blocking_startup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # ADR 0004: the default Window starts at 00:00 UTC today. A request that arrives
    # while the warming thread is still on that Site waits for it instead of computing.
    monkeypatch.setenv("LUNAR_WARM_CACHE", "CR02")
    today = datetime.now(UTC).strftime("%Y-%m-%dT00:00:00Z")
    with TestClient(app) as warmed:
        assert warmed.get("/health").status_code == 200
        _wait_until_cached("CR02", datetime.fromisoformat(today))
        answer = warmed.get("/visibility", params={"site_id": "CR02", "start": today})
    assert answer.status_code == 200
    assert answer.headers["cache-status"] == "lunar-api; hit"


def test_concurrent_requests_for_one_cold_site_share_one_run() -> None:
    query = {"site_id": "CR03", "start": "2026-03-01T00:00:00Z", "duration_hours": 48}
    with ThreadPoolExecutor(max_workers=4) as pool:
        answers = list(pool.map(lambda _: client.get("/visibility", params=query), range(4)))
    statuses = sorted(a.headers["cache-status"] for a in answers)
    assert statuses == ["lunar-api; fwd=miss"] + ["lunar-api; hit"] * 3
    assert all(a.json() == answers[0].json() for a in answers)


def test_the_default_site_is_warmed_first_whatever_the_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # After a deploy the first visitor waited 7 s for the default Query,
    # because the warming thread went through the catalog in file order.
    monkeypatch.setenv("LUNAR_WARM_CACHE", "CR04,CR05,CR01,001")
    today = datetime.now(UTC).strftime("%Y-%m-%dT00:00:00Z")
    with TestClient(app) as warmed:
        _wait_until_cached("001", datetime.fromisoformat(today))
        with cache._lock:
            before = {key[0] for key in cache._entries} - {"001"}
        answer = warmed.get("/visibility", params={"site_id": "001", "start": today})
    # The default Site was stored before any of the others listed ahead of it.
    assert not before & {"CR04", "CR05", "CR01"}
    assert answer.status_code == 200
    assert answer.headers["cache-status"] == "lunar-api; hit"


def test_tomorrows_default_window_is_warm_before_the_day_starts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # warming only covered today, so the first
    # visitors after 00:00 UTC waited for the engine until the thread caught up.
    monkeypatch.setenv("LUNAR_WARM_CACHE", "CR06")
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
    with TestClient(app) as warmed:
        _wait_until_cached("CR06", datetime.fromisoformat(tomorrow))
        answer = warmed.get("/visibility", params={"site_id": "CR06", "start": tomorrow})
    assert answer.status_code == 200
    assert answer.headers["cache-status"] == "lunar-api; hit"
    assert answer.json()["query"]["start"].startswith(tomorrow[:10])


def _wait_until_cached(name: str, start: datetime, seconds: float = 60) -> None:
    # A minute is ten times what warming takes in CI. The limit matters under mutmut:
    # mutants that break warming fail here, and sleeping uses no CPU time, so mutmut's
    # CPU-time limit never cuts the wait short.
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        with cache._lock:
            if any(key[0] == name and key[3] == start for key in cache._entries):
                return
        time.sleep(0.2)
    raise AssertionError(f"the warming thread never stored {name} {start:%Y}")


def test_the_default_sites_year_is_warmed_and_a_year_is_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LUNAR_WARM_CACHE", "001")
    this_year = datetime.now(UTC).year
    with TestClient(app) as warmed:
        # Wait for the warming thread itself, not a fixed second: run alone (as mutmut
        # does) nothing else has warmed the default Window, and the year comes after it.
        _wait_until_cached("001/year", datetime(this_year, 1, 1, tzinfo=UTC))
        first = warmed.get("/sites/001/year", params={"year": this_year})
        again = warmed.get("/sites/001/year", params={"year": this_year})
    assert first.status_code == 200
    assert first.headers["cache-status"] == "lunar-api; hit"
    assert again.json() == first.json()


def test_a_cold_year_is_computed_once_then_served_from_cache() -> None:
    first = client.get("/sites/CR07/year", params={"year": 2028})
    second = client.get("/sites/CR07/year", params={"year": 2028})
    assert first.headers["cache-status"] == "lunar-api; fwd=miss"
    assert second.headers["cache-status"] == "lunar-api; hit"
    assert first.json() == second.json()
    assert len(first.json()["months"]) == 12
