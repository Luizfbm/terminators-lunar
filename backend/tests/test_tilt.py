"""The Moon's tilt against the engine (the requirement).

The classroom figure says that at the pole the Sun never climbs higher than 1.54°, the
Moon's axial tilt (`docs/artigos.md` in the cited source dataset). The engine's own ephemeris
must agree: the largest sub-solar latitude over the engine's years, 2024 to 2032, is
within 0.05° of 1.54° (tolerance written in the requirement before this test ran).
"""

from datetime import UTC, datetime, timedelta

from app import ephemeris

TILT_DEG = 1.54
TOLERANCE_DEG = 0.05


def sub_solar_latitude(instant: datetime) -> float:
    return ephemeris.sub_point("SUN", ephemeris.et(instant))[0]


def test_the_largest_sub_solar_latitude_is_the_moons_tilt() -> None:
    # Every 6 hours, then every 10 minutes for 12 hours around the largest one: the
    # latitude swings over about 173 days, so the coarse grid is already within 1e-6°.
    first, last = datetime(2024, 1, 1, tzinfo=UTC), datetime(2033, 1, 1, tzinfo=UTC)
    coarse = [first + timedelta(hours=6 * k) for k in range(int((last - first).days * 4))]
    peak = max(coarse, key=lambda t: abs(sub_solar_latitude(t)))
    fine = [peak + timedelta(minutes=10 * k) for k in range(-36, 37)]
    largest = max(abs(sub_solar_latitude(t)) for t in fine)
    assert abs(largest - TILT_DEG) <= TOLERANCE_DEG, largest
    # Both signs reach past 1.5°: the Sun goes as far north as it goes south.
    north = max(sub_solar_latitude(t) for t in coarse)
    south = min(sub_solar_latitude(t) for t in coarse)
    assert north > 1.5 and south < -1.5
