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
