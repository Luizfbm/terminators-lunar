"""Curated Sites outside the polar DEMs (the requirement), through the HTTP API only."""

import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_regressions import visibility

client = TestClient(app)
SLDEM = [
    {"product": "SLDEM2015_512", "resolution_m": 59.2},
    {"product": "SLDEM2015_128", "resolution_m": 236.9},
]
START = "2025-03-01T00:00:00Z"


@pytest.mark.parametrize("site_id", ["APOLLO11", "BG1"])
def test_the_offpole_sites_answer_over_sldem2015(site_id: str) -> None:
    payload = visibility({"site_id": site_id, "start": START, "duration_hours": 24})
    assert payload["provenance"]["dems"] == SLDEM
    samples = payload["horizon"]["samples"]
    assert len(samples) == 720
    site = payload["query"]["site"]
    for sample in samples:
        occluder = sample["occluder"]
        assert 0 < occluder["distance_m"] <= 300_000
        # The Occluder is near the Site, not at the pole: the right DEM was read.
        assert abs(occluder["latitude_deg"] - site["latitude_deg"]) < 10
        assert occluder["terrain_height_m"] != 0


@pytest.mark.parametrize("site_id", ["APOLLO11", "BG1", "CH3"])
def test_the_offpole_sites_are_listed_outside_the_polar_map(site_id: str) -> None:
    site = client.get(f"/sites/{site_id}").json()
    assert site["region_id"] is None
    assert site["curated"] is True
    assert site["has_5m_dem"] is False
    assert site["source_reference"]
    listed = {row["id"] for row in client.get("/sites").json()}
    assert site_id in listed


def test_chandrayaan_3_answers_over_the_pgda_60s_dems() -> None:
    # At 69°S SLDEM2015 (±60°) does not reach the Site; the PGDA 60°S products do.
    payload = visibility({"site_id": "CH3", "start": START, "duration_hours": 24})
    assert payload["provenance"]["dems"] == [
        {"product": "LDEM_60S_60MPP_ADJ", "resolution_m": 60},
        {"product": "LDEM_60S_240MPP_ADJ", "resolution_m": 240},
    ]
    samples = payload["horizon"]["samples"]
    assert len(samples) == 720
    for sample in samples:
        assert 0 < sample["occluder"]["distance_m"] <= 300_000
        assert -76 < sample["occluder"]["latitude_deg"] < -59
    assert client.get("/sites/CH3").json()["source"] == "isro"


def test_meta_lists_the_offpole_products() -> None:
    products = client.get("/meta").json()["dems"]
    for dem in SLDEM:
        assert dem in products


def test_the_sun_nearly_reaches_the_zenith_at_apollo_11() -> None:
    # At 0.7°N the Sun's noon altitude is 90° minus the Site latitude minus the
    # subsolar latitude (within about 1.6° of the equator), so it passes within
    # about 3° of the zenith once a lunar day. At the pole it never tops ~2°.
    payload = visibility({"site_id": "APOLLO11", "start": START, "duration_hours": 720})
    highest = max(s["sun"]["elevation_deg"] for s in payload["timeline"]["samples"])
    assert highest > 86
    lat = math.radians(payload["query"]["site"]["latitude_deg"])
    assert highest <= 90 - math.degrees(lat) + 1.6 + 0.1


def test_a_custom_site_north_of_80s_is_still_outside_coverage() -> None:
    response = client.get(
        "/visibility",
        params={"latitude_deg": 0.67416, "longitude_deg": 23.47314, "start": START},
    )
    assert response.status_code == 422


def test_the_resolution_ladder_of_an_offpole_site_uses_its_own_dems() -> None:
    # SLDEM2015 comes at 59 and 237 m: the 240 and 80 m rungs both have only the 237 m
    # DEM, from the Site out; the 20 m rung has both.
    response = client.get(
        "/visibility/ladder", params={"site_id": "BG1", "start": START, "duration_hours": 24}
    )
    assert response.status_code == 200, response.text
    rungs = {rung["resolution_m"]: rung["dems"] for rung in response.json()["rungs"]}
    assert rungs[240] == SLDEM[1:]
    assert rungs[80] == SLDEM[1:]
    assert rungs[20] == SLDEM
