"""Builds the images of the 3D Moon globe from public sources, for lunar.luizfbm.win/moon/.

    python globe_assets.py <out dir> <pgda dem dir> [<download cache>]

Whole Moon (equirectangular, 0° longitude in the middle, north up), from the NASA SVS
CGI Moon Kit (svs.gsfc.nasa.gov/4720, public domain):
  moon_color_8k.webp / moon_color_4k.webp     LROC WAC colour with the poles filled
  moon_normal_4k.webp                          tangent-space normals from LDEM 16 ppd
  moon_normal_8k.webp                          the same from LDEM 64 ppd, area-averaged

South polar cap (polar stereographic, the projection of the engine's DEMs), from
LDEM_80S_80MPP_ADJ (PGDA 90, Barker et al. 2023), the DEM the engine walks to 100 km:
  south_cap_normal.webp   tangent-space normals, 4096 x 4096
  south_cap_albedo.webp   neutral grey, lightly shaded by height (no albedo is invented)
  south_cap_height.png    16-bit heights, scale in south_cap.json
  south_cap.json          projection, pixel size, scale, sources

The cap covers the source's whole square (±304 km), so its 4096 pixels of 148.4375 m
start and end on the source's own edges, and every output pixel is the area average of
the 80 m pixels under it. No grid is shifted by a fraction of a pixel (see the implementation).

Fine level around the pole, where the camera stops, from LDEM_80S_20MPP_ADJ (the DEM the
engine walks in the first 5 km), ±92.16 km (about 87°S), on the 20 m product's pixel
edges:
  south_pole_fine_normal.webp      8192 x 8192, 22.5 m
  south_pole_fine_normal_4k.webp   4096 x 4096, 45 m, for phones
  south_pole_fine_albedo.webp      4096 x 4096, same grey as the cap
  south_pole_fine_height.png       2048 x 2048, 90 m, 16-bit
  south_pole_fine.json             same keys as south_cap.json

Ground at 20 m around each Curated Site, from LDEM_80S_20MPP_ADJ, for the view from the
ground (the requirement): the DEM's own pixels, not resampled, a 320 x 320 square (6.4 km)
centred on the Site's pixel, for every Site of backend/app/data/sites.csv the product holds:
  site_20m_<site id>.png   16-bit heights, 20 m
  site_20m.json            each square's corner, size and scale, keyed by Site id

Inputs are checked against INPUTS below; outputs get SHA256SUMS. Outputs are built again
only when an input or this script changes (BUILD_ID next to them).
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import sys
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
import rasterio.windows
from rasterio.enums import Resampling

R_M = 1_737_400.0
SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720"
INPUTS = {
    "lroc_color_poles_8k.tif": "4af8b0cd4d50c30851359d98e7e72040240dd8d03256b58b345b5b76e9edb4ef",
    "ldem_16.tif": "1ea42bf44f7e9d694f79c3afa7145f97fbf06cc67372067d9fe73dce43bad796",
    "ldem_64_uint.tif": "0f40bce8b42864deddb6943a38474879e691d5b20647aa5e54c2612b23106499",
}
CAP_PRODUCT = "LDEM_80S_80MPP_ADJ"
CAP_SIZE = 4096
GLOBAL_NORMAL = (4096, 2048)
GLOBAL_NORMAL_8K = (8192, 4096)
WEBP = {"driver": "WEBP", "QUALITY": 88}
OBSOLETE: tuple[str, ...] = ()  # files an older version wrote and this one does not


README = """# Moon globe images

Built by `deploy/globe_assets.py` (the project repository, the requirement).
`SHA256SUMS` lists every file; `south_cap.json` and `south_pole_fine.json` have each level's projection.

