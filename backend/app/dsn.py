"""DSN link: when one of the three 70 m Deep Space Network antennas can hear the Site.

A DSN link is the Earth visible from the Site (the same answer `/visibility` gives) and at
least one of DSS-14 (Goldstone), DSS-43 (Canberra) and DSS-63 (Madrid) with the Moon above
the antennas' minimum elevation. The Moon's centre stands for the Site: seen from the
Earth the Site is never more than the Moon's angular radius, about 0.27°, away from it.

Geometry only: no antenna schedule, no link budget, no terrain around the stations and no
refraction (the elevation is the airless one, which is lower than what the antenna points
at, so a pass here starts a little later and ends a little earlier than a real one).

The stations, their topocentric frames and the Earth's orientation come from their own
kernels, loaded after the main meta-kernel and only when this answer is asked for. They
add the ITRF93 frame, the stations and their frames, and touch nothing `/visibility`
uses, whose answer and provenance stay as they were.
"""

from __future__ import annotations

import itertools
import json
import math
import os
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import spiceypy as spice

from . import cache, ephemeris
from .catalog import Site
from .constants import ENGINE_VERSION, STEP_MINUTES
from .timeutil import iso_z, round_second

# DSN 810-005, module 302 "Antenna Positioning", Rev. E (issue date 1 July 2024,
# JPL D-19379, CL#24-3391), Table 1 "DSN Antenna Mechanical Characteristics", page 8:
# "Elevation Motion Limits (deg)", 70-m antenna, 6 – 89.5. The upper limit never binds
# here: from 35° to 40° of latitude the Moon, whose declination stays within about ±28.7°,
# climbs at most about 83°.
MIN_ELEVATION_DEG = 6.0
MIN_ELEVATION_SOURCE = (
    "DSN 810-005, module 302 Rev. E (1 July 2024), Table 1 "
    '"DSN Antenna Mechanical Characteristics", page 8: '
    "elevation motion limits of the 70-m antennas, 6° to 89.5°"
)

META_KERNEL = "LUNAR_DSN_META_KERNEL"

# The reference spheroid of the topocentric frames kernel (WGS-84 radius and flattening,
# as its comments state), so the latitude reported is the one the frame's zenith uses.
_EQUATORIAL_RADIUS_KM = 6378.137
_FLATTENING = 1.0 / 298.2572236


@dataclass(frozen=True)
class Station:
    id: str
    complex: str


STATIONS = (
    Station("DSS-14", "goldstone"),
    Station("DSS-43", "canberra"),
    Station("DSS-63", "madrid"),
)

Interval = tuple[datetime, datetime]

_loaded = False
_names: list[str] = []


def meta_path() -> Path:
    """The DSN meta-kernel: LUNAR_DSN_META_KERNEL, else `dsn.tm` next to the main one."""
    raw = os.environ.get(META_KERNEL)
    if raw:
        return Path(raw)
    return ephemeris.meta_path().parent / "dsn.tm"


def listed_kernels() -> list[str]:
    """The DSN kernels this server has, read from the meta-kernel without loading them."""
    path = meta_path()
    if not path.is_file():
        return []
    return ephemeris._kernel_names(path)


def ensure() -> None:
    global _loaded, _names
    ephemeris.ensure()
    if _loaded:
        return
    with ephemeris._LOCK:
        if _loaded:
            return
        path = meta_path().resolve()
        if not path.is_file():
            raise FileNotFoundError(f"DSN meta-kernel not found: {path}")
        names = ephemeris._kernel_names(path)
        previous = Path.cwd()
        os.chdir(path.parent)
        try:
            spice.furnsh(path.name)
        finally:
            os.chdir(previous)
        _names = names
        _loaded = True


def kernel_names() -> list[str]:
    ensure()
    return list(_names)


def moon_elevation_deg(station_id: str, epoch: float) -> float:
    """Apparent (light time and stellar aberration), airless elevation of the Moon's centre.

    The topocentric frame's z axis is the normal to the reference spheroid at the antenna.
    """
    ensure()
    with ephemeris._LOCK:
        vector, _light_time = spice.spkpos("MOON", epoch, f"{station_id}_TOPO", "LT+S", station_id)
    x, y, z = (float(value) for value in vector)
    return math.degrees(math.atan2(z, math.hypot(x, y)))


def station_location(station_id: str, epoch: float) -> tuple[float, float]:
    """Geodetic latitude and longitude of the antenna, in degrees."""
    ensure()
    with ephemeris._LOCK:
        position, _light_time = spice.spkpos(station_id, epoch, "ITRF93", "NONE", "EARTH")
        longitude, latitude, _altitude = spice.recgeo(position, _EQUATORIAL_RADIUS_KM, _FLATTENING)
    return math.degrees(float(latitude)), math.degrees(float(longitude))


