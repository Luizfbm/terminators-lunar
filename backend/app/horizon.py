"""Horizon mask over the nested PGDA polar DEMs (Barker et al. 2023), and the whole Moon.

Each of the 720 rays walks out from the Site along a great circle, reading the 20 m DEM
up to 5 km, the 80 m DEM up to 100 km and the 240 m DEM up to 300 km, one sample per
pixel. The Horizon mask at that azimuth is the highest elevation angle any of those
points makes above the Observer's local horizontal, with the Moon's curvature, and the
point that sets it is the Occluder.

Away from the south pole a typed point is walked over LOLA's global LDEM_128 (237 m), and
near either pole, where that simple cylindrical map squeezes every longitude into a few
pixels, over LOLA's polar stereographic products instead (see `beyond_polar`).
"""

from __future__ import annotations

import math
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import rasterio  # type: ignore[import-untyped]
from rasterio.windows import Window  # type: ignore[import-untyped]

from .constants import (
    AZIMUTH_STEP_DEG,
    CUSTOM_MAX_LATITUDE_DEG,
    HORIZON_SAMPLES,
    MOON_RADIUS_M,
)

Array = npt.NDArray[np.float64]


@dataclass(frozen=True)
class Band:
    product: str
    resolution_m: float
    inner_m: float
    outer_m: float
    # "polar": south polar stereographic. "eqc": SLDEM2015's equirectangular, lon_0 180°.
    projection: str = "polar"
    # The rung of the Resolution ladder this band stands for, when it is not its own
    # resolution: the 60 m DEM stands in for the 80 m one where that one runs out (see
    # POLAR_WIDE). None is the band's own resolution.
    rung_m: float | None = None
    # The DEM is the whole Moon in longitude (LDEM_128): its first column touches its last,
    # so a ray that crosses 0°E reads on from the other edge instead of running off it.
    wraps: bool = False
    # The walk's step, when it is not half a pixel. A band starts its walk one step out, so
    # a 237 m DEM at half a pixel would not look within 118 m of the Site, where on a slope
    # the ground itself is the horizon (0.6° missed at 45°N 100°W). None is half a pixel.
    step_m: float | None = None


def _rung_of(band: Band) -> float:
    return band.resolution_m if band.rung_m is None else band.rung_m


