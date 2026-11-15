"""Visibility computation independent of HTTP routes."""

from __future__ import annotations

import itertools
import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import cached_property
from typing import Any, Literal

import numpy as np

from . import ephemeris, geometry, horizon
from .catalog import Site
from .constants import ENGINE_VERSION, STEP_MINUTES
from .timeutil import iso_z, round_second
from .visibility import metrics, periods

Body = Literal["sun", "earth"]
BODIES: tuple[Body, ...] = ("sun", "earth")
EVENT_NAMES: dict[Body, tuple[str, str]] = {
    "sun": ("sunrise", "sunset"),
    "earth": ("earthrise", "earthset"),
}


@dataclass(frozen=True)
class Look:
    """Where the Sun and the Earth are at one instant, against the horizon."""

    instant: datetime
    sun: ephemeris.Apparent
    earth: ephemeris.Apparent
    sun_radius_rad: float
    earth_radius_rad: float
    mask: horizon.Mask

    def above(self, body: Body) -> bool:
        """The Sun counts while any part of its disc clears the terrain; the Earth by its centre."""
        if body == "sun":
            return self._sun_over_terrain > 0.0
        return bool(self.earth.elevation_deg > self.mask.elevation_at(self.earth.azimuth_deg))

    @cached_property
    def _sun_over_terrain(self) -> float:
        # Asked several times per instant (events, periods, the sample); computed once.
        # Near the horizon a horizontal offset across the disc spans 1/cos(e) of azimuth.
        stretch = 1.0 / max(math.cos(math.radians(self.sun.elevation_deg)), 1e-6)
        return geometry.disc_over_profile(
            math.radians(self.sun.elevation_deg),
            self.sun_radius_rad,
            lambda offsets: np.radians(
                self.mask.elevation_at(self.sun.azimuth_deg + np.degrees(offsets) * stretch)
            ),
        )

    def sun_fraction(self) -> float:
        over_horizon = self._sun_over_terrain
        behind_earth = geometry.circle_overlap_fraction(
            self.sun_radius_rad,
            self.earth_radius_rad,
            geometry.angle_between(self.sun.vector_km, self.earth.vector_km),
        )
        return max(0.0, min(1.0, over_horizon * (1.0 - behind_earth)))

    def sample(self) -> dict[str, Any]:
        return {
            "t": iso_z(self.instant),
            "sun": {
                "azimuth_deg": self.sun.azimuth_deg,
                "elevation_deg": self.sun.elevation_deg,
                "fraction": self.sun_fraction(),
            },
            "earth": {
                "azimuth_deg": self.earth.azimuth_deg,
                "elevation_deg": self.earth.elevation_deg,
                "visible": self.above("earth"),
            },
        }


def calculate(
    site: Site, start: datetime, duration_hours: float, height_m: float, finest_m: float = 20.0
) -> dict[str, Any]:
    end = start + timedelta(hours=duration_hours)
    mask = horizon.mask(
        site["latitude_deg"], site["longitude_deg"], height_m, finest_m, site_id=site["id"]
    )
    # The Observer stands on the terrain, so SPICE sees it from the DEM height plus its own.
    observer = ephemeris.make_observer(
        site["latitude_deg"], site["longitude_deg"], mask.site_height_m + height_m
    )

    def look(instant: datetime) -> Look:
        return look_at(instant, observer, mask)

    looks = scan(start, end, look)

    events: list[dict[str, Any]] = []
    period_list: list[dict[str, Any]] = []
    for body in BODIES:
        rise, fall = EVENT_NAMES[body]
        found = crossings(looks, body, look)
        for instant, rises in found:
            position = getattr(look(instant), body)
            events.append(
                {
                    "type": rise if rises else fall,
                    "t": iso_z(instant),
                    "azimuth_deg": position.azimuth_deg,
                    "occluder": mask.occluder_at(position.azimuth_deg),
                }
            )
        period_list += body_periods(start, end, [instant for instant, _ in found], body, look)

    events.sort(key=lambda event: event["t"])
    period_list.sort(key=lambda p: (p["start"], p["body"]))
    samples = [item.sample() for item in looks]
    return {
        "query": query_echo(site, start, end, duration_hours, height_m),
        "horizon": {"azimuth_step_deg": 0.5, "samples": mask.samples},
        "timeline": {
            "step_minutes": STEP_MINUTES,
            "samples": samples,
            # Over 60 days the Sun's angular radius moves by at most 0.005°, under 2 % of
            # itself, so one value per answer is enough to draw the disc.
            "sun_radius_deg": math.degrees(sum(item.sun_radius_rad for item in looks) / len(looks)),
        },
        "sub_points": sub_points(start, end),
        "events": events,
        "periods": period_list,
        "metrics": metrics(period_list, samples),
        "provenance": {
            "engine_version": ENGINE_VERSION,
            "synthetic": False,
            "kernels": ephemeris.kernel_names(),
            "dems": mask.products,
        },
    }


