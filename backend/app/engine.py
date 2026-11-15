"""Visibility computation independent of HTTP routes."""

from __future__ import annotations

import itertools
import math
from collections.abc import Callable
from dataclasses import dataclass, replace
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
# What `Look.above` can be asked: a body, or the Earth by the other rule (any part of its disc).
Seen = Literal["sun", "earth", "earth_any_part"]
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

    def above(self, body: Seen) -> bool:
        """The Sun counts while any part of its disc clears the terrain; the Earth by its centre.

        "earth_any_part" is the Earth by the Sun's rule, kept next to the main one so a
        reader can see where a difference with a tool that counts the whole disc comes from.
        """
        if body == "sun":
            return self._sun_over_terrain > 0.0
        if body == "earth_any_part":
            return self._earth_over_terrain > 0.0
        return bool(self.earth.elevation_deg > self.mask.elevation_at(self.earth.azimuth_deg))

    @cached_property
    def _sun_over_terrain(self) -> float:
        # Asked several times per instant (events, periods, the sample); computed once.
        return self._disc_over_terrain(self.sun, self.sun_radius_rad)

    @cached_property
    def _earth_over_terrain(self) -> float:
        return self._disc_over_terrain(self.earth, self.earth_radius_rad)

    def _disc_over_terrain(self, body: ephemeris.Apparent, radius_rad: float) -> float:
        # Near the horizon a horizontal offset across the disc spans 1/cos(e) of azimuth.
        # Same definition validation/run_pgda_engine.py uses to count the Earth by any part.
        stretch = 1.0 / max(math.cos(math.radians(body.elevation_deg)), 1e-6)
        return geometry.disc_over_profile(
            math.radians(body.elevation_deg),
            radius_rad,
            lambda offsets: np.radians(
                self.mask.elevation_at(body.azimuth_deg + np.degrees(offsets) * stretch)
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
                # The disc's apparent radius at this instant, from the Sun's topocentric distance.
                "angular_radius_deg": math.degrees(self.sun_radius_rad),
            },
            "earth": {
                "azimuth_deg": self.earth.azimuth_deg,
                "elevation_deg": self.earth.elevation_deg,
                "visible": self.above("earth"),
                # The same for the Earth: its mean radius over its distance from the Observer.
                "angular_radius_deg": math.degrees(self.earth_radius_rad),
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

    looks, found, period_list = transitions(start, end, look)

    events: list[dict[str, Any]] = []
    for body in BODIES:
        rise, fall = EVENT_NAMES[body]
        for instant, rises in found[body]:
            position = getattr(look(instant), body)
            events.append(
                {
                    "type": rise if rises else fall,
                    "t": iso_z(instant),
                    "azimuth_deg": position.azimuth_deg,
                    "occluder": mask.occluder_at(position.azimuth_deg),
                }
            )

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
        "metrics": metrics(period_list, samples, earth_any_part_hours(start, end, looks, look)),
        "provenance": {
            "engine_version": ENGINE_VERSION,
            "synthetic": False,
            "kernels": ephemeris.kernel_names(),
            "dems": mask.products,
        },
    }


def transitions(
    start: datetime, end: datetime, look: Callable[[datetime], Look]
) -> tuple[list[Look], dict[Body, list[tuple[datetime, bool]]], list[dict[str, Any]]]:
    """The scan of a Window, each body's refined crossings, and the periods they cut."""
    looks = scan(start, end, look)
    found: dict[Body, list[tuple[datetime, bool]]] = {}
    period_list: list[dict[str, Any]] = []
    for body in BODIES:
        found[body] = crossings(looks, body, look)
        period_list += body_periods(start, end, [instant for instant, _ in found[body]], body, look)
    return looks, found, period_list


class Sky:
    """Where the Sun and the Earth are over one Query, kept so any Horizon mask can be put under it.

    The ephemeris does not depend on the terrain, so the clones of the Uncertainty band
    (ADR 0006) share one `Sky` and only swap the mask. The Observer stands at the Site's
    DEM height plus its own.
    """

    def __init__(self, observer: ephemeris.Observer) -> None:
        self.observer = observer
        self._looks: dict[datetime, Look] = {}

    def look(self, instant: datetime, mask: horizon.Mask) -> Look:
        base = self._looks.get(instant)
        if base is None:
            base = self._looks[instant] = look_at(instant, self.observer, mask)
        # Look.mask is all that differs; a new Look also starts with its own cached disc.
        return base if base.mask is mask else replace(base, mask=mask)


def make_sky(site: Site, height_m: float) -> Sky:
    """The Sky `calculate` builds for a Site: the Observer on the DEM, `height_m` above it."""
    ground = horizon.site_height_m(site["latitude_deg"], site["longitude_deg"], site["id"])
    return Sky(
        ephemeris.make_observer(site["latitude_deg"], site["longitude_deg"], ground + height_m)
    )


def band_run(
    sky: Sky, start: datetime, end: datetime, mask: horizon.Mask
) -> tuple[list[tuple[str, datetime]], dict[str, float]]:
    """One Query's Events (type, instant) in time order and its metrics, over `mask`.

    The same scan, crossings, periods and metrics as `calculate`, without the parts that
    only draw the answer; `calculate` and this share `transitions`.
    """

    def look(instant: datetime) -> Look:
        return sky.look(instant, mask)

    looks, found, period_list = transitions(start, end, look)
    events = [
        (EVENT_NAMES[body][0 if rises else 1], instant)
        for body in BODIES
        for instant, rises in found[body]
    ]
    events.sort(key=lambda event: event[1])
    samples = [{"sun": {"fraction": item.sun_fraction()}} for item in looks]
    return events, metrics(period_list, samples, earth_any_part_hours(start, end, looks, look))


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
    looks: list[Look], body: Seen, look: Callable[[datetime], Look]
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
    body: Seen,
    look: Callable[[datetime], Look],
) -> list[dict[str, Any]]:
    """A body's periods over [start, end], cut by its own crossings only."""
    boundaries = sorted({start, end, *instants})
    states = [look(a + (b - a) / 2).above(body) for a, b in itertools.pairwise(boundaries)]
    return periods(boundaries, states, body)


def earth_any_part_hours(
    start: datetime, end: datetime, looks: list[Look], look: Callable[[datetime], Look]
) -> float:
    """Hours of the Window with any part of the Earth's disc above the Horizon mask.

    Built the way the Earth's periods are (grid, then bisection to a second), only with the
    Sun's rule for the disc. The Earth's own periods and every other metric keep the centre.
    """
    found = [instant for instant, _ in crossings(looks, "earth_any_part", look)]
    return sum(
        float(p["duration_hours"])
        for p in body_periods(start, end, found, "earth_any_part", look)
        if p["state"] == "visible"
    )


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


def _refine(left: Look, right: Look, body: Seen, look: Callable[[datetime], Look]) -> datetime:
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