LADDER: tuple[Band, ...] = (
    Band("LDEM_80S_20MPP_ADJ", 20.0, 0.0, 5_000.0),
    Band("LDEM_80S_80MPP_ADJ", 80.0, 5_000.0, 100_000.0),
    Band("LDEM_60S_240MPP_ADJ", 240.0, 100_000.0, 300_000.0),
)
# Curated Sites outside the 80°S DEMs (the requirement) have their own windows, cut by
# deploy/crop_offpole.py into <dem dir>/offpole/<site id>/. SLDEM2015 covers ±60°;
# past 60°S the PGDA 60°S products are finer and in the same projection as the pole.
OFFPOLE_DIR = "offpole"
OFFPOLE_LADDERS: tuple[tuple[Band, ...], ...] = (
    (
        Band("SLDEM2015_512", 59.2, 0.0, 100_000.0, "eqc"),
        Band("SLDEM2015_128", 236.9, 100_000.0, 300_000.0, "eqc"),
    ),
    (
        Band("LDEM_60S_60MPP_ADJ", 60.0, 0.0, 100_000.0),
        Band("LDEM_60S_240MPP_ADJ", 240.0, 100_000.0, 300_000.0),
    ),
)
# The 80 m DEM is a square of ±304 km around the pole, and the rays walk it out to 100 km,
# so on its own it answers a point only up to ~83.3°S (204 km from the pole) in every
# direction, while a typed point is taken up to 80°S. The 60 m DEM of the same release
# reaches 60°S and is finer: where the 80 m one runs out, it walks those 5 to 100 km
# instead. A point the polar ladder answers never gets here, so its answer is unchanged.
WIDE_PRODUCT = "LDEM_60S_60MPP_ADJ"
POLAR_WIDE: tuple[Band, ...] = (
    Band("LDEM_80S_20MPP_ADJ", 20.0, 0.0, 5_000.0),
    Band(WIDE_PRODUCT, 60.0, 5_000.0, 100_000.0, rung_m=80.0),
    Band("LDEM_60S_240MPP_ADJ", 240.0, 100_000.0, 300_000.0),
)
# A point within 5 km of the 20 m square's edge (about 80.0°S) is past even its 5 km.
POLAR_EDGE: tuple[Band, ...] = (
    Band(WIDE_PRODUCT, 60.0, 0.0, 100_000.0, rung_m=80.0),
    Band("LDEM_60S_240MPP_ADJ", 240.0, 100_000.0, 300_000.0),
)
# Typed points north of the polar DEMs (80°S), when the server has LOLA's global map
# (LDEM_128, PDS LRO-L-LOLA-3-RDR-V1, 128 px/deg = 236.9 m, heights above the 1737.4 km
# sphere, simple cylindrical centred on 180°E like SLDEM2015, converted to metres pixel
# for pixel). Its rays read it from the point out to 300 km.
GLOBAL_PRODUCT = "LDEM_128"
# Its rays are walked every 10 m to 5 km, as the 20 m DEM is at the pole (see Band.step_m).
NEAR_M = 5_000.0
NEAR_STEP_M = 10.0
GLOBAL: tuple[Band, ...] = (
    Band(GLOBAL_PRODUCT, 236.9, 0.0, NEAR_M, "eqc", wraps=True, step_m=NEAR_STEP_M),
    Band(GLOBAL_PRODUCT, 236.9, NEAR_M, 300_000.0, "eqc", wraps=True),
)
# A simple cylindrical map is no good near a pole: a ray that passes over the pole crosses
# every column, so the window read is the whole width of the map (1 GB at 85°N), and right
# at the pole the ray runs past the centre of the top row. Within 20° of either pole the
# polar stereographic products of the same LOLA data walk the rays instead: at 70° a 300 km
# ray reaches 60.1°, inside both products' 60° circle. In the south that is the PGDA 240 m
# DEM the polar ladder already reads (after the 60 m one, where it reaches); in the north
# it is LOLA's LDEM_60N_240M (PDS, the same release as LDEM_128).
POLAR_LIMIT_DEG = CUSTOM_MAX_LATITUDE_DEG
CAP_LATITUDE_DEG = 70.0
SOUTH_CAP: tuple[Band, ...] = (
    Band("LDEM_60S_240MPP_ADJ", 240.0, 0.0, NEAR_M, step_m=NEAR_STEP_M),
    Band("LDEM_60S_240MPP_ADJ", 240.0, NEAR_M, 300_000.0),
)
NORTH_PRODUCT = "LDEM_60N_240M"
NORTH_CAP: tuple[Band, ...] = (
    Band(NORTH_PRODUCT, 240.0, 0.0, NEAR_M, "polar_north", step_m=NEAR_STEP_M),
    Band(NORTH_PRODUCT, 240.0, NEAR_M, 300_000.0, "polar_north"),
)
# How far north a typed point is taken with the global map (the contract's
# `coverage.custom_max_latitude_deg`); without it, CUSTOM_MAX_LATITUDE_DEG.
GLOBAL_MAX_LATITUDE_DEG = 90.0
# Ray points don't sit on pixel centres, so a fixed step misses the top of a nearby bump:
# one sample per pixel put the mask 0.2° low 90 m from Site 001, and at the pole the Sun
# climbs about 0.005° an hour, so that moved Sunsets by up to 2.6 h. Each band is walked
# at half a pixel, then the highest local peaks of every ray are zoomed in on.
SAMPLES_PER_PIXEL = 2
PEAKS_PER_RAY = 6
ZOOM_POINTS = 33
ZOOM_ROUNDS = 4
# rasterio datasets are not safe to share between threads.
_LOCK = threading.Lock()
# The pixel window a mask holds per product is shared by that product's bands (see `_heights`).
_WINDOWS = threading.Lock()


class DemUnavailable(Exception):
    """No DEM in the ladder covers part of the Site's rays: there is no honest mask."""

    def __init__(self, product: str, reason: str) -> None:
        super().__init__(f"{product}: {reason}")
        self.product = product
        self.reason = reason


@dataclass(frozen=True)
class Mask:
    site_height_m: float
    elevations_deg: Array
    samples: list[dict[str, Any]]
    products: list[dict[str, Any]]

    def elevation_at(self, azimuth_deg: float | Array) -> Any:
        """The mask between samples, linear in azimuth and wrapping at north."""
        position = np.asarray(azimuth_deg, dtype=float) % 360.0 / AZIMUTH_STEP_DEG
        low = np.floor(position).astype(int) % HORIZON_SAMPLES
        high = (low + 1) % HORIZON_SAMPLES
        weight = position - np.floor(position)
        return (1.0 - weight) * self.elevations_deg[low] + weight * self.elevations_deg[high]

    def occluder_at(self, azimuth_deg: float) -> dict[str, Any]:
        index = round((azimuth_deg % 360.0) / AZIMUTH_STEP_DEG) % HORIZON_SAMPLES
        return dict(self.samples[index]["occluder"])


