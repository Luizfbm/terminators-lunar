"""Every Occluder names the IAU feature it sits on, or says null (the requirement), via HTTP only.

The expected answers are checked against the Gazetteer's own numbers for the craters,
typed in here from planetarynames.wr.usgs.gov, and a distance computed with unit
vectors instead of the module's haversine.
"""

import math
from typing import Any

from tests.test_regressions import MARCH_2025, SHACKLETON_FLOOR, visibility

MOON_RADIUS_KM = 1737.4
# planetarynames.wr.usgs.gov/Feature/5450 and /Feature/16417
SHACKLETON = (-89.67, 129.78, 20.925)
BAY = (-88.76, -36.85, 3.5)
# A Site between Shackleton and Bay whose horizon, to the north-west, runs across Bay.
NEAR_BAY = {"latitude_deg": -89.3, "longitude_deg": -60, "start": "2025-03-01T00:00:00Z"}


def km_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    def unit(lat: float, lon: float) -> tuple[float, float, float]:
        phi, lam = math.radians(lat), math.radians(lon)
        return (math.cos(phi) * math.cos(lam), math.cos(phi) * math.sin(lam), math.sin(phi))

    a, b = unit(lat1, lon1), unit(lat2, lon2)
    cross = math.dist(
        (0, 0, 0), (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    )
    return MOON_RADIUS_KM * math.atan2(cross, sum(x * y for x, y in zip(a, b, strict=True)))


def occluders(payload: dict[str, Any]) -> list[dict[str, Any]]:
    found = [sample["occluder"] for sample in payload["horizon"]["samples"]]
    return found + [event["occluder"] for event in payload["events"]]


def test_from_the_floor_of_shackleton_every_occluder_is_its_rim() -> None:
    payload = visibility(
        {**SHACKLETON_FLOOR, "start": "2025-03-01T00:00:00Z", "duration_hours": 24}
    )
    lat, lon, diameter = SHACKLETON
    for occluder in occluders(payload):
        assert occluder["feature"] == {"name": "Shackleton", "type": "crater", "relation": "rim"}
        gap = (
            km_between(occluder["latitude_deg"], occluder["longitude_deg"], lat, lon) - diameter / 2
        )
        assert abs(gap) <= 0.15 * diameter / 2


def test_an_occluder_inside_a_small_named_crater_says_inside() -> None:
    payload = visibility({**NEAR_BAY, "duration_hours": 24})
    lat, lon, diameter = BAY
    inside = [
        o
        for o in occluders(payload)
        if o["feature"] == {"name": "Bay", "type": "crater", "relation": "inside"}
    ]
    assert inside, "the horizon of this Site crosses Bay"
    for occluder in inside:
        distance = km_between(occluder["latitude_deg"], occluder["longitude_deg"], lat, lon)
        assert distance < diameter / 2 - 0.3


def test_the_sunset_of_site_001_has_no_named_feature_and_says_null() -> None:
    # In March 2025 the Sun sets behind ground 100 m from the lander on Connecting Ridge.
    # The nearest named crater is Henson, whose rim is about 5 km away: no name fits.
    payload = visibility(MARCH_2025)
    sunset = next(event for event in payload["events"] if event["type"] == "sunset")
    assert sunset["occluder"]["distance_m"] < 1000
    assert "feature" in sunset["occluder"]
    assert sunset["occluder"]["feature"] is None


def test_feature_values_stay_inside_the_contract() -> None:
    # The enums of OccluderFeature in contract/openapi.yaml; schemathesis checks the rest.
    types = {"crater", "mons", "mare", "lacus", "sinus", "palus", "planitia", "oceanus"}
    types.add("promontorium")
    for site in (MARCH_2025, NEAR_BAY):
        named = [
            o["feature"]
            for o in occluders(visibility({**site, "duration_hours": 24}))
            if o["feature"]
        ]
        assert named
        for feature in named:
            assert set(feature) == {"name", "type", "relation"}
            assert feature["type"] in types
            assert feature["relation"] in {"rim", "inside", "near"}
            assert feature["name"].strip() == feature["name"] != ""