| File | What | Source | Licence |
|---|---|---|---|
| `moon_color_8k.webp`, `moon_color_4k.webp` | LROC WAC colour, poles filled, equirectangular, 0° longitude in the middle | NASA Scientific Visualization Studio, CGI Moon Kit (2019), `lroc_color_poles_8k.tif`, svs.gsfc.nasa.gov/4720; data: NASA/GSFC/Arizona State University (LROC) | Public domain (NASA) |
| `moon_normal_4k.webp`, `moon_normal_8k.webp` | Normals from LOLA heights (16 ppd for 4k, 64 ppd averaged for 8k), same layout | NASA SVS CGI Moon Kit, `ldem_16.tif`, `ldem_64_uint.tif`; data: LOLA team, NASA/GSFC | Public domain (NASA) |
| `south_cap_normal.webp`, `south_cap_height.png`, `south_cap_albedo.webp` | South polar cap, polar stereographic, from the DEM the engine walks | PGDA product 90, `LDEM_80S_80MPP_ADJ`, Barker et al. 2023, pgda.gsfc.nasa.gov/products/90 | Public domain (NASA) |
| `site_20m_*.png`, `site_20m.json` | 6.4 km around each Curated Site of the 20 m product, its own pixels, 16-bit | PGDA product 90, `LDEM_80S_20MPP_ADJ`, Barker et al. 2023 | Public domain (NASA) |
| `south_pole_fine_*` | The pole to about 87°S at 22.5 m (8192²) and 45 m (4096²), heights at 90 m | PGDA product 90, `LDEM_80S_20MPP_ADJ`, Barker et al. 2023 | Public domain (NASA) |

The cap's albedo is not data: a neutral grey lightly shaded by height, because there is
no public polar albedo product at this scale that we could cite. Shadows on the globe
come from the normals and the Sun's direction, not from this map.

