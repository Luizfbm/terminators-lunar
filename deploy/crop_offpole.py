"""Cuts the DEM windows for the Curated Sites outside the polar DEMs (the requirement).

Writes <out>/offpole/<site id>/<product>.TIF, heights in metres above the 1737.4 km
sphere, NaN where there is no data. Each window is a square around the Site, a little
wider than the rays the engine walks in that product (100 km near, 300 km far), so the
global mosaics never have to sit on the VPS whole.

Where PGDA publishes the per-pixel height error of a DEM (the 60°S products, so Chandrayaan-3),
<product>_ERR.TIF is cut beside the DEM window, from the same bounds on the same grid, in
metres: the Uncertainty band reads it (ADR 0006). Each has its own digest in offpole.sha256.

    python crop_offpole.py <out> [<local PGDA dem dir> [<local SLDEM2015 tile dir>]]

    python crop_offpole.py --digests <out>   prints the digests for offpole.sha256

Runs with rasterio only (the backend image has it). A product that is not in the local
dir is read over HTTP with /vsicurl/, which fetches only the rows it needs. Already
written windows are kept. Every window is then checked against `offpole.sha256` next to
this script. The digest is of the decoded heights and the geotransform, not of the file
bytes, so a different GDAL or zlib build writing the same numbers still passes.
"""

from __future__ import annotations

import hashlib
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.transform import Affine
from rasterio.windows import Window, from_bounds

R = 1_737_400.0
PGDA = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp"
SLDEM = "https://imbrium.mit.edu/DATA/SLDEM2015"
NEAR_M = 105_000.0  # rays to 100 km, plus a margin for the bilinear read
FAR_M = 310_000.0  # rays to 300 km
ERROR_SUFFIX = "_ERR"  # PGDA name of a DEM's per-pixel height error, as in backend/app/horizon.py

# Coordinates as in backend/app/data/sites.csv, which carries their citations.
SITES = {
    "APOLLO11": (0.67416, 23.47314, "sldem"),
    "BG1": (18.5621232969557, 61.8099892551118, "sldem"),
    "CH3": (-69.373, 32.319, "ldem60s"),
    # The mission landing sites of data/missions/missions.csv (LROC 2016), all outside the polar DEMs.
    "APOLLO12": (-3.0128, -23.4219, "sldem"),  # Apollo 12
    "APOLLO14": (-3.64589, -17.47194, "sldem"),  # Apollo 14
    "APOLLO15": (26.13239, 3.6333, "sldem"),  # Apollo 15
    "APOLLO16": (-8.9734, 15.5011, "sldem"),  # Apollo 16
    "APOLLO17": (20.1911, 30.7723, "sldem"),  # Apollo 17
    "SURVEYOR1": (-2.4745, -43.3398, "sldem"),  # Surveyor 1
    "SURVEYOR3": (-3.0162, -23.418, "sldem"),  # Surveyor 3
    "SURVEYOR5": (1.4551, 23.1943, "sldem"),  # Surveyor 5
    "SURVEYOR6": (0.4742, -1.4275, "sldem"),  # Surveyor 6
    "SURVEYOR7": (-40.9812, -11.5127, "sldem"),  # Surveyor 7
    "LUNA16": (-0.5137, 56.3638, "sldem"),  # Luna 16
    "LUNA17": (38.23764, -35.00163, "sldem"),  # Luna 17
    "LUNA20": (3.7863, 56.6242, "sldem"),  # Luna 20
    "LUNA21": (25.9994, 30.4076, "sldem"),  # Luna 21
    "LUNA23": (12.6667, 62.1511, "sldem"),  # Luna 23
    "LUNA24": (12.7142, 62.2129, "sldem"),  # Luna 24
    "CE3": (44.1214, -19.5117, "sldem"),  # Chang'e 3
}


