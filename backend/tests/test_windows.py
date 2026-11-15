"""The same Window started on other days, driven through HTTP.

Each Window is checked against /visibility asked for that Window alone (one engine run,
no months to stitch) and the year's best against /sites/{site_id}/year. Tolerances are
the spec's (the implementation): 0.02 h for both.
"""

import statistics
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import cache, engine
from app.constants import WINDOW_MAX, WINDOW_MIN
from app.main import app

client = TestClient(app)
HOURS = ("sun_and_earth_hours", "sunlit_hours", "earth_visible_hours", "lcsp_hours")
TOLERANCE_H = 0.02


def windows(site_id: str = "001", **params: Any) -> dict[str, Any]:
    response = client.get(f"/sites/{site_id}/windows", params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def at(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


@pytest.mark.parametrize(
    ("start", "duration_hours"),
    [
        # March 2025 at Site 001: the Sun sets and rises inside the Window, and every
        # Window crosses a month boundary, so a period cut there would show.
        ("2025-03-01T00:00:00Z", 708.73),
        # Off the engine's 15-minute grid, shorter than a month, across 1 April.
        ("2025-03-20T07:37:00Z", 300.0),
    ],
)
def test_each_window_gives_the_hours_of_visibility_for_that_window(
    start: str, duration_hours: float
) -> None:
    answer = windows(
        start=start, duration_hours=duration_hours, first_shift_days=-2, last_shift_days=2
    )
    assert [w["shift_days"] for w in answer["windows"]] == [-2, -1, 0, 1, 2]
    assert sum(w["lcsp_hours"] for w in answer["windows"]) > 0  # the Sun does set
    for w in answer["windows"]:
        expected_start = at(start) + timedelta(days=w["shift_days"])
        assert at(w["start"]) == expected_start
        assert at(w["end"]) == expected_start + timedelta(hours=duration_hours)
        alone = client.get(
            "/visibility",
            params={"site_id": "001", "start": w["start"], "duration_hours": duration_hours},
        ).json()["metrics"]
        for name in HOURS:
            assert abs(w[name] - alone[name]) <= TOLERANCE_H, (w["shift_days"], name)


def test_the_daily_best_of_a_year_never_beats_the_years_best_window() -> None:
    answer = windows(start="2027-01-01T00:00:00Z", first_shift_days=0, last_shift_days=365)
    assert len(answer["windows"]) == 366
    year = client.get("/sites/001/year", params={"year": 2027}).json()
    # The year's best Windows start on a 6 h grid and end inside the year; the daily
    # starts that end inside the year are a subset of that grid.
    inside = [w for w in answer["windows"] if at(w["end"]) <= datetime(2028, 1, 1, tzinfo=UTC)]
    assert len(inside) == 336
    best_daily = max(w["sun_and_earth_hours"] for w in inside)
    assert best_daily <= year["best_windows"][0]["sun_and_earth_hours"] + TOLERANCE_H


def test_best_typical_and_worst_are_real_windows_ranked_by_sun_and_earth_time() -> None:
    answer = windows(start="2026-11-14T00:00:00Z")
    rows = answer["windows"]
    assert [w["shift_days"] for w in rows] == list(range(-30, 151))
    values = [w["sun_and_earth_hours"] for w in rows]
    for name in ("best", "typical", "worst"):
        assert answer[name] in rows
    best, typical, worst = (answer[n]["sun_and_earth_hours"] for n in ("best", "typical", "worst"))
    assert best >= typical >= worst
    assert best == max(values) and worst == min(values)
    assert typical == statistics.median_low(values)
    # Ties go to the earlier Window.
    for name, value in (("best", best), ("typical", typical), ("worst", worst)):
        earliest = min(w["shift_days"] for w in rows if w["sun_and_earth_hours"] == value)
        assert answer[name]["shift_days"] == earliest, name
    assert answer["planned_start"] == "2026-11-14T00:00:00Z"
    assert answer["step_days"] == 1
    assert answer["site"]["id"] == "001"


def test_windows_leaving_coverage_are_absent_not_zero() -> None:
    duration = timedelta(hours=708.73)
    late = windows(start="2032-12-01T00:00:00Z", first_shift_days=-30, last_shift_days=30)
    expected = [
        s
        for s in range(-30, 31)
        if datetime(2032, 12, 1, tzinfo=UTC) + timedelta(days=s) + duration <= WINDOW_MAX
    ]
    assert [w["shift_days"] for w in late["windows"]] == expected
    assert 0 < len(expected) < 61  # the last Windows leave coverage

    early = windows(start="2023-08-10T00:00:00Z", first_shift_days=-30, last_shift_days=3)
    shifts = [w["shift_days"] for w in early["windows"]]
    assert shifts == list(range(-9, 4))
    assert at(early["windows"][0]["start"]) == WINDOW_MIN


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2033-06-01T00:00:00Z", "first_shift_days": -30, "last_shift_days": 366},
        {"start": "2023-01-01T00:00:00Z", "first_shift_days": -30, "last_shift_days": 0},
        {"start": "9999-12-31T00:00:00Z", "first_shift_days": 0, "last_shift_days": 366},
        {"start": "0001-01-01T00:00:00Z", "first_shift_days": -30, "last_shift_days": 0},
    ],
)
def test_no_window_inside_coverage_is_422(params: dict[str, Any]) -> None:
    response = client.get("/sites/001/windows", params=params)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "window_out_of_range"


