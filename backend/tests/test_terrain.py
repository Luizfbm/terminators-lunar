"""The answer follows the terrain of the DEM fixtures (the requirement), through the HTTP API only."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_regressions import SHACKLETON_FLOOR, mask_at, samples_around, visibility

client = TestClient(app)
LADDER = [
    {"product": "LDEM_80S_20MPP_ADJ", "resolution_m": 20},
    {"product": "LDEM_80S_80MPP_ADJ", "resolution_m": 80},
    {"product": "LDEM_60S_240MPP_ADJ", "resolution_m": 240},
]


def default(**extra: Any) -> dict[str, Any]:
    return visibility({"site_id": "001", "start": "2025-03-01T00:00:00Z", **extra})


def test_the_mask_is_terrain_with_a_real_occluder_in_every_direction() -> None:
    payload = default(duration_hours=24)
    samples = payload["horizon"]["samples"]
    assert [s["azimuth_deg"] for s in samples] == [i * 0.5 for i in range(720)]
    elevations = [s["elevation_deg"] for s in samples]
    # A flat sphere would give one dip angle everywhere; the ridge does not.
    assert max(elevations) - min(elevations) > 1
    for sample in samples:
        occluder = sample["occluder"]
        assert occluder["azimuth_deg"] == sample["azimuth_deg"]
        assert 0 < occluder["distance_m"] <= 300_000
        assert -90 <= occluder["latitude_deg"] < -80
        assert occluder["terrain_height_m"] != 0
    # Some directions are set by far mountains, which only the 80 m and 240 m DEMs reach.
    assert max(s["occluder"]["distance_m"] for s in samples) > 100_000


def test_a_taller_observer_never_sees_a_higher_horizon() -> None:
    low = default(duration_hours=1, observer_height_m=0)["horizon"]["samples"]
    high = default(duration_hours=1, observer_height_m=50)["horizon"]["samples"]
    assert all(h["elevation_deg"] <= lo["elevation_deg"] for h, lo in zip(high, low, strict=True))
    assert sum(h["elevation_deg"] < lo["elevation_deg"] for h, lo in zip(high, low, strict=True))


def test_the_floor_of_shackleton_is_never_lit() -> None:
    """A permanently shadowed region: four kilometres of rim about ten kilometres away."""
    for start in ("2025-06-01T00:00:00Z", "2025-11-15T00:00:00Z", "2026-06-01T00:00:00Z"):
        payload = visibility({**SHACKLETON_FLOOR, "start": start, "duration_hours": 1440})
        assert min(s["elevation_deg"] for s in payload["horizon"]["samples"]) > 15
        assert payload["metrics"]["sunlit_hours"] == 0
        assert payload["metrics"]["mean_sun_fraction"] == 0
        assert all(s["sun"]["fraction"] == 0 for s in payload["timeline"]["samples"])
        assert [e for e in payload["events"] if e["type"] in ("sunrise", "sunset")] == []


def test_earthrise_and_earthset_happen_on_the_terrain() -> None:
    payload = default()
    earth_events = [e for e in payload["events"] if e["type"] in ("earthrise", "earthset")]
    assert earth_events
    for event in earth_events:
        before, after = samples_around(payload, event["t"])
        assert before["earth"]["visible"] != after["earth"]["visible"]
        middle = (before["earth"]["elevation_deg"] + after["earth"]["elevation_deg"]) / 2
        assert abs(middle - mask_at(payload, event["azimuth_deg"])) < 0.1
        assert event["occluder"]["distance_m"] > 0


def test_provenance_names_the_dems_and_meta_lists_them() -> None:
    assert default(duration_hours=1)["provenance"]["dems"] == LADDER
    # The polar ladder first; the off-pole products (the requirement) follow it.
    assert client.get("/meta").json()["dems"][: len(LADDER)] == LADDER


def test_a_site_past_the_dems_is_outside_coverage_not_a_flat_horizon() -> None:
    response = client.get(
        "/visibility", params={"latitude_deg": -85, "longitude_deg": 0, "start": "2026-01-01"}
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "outside_coverage"
    assert "DEM" in response.json()["detail"]


def test_no_dem_on_the_server_is_outside_coverage(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    # A custom Site, since Curated answers may already sit in the cache.
    query = {"latitude_deg": -89.5, "longitude_deg": 20, "start": "2026-01-01"}
    response = client.get("/visibility", params=query)
    assert (response.status_code, response.json()["code"]) == (422, "outside_coverage")
    assert client.get("/meta").json()["dems"] == []


MMO01 = {"site_id": "MMO01", "start": "2026-01-01T00:00:00Z", "duration_hours": 24}


def test_the_flat_fallback_is_off_unless_asked_for(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LUNAR_FLAT_HORIZON_WITHOUT_DEM", raising=False)
    response = client.get("/visibility", params=MMO01)
    assert (response.status_code, response.json()["code"]) == (422, "outside_coverage")


def test_the_flat_fallback_says_it_has_no_dem(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LUNAR_FLAT_HORIZON_WITHOUT_DEM", "1")
    payload = visibility(MMO01)
    assert payload["provenance"]["dems"] == []
    assert len({s["elevation_deg"] for s in payload["horizon"]["samples"]}) == 1


def test_a_covered_site_uses_terrain_with_or_without_the_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    query = {"latitude_deg": -89.6, "longitude_deg": 0, "start": "2026-01-01", "duration_hours": 1}
    monkeypatch.delenv("LUNAR_FLAT_HORIZON_WITHOUT_DEM", raising=False)
    off = visibility(query)
    monkeypatch.setenv("LUNAR_FLAT_HORIZON_WITHOUT_DEM", "1")
    on = visibility(query)
    assert off == on
    assert on["provenance"]["dems"] == LADDER
