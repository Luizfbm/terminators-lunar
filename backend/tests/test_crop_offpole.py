"""The off-pole DEM windows keep SLDEM2015's own pixel grid.

Blue Ghost 1 check (the implementation): crop_offpole cut the near window with
rasterio.merge(bounds=...), which starts its grid at the bounds and fills it by nearest
neighbour. The terrain moved by up to half a pixel, the Site's height by metres, and the
Blue Ghost 1 Sunset came out 3.7 h before the one SLDEM2015 gives on its own grid.

No network: a small synthetic tile stands in for the SLDEM2015 tile under Blue Ghost 1.
"""

import importlib.util
import math
from pathlib import Path

import numpy as np
import pytest
import rasterio  # type: ignore[import-untyped]
from rasterio.transform import Affine  # type: ignore[import-untyped]

REPO = next(p for p in Path(__file__).resolve().parents if (p / "contract").is_dir())
SPEC = importlib.util.spec_from_file_location("crop_offpole", REPO / "deploy" / "crop_offpole.py")
assert SPEC and SPEC.loader
crop = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(crop)

LAT, LON = 18.5621232969557, 61.8099892551118
RES = 59.2252938  # SLDEM2015 512 ppd on the 1737.4 km sphere
# The real tile's origin (00N-30N, 45-90E), so the synthetic grid is the real one.
X0, Y0 = -4093652.3074560002, 909700.512768


def test_near_window_keeps_the_source_grid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    col = int((math.radians(LON - 180.0) * 1737400.0 - X0) / RES)
    row = int((Y0 - math.radians(LAT) * 1737400.0) / RES)
    size = 200
    left, top = X0 + (col - size // 2) * RES, Y0 - (row - size // 2) * RES
    rng = np.random.default_rng(7)
    km = (-3.65 + rng.normal(0, 0.003, (size, size))).astype(np.float32)
    name = "SLDEM2015_512_00N_30N_045_090_FLOAT.LBL"
    with rasterio.open(
        tmp_path / name,
        "w",
        driver="GTiff",
        width=size,
        height=size,
        count=1,
        dtype="float32",
        crs=crop.rasterio.crs.CRS.from_proj4(
            "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +x_0=0 +y_0=0 +R=1737400 +units=m"
        ),
        transform=Affine(RES, 0, left, 0, -RES, top),
    ) as tile:
        tile.write(km, 1)
    (tmp_path / name.replace(".LBL", ".IMG")).write_bytes(b"")
    monkeypatch.setattr(crop, "SLDEM_LOCAL", tmp_path)
    monkeypatch.setattr(crop, "NEAR_M", 2000.0)

    out = tmp_path / "near.TIF"
    crop._sldem_near(LAT, LON, out)

    with rasterio.open(out) as window:
        t = window.transform
        shift_x = ((t.c - left) / RES) % 1.0
        shift_y = ((top - t.f) / RES) % 1.0
        assert min(shift_x, 1 - shift_x) < 1e-6, shift_x
        assert min(shift_y, 1 - shift_y) < 1e-6, shift_y
        c0, r0 = round((t.c - left) / RES), round((top - t.f) / RES)
        got = window.read(1)
    want = km[r0 : r0 + got.shape[0], c0 : c0 + got.shape[1]].astype(np.float64) * 1000.0
    assert np.allclose(got, want, atol=1e-3)


def test_a_stale_window_is_cut_again(tmp_path: Path) -> None:
    # deploy of the implementation: the VPS kept the windows cut on the shifted grid, because
    # the script skipped any window already on disk, and the digest check then failed.
    path = tmp_path / "SLDEM2015_512.TIF"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=2,
        height=2,
        count=1,
        dtype="float32",
        transform=Affine(1, 0, 0, 0, -1, 0),
    ) as window:
        window.write(np.zeros((2, 2), dtype=np.float32), 1)
    name = "BG1/SLDEM2015_512.TIF"
    assert crop.needs_cut(path, name, {name: crop.digest(path)}) is False
    assert crop.needs_cut(path, name, {name: "0" * 64}) is True
    assert crop.needs_cut(tmp_path / "missing.TIF", name, {}) is True


