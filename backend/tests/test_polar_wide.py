"""A polar point past the 80 m DEM's square, which the 60 m DEM now answers.

15/11/2026: a typed point is taken up to 80°S, but the 80 m DEM is a square of ±304 km around
the pole and the rays walk it out to 100 km, so the polar ladder answered only up to ~83.3°S in
every direction; past that the answer was 422 outside-coverage. The 60 m DEM of the same release
reaches 60°S and is finer, so it walks those 5 to 100 km instead (POLAR_WIDE), and every ray
from the Site right at the 20 m square's edge (POLAR_EDGE). A point the polar ladder answers
must not change by a bit.

The ladders are unit-tested here and the engine is run over small synthetic DEMs with the
products' file names; the real 60 m DEM is driven through the API in test_regressions.py.
"""

import math
from pathlib import Path

import numpy as np
import pytest

from app import horizon
from app.constants import AZIMUTH_STEP_DEG
from tests.synthetic_dem import POLAR, Heights, R, polar_latlon, polar_xy, write_dem

W20, W80, W60, W240 = (
    "LDEM_80S_20MPP_ADJ",
    "LDEM_80S_80MPP_ADJ",
    horizon.WIDE_PRODUCT,
    "LDEM_60S_240MPP_ADJ",
)
SITE = (-84.0, 0.0)  # 182 km from the pole: on the 0° meridian, north is +y on the map
WALL_M = 3_000.0
WALL_GAP_M = 60_000.0  # map metres from the Site to the wall's near edge, due north


def _products(mask: horizon.Mask) -> list[str]:
    return [entry["product"] for entry in mask.products]


def test_the_60_m_band_stands_for_the_80_m_rung() -> None:
    wide = horizon.POLAR_WIDE
    assert horizon.rung(20.0, wide) == wide
    # The 80 m rung reads the 60 m DEM from the Site out to 100 km, then the 240 m one.
    assert horizon.rung(80.0, wide) == (
        horizon.Band(W60, 60.0, 0.0, 100_000.0, rung_m=80.0),
        horizon.Band(W240, 240.0, 100_000.0, 300_000.0),
    )
    assert horizon.rung(240.0, wide) == (horizon.Band(W240, 240.0, 0.0, 300_000.0),)
    assert horizon.rung(80.0, horizon.POLAR_EDGE) == horizon.POLAR_EDGE
    assert horizon.rung(20.0, horizon.POLAR_EDGE) == horizon.POLAR_EDGE


def test_the_ladders_that_were_there_cut_their_rungs_as_before() -> None:
    ladder = horizon.LADDER
    assert horizon.rung(20.0, ladder) == ladder
    assert horizon.rung(80.0, ladder) == (
        horizon.Band(W80, 80.0, 0.0, 100_000.0),
        horizon.Band(W240, 240.0, 100_000.0, 300_000.0),
    )
    assert horizon.rung(240.0, ladder) == (horizon.Band(W240, 240.0, 0.0, 300_000.0),)
    sldem, ldem60 = horizon.OFFPOLE_LADDERS
    # 59.2 m is not within 5% of 80 m, so the off-pole 80 m rung is still the coarse one alone.
    assert horizon.rung(80.0, sldem) == (
        horizon.Band("SLDEM2015_128", 236.9, 0.0, 300_000.0, "eqc"),
    )
    assert horizon.rung(80.0, ldem60) == (horizon.Band(W240, 240.0, 0.0, 300_000.0),)
    assert horizon.rung(20.0, ldem60) == ldem60


