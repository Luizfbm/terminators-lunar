"""A typed point anywhere on the Moon, walked over LOLA's global LDEM_128 (Phase B, 15/11/2026).

Before: a typed point north of 80°S was 422 outside-coverage, since the only DEMs were the south
polar ones and the off-pole windows of the curated Sites. With LOLA's global map on the server
(LDEM_128, 237 m, simple cylindrical centred on 180°E like SLDEM2015), the rays of any point
between 70°S and 70°N walk it out to 300 km; within 20° of either pole LOLA's polar
stereographic DEMs do (the south ones the polar ladder already has, LDEM_60N_240M in the north).

The map is the whole Moon in longitude, so its first column (0°E) touches its last: a ray that
crosses 0°E must read on from the other edge, not run off the map. Without the global file
nothing changes: same 80°S limit, same answers, to the bit.

These run the engine over small synthetic DEMs with the products' file names; the real
LDEM_128 is driven through the API in test_regressions.py.
"""

import math
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
import rasterio  # type: ignore[import-untyped]
from fastapi.testclient import TestClient
from rasterio.transform import from_origin  # type: ignore[import-untyped]

from app import horizon, slope
from app.constants import AZIMUTH_STEP_DEG
from app.main import app
from tests.synthetic_dem import EQC, R
from tests.test_polar_wide import SITE as POLAR_SITE
from tests.test_polar_wide import _dems as polar_dems

GLOBAL = horizon.GLOBAL_PRODUCT
CELL_DEG = 0.25  # coarse cells keep the file small; the Band, not the file, sets the walk's step
WALL_M = 3_000.0
# The wall: the two cells whose centres are at 359.125°E and 359.375°E, just west of 0°E.
WALL_CENTRES_DEG = (-0.875, -0.625)
SEAM_SITE = (0.0, 0.5)  # half a degree east of 0°E: due west, the wall is across the seam


def _write_global(folder: Path, heights_of_lon: object = None) -> None:
    """A whole-Moon simple cylindrical DEM, lon_0 180°, first column at 0°E, flat but the wall."""
    folder.mkdir(parents=True, exist_ok=True)
    cols, rows = round(360 / CELL_DEG), round(180 / CELL_DEG)
    cell_m = R * math.radians(CELL_DEG)
    # Cell centre longitudes, 0..360°E from the first column, as in LDEM_128.
    lon = (np.arange(cols) + 0.5) * CELL_DEG
    signed = (lon + 180.0) % 360.0 - 180.0
    if heights_of_lon is None:
        row = np.where(np.isin(np.round(signed, 6), WALL_CENTRES_DEG), WALL_M, 0.0)
    else:
        row = heights_of_lon(np.radians(lon))  # type: ignore[operator]
    grid = np.broadcast_to(row, (rows, cols)).astype(np.float32)
    with rasterio.open(
        folder / f"{GLOBAL}.TIF",
        "w",
        driver="GTiff",
        width=cols,
        height=rows,
        count=1,
        dtype="float32",
        crs=rasterio.crs.CRS.from_proj4(EQC),
        transform=from_origin(-math.pi * R, math.pi * R / 2.0, cell_m, cell_m),
        nodata=np.nan,
    ) as dataset:
        dataset.write(grid, 1)


def _top_deg(ground_m: float, height_m: float = WALL_M) -> float:
    """A wall top `ground_m` away over a sphere of radius R, from 2 m above flat ground."""
    return math.degrees(
        math.atan2(
            (R + height_m) * math.cos(ground_m / R) - (R + 2.0),
            (R + height_m) * math.sin(ground_m / R),
        )
    )


def _ground_west_m(longitude_deg: float) -> float:
    """Ground distance along the equator from the Site west to a (signed) longitude."""
    return R * math.radians(SEAM_SITE[1] - longitude_deg)


def test_the_global_ladders_are_one_band_on_every_rung() -> None:
    for ladder in (horizon.GLOBAL, horizon.SOUTH_CAP, horizon.NORTH_CAP):
        for finest in horizon.RUNGS_M:
            assert horizon.rung(finest, ladder) == ladder
    near, far = horizon.GLOBAL
    assert {(b.product, b.resolution_m, b.projection, b.wraps) for b in (near, far)} == {
        (GLOBAL, 236.9, "eqc", True)
    }
    # One DEM in two bands: walked every 10 m to 5 km, then at half a pixel to 300 km.
    assert (near.inner_m, near.outer_m, near.step_m) == (0.0, 5_000.0, 10.0)
    assert (far.inner_m, far.outer_m, far.step_m) == (5_000.0, 300_000.0, None)