def dem_dir() -> Path:
    raw = os.environ.get("LUNAR_DEM_DIR")
    if raw:
        return Path(raw)
    return Path(__file__).resolve().parents[2] / "fixtures" / "dem"


def products() -> list[dict[str, Any]]:
    """The DEM products this server has, in ladder order, then the off-pole ones."""
    folder = dem_dir()
    found = [
        {"product": band.product, "resolution_m": band.resolution_m}
        for band in LADDER
        if (folder / f"{band.product}.TIF").is_file()
    ]
    if (folder / f"{WIDE_PRODUCT}.TIF").is_file():
        found.append({"product": WIDE_PRODUCT, "resolution_m": 60.0})
    for band in (*GLOBAL, *NORTH_CAP):
        entry = {"product": band.product, "resolution_m": band.resolution_m}
        if entry not in found and (folder / f"{band.product}.TIF").is_file():
            found.append(entry)
    for ladder in OFFPOLE_LADDERS:
        for band in ladder:
            entry = {"product": band.product, "resolution_m": band.resolution_m}
            # Chandrayaan-3's far window is the same product as the polar ladder's.
            if entry not in found and any((folder / OFFPOLE_DIR).glob(f"*/{band.product}.TIF")):
                found.append(entry)
    return found


def ladder_for(site_id: str | None) -> tuple[Path, tuple[Band, ...]]:
    """Where a Site's DEMs are and which ladder walks them."""
    folder = dem_dir()
    if site_id:
        own = folder / OFFPOLE_DIR / site_id
        for ladder in OFFPOLE_LADDERS:
            if (own / f"{ladder[0].product}.TIF").is_file():
                return own, ladder
    return folder, LADDER


def has_global(folder: Path | None = None) -> bool:
    """Whether the server has LOLA's global map, which opens typed points to the whole Moon."""
    return ((folder or dem_dir()) / f"{GLOBAL_PRODUCT}.TIF").is_file()


def custom_max_latitude_deg() -> float:
    """How far north a typed point is answered: the whole Moon with the global map, else 80°S."""
    return GLOBAL_MAX_LATITUDE_DEG if has_global() else CUSTOM_MAX_LATITUDE_DEG


def beyond_polar(latitude_deg: float) -> tuple[tuple[Band, ...], ...]:
    """The ladders tried, in order, for a typed point north of the polar ladder's 80°S.

    Between 80°S and 70°S: the polar ladders while their squares reach (the 20 m one's
    corners and the 60 m one go past 80°S), then the PGDA 240 m DEM alone. A ladder that
    does not reach fails on a bounds check before its pixels are read.
    Between 70°S and 70°N: the global LDEM_128. From 70°N: LOLA's north polar 240 m DEM.
    """
    if latitude_deg <= -CAP_LATITUDE_DEG:
        return (LADDER, POLAR_WIDE, POLAR_EDGE, SOUTH_CAP)
    if latitude_deg >= CAP_LATITUDE_DEG:
        return (NORTH_CAP,)
    return (GLOBAL,)


def slope_bands(site_id: str | None, latitude_deg: float) -> tuple[Path, tuple[Band, ...]]:
    """The DEMs the Slope tries, finest first: the Site's ladder, or the ones `mask` walks."""
    folder, ladder = ladder_for(site_id)
    if ladder is LADDER and latitude_deg > POLAR_LIMIT_DEG and has_global(folder):
        bands: list[Band] = []
        for candidate in beyond_polar(latitude_deg):
            bands.extend(b for b in candidate if b.product not in {k.product for k in bands})
        # Finest first, as in a ladder: the 60 m DEM before the 80 and 240 m ones near 80°S.
        return folder, tuple(sorted(bands, key=lambda band: band.resolution_m))
    return folder, ladder


FLAT_WITHOUT_DEM = "LUNAR_FLAT_HORIZON_WITHOUT_DEM"


RUNGS_M: tuple[float, ...] = (240.0, 80.0, 20.0)


