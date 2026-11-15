"""Sites near the SLDEM2015 seam (0°E), where the map's x jumps by a whole Moon.

15/11/2026, the 17 mission Sites: Apollo 15 (3.6°E), Surveyor 6 (1.4°W) and Surveyor 7
(11.5°W) answered 422 outside-coverage. SLDEM2015 is a simple cylinder centred on 180°E, so
x = R*radians(lon - 180) jumps from +pi*R to -pi*R across 0°E, and a ray that crossed it got
x a whole map away from the window the Site sits in.

The projection is unit-tested here and the engine is run over a small synthetic window that
runs on past the seam; the real windows are driven through the API in test_regressions.py.
"""

import math
from pathlib import Path

import numpy as np
import pytest

from app import horizon
from tests.synthetic_dem import EQC, R, eqc_xy, write_dem

PI_R = math.pi * R


def test_x_runs_on_past_the_seam_around_a_site_just_east_of_it() -> None:
    # Apollo 15, 3.6333°E. 359.9°E and 0.1°E are 3.7° and 3.5° from it, on either side of the seam.
    site_lon = 3.6333
    lat = np.array([26.0, 26.0])
    x, y = horizon._equirectangular(lat, np.array([359.9, 0.1]), site_lon)
    site_x, _ = eqc_xy(26.0, site_lon)
    # Written out from the definition of the projection, a metre per 1/R radian.
    assert x[0] == pytest.approx(R * math.radians(-0.1 - 180.0), abs=1e-6)
    assert x[1] == pytest.approx(R * math.radians(0.1 - 180.0), abs=1e-6)
    # Both are within 4° of the Site on the map (the old x put 359.9°E a whole Moon away).
    assert np.all(np.abs(x - site_x) < R * math.radians(4.0))
    assert np.allclose(y, R * math.radians(26.0))


def test_x_runs_on_past_the_seam_around_a_site_just_west_of_it() -> None:
    # Surveyor 6, 1.4275°W (358.5725°E): its x is just inside +pi*R, and 0.1°E is past it.
    site_lon = -1.4275
    x, _ = horizon._equirectangular(np.array([0.0, 0.0]), np.array([0.1, 358.0]), site_lon)
    assert x[0] == pytest.approx(R * math.radians(0.1 + 180.0), abs=1e-6)
    assert x[0] > PI_R
    assert x[1] == pytest.approx(R * math.radians(178.0), abs=1e-6)


def test_a_site_away_from_the_seam_projects_to_the_same_bits() -> None:
    # Apollo 11 and Blue Ghost 1 do not cross the seam: their masks must not move at all.
    for site_lon, spread in ((23.47314, 6.0), (61.8099892551118, 6.0), (-23.4219, 6.0)):
        rng = np.random.default_rng(3)
        lon = site_lon + rng.uniform(-spread, spread, 500)
        lat = rng.uniform(-30.0, 30.0, 500)
        plain = horizon._equirectangular(lat, lon)
        around = horizon._equirectangular(lat, lon, site_lon)
        assert np.array_equal(plain[0], around[0])
        assert np.array_equal(plain[1], around[1])


def test_the_polar_projection_ignores_the_site_longitude() -> None:
    band = horizon.LADDER[0]
    lat, lon = np.array([-85.0]), np.array([0.5])
    with_site = horizon._project(band, lat, lon, 3.0)
    without = horizon._project(band, lat, lon)
    assert np.array_equal(with_site[0], without[0])
    assert np.array_equal(with_site[1], without[1])


def _window_with_a_wall(
    folder: Path, site: tuple[float, float], wall_x: float, wall_m: float
) -> None:
    """A SLDEM2015 ladder, flat but for a north-south wall at map x `wall_x`, on a continuous x.

    The far window runs 400 km either side of the Site and goes past +-pi*R, as the real
    ones cut by deploy/crop_offpole.py do. The cells are coarse (the Band, not the file,
    sets the walk's step), to keep the files small.
    """
    site_x, site_y = eqc_xy(*site)

    def heights(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        return np.where((x >= wall_x) & (x <= wall_x + 4_000.0), wall_m, 0.0) + 0.0 * y

    window = folder / "offpole" / "SEAM"
    write_dem(window / "SLDEM2015_512.TIF", (site_x, site_y), 500.0, 600, heights, EQC)
    write_dem(window / "SLDEM2015_128.TIF", (site_x, site_y), 2_000.0, 400, heights, EQC)


@pytest.mark.parametrize(
    ("site", "side", "azimuth"),
    [
        ((0.0, 3.6), -1.0, 270.0),  # Apollo 15's side: the wall is west, past the seam
        ((0.0, -3.6), 1.0, 90.0),  # Surveyor 6's side: the wall is east, past the seam
    ],
)
def test_a_wall_beyond_the_seam_sets_the_horizon(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    site: tuple[float, float],
    side: float,
    azimuth: float,
) -> None:
    site_x, _ = eqc_xy(*site)
    distance, height = 130_000.0, 6_000.0
    # On the equator a degree of longitude is a degree of arc, so the seam, 3.6° (about 109 km)
    # from the Site, is crossed by a ray that reaches the wall 130 km out.
    wall_x = site_x + side * distance - (0.0 if side > 0 else 4_000.0)
    assert abs(wall_x) > PI_R
    _window_with_a_wall(tmp_path, site, wall_x, height)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))

    mask = horizon.mask(site[0], site[1], 2.0, site_id="SEAM")

    # The top of the wall seen from 2 m up over a sphere of radius R, from `d` metres away:
    # atan2((R + h) cos(d/R) - (R + 2), (R + h) sin(d/R)).
    def top(d: float) -> float:
        return math.degrees(
            math.atan2(
                (R + height) * math.cos(d / R) - (R + 2.0),
                (R + height) * math.sin(d / R),
            )
        )

    # The wall's edge is one 2 km cell of ramp (bilinear), so the top the ray sees is between
    # the top at the edge cell centre, 130 km out, and at the one a cell farther.
    got = float(mask.elevations_deg[round(azimuth / 0.5)])
    assert top(distance + 2_000.0) - 0.005 <= got <= top(distance) + 0.005
    # Flat ground the other way: the dip of the horizon, well below the wall.
    flat = float(mask.elevations_deg[round(((azimuth + 180.0) % 360.0) / 0.5)])
    assert flat < -0.05
    assert got - flat > 0.4