def _tile_names(lat: float, lon: float, half_m: float) -> list[str]:
    """The SLDEM2015 512 ppd tiles (30° by 45°) under the window.

    The map's seam is at 0°E: a window that reaches past it takes the tiles on both sides.
    """
    dlat = math.degrees(half_m / R)
    dlon = math.degrees(half_m / (R * math.cos(math.radians(abs(lat) + dlat))))
    names = []
    for lat0 in range(-60, 60, 30):
        if lat - dlat >= lat0 + 30 or lat + dlat <= lat0:
            continue
        for lon0 in range(0, 360, 45):
            east = lon % 360.0
            # The window's longitudes, and the same ones a turn east and west of them.
            if all(
                east + turn - dlon >= lon0 + 45 or east + turn + dlon <= lon0
                for turn in (-360.0, 0.0, 360.0)
            ):
                continue
            band = {-60: "60S_30S", -30: "30S_00S", 0: "00N_30N", 30: "30N_60N"}[lat0]
            names.append(
                f"{SLDEM}/TILES/FLOAT_IMG/SLDEM2015_512_{band}_{lon0:03d}_{lon0 + 45:03d}_FLOAT.LBL"
            )
    return names


def _eqc_bounds(lat: float, lon: float, half_m: float) -> tuple[float, float, float, float]:
    """Window in SLDEM's equirectangular metres (lon_0 = 180°, true scale at the equator)."""
    x = R * math.radians((lon - 180.0 + 180.0) % 360.0 - 180.0)
    y = R * math.radians(lat)
    half_x = half_m / math.cos(math.radians(min(abs(lat) + math.degrees(half_m / R), 89.0)))
    return x - half_x, y - half_m, x + half_x, y + half_m


def _snap(bounds: tuple[float, float, float, float], grid) -> tuple[float, float, float, float]:
    """Bounds widened outwards to whole pixels of `grid` (an affine transform, north up)."""
    left, bottom, right, top = bounds
    x0, dx, y0, dy = grid.c, grid.a, grid.f, grid.e
    return (
        x0 + math.floor((left - x0) / dx) * dx,
        y0 + math.ceil((bottom - y0) / dy) * dy,
        x0 + math.ceil((right - x0) / dx) * dx,
        y0 + math.floor((top - y0) / dy) * dy,
    )


PI_R = math.pi * R


def _crosses_seam(bounds: tuple[float, float, float, float]) -> bool:
    """Whether a window runs past the map's seam (0°E, x = -+pi*R), by more than a metre."""
    return bounds[0] < -PI_R - 1.0 or bounds[2] > PI_R + 1.0


def _stitch(sources: list, bounds: tuple[float, float, float, float]) -> tuple[np.ndarray, Affine]:
    """The window as one continuous grid, the map's far side taken a turn round.

    A window past +-pi*R has no pixels there on the map: the Moon goes on at the opposite
    edge. Each tile is also tried a whole map width (2*pi*R, an exact number of pixels) east
    and west, so x keeps running past the seam, which is how the engine projects the rays
    (horizon._equirectangular). Pixels are copied, never resampled; the first tile wins.
    """
    grid = sources[0].transform
    dx, dy = grid.a, -grid.e
    left, bottom, right, top = bounds
    width, height = round((right - left) / dx), round((top - bottom) / dy)
    data = np.full((height, width), np.nan, dtype=np.float32)
    turn = round(2.0 * PI_R / dx) * dx
    for source in sources:
        for shift in (0.0, -turn, turn):
            s_left = source.bounds.left + shift
            s_right = source.bounds.right + shift
            o_left, o_right = max(left, s_left), min(right, s_right)
            o_bottom, o_top = max(bottom, source.bounds.bottom), min(top, source.bounds.top)
            if o_right <= o_left or o_top <= o_bottom:
                continue
            col = round((o_left - s_left) / dx)
            row = round((source.bounds.top - o_top) / dy)
            cols, rows = round((o_right - o_left) / dx), round((o_top - o_bottom) / dy)
            out_col, out_row = round((o_left - left) / dx), round((top - o_top) / dy)
            part = source.read(1, window=Window(col, row, cols, rows)).astype(np.float32)
            part[~np.isfinite(part) | (part < -1e30)] = np.nan
            target = data[out_row : out_row + rows, out_col : out_col + cols]
            target[np.isnan(target)] = part[np.isnan(target)]
    return data[np.newaxis], Affine(dx, 0.0, left, 0.0, grid.e, top)


