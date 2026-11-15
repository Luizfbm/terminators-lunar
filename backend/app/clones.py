"""DEM clones: the terrain raised and lowered by the height error NASA publishes (ADR 0006).

A clone adds `sigma * z` to the heights of each DEM band that has a per-pixel error
raster: `sigma` is that raster (PGDA `LDEM_*_ADJ_ERR`, the 1 sigma height error in metres,
on the DEM's own grid) and `z` is a unit-variance Gaussian field whose correlation at
distance r is exp(-(r / L)^2), L being the correlation length. Only the Horizon mask
depends on the terrain, so a clone is only a mask; the Sun and the Earth are the same.

The pixels one Site's rays read are read once per `CloneSource` and every clone starts
from them, so a clone costs a random field and a mask, not a trip to the disk.
"""

from __future__ import annotations

import logging
import math
import os
import threading
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import rasterio  # type: ignore[import-untyped]
from rasterio.windows import Window  # type: ignore[import-untyped]

from . import horizon
from .catalog import Site
from .constants import AZIMUTH_STEP_DEG, HORIZON_SAMPLES

Array = npt.NDArray[np.float64]

# Fixed: the same Query on the same data must give the same band (ADR 0006).
SEED = 20261115
CLONES_ENV = "LUNAR_UNCERTAINTY_CLONES"
CORRELATION_ENV = "LUNAR_UNCERTAINTY_CORRELATION_M"
DEFAULT_CLONES = 32
MAX_CLONES = 100
# Barker et al. 2023: "much of the Artemis zone has an effective resolution of ~20 m", the
# gap size the interpolation error is correlated with; measured on the PGDA EFFRES rasters
# around Site 001 at 14.5, 19.2 and 38.6 m (ADR 0006).
DEFAULT_CORRELATION_M = 20.0
# Pixels read beyond the ring the rays reach, for bilinear reads and the peak zoom.
MARGIN_PIXELS = 4
MASKS_KEPT = 4096

_log = logging.getLogger(__name__)


def clone_count() -> int:
    """How many clones a band is made of: LUNAR_UNCERTAINTY_CLONES, 1 to 100, 32 by default."""
    return max(1, min(MAX_CLONES, int(os.environ.get(CLONES_ENV, str(DEFAULT_CLONES)))))


def correlation_m() -> float:
    return float(os.environ.get(CORRELATION_ENV, str(DEFAULT_CORRELATION_M)))


def _fast_length(n: int) -> int:
    """The smallest length of at least n whose only prime factors are 2, 3 and 5 (a fast FFT)."""
    size = n
    while True:
        rest = size
        for prime in (2, 3, 5):
            while rest % prime == 0:
                rest //= prime
        if rest == 1:
            return size
        size += 1


def correlated_field(shape: tuple[int, int], sigma_px: float, rng: np.random.Generator) -> Array:
    """A zero-mean, unit-variance Gaussian field with correlation exp(-(r / L)^2), L = 2 sigma.

    White noise smoothed by a Gaussian of standard deviation `sigma_px` pixels, which makes
    the correlation Gaussian with L = 2 * sigma_px pixels, then scaled by the exact variance
    of the smoothed noise so the result has unit variance at any `sigma_px`. The smoothing
    is circular on a padded grid; the padding is cropped away.
    """
    rows, cols = (_fast_length(n) for n in shape)
    white = rng.standard_normal((rows, cols))
    if sigma_px > 0.0:
        gain_rows = np.exp(-2.0 * (math.pi * sigma_px) ** 2 * np.fft.fftfreq(rows) ** 2)
        gain_cols = np.exp(-2.0 * (math.pi * sigma_px) ** 2 * np.fft.rfftfreq(cols) ** 2)
        full_cols = np.exp(-2.0 * (math.pi * sigma_px) ** 2 * np.fft.fftfreq(cols) ** 2)
        # Parseval: the variance of white noise through the filter is the mean squared gain.
        variance = float(np.mean(gain_rows**2) * np.mean(full_cols**2))
        spectrum = np.fft.rfft2(white) * gain_rows[:, np.newaxis] * gain_cols[np.newaxis, :]
        white = np.fft.irfft2(spectrum, s=(rows, cols)) / math.sqrt(variance)
    field: Array = white[: shape[0], : shape[1]]
    return field


@dataclass(frozen=True)
class Coverage:
    """Which DEM bands of a Site's ladder have a per-pixel error raster beside them."""

    folder: Path
    bands: tuple[horizon.Band, ...]
    covered: tuple[horizon.Band, ...]

    @property
    def uncovered(self) -> tuple[horizon.Band, ...]:
        return tuple(band for band in self.bands if band not in self.covered)


def coverage(site_id: str | None) -> Coverage:
    folder, ladder = horizon.ladder_for(site_id)
    bands = horizon.rung(20.0, ladder)
    covered = tuple(band for band in bands if horizon.error_path(folder, band).is_file())
    return Coverage(folder, bands, covered)


def fingerprint(found: Coverage) -> tuple[tuple[str, int, int], ...]:
    """Size and modification time of every DEM and error raster in use, for the cache key."""
    marks = []
    for band in found.bands:
        for path in (found.folder / f"{band.product}.TIF", horizon.error_path(found.folder, band)):
            if path.is_file():
                stat = path.stat()
                marks.append((path.stem, stat.st_size, stat.st_mtime_ns))
    return tuple(marks)


@dataclass
class _Window:
    """The DEM and its error over every pixel a band's rays can read, for one Site."""

    band: horizon.Band
    width: int
    height: int
    inverse: Any
    col0: int
    row0: int
    heights: Array
    sigma: Array