def passes(station_id: str, start: datetime, end: datetime) -> list[Interval]:
    """Stretches of [start, end] with the Moon above the minimum elevation at the antenna.

    Sampled on the engine's grid and refined by bisection to the second, as the engine
    refines Sunrise and Sunset. A pass lasts hours (the Moon climbs at least about 21° at
    all three antennas every day), so none fits between two samples 15 minutes apart.
    """

    def up(instant: datetime) -> bool:
        return moon_elevation_deg(station_id, ephemeris.et(instant)) > MIN_ELEVATION_DEG

    grid = _grid(start, end)
    states = [up(instant) for instant in grid]
    crossings = [
        _refine(left, right, left_up, up)
        for (left, left_up), (right, right_up) in itertools.pairwise(zip(grid, states, strict=True))
        if left_up != right_up
    ]
    boundaries = sorted({start, end, *crossings})
    return _merge([(a, b) for a, b in itertools.pairwise(boundaries) if up(a + (b - a) / 2)])


def compute(site: Site, start: datetime, duration_hours: float, height_m: float) -> dict[str, Any]:
    raw, _hit = cache.calculate(site, start, duration_hours, height_m)
    answer = json.loads(raw)
    end = start + timedelta(hours=duration_hours)
    earth = [
        (datetime.fromisoformat(p["start"]), datetime.fromisoformat(p["end"]))
        for p in answer["periods"]
        if p["body"] == "earth" and p["state"] == "visible"
    ]
    epoch = ephemeris.et(start)
    stations: list[dict[str, Any]] = []
    in_view: list[Interval] = []
    for station in STATIONS:
        latitude, longitude = station_location(station.id, epoch)
        found = passes(station.id, start, end)
        in_view += found
        stations.append(
            {
                "id": station.id,
                "complex": station.complex,
                "latitude_deg": latitude,
                "longitude_deg": longitude,
                "passes": [_interval(item) for item in found],
            }
        )
    any_dish = _merge(in_view)
    link = _intersect(_merge(earth), any_dish)
    without = _subtract(_merge(earth), any_dish)
    return {
        "query": answer["query"],
        "min_elevation_deg": MIN_ELEVATION_DEG,
        "stations": stations,
        "link_periods": [_interval(item) for item in link],
        "earth_visible_hours": _total(earth),
        "link_hours": _total(link),
        "earth_without_station_hours": _total(without),
        "provenance": {
            "engine_version": ENGINE_VERSION,
            "synthetic": False,
            "kernels": [*answer["provenance"]["kernels"], *kernel_names()],
            "dems": answer["provenance"]["dems"],
        },
    }


def answer(
    site: Site, start: datetime, duration_hours: float, height_m: float
) -> tuple[bytes, bool]:
    """The answer as JSON and whether it came from the cache, keyed as `/visibility` is."""

    def run() -> bytes:
        return json.dumps(
            compute(site, start, duration_hours, height_m), separators=(",", ":"), allow_nan=False
        ).encode()

    if not site["curated"]:
        return run(), False
    key: cache.Key = (
        f"{site['id']}/dsn",
        ENGINE_VERSION,
        cache._dem_fingerprint(),
        start,
        duration_hours,
        height_m,
    )
    return cache._memo(key, run)


def _grid(start: datetime, end: datetime) -> list[datetime]:
    times: list[datetime] = []
    cursor = start
    while cursor < end:
        times.append(cursor)
        cursor += timedelta(minutes=STEP_MINUTES)
    times.append(end)
    return times


def _refine(
    before: datetime, after: datetime, was_up: bool, up: Callable[[datetime], bool]
) -> datetime:
    """Bisect the instant the Moon crosses the minimum elevation, to about one second."""
    while (after - before).total_seconds() > 0.5:
        middle = before + (after - before) / 2
        if up(middle) == was_up:
            before = middle
        else:
            after = middle
    return round_second(before + (after - before) / 2)


def _merge(intervals: list[Interval]) -> list[Interval]:
    """Sorted, with overlapping or touching intervals joined and empty ones dropped."""
    out: list[Interval] = []
    for begin, end in sorted(item for item in intervals if item[1] > item[0]):
        if out and begin <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], end))
        else:
            out.append((begin, end))
    return out


def _intersect(left: list[Interval], right: list[Interval]) -> list[Interval]:
    return _merge(
        [
            (max(a1, b1), min(a2, b2))
            for a1, a2 in left
            for b1, b2 in right
            if max(a1, b1) < min(a2, b2)
        ]
    )


def _subtract(left: list[Interval], right: list[Interval]) -> list[Interval]:
    out: list[Interval] = []
    for begin, end in left:
        cursor = begin
        for cut_begin, cut_end in right:
            if cut_end <= cursor or cut_begin >= end:
                continue
            if cut_begin > cursor:
                out.append((cursor, cut_begin))
            cursor = max(cursor, cut_end)
        if cursor < end:
            out.append((cursor, end))
    return out


def _hours(item: Interval) -> float:
    return (item[1] - item[0]).total_seconds() / 3600.0


def _interval(item: Interval) -> dict[str, Any]:
    return {"start": iso_z(item[0]), "end": iso_z(item[1]), "duration_hours": _hours(item)}


def _total(intervals: list[Interval]) -> float:
    # Always a float, also with nothing to add: JSON then reads 0.0, not 0.
    return float(sum(_hours(item) for item in intervals))