def test_unknown_site_is_404_and_bad_parameters_are_422() -> None:
    response = client.get("/sites/NOPE/windows", params={"start": "2027-01-01T00:00:00Z"})
    assert response.status_code == 404
    assert response.json()["code"] == "missing_site"
    for params in (
        {},
        {"start": "2027-01-01T00:00:00Z", "first_shift_days": 1},
        {"start": "2027-01-01T00:00:00Z", "first_shift_days": -31},
        {"start": "2027-01-01T00:00:00Z", "last_shift_days": 367},
        {"start": "2027-01-01T00:00:00Z", "last_shift_days": -1},
        {"start": "2027-01-01T00:00:00Z", "duration_hours": 0},
        {"start": "2027-01-01T00:00:00Z", "duration_hours": 1441},
        {"start": "2027-01-01T00:00:00Z", "observer_height_m": 51},
    ):
        response = client.get("/sites/001/windows", params=params)
        assert response.status_code == 422, params
        assert response.json()["code"] == "invalid_parameter", params


def _count_engine_runs(monkeypatch: pytest.MonkeyPatch) -> list[datetime]:
    runs: list[datetime] = []
    real = engine.calculate

    def counted(site: Any, start: datetime, *args: Any) -> dict[str, Any]:
        runs.append(start)
        return real(site, start, *args)

    monkeypatch.setattr(engine, "calculate", counted)
    return runs


def test_a_year_computed_by_windows_is_not_computed_again_by_year(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runs = _count_engine_runs(monkeypatch)
    windows(site_id="CR02", start="2027-01-01T00:00:00Z", first_shift_days=0, last_shift_days=310)
    assert len(runs) == 12  # January to December 2027, one run each
    runs.clear()
    year = client.get("/sites/CR02/year", params={"year": 2027})
    assert year.status_code == 200
    assert runs == []
    again = client.get(
        "/sites/CR02/windows",
        params={"start": "2027-01-01T00:00:00Z", "first_shift_days": 0, "last_shift_days": 310},
    )
    assert again.headers["cache-status"] == "lunar-api; hit"


def test_windows_inside_a_year_already_computed_need_no_engine_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runs = _count_engine_runs(monkeypatch)
    assert client.get("/sites/CR03/year", params={"year": 2027}).status_code == 200
    assert len(runs) == 12
    runs.clear()
    response = client.get(
        "/sites/CR03/windows",
        params={"start": "2027-03-15T06:00:00Z", "first_shift_days": -30, "last_shift_days": 200},
    )
    assert response.status_code == 200
    assert response.headers["cache-status"] == "lunar-api; fwd=miss"
    assert runs == []


def test_the_month_store_has_its_own_caps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cache, "MONTH_MAX_ENTRIES", 3)
    windows(site_id="CR04", start="2027-01-01T00:00:00Z", first_shift_days=0, last_shift_days=60)
    with cache._lock:
        assert 0 < len(cache._months) <= 3
    monkeypatch.setattr(cache, "MONTH_MAX_BYTES", 1)
    windows(site_id="CR04", start="2027-06-01T00:00:00Z", first_shift_days=0, last_shift_days=60)
    with cache._lock:
        assert len(cache._months) == 1