def query_echo(
    site: Site, start: datetime, end: datetime, duration_hours: float, height_m: float
) -> dict[str, Any]:
    """The Query as the engine resolved it."""
    return {
        "site": site,
        "start": iso_z(start),
        "end": iso_z(end),
        "duration_hours": duration_hours,
        "observer_height_m": height_m,
        "step_minutes": STEP_MINUTES,
    }


def scan(start: datetime, end: datetime, look: Callable[[datetime], Look]) -> list[Look]:
    """The Sun and the Earth every STEP_MINUTES from `start`, plus `end` itself."""
    return [look(instant) for instant in _grid(start, end)]


def crossings(
    looks: list[Look], body: Body, look: Callable[[datetime], Look]
) -> list[tuple[datetime, bool]]:
    """Each instant the body crosses the horizon between two looks, refined, and if it rises."""
    found: list[tuple[datetime, bool]] = []
    for left, right in itertools.pairwise(looks):
        if left.above(body) == right.above(body):
            continue
        found.append((_refine(left, right, body, look), right.above(body)))
    return found


def body_periods(
    start: datetime,
    end: datetime,
    instants: list[datetime],
    body: Body,
    look: Callable[[datetime], Look],
) -> list[dict[str, Any]]:
    """A body's periods over [start, end], cut by its own crossings only."""
    boundaries = sorted({start, end, *instants})
    states = [look(a + (b - a) / 2).above(body) for a, b in itertools.pairwise(boundaries)]
    return periods(boundaries, states, body)


SUB_POINT_STEP_HOURS = 1


def sub_points(start: datetime, end: datetime) -> dict[str, Any]:
    """Sub-solar and sub-Earth points every hour from the Window start, plus its end.

    Hourly is enough for the globe: linear interpolation between samples stays within
    0.0002° (Earth) and 0.00001° (Sun), and an hourly series costs about a fifth of the
    bytes of one point per timeline sample.
    """
    instants: list[datetime] = []
    cursor = start
    while cursor < end:
        instants.append(cursor)
        cursor += timedelta(hours=SUB_POINT_STEP_HOURS)
    instants.append(end)
    samples = []
    for instant in instants:
        epoch = ephemeris.et(instant)
        sun_lat, sun_lon = ephemeris.sub_point("SUN", epoch)
        earth_lat, earth_lon = ephemeris.sub_point("EARTH", epoch)
        samples.append(
            {
                "t": iso_z(instant),
                "sun": {"latitude_deg": sun_lat, "longitude_deg": sun_lon},
                "earth": {"latitude_deg": earth_lat, "longitude_deg": earth_lon},
            }
        )
    return {"step_hours": SUB_POINT_STEP_HOURS, "frame": "MOON_ME", "samples": samples}


def look_at(instant: datetime, observer: ephemeris.Observer, mask: horizon.Mask) -> Look:
    epoch = ephemeris.et(instant)
    sun = ephemeris.apparent("SUN", epoch, observer)
    earth = ephemeris.apparent("EARTH", epoch, observer)
    return Look(
        instant=instant,
        sun=sun,
        earth=earth,
        sun_radius_rad=ephemeris.angular_radius_rad(sun.distance_km, ephemeris.sun_radius_km()),
        earth_radius_rad=ephemeris.angular_radius_rad(
            earth.distance_km, ephemeris.earth_radius_km()
        ),
        mask=mask,
    )


def _grid(start: datetime, end: datetime) -> list[datetime]:
    times: list[datetime] = []
    cursor = start
    while cursor < end:
        times.append(cursor)
        cursor += timedelta(minutes=STEP_MINUTES)
    times.append(end)
    return times


def _refine(left: Look, right: Look, body: Body, look: Callable[[datetime], Look]) -> datetime:
    """Bisect the instant the body crosses the horizon, to about one second."""
    before, after = left.instant, right.instant
    was_above = left.above(body)
    while (after - before).total_seconds() > 0.5:
        middle = before + (after - before) / 2
        if look(middle).above(body) == was_above:
            before = middle
        else:
            after = middle
    return round_second(before + (after - before) / 2)