def rung(finest_m: float, ladder: tuple[Band, ...] = LADDER) -> tuple[Band, ...]:
    """The ladder without the DEMs finer than `finest_m`; the finest one left starts at the Site.

    At 20 m this is the ladder itself. At 80 m the 80 m DEM reads from the Site out to 100 km,
    at 240 m the 240 m DEM reads every ray, Site height included. The off-pole products are
    59.2 and 236.9 m, so a band counts as a rung when it is within 5% of it. A band that
    stands in for another rung (`rung_m`, the 60 m DEM where the 80 m one runs out) counts
    as that rung.
    """
    kept = [band for band in ladder if _rung_of(band) >= finest_m * 0.95]
    if not kept:
        raise ValueError(f"no DEM in the ladder is {finest_m} m or coarser")
    if kept[0].inner_m == 0.0:
        return tuple(kept)
    return (replace(kept[0], inner_m=0.0), *kept[1:])


POLE_LATITUDE_DEG = -90.0 + 1e-6


def bands_for(
    latitude_deg: float,
    longitude_deg: float,
    site_id: str | None = None,
    finest_m: float = 20.0,
) -> tuple[Path, tuple[Band, ...]]:
    """The folder and the DEM bands that walk this point's rays at the `finest_m` rung.

    The one place that chooses: `mask()`, the Observer's ground and the clones of the
    Uncertainty band all ask here, so they never read different DEMs for the same point.
    An off-pole Curated Site has its own windows. A polar point takes the polar ladder when
    the DEMs it names cover every ray; past the 80 m square (a typed point up to 80°S) it takes
    POLAR_WIDE, and right at the 20 m square's edge POLAR_EDGE, when the 60 m DEM is there.
    North of the polar DEMs (80°S), with LOLA's global map on the server, a typed point takes the
    ladders of `beyond_polar` in order, the first that covers its rays. When nothing covers the
    rays it is the polar ladder (or, north of 80°S, the last of those), so the error that
    follows is its own.
    """
    folder, ladder = ladder_for(site_id)
    if ladder is not LADDER:
        return folder, rung(finest_m, ladder)
    latitude_deg, longitude_deg = _placed(latitude_deg, longitude_deg)
    candidates: tuple[tuple[Band, ...], ...] = (LADDER,)
    fallback = LADDER
    if latitude_deg > POLAR_LIMIT_DEG and has_global(folder):
        candidates = beyond_polar(latitude_deg)
        fallback = candidates[-1]
    elif (folder / f"{WIDE_PRODUCT}.TIF").is_file():
        candidates = (LADDER, POLAR_WIDE, POLAR_EDGE)
    for candidate in candidates:
        bands = rung(finest_m, candidate)
        if _covers(folder, bands, latitude_deg, longitude_deg):
            return folder, bands
    return folder, rung(finest_m, fallback)


def _placed(latitude_deg: float, longitude_deg: float) -> tuple[float, float]:
    """Where the rays leave from: off the pole by a hair, rounded to 7 places."""
    # At exactly -90° every bearing leaves along the same meridian (cos(lat) is 0 in the
    # great-circle step), so the 720 rays collapse onto one line. 0.1 m off the pole they
    # fan out again, and the local frame (east, north from the longitude) is the same. The
    # north pole has the same collapse.
    latitude = min(max(latitude_deg, POLE_LATITUDE_DEG), -POLE_LATITUDE_DEG)
    return round(latitude, 7), round(longitude_deg, 7)


def _step_of(band: Band) -> float:
    """How far apart a band's ray samples are: half a pixel, unless the band says otherwise."""
    return band.resolution_m / SAMPLES_PER_PIXEL if band.step_m is None else band.step_m


@lru_cache(maxsize=32)
def _raster_shape(path: str, size: int, modified_ns: int) -> tuple[int, int, Any]:
    """Width, height and inverse transform of a DEM file (size and mtime key a rewrite)."""
    with _LOCK, rasterio.open(path) as dataset:
        return dataset.width, dataset.height, ~dataset.transform


