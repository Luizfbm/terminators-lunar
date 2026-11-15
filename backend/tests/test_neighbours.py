"""The nearby Sites that still work when a launch slips (the requirement), driven through HTTP.

Every number of a nearby Site is checked against `/visibility` asked for that Site alone,
and the order against a sort written here. Distances come from the test's own great-circle
formula (tests/synthetic_dem.py), not from the app's.

Connecting Ridge (Region CR) runs on the repo's DEM fixtures. Haworth is about 95 km from
the pole, past the ±25 km of the 20 m fixture, so its test writes its own terrain: the
point there is the ranking and its agreement with `/visibility`, which any terrain shows.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import catalog
from app.main import app
from tests.synthetic_dem import great_circle_m, polar_xy, write_dem

client = TestClient(app)
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "dem"
# The reference Window (the reference default Query) slipped by 7 days.
SLIPPED = "2026-11-21T00:00:00Z"


def neighbours(site_id: str, **params: Any) -> dict[str, Any]:
    response = client.get(f"/sites/{site_id}/neighbours", params=params)
    assert response.status_code == 200, response.text
    payload: dict[str, Any] = response.json()
    return payload


def alone(site_id: str, start: str, duration_hours: float) -> dict[str, Any]:
    response = client.get(
        "/visibility",
        params={"site_id": site_id, "start": start, "duration_hours": duration_hours},
    )
    assert response.status_code == 200, response.text
    metrics: dict[str, Any] = response.json()["metrics"]
    return metrics


def km(a: str, b: str) -> float:
    sa, sb = catalog.find_site(a), catalog.find_site(b)
    assert sa is not None and sb is not None
    return (
        great_circle_m(
            (sa["latitude_deg"], sa["longitude_deg"]), (sb["latitude_deg"], sb["longitude_deg"])
        )
        / 1000.0
    )


def region_of(site_id: str) -> set[str]:
    region = catalog.find_site(site_id)["region_id"]  # type: ignore[index]
    return {s["id"] for s in catalog.SITES if s["region_id"] == region} - {site_id}


def check_against_visibility(site_id: str, start: str, duration_hours: float) -> list[str]:
    """The answer's every number is /visibility's, in the order a plain sort gives."""
    answer = neighbours(site_id, start=start, duration_hours=duration_hours)
    rows = answer["neighbours"]
    assert {r["site"]["id"] for r in rows} == region_of(site_id)
    assert answer["query"]["site"]["id"] == site_id
    assert answer["query"]["start"] == start
    assert answer["metrics"] == alone(site_id, start, duration_hours)
    for row in rows:
        assert row["metrics"] == alone(row["site"]["id"], start, duration_hours)
        assert math.isclose(row["distance_km"], km(site_id, row["site"]["id"]), rel_tol=1e-9)
    expected = sorted(
        rows,
        key=lambda r: (-r["metrics"]["sun_and_earth_hours"], r["distance_km"], r["site"]["id"]),
    )
    assert [r["site"]["id"] for r in rows] == [r["site"]["id"] for r in expected]
    return [r["site"]["id"] for r in rows]


def test_connecting_ridge_ranks_its_region_by_sun_and_earth_time_as_visibility_counts_it() -> None:
    order = check_against_visibility("001", SLIPPED, 168.0)
    assert len(order) == 8


def test_haworth_hw03_slipped_a_week_ranks_its_region_as_visibility_counts_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    hw = [s for s in catalog.SITES if s["region_id"] == "HW"]
    xs, ys = zip(*(polar_xy(s["latitude_deg"], s["longitude_deg"]) for s in hw), strict=True)
    centre = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)

    # Ridges a few km apart and up to 3 km high: each Site gets its own horizon, so the
    # Sites do not tie and the order means something.
    def relief(x: Any, y: Any) -> Any:
        return 1500.0 * np.sin(x / 6_000.0) * np.cos(y / 8_500.0) + 0.004 * (y - centre[1])

    # Coarser cells than the products' names: the engine walks each band at its own
    # resolution and interpolates, and smooth relief needs no finer grid.
    write_dem(tmp_path / "LDEM_80S_20MPP_ADJ.TIF", centre, 100.0, 400, relief)
    write_dem(tmp_path / "LDEM_80S_80MPP_ADJ.TIF", centre, 400.0, 600, relief)
    write_dem(tmp_path / "LDEM_60S_240MPP_ADJ.TIF", centre, 1_200.0, 560, relief)

    order = check_against_visibility("HW03", SLIPPED, 708.73)
    assert len(order) == 10
    answer = neighbours("HW03", start=SLIPPED, duration_hours=708.73)
    hours = [r["metrics"]["sun_and_earth_hours"] for r in answer["neighbours"]]
    assert len(set(hours)) > 1, "every Site tied: the terrain does not tell them apart"


def test_the_nearby_answers_are_the_visibility_cache_entries() -> None:
    first = client.get("/sites/CR01/neighbours", params={"start": SLIPPED, "duration_hours": 48})
    assert first.status_code == 200
    assert first.headers["cache-status"] == "lunar-api; fwd=miss"
    again = client.get("/sites/CR01/neighbours", params={"start": SLIPPED, "duration_hours": 48})
    assert again.headers["cache-status"] == "lunar-api; hit"
    assert again.json() == first.json()
    top = first.json()["neighbours"][0]["site"]["id"]
    clicked = client.get(
        "/visibility", params={"site_id": top, "start": SLIPPED, "duration_hours": 48}
    )
    assert clicked.headers["cache-status"] == "lunar-api; hit"


def test_a_site_with_no_region_takes_the_nearest_curated_sites_within_50_km() -> None:
    # IM-2's Site has no Region and 30 Curated Sites within 50 km; the nearest 10 count.
    im2 = catalog.find_site("IM2")
    assert im2 is not None and im2["region_id"] is None
    from app import neighbours as module

    near = module.nearby(im2)
    everyone = sorted((km("IM2", s["id"]), s["id"]) for s in catalog.SITES if s["id"] != "IM2")
    within = [site_id for d, site_id in everyone if d <= 50.0]
    assert len(within) == 30
    assert [s["id"] for s in near] == within[:10]
    # Chandrayaan-3, near 69°S, has no Curated Site within 50 km.
    ch3 = catalog.find_site("CH3")
    assert ch3 is not None
    assert module.nearby(ch3) == []


def test_a_nearby_site_with_no_dem_makes_the_whole_request_422(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The fixtures stop 25 km from the pole: no Haworth Site has its 20 m terrain there.
    monkeypatch.setenv("LUNAR_DEM_DIR", str(FIXTURES))
    response = client.get("/sites/HW03/neighbours", params={"start": SLIPPED})
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "outside_coverage"


def test_unknown_site_is_404_and_bad_parameters_are_422() -> None:
    response = client.get("/sites/NOPE/neighbours", params={"start": SLIPPED})
    assert response.status_code == 404
    assert response.json()["code"] == "missing_site"
    for params, code in (
        ({}, "invalid_parameter"),
        ({"start": SLIPPED, "duration_hours": 0}, "invalid_parameter"),
        ({"start": SLIPPED, "duration_hours": 1441}, "invalid_parameter"),
        ({"start": SLIPPED, "observer_height_m": 51}, "invalid_parameter"),
        ({"start": "2033-06-01T00:00:00Z"}, "window_out_of_range"),
        ({"start": "2032-12-31T00:00:00Z", "duration_hours": 48}, "window_out_of_range"),
    ):
        response = client.get("/sites/001/neighbours", params=params)
        assert response.status_code == 422, params
        assert response.json()["code"] == code, params