def _read_wrapped(source, window: Window) -> np.ndarray:
    """A window of the 360° global SLDEM2015 raster, columns past an edge taken from the other.

    rasterio reads a window that starts left of column 0 as if it started at column 0, and
    window_transform() still says it starts out there: every height of Apollo 15's far window was labelled 275 km from
    where it was (15/11/2026). Here the missing columns come round the globe.
    """
    col0, row0 = int(window.col_off), int(window.row_off)
    cols, rows = int(window.width), int(window.height)
    if row0 < 0 or row0 + rows > source.height:
        raise SystemExit("the window runs past the poles of the SLDEM2015 global raster")
    km = np.full((rows, cols), np.nan)
    first = (col0 // source.width) * source.width
    for start in range(first, col0 + cols, source.width):
        low, high = max(col0, start), min(col0 + cols, start + source.width)
        part = source.read(1, window=Window(low - start, row0, high - low, rows))
        km[:, low - col0 : high - col0] = part
    return km


def _polar_bounds(lat: float, lon: float, half_m: float) -> tuple[float, float, float, float]:
    # The projection stretches distances by 2 / (1 + sin|lat|), more the farther from the
    # pole, so a 300 km ray from 69°S spans about 320 km of map: widen by the stretch at
    # the ray end nearest the equator.
    reach = abs(lat) - math.degrees(half_m / R)
    half_m *= 2.0 / (1.0 + math.sin(math.radians(reach)))
    rho = 2.0 * R * math.tan(math.pi / 4.0 + math.radians(lat) / 2.0)
    x, y = rho * math.sin(math.radians(lon)), rho * math.cos(math.radians(lon))
    return x - half_m, y - half_m, x + half_m, y + half_m


def _write(path: Path, data: np.ndarray, transform, crs) -> None:
    if not np.isfinite(data).any():
        raise SystemExit(f"{path}: no data in the window")
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": 1,
        "width": data.shape[1],
        "height": data.shape[0],
        "crs": crs,
        "transform": transform,
        "nodata": float("nan"),
        "compress": "deflate",
        "predictor": 3,
        "tiled": True,
        "blockxsize": 512,
        "blockysize": 512,
    }
    part = path.with_suffix(".part")
    with rasterio.open(part, "w", **profile) as out:
        out.write(data.astype(np.float32), 1)
    part.rename(path)


SLDEM_LOCAL: Path | None = None


def _local_or_remote(url: str) -> str:
    """A tile fetch-data.sh already downloaded whole, else the same tile over HTTP."""
    if SLDEM_LOCAL is not None:
        name = url.rsplit("/", 1)[1]
        if (SLDEM_LOCAL / name).is_file() and (
            SLDEM_LOCAL / name.replace(".LBL", ".IMG")
        ).is_file():
            return str(SLDEM_LOCAL / name)
    return f"/vsicurl/{url}"


def _sldem_near(lat: float, lon: float, path: Path) -> None:
    sources = [rasterio.open(_local_or_remote(name)) for name in _tile_names(lat, lon, NEAR_M)]
    try:
        # Snap the window to the tiles' own pixel grid. merge() starts its output grid at
        # the bounds it is given and fills it by nearest neighbour, so unsnapped bounds moved
        # the terrain by up to half a pixel (30 m) and the Site's height by metres.
        bounds = _snap(_eqc_bounds(lat, lon, NEAR_M), sources[0].transform)
        if _crosses_seam(bounds):
            data, transform = _stitch(sources, bounds)
        else:
            data, transform = merge(sources, bounds=bounds, nodata=np.nan, dtype="float32")
        crs = sources[0].crs
    finally:
        for source in sources:
            source.close()
    km = data[0]
    km[~np.isfinite(km) | (km < -1e30)] = np.nan
    _write(path, km * 1000.0, transform, crs)


def _sldem_far(lat: float, lon: float, path: Path) -> None:
    url = f"/vsicurl/{SLDEM}/GLOBAL/FLOAT_IMG/SLDEM2015_128_60S_60N_000_360_FLOAT.LBL"
    with rasterio.open(url) as source:
        window = from_bounds(*_eqc_bounds(lat, lon, FAR_M), source.transform).round_offsets()
        window = window.round_lengths()
        km = _read_wrapped(source, window)
        transform = source.window_transform(window)
        crs = source.crs
    km[km < -1e30] = np.nan
    _write(path, km * 1000.0, transform, crs)


def _ldem(
    product: str, local: Path | None, lat: float, lon: float, half: float, path: Path
) -> None:
    name = f"{product}.TIF"
    src = str(local / name) if local and (local / name).is_file() else f"/vsicurl/{PGDA}/{name}"
    with rasterio.open(src) as source:
        window = from_bounds(*_polar_bounds(lat, lon, half), source.transform)
        window = window.round_offsets().round_lengths()
        data = source.read(1, window=window, resampling=Resampling.nearest)
        _write(path, data, source.window_transform(window), source.crs)