def _covers(
    folder: Path, bands: tuple[Band, ...], latitude_deg: float, longitude_deg: float
) -> bool:
    """Whether every band's file is there and holds the rays' pixels, without reading them.

    The test `_heights` applies, on the Site and the ring each band starts and ends at in
    the 720 directions: a subset of the points the walk reads, so a point this passes
    can only fail the walk for missing data, never for the edge of the file.
    """
    azimuths: Array = np.arange(HORIZON_SAMPLES, dtype=np.float64) * AZIMUTH_STEP_DEG
    for band in bands:
        path = folder / f"{band.product}.TIF"
        if not path.is_file():
            return False
        stat = path.stat()
        width, height, inverse = _raster_shape(str(path), stat.st_size, stat.st_mtime_ns)
        ring = np.array([max(band.inner_m, _step_of(band)), band.outer_m])
        lat, lon = _destination(latitude_deg, longitude_deg, azimuths, ring)
        x, y = _project(
            band,
            np.append(lat.ravel(), latitude_deg),
            np.append(lon.ravel(), longitude_deg),
            longitude_deg,
        )
        col = inverse.a * x + inverse.b * y + inverse.c - 0.5
        row = inverse.d * x + inverse.e * y + inverse.f - 0.5
        col0 = math.floor(float(col.min()))
        col1 = math.floor(float(col.max())) + 2
        if math.floor(float(row.min())) < 0 or math.floor(float(row.max())) + 2 > height:
            return False
        if band.wraps:
            # Columns past either edge read on from the other one; the rays of a point near
            # a pole span every column, which no window can hold (see `_heights`).
            if col1 - col0 > width + 2:
                return False
        elif col0 < 0 or col1 > width:
            return False
    return True


def mask(
    latitude_deg: float,
    longitude_deg: float,
    height_m: float,
    finest_m: float = 20.0,
    site_id: str | None = None,
) -> Mask:
    folder, bands = bands_for(latitude_deg, longitude_deg, site_id, finest_m)
    placed = _placed(latitude_deg, longitude_deg)
    try:
        return _mask(str(folder), bands, *placed, height_m)
    except DemUnavailable:
        # Off by default and in production. Only checks of where the Sun and the Earth
        # are in the sky turn it on, for Sites past the DEM fixtures; the answer then
        # says so with an empty `provenance.dems`.
        if os.environ.get(FLAT_WITHOUT_DEM) != "1":
            raise
        return flat(placed[0], longitude_deg, height_m)


def flat(latitude_deg: float, longitude_deg: float, height_m: float) -> Mask:
    """The bare sphere: the geometric dip at the Observer height, the same all round."""
    depression = math.acos(MOON_RADIUS_M / (MOON_RADIUS_M + height_m)) if height_m > 0 else 0.0
    distance = MOON_RADIUS_M * depression
    azimuths: Array = np.arange(HORIZON_SAMPLES, dtype=np.float64) * AZIMUTH_STEP_DEG
    lat, lon = _destination(latitude_deg, longitude_deg, azimuths, np.array([distance]))
    elevation = -math.degrees(depression)
    samples = [
        {
            "azimuth_deg": float(azimuths[i]),
            "elevation_deg": elevation,
            "occluder": {
                "azimuth_deg": float(azimuths[i]),
                "distance_m": distance,
                "latitude_deg": float(lat[i, 0]),
                "longitude_deg": float(lon[i, 0]),
                "terrain_height_m": 0.0,
            },
        }
        for i in range(HORIZON_SAMPLES)
    ]
    return Mask(0.0, np.full(HORIZON_SAMPLES, elevation), samples, [])


@lru_cache(maxsize=64)
def _mask(
    folder: str,
    bands: tuple[Band, ...],
    latitude_deg: float,
    longitude_deg: float,
    height_m: float,
) -> Mask:
    return _compute(folder, bands, latitude_deg, longitude_deg, height_m, {})


