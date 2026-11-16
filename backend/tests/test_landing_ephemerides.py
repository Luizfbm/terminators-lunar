"""Focused N1/N2 sky check against independently fetched JPL Horizons observations.

Airless surface positions at 2 m; does not test terrain occlusion or vehicle dynamics.
The 0.02 degree tolerance is the existing project's Horizons tolerance, not fitted here.
"""
import json
import math
from datetime import datetime
from pathlib import Path

import pytest

from app import ephemeris

DATA = json.loads((Path(__file__).parent / 'data/landing_horizons_2026.json').read_text())['records']


@pytest.mark.parametrize('reference', DATA, ids=lambda r: f"level{r['level']}-{r['body']}")
def test_landing_sky_and_disc_against_horizons(reference):
    observer = ephemeris.make_observer(reference['latitude_deg'], reference['longitude_deg'], reference['height_m'])
    at = ephemeris.et(datetime.fromisoformat(reference['t']))
    actual = ephemeris.apparent(reference['body'], at, observer)
    a, b = math.radians(actual.elevation_deg), math.radians(reference['elevation_deg'])
    delta = math.radians(actual.azimuth_deg - reference['azimuth_deg'])
    separation = math.degrees(math.acos(min(1, max(-1, math.sin(a)*math.sin(b) + math.cos(a)*math.cos(b)*math.cos(delta)))))
    assert separation < .02
    radius_km = ephemeris.sun_radius_km() if reference['body'] == 'SUN' else ephemeris.earth_radius_km()
    radius_deg = math.degrees(math.asin(radius_km / actual.distance_km))
    expected_radius = reference['angular_diameter_arcsec'] / 7200
    assert radius_deg == pytest.approx(expected_radius, rel=.001)
