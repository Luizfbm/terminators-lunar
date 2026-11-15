"""The year at a Site, driven through HTTP and checked against /visibility asked differently."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
YEAR = 2027


def _year() -> dict:  # type: ignore[type-arg]
    response = client.get("/sites/001/year", params={"year": YEAR})
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def _sun_periods_from_visibility() -> list[tuple[str, datetime, datetime]]:
    """The Sun's periods over the year from 1440 h /visibility Windows, joined by hand.

    The year endpoint asks the engine month by month; this asks in 60-day pieces, so a
    period cut or counted twice at a month boundary shows up as a mismatch.
    """
    start = datetime(YEAR, 1, 1, tzinfo=UTC)
    end = datetime(YEAR + 1, 1, 1, tzinfo=UTC)
    out: list[tuple[str, datetime, datetime]] = []
    cursor = start
    while cursor < end:
        hours = min(1440.0, (end - cursor).total_seconds() / 3600)
        payload = client.get(
            "/visibility",
            params={"site_id": "001", "start": cursor.isoformat(), "duration_hours": hours},
        ).json()
        for p in payload["periods"]:
            if p["body"] != "sun":
                continue
            a, b = datetime.fromisoformat(p["start"]), datetime.fromisoformat(p["end"])
            if out and out[-1][0] == p["state"] and out[-1][2] == a:
                out[-1] = (p["state"], out[-1][1], b)
            else:
                out.append((p["state"], a, b))
        cursor += timedelta(hours=hours)
    return out


def test_months_add_up_to_the_year() -> None:
    year = _year()
    assert len(year["months"]) == 12
    for field in ("sunlit_hours", "earth_visible_hours", "sun_and_earth_hours"):
        assert abs(sum(m[field] for m in year["months"]) - year["totals"][field]) < 1e-6
    assert abs(year["totals"]["sunlit_days"] * 24 - year["totals"]["sunlit_hours"]) < 1e-9
    for month in year["months"]:
        span = (
            datetime.fromisoformat(month["end"]) - datetime.fromisoformat(month["start"])
        ).total_seconds() / 3600
        assert (
            month["sun_and_earth_hours"]
            <= min(month["sunlit_hours"], month["earth_visible_hours"]) + 1e-9
        )
        assert month["sunlit_hours"] <= span + 1e-9


def test_lcip_and_lcsp_match_visibility_asked_in_other_pieces() -> None:
    year = _year()
    periods = _sun_periods_from_visibility()
    hours = {
        state: max(((b - a).total_seconds() / 3600 for s, a, b in periods if s == state), default=0)
        for state in ("visible", "hidden")
    }
    assert abs(year["totals"]["lcip_hours"] - hours["visible"]) < 1e-6
    assert abs(year["totals"]["lcsp_hours"] - hours["hidden"]) < 1e-6
    sunlit = sum((b - a).total_seconds() / 3600 for s, a, b in periods if s == "visible")
    assert abs(year["totals"]["sunlit_hours"] - sunlit) < 1e-6


def test_best_windows_are_synodic_months_inside_the_year_without_overlap() -> None:
    windows = _year()["best_windows"]
    assert len(windows) == 3
    starts = [datetime.fromisoformat(w["start"]) for w in windows]
    assert [w["sun_and_earth_hours"] for w in windows] == sorted(
        (w["sun_and_earth_hours"] for w in windows), reverse=True
    )
    for w, s in zip(windows, starts, strict=True):
        assert abs(w["duration_hours"] - 708.73) < 1e-9
        assert s.year == YEAR and datetime.fromisoformat(w["end"]).year in (YEAR, YEAR + 1)
        answer = client.get(
            "/visibility", params={"site_id": "001", "start": w["start"], "duration_hours": 708.73}
        ).json()
        assert abs(answer["metrics"]["sun_and_earth_hours"] - w["sun_and_earth_hours"]) < 0.01
    for i, a in enumerate(starts):
        for b in starts[i + 1 :]:
            assert abs((a - b).total_seconds()) / 3600 >= 708.73


def test_year_outside_coverage_and_unknown_site() -> None:
    for year in (2023, 2033):  # 2023 is not whole: the Window starts on 1 August
        response = client.get("/sites/001/year", params={"year": year})
        assert response.status_code == 422
        assert response.json()["code"] == "window_out_of_range"
    response = client.get("/sites/NOPE/year", params={"year": YEAR})
    assert response.status_code == 404
    assert response.json()["code"] == "missing_site"