def _compute(
    folder: str,
    bands: tuple[Band, ...],
    latitude_deg: float,
    longitude_deg: float,
    height_m: float,
    reads: Reads,
) -> Mask:
    """The Horizon mask over `bands`. `reads` may already hold a band's pixels (the clones')."""
    azimuths: Array = np.arange(HORIZON_SAMPLES, dtype=np.float64) * AZIMUTH_STEP_DEG
    first = bands[0]
    site_x, site_y = _project(first, np.array([latitude_deg]), np.array([longitude_deg]))
    site_height = float(_heights(Path(folder), first, site_x, site_y, reads)[0])
    observer_radius = MOON_RADIUS_M + site_height + height_m

    best = np.full(HORIZON_SAMPLES, -math.inf)
    best_distance = np.zeros(HORIZON_SAMPLES)
    best_lat = np.zeros(HORIZON_SAMPLES)
    best_lon = np.zeros(HORIZON_SAMPLES)
    best_height = np.zeros(HORIZON_SAMPLES)
    rows = np.arange(HORIZON_SAMPLES)

    def look(distances: Array, band: Band) -> tuple[Array, Array, Array, Array]:
        lat, lon = _destination(latitude_deg, longitude_deg, azimuths, distances)
        x, y = _project(band, lat, lon, longitude_deg)
        terrain = _heights(Path(folder), band, x, y, reads)
        theta = distances / MOON_RADIUS_M
        radius = MOON_RADIUS_M + terrain
        elevation = np.degrees(
            np.arctan2(radius * np.cos(theta) - observer_radius, radius * np.sin(theta))
        )
        return elevation, lat, lon, terrain

    def band_peaks(band: Band) -> tuple[Array, Array, Array, Array, Array]:
        """The highest point of every ray inside one band, after the peak zoom."""
        step = _step_of(band)
        start = max(band.inner_m, step)
        coarse: Array = np.arange(start, band.outer_m + step / 2, step)
        elevation, _, _, _ = look(coarse, band)
        # Zoom in on the highest few samples of each ray, each a local peak or a band edge.
        padded = np.pad(elevation, ((0, 0), (1, 1)), constant_values=-math.inf)
        is_peak = (elevation >= padded[:, :-2]) & (elevation >= padded[:, 2:])
        ranked = np.where(is_peak, elevation, -math.inf)
        count = min(PEAKS_PER_RAY, coarse.size)
        picks = np.argpartition(-ranked, count - 1, axis=1)[:, :count]
        centre = np.broadcast_to(coarse[picks], picks.shape).copy()
        half = np.full(HORIZON_SAMPLES, step)
        offsets = np.linspace(-1.0, 1.0, ZOOM_POINTS)
        low, high = start, band.outer_m
        for _ in range(ZOOM_ROUNDS):
            grid = np.clip(
                centre[:, :, None] + half[:, None, None] * offsets[None, None, :], low, high
            ).reshape(HORIZON_SAMPLES, -1)
            values, lat, lon, terrain = look(grid, band)
            values = values.reshape(HORIZON_SAMPLES, count, ZOOM_POINTS)
            centre = np.take_along_axis(
                grid.reshape(HORIZON_SAMPLES, count, ZOOM_POINTS),
                values.argmax(axis=2)[:, :, None],
                axis=2,
            )[:, :, 0]
            half = half * 2.0 / (ZOOM_POINTS - 1)
        values, lat, lon, terrain = look(centre, band)
        index = np.argmax(values, axis=1)
        return (
            values[rows, index],
            centre[rows, index],
            lat[rows, index],
            lon[rows, index],
            terrain[rows, index],
        )

    # The bands don't depend on each other and numpy lets go of the GIL in its loops, so
    # they run side by side; they are merged in ladder order, as one after the other would.
    with ThreadPoolExecutor(max_workers=len(bands)) as pool:
        found = list(pool.map(band_peaks, bands))
    for peak, distance, lat, lon, terrain in found:
        better = peak > best
        best = np.where(better, peak, best)
        best_distance = np.where(better, distance, best_distance)
        best_lat = np.where(better, lat, best_lat)
        best_lon = np.where(better, lon, best_lon)
        best_height = np.where(better, terrain, best_height)

    samples = [
        {
            "azimuth_deg": float(azimuths[i]),
            "elevation_deg": float(best[i]),
            "occluder": {
                "azimuth_deg": float(azimuths[i]),
                "distance_m": float(best_distance[i]),
                "latitude_deg": float(best_lat[i]),
                "longitude_deg": float(best_lon[i]),
                "terrain_height_m": float(best_height[i]),
            },
        }
        for i in range(HORIZON_SAMPLES)
    ]
    used: list[dict[str, Any]] = []
    for band in bands:
        entry = {"product": band.product, "resolution_m": band.resolution_m}
        # A DEM walked as two bands (near and far, see Band.step_m) is one DEM.
        if entry not in used:
            used.append(entry)
    return Mask(site_height, best, samples, used)


# One mask reads the same DEM window over and over: the coarse walk, four zoom rounds and
# the final look per band. Reading it once per band and slicing it after was most of the
# cold time on a custom Site (0.1 s per read of a 2500 px square, six reads per band).
@dataclass
class _Read:
    width: int
    height: int
    inverse: Any
    col0: int = 0
    row0: int = 0
    grid: npt.NDArray[np.float64] | None = None
    # A clone's heights live in memory only: asking for pixels beyond them must not fall
    # back to reading the file, which would hand back the unperturbed DEM.
    fixed: bool = False


Reads = dict[str, _Read]