def test_the_error_window_is_cut_on_the_dem_windows_grid(tmp_path: Path) -> None:
    """Chandrayaan-3's `_ERR` window comes from the same bounds as its DEM window (issue 51)."""
    lat, lon, half = -69.373, 32.319, 2000.0
    left, bottom, right, top = crop._polar_bounds(lat, lon, 4 * half)
    res = 60.0
    width, height = int((right - left) / res), int((top - bottom) / res)
    transform = Affine(res, 0, left, 0, -res, top)
    crs = rasterio.crs.CRS.from_proj4(
        "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m"
    )
    rng = np.random.default_rng(3)
    for name, values in (
        ("LDEM_60S_60MPP_ADJ", 1000.0 + rng.normal(0, 5, (height, width))),
        ("LDEM_60S_60MPP_ADJ_ERR", np.abs(rng.normal(0.5, 0.1, (height, width)))),
    ):
        with rasterio.open(
            tmp_path / f"{name}.TIF",
            "w",
            driver="GTiff",
            width=width,
            height=height,
            count=1,
            dtype="float32",
            crs=crs,
            transform=transform,
        ) as source:
            source.write(values.astype(np.float32), 1)

    dem, error = tmp_path / "cut" / "dem.TIF", tmp_path / "cut" / "err.TIF"
    dem.parent.mkdir()
    crop._ldem("LDEM_60S_60MPP_ADJ", tmp_path, lat, lon, half, dem)
    crop._ldem("LDEM_60S_60MPP_ADJ" + crop.ERROR_SUFFIX, tmp_path, lat, lon, half, error)
    crop._same_grid(dem, error)
    with rasterio.open(dem) as a, rasterio.open(error) as b:
        assert a.shape == b.shape and a.shape[0] > 10
        assert a.transform.almost_equals(b.transform)
        assert float(b.read(1).max()) < 2.0  # metres of error, not heights
    # A window on another grid is refused, not silently read as if it matched.
    crop._ldem("LDEM_60S_60MPP_ADJ_ERR", tmp_path, lat, lon, half / 2, error.with_name("e2.TIF"))
    with pytest.raises(SystemExit):
        crop._same_grid(dem, error.with_name("e2.TIF"))