def _flat(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    return 0.0 * x + 0.0 * y


def _wall_north(site_y: float) -> Heights:
    def heights(x: np.ndarray, y: np.ndarray) -> np.ndarray:
        near = site_y + WALL_GAP_M
        return np.where((y >= near) & (y <= near + 4_000.0), WALL_M, 0.0) + 0.0 * x

    return heights


def _dems(
    folder: Path,
    *,
    with_60: bool,
    eighty_covers_site: bool,
    twenty_at_site: bool = True,
) -> None:
    """Flat polar DEMs with the products' names, sized so the Site is or is not covered.

    The cells are coarse (the Band, not the file, sets the walk's step) to keep the files small.
    The 60 m one has a wall due north; the others are flat.
    """
    site_xy = polar_xy(*SITE)
    twenty_centre = site_xy if twenty_at_site else (0.0, 0.0)
    write_dem(folder / f"{W20}.TIF", twenty_centre, 200.0, 120, _flat, POLAR)  # ±12 km
    if eighty_covers_site:
        write_dem(folder / f"{W80}.TIF", site_xy, 2_000.0, 150, _flat, POLAR)  # ±150 km
    else:
        write_dem(folder / f"{W80}.TIF", (0.0, 0.0), 2_000.0, 60, _flat, POLAR)  # ±60 km
    write_dem(folder / f"{W240}.TIF", site_xy, 4_000.0, 170, _flat, POLAR)  # ±340 km
    if with_60:
        write_dem(
            folder / f"{W60}.TIF", site_xy, 500.0, 480, _wall_north(site_xy[1]), POLAR
        )  # ±120 km


def _top_of_wall_deg(ground_m: float) -> float:
    """The wall's top from 2 m above flat ground, over a sphere of radius R, `ground_m` away."""
    return math.degrees(
        math.atan2(
            (R + WALL_M) * math.cos(ground_m / R) - (R + 2.0),
            (R + WALL_M) * math.sin(ground_m / R),
        )
    )


def _ground_to_map_y(y: float) -> float:
    """Ground distance due north (along the 0° meridian) from the Site to map y = `y`."""
    lat, _ = polar_latlon(0.0, y)
    return R * math.radians(lat - SITE[0])


def test_past_the_80_m_square_the_old_ladder_has_no_answer(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _dems(tmp_path, with_60=False, eighty_covers_site=False)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    with pytest.raises(horizon.DemUnavailable) as error:
        horizon.mask(*SITE, 2.0)
    # The polar ladder's own reason, as before the 60 m fallback existed.
    assert error.value.product == W80
    assert "run past the edge" in error.value.reason


def test_past_the_80_m_square_the_60_m_dem_answers_and_sees_the_wall(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _dems(tmp_path, with_60=True, eighty_covers_site=False)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    mask = horizon.mask(*SITE, 2.0)

    assert _products(mask) == [W20, W60, W240]
    assert np.all(np.isfinite(mask.elevations_deg))
    # Due north the wall: its near edge is 60 km out on the map, and the 500 m cells ramp it
    # (bilinear) over one cell, so the top the ray sees is between the two cell centres.
    site_y = polar_xy(*SITE)[1]
    near = _ground_to_map_y(site_y + WALL_GAP_M - 500.0)
    far = _ground_to_map_y(site_y + WALL_GAP_M + 500.0)
    got = float(mask.elevations_deg[0])
    assert _top_of_wall_deg(far) - 0.01 <= got <= _top_of_wall_deg(near) + 0.01
    # Due south, towards the pole, flat ground: the dip of the horizon, well below the wall.
    south = float(mask.elevations_deg[round(180.0 / AZIMUTH_STEP_DEG)])
    assert south < -0.05
    assert got - south > 1.0


def test_a_point_the_80_m_dem_covers_is_answered_exactly_as_before(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    without, with_60 = tmp_path / "without", tmp_path / "with"
    _dems(without, with_60=False, eighty_covers_site=True)
    _dems(with_60, with_60=True, eighty_covers_site=True)

    monkeypatch.setenv("LUNAR_DEM_DIR", str(without))
    before = horizon.mask(*SITE, 2.0)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(with_60))
    after = horizon.mask(*SITE, 2.0)

    # The 60 m DEM, wall and all, is not read: same products and the same mask to the bit.
    assert _products(after) == [W20, W80, W240]
    assert np.array_equal(before.elevations_deg, after.elevations_deg)
    assert before.samples == after.samples


def test_at_the_edge_of_the_20_m_square_every_ray_walks_the_60_m_dem(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _dems(tmp_path, with_60=True, eighty_covers_site=False, twenty_at_site=False)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    mask = horizon.mask(*SITE, 2.0)
    assert _products(mask) == [W60, W240]
    assert np.all(np.isfinite(mask.elevations_deg))


# 15/11/2026: one resolver chooses the bands, for the mask and for the clones of the
# Uncertainty band, so the two never read different DEMs for the same point.
def _band_products() -> list[str]:
    return [band.product for band in horizon.bands_for(*SITE, None)[1]]


@pytest.mark.parametrize(
    ("with_60", "eighty_covers_site", "twenty_at_site", "expected"),
    [
        (True, True, True, [W20, W80, W240]),
        (True, False, True, [W20, W60, W240]),
        (True, False, False, [W60, W240]),
        # Nothing covers the rays: the polar ladder, so the error that follows is its own.
        (False, False, True, [W20, W80, W240]),
    ],
)
def test_the_resolver_picks_the_bands_the_mask_walks(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    with_60: bool,
    eighty_covers_site: bool,
    twenty_at_site: bool,
    expected: list[str],
) -> None:
    _dems(
        tmp_path,
        with_60=with_60,
        eighty_covers_site=eighty_covers_site,
        twenty_at_site=twenty_at_site,
    )
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    assert _band_products() == expected
    # The 80 m rung of the same point: the 60 m DEM stands in for it, and it is what the mask walks.
    rung_80 = [band.product for band in horizon.bands_for(*SITE, None, 80.0)[1]]
    assert rung_80 == [W60 if W60 in expected else W80, W240]
    if with_60 or eighty_covers_site:
        assert _products(horizon.mask(*SITE, 2.0)) == expected
        assert horizon.site_height_m(*SITE) == pytest.approx(0.0)