def _heights(folder: Path, band: Band, x: Array, y: Array, reads: Reads | None = None) -> Array:
    """Bilinear terrain height at projected points, from one DEM product.

    `reads` keeps, per product, the pixels this mask has already read. The arithmetic is
    the same with or without it, so the heights are the same to the bit.
    """
    path = folder / f"{band.product}.TIF"
    if not path.is_file():
        raise DemUnavailable(band.product, f"not found in {folder}")
    # The near and far bands of one product (GLOBAL's, the caps') run in two threads and share
    # this product's pixels: the window they hold is checked, swapped and taken as one step.
    with _WINDOWS:
        read = reads.get(band.product) if reads is not None else None
        if read is None:
            with _LOCK, rasterio.open(path) as dataset:
                read = _Read(dataset.width, dataset.height, ~dataset.transform)
            if reads is not None:
                reads[band.product] = read
        inverse = read.inverse
        col = (inverse.a * x + inverse.b * y + inverse.c) - 0.5
        row = (inverse.d * x + inverse.e * y + inverse.f) - 0.5
        col0 = math.floor(float(col.min()))
        row0 = math.floor(float(row.min()))
        col1 = math.floor(float(col.max())) + 2
        row1 = math.floor(float(row.max())) + 2
        if row0 < 0 or row1 > read.height or (not band.wraps and (col0 < 0 or col1 > read.width)):
            raise DemUnavailable(band.product, "the rays run past the edge of the DEM")
        if col1 - col0 > read.width + 2:
            # Only a ray over a pole spans every longitude; the polar DEMs answer there.
            raise DemUnavailable(band.product, "the rays cross every longitude of the map")
        held = read.grid
        if (
            held is None
            or col0 < read.col0
            or row0 < read.row0
            or col1 > read.col0 + held.shape[1]
            or row1 > read.row0 + held.shape[0]
        ):
            if read.fixed:
                raise DemUnavailable(band.product, "the rays leave the pixels read for the clones")
            with _LOCK, rasterio.open(path) as dataset:
                held = read_window(dataset, col0, row0, col1, row1, band.wraps)
            read.col0, read.row0, read.grid = col0, row0, held
        held_col0, held_row0 = read.col0, read.row0
    c = col - col0
    r = row - row0
    ci = np.floor(c).astype(int)
    ri = np.floor(r).astype(int)
    fc = c - ci
    fr = r - ri
    # The same pixels a read at (col0, row0) would give, indexed from where they were read.
    ci += col0 - held_col0
    ri += row0 - held_row0
    # Gather the four corners through one flat index: the same pixels as held[ri, ci] and
    # its neighbours, in one pass instead of four 2-D fancy indexings.
    flat = held.ravel()
    corner = ri * held.shape[1] + ci
    below = corner + held.shape[1]
    value = (
        flat.take(corner) * (1 - fc) * (1 - fr)
        + flat.take(corner + 1) * fc * (1 - fr)
        + flat.take(below) * (1 - fc) * fr
        + flat.take(below + 1) * fc * fr
    )
    if not np.all(np.isfinite(value)):
        raise DemUnavailable(band.product, "the DEM has no data under part of the rays")
    result: Array = value
    return result


def read_window(
    dataset: Any, col0: int, row0: int, col1: int, row1: int, wraps: bool = False
) -> npt.NDArray[np.float64]:
    """Pixels [row0, row1) x [col0, col1) of band 1 as float64.

    For a map that wraps in longitude, columns past either edge are read from the other
    one, piece by piece, so the grid is continuous across 0°E. Inside the map, and for every
    map that does not wrap, it is the one plain read it always was.
    """
    width = dataset.width
    if not wraps or (col0 >= 0 and col1 <= width):
        window = Window(col0, row0, col1 - col0, row1 - row0)
        grid: npt.NDArray[np.float64] = dataset.read(1, window=window).astype(np.float64)
        return grid
    pieces = []
    start = col0
    while start < col1:
        turn = start // width
        stop = min(col1, (turn + 1) * width)
        window = Window(start - turn * width, row0, stop - start, row1 - row0)
        pieces.append(dataset.read(1, window=window))
        start = stop
    joined: npt.NDArray[np.float64] = np.concatenate(pieces, axis=1).astype(np.float64)
    return joined


