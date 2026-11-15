"""The Query on the Flat horizon: the bare reference sphere, with no DEM (the requirement).

The Site sits on the 1737.4 km sphere and the Observer stands its height above it, so the
horizon is the same all round: minus the dip, acos(R / (R + h)). Everything else is the
engine of `/visibility`: the same ephemeris, the same 15 minute grid and the same
definitions of every event, so the two answers differ by the terrain alone.

Metrics cover the Window. Events are looked for from the Window start to `search_end`,
180 days past the Window end or the end of coverage, whichever comes first: in polar
summer the Sun would not set for months without terrain, and that is the sentence the
screen wants. The lookahead walks the same 15 minute grid as the Window (about 70 µs a
step, so 180 days cost about 1.2 s); a coarser step could step over a short dip of the
Sun below the horizon, where its path only grazes it.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from . import cache, engine, ephemeris, horizon
from .catalog import Site
from .constants import ENGINE_VERSION, WINDOW_MAX
from .timeutil import iso_z
from .visibility import metrics

SEARCH_DAYS = 180


def search_end(end: datetime) -> datetime:
    """Where the search for events stops: 180 days past the Window end, or coverage's end."""
    return min(end + timedelta(days=SEARCH_DAYS), WINDOW_MAX)


def compute(site: Site, start: datetime, duration_hours: float, height_m: float) -> dict[str, Any]:
    end = start + timedelta(hours=duration_hours)
    stop = search_end(end)
    mask = horizon.flat(site["latitude_deg"], site["longitude_deg"], height_m)
    # The Site is on the sphere (mask.site_height_m is 0); the Observer stands above it.
    observer = ephemeris.make_observer(
        site["latitude_deg"], site["longitude_deg"], mask.site_height_m + height_m
    )

    def look(instant: datetime) -> engine.Look:
        return engine.look_at(instant, observer, mask)

    window = engine.scan(start, end, look)
    # From the Window end on its own grid, so each step inside the Window is the one
    # /visibility takes and no state change is counted twice at the seam.
    beyond = engine.scan(end, stop, look)

    events: list[dict[str, Any]] = []
    period_list: list[dict[str, Any]] = []
    for body in engine.BODIES:
        rise, fall = engine.EVENT_NAMES[body]
        inside = engine.crossings(window, body, look)
        for instant, rises in inside + engine.crossings(beyond, body, look):
            events.append(
                {
                    "type": rise if rises else fall,
                    "t": iso_z(instant),
                    "azimuth_deg": getattr(look(instant), body).azimuth_deg,
                }
            )
        period_list += engine.body_periods(
            start, end, [instant for instant, _ in inside], body, look
        )

    events.sort(key=lambda event: event["t"])
    period_list.sort(key=lambda p: (p["start"], p["body"]))
    return {
        "query": engine.query_echo(site, start, end, duration_hours, height_m),
        # + 0.0 turns the -0.0 of a 0 m Observer into 0.
        "horizon_elevation_deg": float(mask.elevations_deg[0]) + 0.0,
        "search_end": iso_z(stop),
        "events": events,
        "metrics": metrics(period_list, [item.sample() for item in window]),
        "provenance": {
            "engine_version": ENGINE_VERSION,
            "synthetic": False,
            "kernels": ephemeris.kernel_names(),
            "dems": mask.products,
        },
    }


def answer(
    site: Site, start: datetime, duration_hours: float, height_m: float
) -> tuple[bytes, bool]:
    """The answer as JSON and whether it came from the cache.

    Curated Sites are kept under the same versioned key scheme as `/visibility`, named
    `<id>/flat`. No DEM goes into the answer, so the DEM fingerprint is left empty and
    a new DEM on the server keeps these answers.
    """
    if not site["curated"]:
        return _run(site, start, duration_hours, height_m), False
    key: cache.Key = (f"{site['id']}/flat", ENGINE_VERSION, (), start, duration_hours, height_m)
    return cache._memo(key, lambda: _run(site, start, duration_hours, height_m))


def _run(site: Site, start: datetime, duration_hours: float, height_m: float) -> bytes:
    # Through the same engine slots as every other run, so a burst queues or gets 503.
    warming = cache._is_warming()
    cache._gate.acquire(warming)
    try:
        result = compute(site, start, duration_hours, height_m)
    finally:
        cache._gate.release(warming)
    return json.dumps(result, separators=(",", ":"), allow_nan=False).encode()