def test_a_hilltop_closer_than_half_a_237_m_pixel_is_the_horizon(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 15/11/2026, 45°N 100°W: the engine started each band half a pixel out, 118 m on the
    # 237 m map, and a convex slope whose top was 90 m away was missed by 0.6°. Here one
    # cell is a 400 m hill on flat ground and the Site stands 90 m west of its top, on its
    # bilinear flank: due east the ground climbs above the eye to the top 90 m away, then
    # falls, so the horizon is that top. A walk from 118 m out sees only the far side.
    hill_deg = 10.0 + CELL_DEG * 1.5  # a cell centre
    cell_m = R * math.radians(CELL_DEG)
    gap_m = 90.0
    _write_global(
        tmp_path,
        lambda lon: np.where(np.isclose(np.degrees(lon), hill_deg), 400.0, 0.0),
    )
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    mask = horizon.mask(0.0, hill_deg - math.degrees(gap_m / R), 2.0)
    east = float(mask.elevations_deg[round(90.0 / AZIMUTH_STEP_DEG)])

    # Written out: the tent the bilinear makes along the equator, walked every 0.1 m to 5 km.
    d = np.arange(0.1, 5_000.0, 0.1)
    ground = 400.0 * np.clip(1.0 - np.abs(d - gap_m) / cell_m, 0.0, None)
    eye = R + 400.0 * (1.0 - gap_m / cell_m) + 2.0
    theta = d / R
    walk = np.degrees(np.arctan2((R + ground) * np.cos(theta) - eye, (R + ground) * np.sin(theta)))
    assert d[np.argmax(walk)] == pytest.approx(gap_m, abs=0.2)
    assert east == pytest.approx(float(walk.max()), abs=0.003)


def test_which_dems_walk_a_typed_point_by_latitude() -> None:
    assert horizon.beyond_polar(0.0) == (horizon.GLOBAL,)
    assert horizon.beyond_polar(69.9) == (horizon.GLOBAL,)
    assert horizon.beyond_polar(-69.9) == (horizon.GLOBAL,)
    assert horizon.beyond_polar(70.0) == (horizon.NORTH_CAP,)
    assert horizon.beyond_polar(-70.0)[-1] == horizon.SOUTH_CAP
    assert horizon.beyond_polar(-75.0)[0] == horizon.LADDER


def test_without_the_global_map_a_typed_point_is_still_limited_to_80s(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    assert horizon.custom_max_latitude_deg() == -80.0
    # The polar ladder's own error, as before the global map existed.
    with pytest.raises(horizon.DemUnavailable) as error:
        horizon.mask(*SEAM_SITE, 2.0)
    assert error.value.product == "LDEM_80S_20MPP_ADJ"
    _write_global(tmp_path)
    assert horizon.custom_max_latitude_deg() == 90.0


def test_a_ray_across_0e_reads_on_from_the_other_edge_and_sees_the_wall(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_global(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    mask = horizon.mask(*SEAM_SITE, 2.0)
    assert [p["product"] for p in mask.products] == [GLOBAL]
    assert np.all(np.isfinite(mask.elevations_deg))
    # Due west the wall, across the seam. Its top is flat between the two cell centres and the
    # bilinear ramps it to 0 at the next centres, so the top the ray sees is between these.
    west = float(mask.elevations_deg[round(270.0 / AZIMUTH_STEP_DEG)])
    near = _ground_west_m(WALL_CENTRES_DEG[1] + CELL_DEG)
    far = _ground_west_m(WALL_CENTRES_DEG[0])
    assert _top_deg(far) - 0.01 <= west <= _top_deg(near) + 0.01, west
    # Due east, flat ground: the dip of the horizon, far below the wall.
    east = float(mask.elevations_deg[round(90.0 / AZIMUTH_STEP_DEG)])
    assert east < 0.0
    assert west - east > 3.0


def test_a_point_away_from_the_seam_reads_the_map_exactly_as_a_plain_read(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_global(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    plain = tuple(replace(band, wraps=False) for band in horizon.GLOBAL)
    for site in ((10.0, 180.0), (-40.0, 90.0)):
        wrapped = horizon._mask(str(tmp_path), horizon.GLOBAL, *site, 2.0)
        unwrapped = horizon._mask(str(tmp_path), plain, *site, 2.0)
        assert np.array_equal(wrapped.elevations_deg, unwrapped.elevations_deg)
        assert wrapped.samples == unwrapped.samples


def test_points_the_polar_ladder_answers_do_not_change_with_the_global_map(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    without, with_global = tmp_path / "without", tmp_path / "with"
    polar_dems(without, with_60=True, eighty_covers_site=True)
    polar_dems(with_global, with_60=True, eighty_covers_site=True)
    _write_global(with_global)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(without))
    before = horizon.mask(*POLAR_SITE, 2.0)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(with_global))
    after = horizon.mask(*POLAR_SITE, 2.0)
    assert after.products == before.products
    assert np.array_equal(before.elevations_deg, after.elevations_deg)
    assert before.samples == after.samples


def test_near_the_north_pole_the_cylindrical_map_is_never_walked(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Past 70°N a ray over the pole would cross every column of the cylindrical map. Without
    # the north polar DEM the answer is a clear DemUnavailable, never the cylindrical one.
    _write_global(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    with pytest.raises(horizon.DemUnavailable) as error:
        horizon.mask(85.0, 0.0, 2.0)
    assert error.value.product == horizon.NORTH_PRODUCT


def test_north_polar_stereographic_puts_0e_down_the_map_and_is_true_at_the_pole() -> None:
    x, y = horizon._stereographic_north(np.array([80.0, 80.0]), np.array([0.0, 90.0]))
    rho = 2.0 * R * math.tan(math.radians(10.0) / 2.0)  # written out: colatitude 10°
    assert x[0] == pytest.approx(0.0, abs=1e-6)
    assert y[0] == pytest.approx(-rho)
    assert x[1] == pytest.approx(rho)
    assert y[1] == pytest.approx(0.0, abs=1e-6)
    near, _ = horizon._stereographic_north(np.array([89.99]), np.array([90.0]))
    assert near[0] == pytest.approx(R * math.radians(0.01), rel=1e-6)


def test_the_slope_of_a_typed_point_on_0e_reads_across_the_seam(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Heights 1000 m * sin(longitude): continuous round the Moon, and at 0°E on the equator
    # the slope is atan(1000 / R) along x (written out here), the same on both sides of 0°E.
    _write_global(tmp_path, lambda lon: 1_000.0 * np.sin(lon))
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    found = slope.measure(0.0, 0.01, 20_000.0, 10.0)
    assert found.product == GLOBAL
    expected = math.degrees(math.atan(1_000.0 / R))
    assert found.median_deg == pytest.approx(expected, rel=0.01)


def test_the_slope_of_a_typed_point_past_80s_tries_the_finest_dem_first(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 15/11/2026: at 79.9°S 0°E the Slope came from the 240 m DEM though the 60 m one covers
    # the point: the polar ladders were joined in the order they are tried, not by resolution.
    _write_global(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    _, bands = horizon.slope_bands(None, -79.9)
    resolutions = [band.resolution_m for band in bands]
    assert resolutions == sorted(resolutions)
    assert [band.product for band in bands][:2] == ["LDEM_80S_20MPP_ADJ", horizon.WIDE_PRODUCT]
    assert len({band.product for band in bands}) == len(bands)
    # The polar ladder of a point south of 80°S is the ladder itself, as before.
    assert horizon.slope_bands(None, -85.0)[1] == horizon.LADDER


def test_the_near_and_far_bands_of_one_dem_share_its_pixels_without_changing_the_mask(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The two bands walk in their own threads over one window of LDEM_128. The mask must be what
    # each band gives alone, with a window of its own, element by element: the highest of the two.
    _write_global(tmp_path, lambda lon: 800.0 * np.sin(40.0 * lon) + 300.0 * np.cos(90.0 * lon))
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    site = (20.0, 359.9)  # a few cells from the 0°E seam, so the shared window wraps
    near, far = horizon.GLOBAL
    together = horizon._compute(str(tmp_path), (near, far), *site, 2.0, {})
    alone_near = horizon._compute(str(tmp_path), (near,), *site, 2.0, {})
    alone_far = horizon._compute(str(tmp_path), (far,), *site, 2.0, {})
    assert np.array_equal(
        together.elevations_deg, np.maximum(alone_near.elevations_deg, alone_far.elevations_deg)
    )


# --- through the HTTP API: what every route that takes a typed point does with a global one ----

client = TestClient(app)
START = "2026-11-15T00:00:00Z"
POINT = {"latitude_deg": 10.0, "longitude_deg": 20.0, "start": START, "duration_hours": 24}


@pytest.fixture
def global_dem(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A server whose DEM folder holds only LDEM_128 (flat ground, a wall at 359.1°E)."""
    _write_global(tmp_path)
    monkeypatch.setenv("LUNAR_DEM_DIR", str(tmp_path))
    return tmp_path


def test_a_typed_point_is_answered_and_the_provenance_names_the_dem_and_its_cell(
    global_dem: Path,
) -> None:
    meta = client.get("/meta").json()
    assert meta["coverage"]["custom_max_latitude_deg"] == 90.0
    assert meta["dems"] == [{"product": GLOBAL, "resolution_m": 236.9}]
    response = client.get("/visibility", params=POINT)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["horizon"]["samples"]) == 720
    # The product and its true cell (128 px/deg of a 1737.4 km sphere is 236.9 m), for the
    # screen to show: not the 20 m of the rung the Query asked at.
    assert payload["provenance"]["dems"] == [{"product": GLOBAL, "resolution_m": 236.9}]
    cell_m = R * math.radians(1.0 / 128.0)
    assert payload["provenance"]["dems"][0]["resolution_m"] == pytest.approx(cell_m, abs=0.05)


@pytest.mark.usefixtures("without_global_dem")
def test_without_the_global_map_the_same_point_is_422_south_of_80s(global_dem: Path) -> None:
    assert client.get("/meta").json()["coverage"]["custom_max_latitude_deg"] == -80.0
    response = client.get("/visibility", params=POINT)
    assert (response.status_code, response.json()["code"]) == (422, "outside_coverage")
    assert "south of 80°S" in response.json()["detail"]


@pytest.mark.parametrize("latitude", [85.0, 90.0])
def test_near_the_north_pole_without_the_north_polar_dem_the_answer_is_422_naming_it(
    global_dem: Path, latitude: float
) -> None:
    for path in ("/visibility", "/visibility/ladder", "/visibility/scatter"):
        response = client.get(path, params={**POINT, "latitude_deg": latitude})
        assert (response.status_code, response.json()["code"]) == (422, "outside_coverage"), path
        assert horizon.NORTH_PRODUCT in response.json()["detail"], path


def test_the_ladder_of_a_global_point_has_one_dem_on_every_rung(global_dem: Path) -> None:
    # One DEM answers on every rung, as the off-pole Curated Sites' 237 m map does for the 240
    # and 80 m rungs: each rung's `dems` says which one it was, and the rungs agree.
    response = client.get("/visibility/ladder", params=POINT)
    assert response.status_code == 200, response.text
    rungs = response.json()["rungs"]
    assert [rung["resolution_m"] for rung in rungs] == [240, 80, 20]
    assert all(rung["dems"] == [{"product": GLOBAL, "resolution_m": 236.9}] for rung in rungs)
    assert rungs[0]["metrics"] == rungs[1]["metrics"] == rungs[2]["metrics"]


def test_the_uncertainty_of_a_global_point_is_its_nominal_answer_as_a_band_of_one(
    global_dem: Path,
) -> None:
    # LDEM_128 has no per-pixel error raster, so no clone varies its heights (ADR 0006): the
    # band is the nominal answer and `uncovered` says the DEM was not varied.
    response = client.get("/visibility/uncertainty", params=POINT)
    assert response.status_code == 200, response.text
    band = response.json()
    nominal = client.get("/visibility", params=POINT).json()
    assert band["clones"] == 1
    assert band["error_products"] == []
    assert set(band["uncovered"]) == {GLOBAL}
    for name, value in nominal["metrics"].items():
        if name in band["metrics"]:
            assert band["metrics"][name] == {"low": value, "high": value}


def test_the_landing_scatter_of_a_global_point_has_its_19_points(global_dem: Path) -> None:
    response = client.get("/visibility/scatter", params=POINT)
    assert response.status_code == 200, response.text
    assert len(response.json()["points"]) == 19


def test_the_slope_of_a_global_point_is_422_where_the_cell_is_too_coarse_for_the_radius(
    global_dem: Path,
) -> None:
    # Never a made-up slope: with no cell centre inside the radius there is no Slope.
    response = client.get("/terrain", params={"latitude_deg": 10.0, "longitude_deg": 20.0})
    assert (response.status_code, response.json()["code"]) == (422, "outside_coverage")
    assert GLOBAL in response.json()["detail"]