def _project(
    band: Band,
    latitude_deg: Array,
    longitude_deg: Array,
    site_longitude_deg: float | None = None,
) -> tuple[Array, Array]:
    """Map metres of lat/lon points.

    `site_longitude_deg` is the Site the points belong to. Only an equirectangular band could
    need it, to keep x continuous across its seam at 0°E; the polar projections ignore it.
    """
    if band.projection == "eqc":
        return _equirectangular(latitude_deg, longitude_deg, site_longitude_deg)
    if band.projection == "polar_north":
        return _stereographic_north(latitude_deg, longitude_deg)
    return _stereographic(latitude_deg, longitude_deg)


def _equirectangular(
    latitude_deg: Array, longitude_deg: Array, site_longitude_deg: float | None = None
) -> tuple[Array, Array]:
    """SLDEM2015's simple cylindrical on the 1737.4 km sphere, centred on 180°E.

    The map's seam is at 0°E, where x jumps from +pi*R to -pi*R. With `site_longitude_deg`,
    a point on the other side of the seam from the Site is moved by one map width, so x runs
    on past +-pi*R instead of jumping and a ray that crosses 0°E reads the DEM window's
    continuous pixels (deploy/crop_offpole.py cuts them that way). Points on the Site's own
    side of the seam are returned untouched, to the bit.
    """
    shifted = (np.asarray(longitude_deg) - 180.0 + 180.0) % 360.0 - 180.0
    x = MOON_RADIUS_M * np.radians(shifted)
    if site_longitude_deg is not None:
        width = 2.0 * math.pi * MOON_RADIUS_M
        site_x = MOON_RADIUS_M * math.radians((site_longitude_deg - 180.0 + 180.0) % 360.0 - 180.0)
        x = np.where(x - site_x > width / 2.0, x - width, x)
        x = np.where(x - site_x < -width / 2.0, x + width, x)
    return x, MOON_RADIUS_M * np.radians(latitude_deg)


def _stereographic(latitude_deg: Array, longitude_deg: Array) -> tuple[Array, Array]:
    """South polar stereographic on the 1737.4 km sphere, true scale at the pole."""
    rho = 2.0 * MOON_RADIUS_M * np.tan(np.pi / 4.0 + np.radians(latitude_deg) / 2.0)
    lon = np.radians(longitude_deg)
    return rho * np.sin(lon), rho * np.cos(lon)


def _stereographic_north(latitude_deg: Array, longitude_deg: Array) -> tuple[Array, Array]:
    """North polar stereographic on the 1737.4 km sphere, true scale at the pole.

    LOLA's LDEM_60N_240M: 0°E points down the map (y < 0) and 90°E to the right.
    """
    rho = 2.0 * MOON_RADIUS_M * np.tan(np.pi / 4.0 - np.radians(latitude_deg) / 2.0)
    lon = np.radians(longitude_deg)
    return rho * np.sin(lon), -rho * np.cos(lon)


def _destination(
    latitude_deg: float, longitude_deg: float, bearing_deg: Array, distance_m: Array
) -> tuple[Array, Array]:
    """Points at `distance_m` along great circles leaving the Site at each bearing."""
    delta = (distance_m if distance_m.ndim == 2 else distance_m[np.newaxis, :]) / MOON_RADIUS_M
    bearing = np.radians(bearing_deg)[:, np.newaxis]
    lat1 = math.radians(latitude_deg)
    lat2 = np.arcsin(
        math.sin(lat1) * np.cos(delta) + math.cos(lat1) * np.sin(delta) * np.cos(bearing)
    )
    lon2 = math.radians(longitude_deg) + np.arctan2(
        np.sin(bearing) * np.sin(delta) * math.cos(lat1),
        np.cos(delta) - math.sin(lat1) * np.sin(lat2),
    )
    longitude = (np.degrees(lon2) + 180.0) % 360.0 - 180.0
    return np.degrees(lat2), longitude


def site_height_m(latitude_deg: float, longitude_deg: float, site_id: str | None = None) -> float:
    """The DEM height under a Site: what `mask()` puts the Observer on, without the mask."""
    folder, bands = bands_for(latitude_deg, longitude_deg, site_id)
    latitude_deg, longitude_deg = _placed(latitude_deg, longitude_deg)
    x, y = _project(bands[0], np.array([latitude_deg]), np.array([longitude_deg]))
    return float(_heights(folder, bands[0], x, y)[0])


ERROR_SUFFIX = "_ERR"


def error_path(folder: Path, band: Band) -> Path:
    """The PGDA per-pixel height error raster that goes with a DEM product, if it is there."""
    return folder / f"{band.product}{ERROR_SUFFIX}.TIF"