def _read_window(
    folder: Path, band: horizon.Band, latitude_deg: float, longitude_deg: float
) -> _Window | None:
    """The pixels of the band's disc, or None when the error raster is not on the DEM's grid."""
    azimuths: Array = np.arange(HORIZON_SAMPLES, dtype=np.float64) * AZIMUTH_STEP_DEG
    lat, lon = horizon._destination(
        latitude_deg, longitude_deg, azimuths, np.array([band.outer_m], dtype=np.float64)
    )
    x, y = horizon._project(
        band, np.append(lat.ravel(), latitude_deg), np.append(lon.ravel(), longitude_deg)
    )
    with (
        horizon._LOCK,
        rasterio.open(folder / f"{band.product}.TIF") as dem,
        rasterio.open(horizon.error_path(folder, band)) as err,
    ):
        same_grid = (err.width, err.height) == (dem.width, dem.height)
        if not same_grid or not err.transform.almost_equals(dem.transform):
            _log.warning("%s is not on the grid of %s", err.name, dem.name)
            return None
        inverse = ~dem.transform
        cols = inverse.a * x + inverse.b * y + inverse.c
        rows = inverse.d * x + inverse.e * y + inverse.f
        col0 = max(0, math.floor(float(cols.min())) - MARGIN_PIXELS)
        row0 = max(0, math.floor(float(rows.min())) - MARGIN_PIXELS)
        col1 = min(dem.width, math.floor(float(cols.max())) + 1 + MARGIN_PIXELS)
        row1 = min(dem.height, math.floor(float(rows.max())) + 1 + MARGIN_PIXELS)
        if col1 <= col0 or row1 <= row0:
            raise horizon.DemUnavailable(band.product, "the rays are outside the DEM")
        window = Window(col0, row0, col1 - col0, row1 - row0)
        heights = dem.read(1, window=window).astype(np.float64)
        sigma = err.read(1, window=window).astype(np.float64)
        width, height = dem.width, dem.height
    # No published error is no variation, not an error of NaN: the DEM is left as it is there.
    sigma = np.where(np.isfinite(sigma), np.abs(sigma), 0.0)
    return _Window(band, width, height, inverse, col0, row0, heights, sigma)


_masks: OrderedDict[tuple[Any, ...], horizon.Mask] = OrderedDict()
_masks_lock = threading.Lock()


class CloneSource:
    """The clones of one Site and Observer height: `mask(i)` is the Horizon mask of clone i.

    Built once per band job. A mask depends on the Site, the height, the clone index, the
    data and the settings, never on the Window, so masks are kept and a later Window on
    the same Site only reruns the sky.
    """

    def __init__(
        self,
        site: Site,
        height_m: float,
        found: Coverage | None = None,
        correlation: float | None = None,
        seed: int | None = None,
    ) -> None:
        self.site = site
        self.height_m = height_m
        self.coverage = found or coverage(site["id"])
        self.correlation_m = correlation_m() if correlation is None else correlation
        self.seed = SEED if seed is None else seed
        # Same placement as horizon.mask(): off the pole by a hair, rounded to 7 places.
        self.latitude_deg = round(max(site["latitude_deg"], horizon.POLE_LATITUDE_DEG), 7)
        self.longitude_deg = round(site["longitude_deg"], 7)
        self._windows: list[_Window] = []
        for band in self.coverage.covered:
            window = _read_window(self.coverage.folder, band, self.latitude_deg, self.longitude_deg)
            if window is not None:
                self._windows.append(window)
        self._fingerprint = fingerprint(self.coverage)

    @property
    def covered_products(self) -> list[str]:
        return [window.band.product for window in self._windows]

    @property
    def uncovered_products(self) -> list[str]:
        have = set(self.covered_products)
        return [band.product for band in self.coverage.bands if band.product not in have]

    def _key(self, index: int) -> tuple[Any, ...]:
        return (
            str(self.coverage.folder),
            self.latitude_deg,
            self.longitude_deg,
            self.height_m,
            index,
            self.correlation_m,
            self.seed,
            tuple(band.product for band in self.coverage.bands),
            self._fingerprint,
        )

    def mask(self, index: int) -> horizon.Mask:
        """Clone `index` of the terrain, as a Horizon mask (without the Occluder samples)."""
        key = self._key(index)
        with _masks_lock:
            if key in _masks:
                _masks.move_to_end(key)
                return _masks[key]
        reads: horizon.Reads = {}
        by_product = {band.product: i for i, band in enumerate(self.coverage.bands)}
        for window in self._windows:
            rng = np.random.default_rng(
                np.random.SeedSequence([self.seed, index, by_product[window.band.product]])
            )
            sigma_px = self.correlation_m / (2.0 * window.band.resolution_m)
            field = correlated_field(window.heights.shape, sigma_px, rng)
            reads[window.band.product] = horizon._Read(
                window.width,
                window.height,
                window.inverse,
                window.col0,
                window.row0,
                window.heights + window.sigma * field,
                fixed=True,
            )
        full = horizon._compute(
            str(self.coverage.folder),
            self.coverage.bands,
            self.latitude_deg,
            self.longitude_deg,
            self.height_m,
            reads,
        )
        slim = horizon.Mask(full.site_height_m, full.elevations_deg, [], full.products)
        with _masks_lock:
            _masks[key] = slim
            while len(_masks) > MASKS_KEPT:
                _masks.popitem(last=False)
        return slim