def _same_grid(dem: Path, error: Path) -> None:
    """The error window must sit on the DEM window's pixels, or the clones refuse it."""
    with rasterio.open(dem) as a, rasterio.open(error) as b:
        if a.shape != b.shape or not a.transform.almost_equals(b.transform):
            raise SystemExit(f"{error} is not on the grid of {dem}")


# SLDEM2015 is raw, one row after the other, so a window is a run of whole rows: read
# it in big HTTP chunks instead of one request per row.
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_CHUNK_SIZE": str(10 * 1024 * 1024),
    "CPL_VSIL_CURL_CACHE_SIZE": str(512 * 1024 * 1024),
    "GDAL_HTTP_MAX_RETRY": "5",
    "GDAL_HTTP_RETRY_DELAY": "3",
}


SUMS = Path(__file__).with_name("offpole.sha256")


def digest(path: Path) -> str:
    with rasterio.open(path) as dataset:
        heights = dataset.read(1).astype("<f4")
        header = repr((tuple(dataset.transform)[:6], dataset.shape)).encode()
    heights[np.isnan(heights)] = np.float32("nan")  # one NaN bit pattern
    return hashlib.sha256(header + heights.tobytes()).hexdigest()


def _windows(out: Path) -> list[Path]:
    return sorted(out.glob("*/*.TIF"))


def _expected() -> dict[str, str]:
    expected = {}
    for line in SUMS.read_text().splitlines():
        value, name = line.split()
        expected[name] = value
    return expected


def needs_cut(path: Path, name: str, expected: dict[str, str]) -> bool:
    """Cut again when the window is missing or is not the one offpole.sha256 names.

    A window cut by an older version of this script stays on disk otherwise, and the
    deploy then fails the check below forever.
    """
    if not path.is_file():
        return True
    return name in expected and digest(path) != expected[name]


def _check(out: Path) -> None:
    expected = _expected()
    bad = []
    for name, value in expected.items():
        path = out / name
        if not path.is_file() or digest(path) != value:
            bad.append(name)
    if bad:
        raise SystemExit(f"off-pole DEM windows missing or not as expected: {', '.join(bad)}")
    print(f"{len(expected)} off-pole DEM windows checked", flush=True)


def main() -> None:
    with rasterio.Env(**GDAL_ENV):
        if sys.argv[1] == "--digests":
            out = Path(sys.argv[2]) / "offpole"
            for path in _windows(out):
                print(f"{digest(path)}  {path.relative_to(out)}")
            return
        _main()
        _check(Path(sys.argv[1]) / "offpole")


def _main() -> None:
    out = Path(sys.argv[1]) / "offpole"
    local = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    global SLDEM_LOCAL
    SLDEM_LOCAL = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    expected = _expected()
    for site_id, (lat, lon, kind) in SITES.items():
        folder = out / site_id
        folder.mkdir(parents=True, exist_ok=True)
        if kind == "sldem":
            jobs = [
                ("SLDEM2015_512.TIF", lambda p, lat=lat, lon=lon: _sldem_near(lat, lon, p)),
                ("SLDEM2015_128.TIF", lambda p, lat=lat, lon=lon: _sldem_far(lat, lon, p)),
            ]
        else:
            jobs = []
            for product, half in (("LDEM_60S_60MPP_ADJ", NEAR_M), ("LDEM_60S_240MPP_ADJ", FAR_M)):
                # The DEM window first, then its error window on the same grid.
                for suffix in ("", ERROR_SUFFIX):
                    jobs.append(
                        (
                            f"{product}{suffix}.TIF",
                            lambda p, lat=lat, lon=lon, name=f"{product}{suffix}", half=half: _ldem(
                                name, local, lat, lon, half, p
                            ),
                        )
                    )
        for name, job in jobs:
            path = folder / name
            if not needs_cut(path, f"{site_id}/{name}", expected):
                continue
            path.unlink(missing_ok=True)
            print(f"cutting {site_id}/{name}", flush=True)
            job(path)
            if name.endswith(f"{ERROR_SUFFIX}.TIF"):
                _same_grid(folder / name.replace(f"{ERROR_SUFFIX}.TIF", ".TIF"), path)


if __name__ == "__main__":
    main()