Please credit "NASA/GSFC (SVS, LOLA, PGDA), NASA/GSFC/Arizona State University (LROC)".
"""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _fetch(name: str, cache: Path) -> Path:
    path = cache / name
    if not path.is_file():
        part = path.with_suffix(".part")
        urllib.request.urlretrieve(f"{SVS}/{name}", part)
        part.rename(path)
    want = INPUTS[name]
    if want and _sha256(path) != want:
        raise SystemExit(f"{name}: checksum does not match INPUTS")
    return path


def _write_rgb(path: Path, rgb: np.ndarray, **options: object) -> None:
    """rgb is (3, h, w) uint8."""
    profile = {"width": rgb.shape[2], "height": rgb.shape[1], "count": 3, "dtype": "uint8"}
    part = path.with_name(path.name + ".part")
    with rasterio.open(part, "w", **profile, **options) as out:
        out.write(rgb)
    part.rename(path)


def encode_normals(dx: np.ndarray, dy: np.ndarray) -> np.ndarray:
    """Tangent-space normal from slopes along image right (dx) and image up (dy).

    n = (-dz/dx, -dz/dy, 1) normalised, stored as RGB = (n + 1) / 2 * 255: red points to
    image right, green to image up (the OpenGL / three.js convention), blue out.
    """
    norm = np.sqrt(dx * dx + dy * dy + 1.0)
    n = np.stack([-dx / norm, -dy / norm, 1.0 / norm])
    return np.clip(np.round((n + 1.0) * 127.5), 0, 255).astype(np.uint8)


def stereographic_pixel(
    latitude_deg: float, longitude_deg: float, cap: dict
) -> tuple[float, float]:
    """(column, row) of a point in the cap image, pixel centres at whole numbers + 0.5.

    Uses only what south_cap.json says, so the frontend can do the same.
    """
    rho = 2.0 * cap["sphere_radius_m"] * math.tan(math.pi / 4.0 + math.radians(latitude_deg) / 2.0)
    x = rho * math.sin(math.radians(longitude_deg))
    y = rho * math.cos(math.radians(longitude_deg))
    size = cap["metres_per_pixel"]
    return (x - cap["x_min_m"]) / size, (cap["y_max_m"] - y) / size


FINE_PRODUCT = "LDEM_80S_20MPP_ADJ"
# ±92.16 km is 10608 source pixels in from the 20 m product's ±304 km edges, so the fine
# level's edges are source pixel edges; 8192 pixels of 22.5 m reach about 87°S.
FINE_HALF_M = 92_160.0
FINE_SIZE = 8192
FINE_SMALL = 4096  # the same area for phones, 45 m
FINE_HEIGHT = 2048  # 90 m, enough vertices to displace a mesh
STRIP = 1024


# The ground at 20 m around each Site (the requirement): a square of the source's own pixels,
# so a height in it is a height of the DEM, with the Site's pixel at (SITE_PX / 2, SITE_PX / 2).
SITE_PX = 320
SITE_PREFIX = "site_20m"


def _sites_csv() -> Path:
    """The Curated Sites: here in the repo, or where the backend image keeps them."""
    for candidate in (
        Path(__file__).resolve().parents[1] / "backend" / "app" / "data" / "sites.csv",
        Path("/app/app/data/sites.csv"),
    ):
        if candidate.is_file():
            return candidate
    raise SystemExit("sites.csv not found")


def read_sites(path: Path) -> list[tuple[str, float, float]]:
    with path.open(newline="") as handle:
        return [
            (row["id"], float(row["latitude_deg"]), float(row["longitude_deg"]))
            for row in csv.DictReader(handle)
        ]


def _plane_xy(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    rho = 2.0 * R_M * math.tan(math.pi / 4.0 + math.radians(latitude_deg) / 2.0)
    return rho * math.sin(math.radians(longitude_deg)), rho * math.cos(math.radians(longitude_deg))


def build_site_ground(
    source: Path, out: Path, sites: list[tuple[str, float, float]], size: int = SITE_PX
) -> dict[str, Any]:
    """A square of the 20 m product's own pixels around each Site it holds whole.

    The Site's pixel is the one at (size / 2, size / 2), so the Site is within half a pixel
    of the square's centre. A Site whose square would leave the product, or hold no-data, is
    left out. Returns the index, which main() writes to site_20m.json.
    """
    tiles: dict[str, dict[str, Any]] = {}
    with rasterio.open(source) as dem:
        left, _, _, top = dem.bounds
        res = dem.res[0]
        nodata = dem.nodata
        for site_id, latitude_deg, longitude_deg in sites:
            if latitude_deg > -60.0:
                continue
            x, y = _plane_xy(latitude_deg, longitude_deg)
            column = math.floor((x - left) / res) - size // 2
            row = math.floor((top - y) / res) - size // 2
            if column < 0 or row < 0 or column + size > dem.width or row + size > dem.height:
                continue
            heights = dem.read(1, window=rasterio.windows.Window(column, row, size, size))
            heights = heights.astype(np.float64)
            if not np.isfinite(heights).all() or (nodata is not None and (heights == nodata).any()):
                continue
            name = f"{SITE_PREFIX}_{site_id}.png"
            png = _write_height(out / name, heights)
            png["metres_per_pixel"] = res
            tiles[site_id] = {
                "x_min_m": left + column * res,
                "y_max_m": top - row * res,
                "height_png": png,
            }
    index = {
        "projection": "south polar stereographic, sphere, true scale at the pole",
        "proj4": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m",
        "sphere_radius_m": R_M,
        "pixel_of": (
            "column = (x - x_min_m) / metres_per_pixel, row = (y_max_m - y) / metres_per_pixel; "
            "the Site's own pixel is at (size_px / 2, size_px / 2)"
        ),
        "tiles": tiles,
        "source": {
            "product": source.stem,
            "resolution_m": res,
            "resampling": "none: the source's own pixels",
            "reference": "Barker et al. 2023, PGDA product 90, pgda.gsfc.nasa.gov/products/90",
        },
    }
    return index


def _normals_in_strips(heights: np.ndarray, step: float) -> np.ndarray:
    """encode_normals of the whole grid, a strip of rows at a time, to keep memory low."""
    rows = heights.shape[0]
    out = np.empty((3, *heights.shape), dtype=np.uint8)
    for top in range(0, rows, STRIP):
        lo, hi = max(top - 1, 0), min(top + STRIP + 1, rows)
        grad_row, grad_col = np.gradient(heights[lo:hi].astype(np.float64), step)
        keep = slice(top - lo, top - lo + min(STRIP, rows - top))
        out[:, top : top + STRIP] = encode_normals(grad_col[keep], -grad_row[keep])
    return out


def _write_height(path: Path, heights: np.ndarray) -> dict:
    low, high = float(heights.min()), float(heights.max())
    # A perfectly flat square still needs a range to scale by.
    span = high - low if high > low else 1.0
    high = low + span
    scaled = np.round((heights - low) / span * 65535.0).astype(np.uint16)
    part = path.with_name(path.name + ".part")
    size = heights.shape[0]
    with rasterio.open(
        part, "w", driver="PNG", width=size, height=size, count=1, dtype="uint16"
    ) as png:
        png.write(scaled, 1)
    part.rename(path)
    return {
        "file": path.name,
        "size_px": size,
        "metres_per_pixel": None,
        "metres_above_1737400_m": {"at_0": round(low, 3), "at_65535": round(high, 3)},
    }


# Encoding an 8192 x 8192 WebP through GDAL takes about 1.7 GB on top of the image.
WEBP_BIG_PX = 4096 * 4096
WEBP_BIG_NEEDS_KB = 3_500_000


def _mem_available_kb() -> int | None:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1])
    except OSError:
        return None
    return None


def _write_big_rgb(out: Path, stem: str, rgb: np.ndarray) -> str:
    """WebP, unless the image is big and the machine is short of memory: then JPEG.

    JPEG is written line by line (about 200 MB for 8192 x 8192) but is about 1.8 times
    heavier for the browser. The level's JSON names whichever file was written.
    """
    available = _mem_available_kb()
    big = rgb.shape[1] * rgb.shape[2] > WEBP_BIG_PX
    if big and available is not None and available < WEBP_BIG_NEEDS_KB:
        print(f"{stem}: {available} kB available, writing JPEG", flush=True)
        (out / f"{stem}.webp").unlink(missing_ok=True)
        _write_rgb(out / f"{stem}.jpg", rgb, driver="JPEG", QUALITY=92)
        return f"{stem}.jpg"
    (out / f"{stem}.jpg").unlink(missing_ok=True)
    _write_rgb(out / f"{stem}.webp", rgb, **WEBP)
    return f"{stem}.webp"


def _read_average(dem, window, size: int) -> np.ndarray:
    """Area-average the window onto size x size, in strips of rows that both grids share.

    A strip of `unit` output rows is exactly `unit * window.height / size` source rows,
    so each strip is averaged on its own and no output pixel straddles two strips. Read
    whole, the 20 m level took 2.7 GB; in strips it fits a small VPS.
    """
    rows = int(window.height)
    unit = size // math.gcd(size, rows)
    strip = unit * max(1, 512 // unit)
    out = np.empty((size, size), dtype=np.float32)
    for top in range(0, size, strip):
        n = min(strip, size - top)
        src = rasterio.windows.Window(
            window.col_off, window.row_off + top * rows // size, window.width, n * rows // size
        )
        out[top : top + n] = dem.read(
            1, window=src, out_shape=(n, size), resampling=Resampling.average
        )
    return out


def build_level(
    source: Path,
    out: Path,
    prefix: str,
    size: int,
    half_m: float | None = None,
    small: int | None = None,
    height_size: int | None = None,
) -> dict:
    """One polar stereographic level: normals, albedo, 16-bit heights and its JSON.

    The level's square is either the source's whole extent or ±half_m around the pole,
    which must fall on the source's pixel edges, so no output grid is shifted by a
    fraction of a source pixel (the implementation). Every output pixel is the area average of the
    source pixels under it.
    """
    with rasterio.open(source) as dem:
        left, bottom, right, top = dem.bounds
        res = dem.res[0]
        if half_m is not None:
            left, bottom, right, top = -half_m, -half_m, half_m, half_m
        assert right - left == top - bottom, (left, bottom, right, top)
        window = rasterio.windows.from_bounds(left, bottom, right, top, dem.transform)
        for edge in (window.col_off, window.row_off, window.width, window.height):
            assert abs(edge - round(edge)) < 1e-6, f"{source.name}: level not on source pixels"
        window = window.round_offsets().round_lengths()
        heights = _read_average(dem, window, size)
    step = (right - left) / size
    if not np.isfinite(heights).all():
        raise SystemExit(f"{source.name}: no data under part of {prefix}")

    files = {"normal": _write_big_rgb(out, f"{prefix}_normal", _normals_in_strips(heights, step))}
    if small:
        factor = size // small
        coarse = heights.reshape(small, factor, small, factor).mean(axis=(1, 3))
        name = f"{prefix}_normal_{small // 1024}k.webp"
        _write_rgb(out / name, _normals_in_strips(coarse, step * factor), **WEBP)
        files["normal_small"] = name

    hsize = height_size or size
    hfactor = size // hsize
    hgrid = heights.reshape(hsize, hfactor, hsize, hfactor).mean(axis=(1, 3))
    height = _write_height(out / f"{prefix}_height.png", hgrid.astype(np.float64))
    height["metres_per_pixel"] = step * hfactor

    # Albedo: we have no public polar albedo product at this scale, so a neutral grey
    # (the Moon's mean, about 0.12 → sRGB ~ 96) with ±10% from height, so the surface is
    # not flat when the light is off. Shadows come from the normals, not from this map.
    agrid = heights if not small else coarse
    grey = 96.0 + 10.0 * (agrid - agrid.mean()) / max(float(agrid.std()), 1.0)
    grey8 = np.clip(np.round(grey), 0, 255).astype(np.uint8)
    _write_rgb(out / f"{prefix}_albedo.webp", np.stack([grey8] * 3), **WEBP)
    files["albedo"] = f"{prefix}_albedo.webp"

    half = min(-left, right, -bottom, top)
    edge = -90.0 + math.degrees(2.0 * math.atan(half / (2.0 * R_M)))
    return {
        "projection": "south polar stereographic, sphere, true scale at the pole",
        "proj4": "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400 +units=m",
        "sphere_radius_m": R_M,
        "size_px": size,
        "x_min_m": left,
        "y_max_m": top,
        "metres_per_pixel": step,
        "edge_latitude_deg_at_side_midpoints": round(edge, 4),
        "centre": "the south pole is at x = 0, y = 0",
        "orientation": (
            "0° longitude points up (to row 0), 90°E to the right, 180° down, 90°W left; "
            "x = rho sin(lon), y = rho cos(lon), rho = 2R tan(45° + lat/2)"
        ),
        "pixel_of": (
            "column = (x - x_min_m) / metres_per_pixel, row = (y_max_m - y) / metres_per_pixel "
            "(for a smaller file of the same level, scale metres_per_pixel by size_px / its size)"
        ),
        "normals": "tangent space, red = image right, green = image up, blue = out of the surface",
        "files": files,
        "height_png": height,
        "source": {
            "product": source.stem,
            "resolution_m": res,
            "resampling": f"area average onto a {size} grid that shares the source's pixel edges",
            "reference": "Barker et al. 2023, PGDA product 90, pgda.gsfc.nasa.gov/products/90",
        },
    }


def build_cap(dem_dir: Path, out: Path) -> dict:
    """The whole 80 m product, ±304 km, about 80°S."""
    return build_level(dem_dir / f"{CAP_PRODUCT}.TIF", out, "south_cap", CAP_SIZE)


def build_fine(dem_dir: Path, out: Path) -> dict:
    """The 20 m product around the pole, ±92.16 km, about 87°S."""
    return build_level(
        dem_dir / f"{FINE_PRODUCT}.TIF",
        out,
        "south_pole_fine",
        FINE_SIZE,
        half_m=FINE_HALF_M,
        small=FINE_SMALL,
        height_size=FINE_HEIGHT,
    )


def _equirect_normals(metres: np.ndarray) -> np.ndarray:
    """Tangent-space normals of an equirectangular height grid, a strip of rows at a time.

    East-west steps shrink with cos(latitude), and longitude wraps, so the difference
    across the seam uses the other edge.
    """
    height, width = metres.shape
    lat = np.radians(90.0 - (np.arange(height) + 0.5) * 180.0 / height)
    step_y = math.pi * R_M / height
    out = np.empty((3, height, width), dtype=np.uint8)
    for top in range(0, height, STRIP):
        lo, hi = max(top - 1, 0), min(top + STRIP + 1, height)
        block = metres[lo:hi].astype(np.float64)
        keep = slice(top - lo, top - lo + min(STRIP, height - top))
        grad_row = np.gradient(block, axis=0)[keep] / step_y
        step_x = 2.0 * math.pi * R_M * np.cos(lat[top : top + STRIP])[:, None] / width
        rows = block[keep]
        grad_col = (np.roll(rows, -1, axis=1) - np.roll(rows, 1, axis=1)) / (2.0 * step_x)
        out[:, top : top + STRIP] = encode_normals(grad_col, -grad_row)
    return out


def _ldem_64_metres(path: Path, width: int, height: int) -> np.ndarray:
    """LOLA 64 ppd, area-averaged to width x height, in metres above 1737.4 km.

    The SVS unsigned file stores half-metres above a 1727.4 km sphere: m = v / 2 - 10000.
    Read in strips whose borders both grids share (16 output rows = 45 source rows).
    """
    with rasterio.open(path) as dem:
        rows = dem.height
        unit = height // math.gcd(height, rows)
        strip = unit * max(1, 512 // unit)
        out = np.empty((height, width), dtype=np.float32)
        for top in range(0, height, strip):
            n = min(strip, height - top)
            window = rasterio.windows.Window(0, top * rows // height, dem.width, n * rows // height)
            half_m = dem.read(
                1,
                window=window,
                out_shape=(n, width),
                out_dtype="float32",
                resampling=Resampling.average,
            )
            out[top : top + n] = half_m / 2.0 - 10_000.0
    return out


def build_global(cache: Path, out: Path) -> None:
    with rasterio.open(_fetch("lroc_color_poles_8k.tif", cache)) as colour:
        full = colour.read([1, 2, 3])
        half = colour.read(
            [1, 2, 3],
            out_shape=(3, colour.height // 2, colour.width // 2),
            resampling=Resampling.average,
        )
    _write_rgb(out / "moon_color_8k.webp", _to_uint8(full), **WEBP)
    del full
    _write_rgb(out / "moon_color_4k.webp", _to_uint8(half), **WEBP)

    width, height = GLOBAL_NORMAL
    with rasterio.open(_fetch("ldem_16.tif", cache)) as dem:
        km = dem.read(1, out_shape=(height, width), resampling=Resampling.average)
    metres = km.astype(np.float64) * 1000.0
    _write_rgb(out / "moon_normal_4k.webp", _equirect_normals(metres), **WEBP)

    width, height = GLOBAL_NORMAL_8K
    metres = _ldem_64_metres(_fetch("ldem_64_uint.tif", cache), width, height)
    _write_rgb(out / "moon_normal_8k.webp", _equirect_normals(metres), **WEBP)


def _to_uint8(rgb: np.ndarray) -> np.ndarray:
    if rgb.dtype == np.uint8:
        return rgb
    top = 65535.0 if rgb.dtype == np.uint16 else float(rgb.max())
    return np.clip(np.round(rgb.astype(np.float64) / top * 255.0), 0, 255).astype(np.uint8)


def _build_id(dem_dir: Path) -> str:
    parts = [hashlib.sha256(Path(__file__).read_bytes()).hexdigest()]
    parts += [f"{name}={want}" for name, want in sorted(INPUTS.items())]
    for product in (CAP_PRODUCT, FINE_PRODUCT):
        parts.append(f"{product}={(dem_dir / f'{product}.TIF').stat().st_size}")
    parts.append(f"sites={hashlib.sha256(_sites_csv().read_bytes()).hexdigest()}")
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def main() -> None:
    out, dem_dir = Path(sys.argv[1]), Path(sys.argv[2])
    cache = Path(sys.argv[3]) if len(sys.argv) > 3 else out / ".cache"
    out.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    build_id = _build_id(dem_dir)
    marker = out / "BUILD_ID"
    if marker.is_file() and marker.read_text().strip() == build_id:
        print("globe assets up to date", flush=True)
        return
    print("building globe assets", flush=True)
    build_global(cache, out)
    built = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    for name, level in (
        ("south_cap", build_cap(dem_dir, out)),
        ("south_pole_fine", build_fine(dem_dir, out)),
    ):
        level["built_at"] = built
        (out / f"{name}.json").write_text(json.dumps(level, indent=2) + "\n")
    sites = build_site_ground(dem_dir / f"{FINE_PRODUCT}.TIF", out, read_sites(_sites_csv()))
    sites["built_at"] = built
    (out / f"{SITE_PREFIX}.json").write_text(json.dumps(sites, indent=2) + "\n")
    for stale in OBSOLETE:
        (out / stale).unlink(missing_ok=True)
    (out / "README.md").write_text(README)
    files = sorted(
        p
        for p in out.iterdir()
        if p.is_file() and p.suffix in {".webp", ".jpg", ".png", ".json", ".md"}
    )
    (out / "SHA256SUMS").write_text("".join(f"{_sha256(p)}  {p.name}\n" for p in files))
    marker.write_text(build_id + "\n")
    for path in files:
        print(f"{path.name} {path.stat().st_size}", flush=True)


if __name__ == "__main__":
    # A small block cache: the default is 5% of RAM, which the VPS needs for the API.
    with rasterio.Env(GDAL_PAM_ENABLED="NO", GDAL_CACHEMAX=256):
        main()