def _periodic_km(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Heights in km that repeat every 2*pi*R in x, as the Moon does going round."""
    return 0.4 * np.cos(3.0 * x / 1737400.0) + 0.2 * np.sin(5.0 * x / 1737400.0) + y * 1e-7


def _write_tile(path: Path, left: float, top: float, size: int) -> None:
    xs = left + (np.arange(size) + 0.5) * RES
    ys = top - (np.arange(size) + 0.5) * RES
    km = _periodic_km(xs[np.newaxis, :], ys[:, np.newaxis]).astype(np.float32)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=size,
        height=size,
        count=1,
        dtype="float32",
        crs=rasterio.crs.CRS.from_proj4(
            "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +x_0=0 +y_0=0 +R=1737400 +units=m"
        ),
        transform=Affine(RES, 0, left, 0, -RES, top),
    ) as tile:
        tile.write(km, 1)
    path.with_suffix(".IMG").write_bytes(b"")


def test_a_near_window_across_the_seam_is_continuous_and_has_no_gap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # 15/11/2026, the mission Sites: the near window of Apollo 15 (3.6°E) was cut from the
    # 000-045 tile alone and ran 10 km past x = -pi*R, so those 181 columns were NaN, and the
    # engine's rays across 0°E found nothing there. The window now takes the 315-360 tile too,
    # a whole map width to the east, so x runs on past -pi*R with the data of the other side.
    pi_r = math.pi * 1737400.0
    size, row = 300, 10_000
    top = Y0 - row * RES
    west_edge = -pi_r  # left edge of the 000-045 tile, x = R*radians(0 - 180)
    _write_tile(tmp_path / "SLDEM2015_512_00N_30N_000_045_FLOAT.LBL", west_edge, top, size)
    _write_tile(tmp_path / "SLDEM2015_512_00N_30N_315_360_FLOAT.LBL", pi_r - size * RES, top, size)
    monkeypatch.setattr(crop, "SLDEM_LOCAL", tmp_path)
    monkeypatch.setattr(crop, "NEAR_M", 3000.0)
    lat, lon = 10.0, 0.02  # 0.02° is about 600 m from the seam: the window reaches 2.4 km past it

    out = tmp_path / "near.TIF"
    crop._sldem_near(lat, lon, out)

    with rasterio.open(out) as window:
        t, got = window.transform, window.read(1)
    assert t.c < -pi_r - 2000.0  # the window begins west of the seam, on the map's far side
    assert t.c + got.shape[1] * t.a > -pi_r + 2000.0  # and ends on this side
    assert not np.isnan(got).any()
    xs = t.c + (np.arange(got.shape[1]) + 0.5) * t.a
    ys = t.f + (np.arange(got.shape[0]) + 0.5) * t.e
    # The same heights as one unbroken map would give: the periodic function at the
    # continuous x, not x jumping by 2*pi*R at the seam.
    want = _periodic_km(xs[np.newaxis, :], ys[:, np.newaxis]) * 1000.0
    assert np.allclose(got, want, atol=1e-3)


def test_the_stitched_window_is_the_merged_one_where_there_is_no_seam(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # The stitching is only used past the seam; where merge() used to cut the window it must
    # give the same pixels, since offpole.sha256 pins them.
    size, col, row = 300, 5_000, 10_000
    left, top = -math.pi * 1737400.0 + col * RES, Y0 - row * RES
    path = tmp_path / "SLDEM2015_512_00N_30N_000_045_FLOAT.LBL"
    _write_tile(path, left, top, size)
    sources = [rasterio.open(path)]
    try:
        x = left + size * RES / 2.0
        bounds = crop._snap(
            (x - 2000.0, top - 9000.0, x + 2000.0, top - 5000.0), sources[0].transform
        )
        stitched, stitched_t = crop._stitch(sources, bounds)
        merged, merged_t = crop.merge(sources, bounds=bounds, nodata=np.nan, dtype="float32")
    finally:
        sources[0].close()
    assert tuple(stitched_t)[:6] == pytest.approx(tuple(merged_t)[:6], abs=1e-6)
    assert stitched.shape == merged.shape
    assert np.array_equal(stitched, merged)


def test_a_far_window_across_the_seam_comes_round_the_globe(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # SLDEM2015_128 is one 360° raster. The far window of Apollo 15 starts 275 km west of its
    # first column; rasterio read the first columns instead and kept the geotransform, so the
    # whole window sat 275 km from where its heights were. The columns must come from the
    # raster's east end, and the geotransform must say where they are on the continuous map.
    pi_r = math.pi * 1737400.0
    cols, rows = 720, 240
    cell = 2.0 * pi_r / cols
    top = rows / 2.0 * cell
    xs = -pi_r + (np.arange(cols) + 0.5) * cell
    ys = top - (np.arange(rows) + 0.5) * cell
    km = _periodic_km(xs[np.newaxis, :], ys[:, np.newaxis]).astype(np.float32)
    global_raster = tmp_path / "global.TIF"
    with rasterio.open(
        global_raster,
        "w",
        driver="GTiff",
        width=cols,
        height=rows,
        count=1,
        dtype="float32",
        crs=rasterio.crs.CRS.from_proj4(
            "+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=180 +x_0=0 +y_0=0 +R=1737400 +units=m"
        ),
        transform=Affine(cell, 0, -pi_r, 0, -cell, top),
    ) as dataset:
        dataset.write(km, 1)
    real_open = rasterio.open

    def open_the_global(path: str, *args: object, **kwargs: object):  # type: ignore[no-untyped-def]
        if str(path).startswith("/vsicurl/"):
            return real_open(global_raster)
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(crop.rasterio, "open", open_the_global)
    monkeypatch.setattr(crop, "FAR_M", 120_000.0)
    for lat, lon in ((10.0, 2.0), (10.0, -2.0)):  # east and west of the seam, 60 km from it
        out = tmp_path / f"far_{lon}.TIF"
        crop._sldem_far(lat, lon, out)
        with real_open(out) as window:
            t, got = window.transform, window.read(1)
        assert t.c < -pi_r or t.c + got.shape[1] * t.a > pi_r  # the window crosses the seam
        assert not np.isnan(got).any()
        wx = t.c + (np.arange(got.shape[1]) + 0.5) * t.a
        wy = t.f + (np.arange(got.shape[0]) + 0.5) * t.e
        want = _periodic_km(wx[np.newaxis, :], wy[:, np.newaxis]) * 1000.0
        assert np.allclose(got, want, atol=1e-3)
