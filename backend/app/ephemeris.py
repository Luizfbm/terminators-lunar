"""Apparent Sun and Earth positions from the SPICE meta-kernel."""

from __future__ import annotations

import math
import os
import re
import threading
from datetime import datetime
from pathlib import Path

import spiceypy as spice

from .constants import MOON_RADIUS_KM
from .timeutil import as_utc

# CSPICE keeps global state and is not thread-safe, and FastAPI runs the routes in a
# thread pool, so every call into it goes through this lock.
_LOCK = threading.RLock()
_LOADED = False
_KERNEL_NAMES: list[str] = []
_SUN_RADIUS_KM = 695_700.0
_EARTH_RADIUS_KM = 6378.1366


class Observer:
    def __init__(
        self,
        latitude_deg: float,
        longitude_deg: float,
        height_m: float,
        position_km: tuple[float, float, float],
        east: tuple[float, float, float],
        north: tuple[float, float, float],
        up: tuple[float, float, float],
    ) -> None:
        self.latitude_deg = latitude_deg
        self.longitude_deg = longitude_deg
        self.height_m = height_m
        self.position_km = position_km
        self.east = east
        self.north = north
        self.up = up


class Apparent:
    def __init__(
        self,
        azimuth_deg: float,
        elevation_deg: float,
        distance_km: float,
        vector_km: tuple[float, float, float],
    ) -> None:
        self.azimuth_deg = azimuth_deg
        self.elevation_deg = elevation_deg
        self.distance_km = distance_km
        self.vector_km = vector_km


def meta_path() -> Path:
    raw = os.environ.get("LUNAR_META_KERNEL")
    if raw:
        return Path(raw)
    return Path(__file__).resolve().parents[2] / "fixtures" / "kernels" / "meta.tm"


def ensure() -> None:
    global _LOADED
    if _LOADED:
        return
    with _LOCK:
        if _LOADED:
            return
        _load()
        _LOADED = True


def kernel_names() -> list[str]:
    ensure()
    return list(_KERNEL_NAMES)


def sun_radius_km() -> float:
    ensure()
    return _SUN_RADIUS_KM


def earth_radius_km() -> float:
    ensure()
    return _EARTH_RADIUS_KM


def et(instant: datetime) -> float:
    ensure()
    stamp = as_utc(instant).strftime("%Y-%m-%dT%H:%M:%S.%f")
    with _LOCK:
        return float(spice.str2et(stamp))


def make_observer(latitude_deg: float, longitude_deg: float, height_m: float) -> Observer:
    lat = math.radians(latitude_deg)
    lon = math.radians(longitude_deg)
    radius_km = MOON_RADIUS_KM + height_m / 1000.0
    cos_lat = math.cos(lat)
    sin_lat = math.sin(lat)
    cos_lon = math.cos(lon)
    sin_lon = math.sin(lon)
    position = (radius_km * cos_lat * cos_lon, radius_km * cos_lat * sin_lon, radius_km * sin_lat)
    east = (-sin_lon, cos_lon, 0.0)
    north = (-sin_lat * cos_lon, -sin_lat * sin_lon, cos_lat)
    up = (cos_lat * cos_lon, cos_lat * sin_lon, sin_lat)
    return Observer(latitude_deg, longitude_deg, height_m, position, east, north, up)


def apparent(body: str, epoch: float, observer: Observer) -> Apparent:
    with _LOCK:
        state, _light_time = spice.spkcpo(
            body,
            epoch,
            "MOON_ME",
            "OBSERVER",
            "LT+S",
            observer.position_km,
            "MOON",
            "MOON_ME",
        )
    vector = (float(state[0]), float(state[1]), float(state[2]))
    east = _dot(vector, observer.east)
    north = _dot(vector, observer.north)
    upward = _dot(vector, observer.up)
    azimuth = math.degrees(math.atan2(east, north)) % 360.0
    if azimuth >= 360.0:
        azimuth = 0.0
    elevation = math.degrees(math.atan2(upward, math.hypot(east, north)))
    distance = math.sqrt(vector[0] ** 2 + vector[1] ** 2 + vector[2] ** 2)
    return Apparent(azimuth, elevation, distance, vector)


def sub_point(body: str, epoch: float) -> tuple[float, float]:
    """Latitude and longitude on the Moon (MOON_ME) under the body, seen from the Moon's centre.

    Light time and stellar aberration are corrected, as for the topocentric positions.
    """
    with _LOCK:
        position, _light_time = spice.spkpos(body, epoch, "MOON_ME", "LT+S", "MOON")
        _radius, longitude, latitude = spice.reclat(position)
    return math.degrees(float(latitude)), math.degrees(float(longitude))


def angular_radius_rad(distance_km: float, radius_km: float) -> float:
    if distance_km <= 0.0:
        return math.pi / 2.0
    ratio = radius_km / distance_km
    if ratio >= 1.0:
        return math.pi / 2.0
    return math.asin(ratio)


def _load() -> None:
    global _KERNEL_NAMES, _SUN_RADIUS_KM, _EARTH_RADIUS_KM
    path = meta_path().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"SPICE meta-kernel not found: {path}")
    _KERNEL_NAMES = _kernel_names(path)
    previous = Path.cwd()
    os.chdir(path.parent)
    try:
        spice.furnsh(path.name)
    finally:
        os.chdir(previous)
    _SUN_RADIUS_KM = _body_radius("SUN", _SUN_RADIUS_KM)
    _EARTH_RADIUS_KM = _body_radius("EARTH", _EARTH_RADIUS_KM)


def _kernel_names(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"KERNELS_TO_LOAD\s*=\s*\((.*?)\)", text, flags=re.DOTALL)
    if match is None:
        return [path.name]
    names = re.findall(r"'([^']+)'", match.group(1))
    return names or [path.name]


def _body_radius(name: str, fallback: float) -> float:
    _count, radii = spice.bodvrd(name, "RADII", 3)
    radius = float(radii[0])
    if radius <= 0.0:
        return fallback
    return radius


def _dot(left: tuple[float, float, float], right: tuple[float, float, float]) -> float:
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
