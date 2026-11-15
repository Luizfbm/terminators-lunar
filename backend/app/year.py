"""The year at one Curated Site: Sun and Earth month by month, and the best Windows.

The engine is used as a black box, through the cache (cache.month_periods); the answer
is cached by cache.year. A year is asked one calendar month at a time (each call stays
under the 1440 h Window limit), and the periods are stitched where the months meet: a
period that crosses a month boundary is one period, counted once (spans.sky). The months
are the ones `/sites/{site_id}/windows` asks for, so either route reuses the other's.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from .catalog import Site
from .constants import DEFAULT_DURATION_HOURS, WINDOW_MAX
from .spans import Span, month_spans, sky
from .spans import clip as _clip
from .spans import hours as _hours
from .timeutil import iso_z

BEST_WINDOWS = 3
WINDOW_STEP = timedelta(hours=6)


def year_bounds(year: int) -> Span:
    start = datetime(year, 1, 1, tzinfo=UTC)
    end = min(datetime(year + 1, 1, 1, tzinfo=UTC), WINDOW_MAX)
    return start, end


def _months(year: int) -> list[Span]:
    return month_spans(*year_bounds(year))


def _longest_starting(spans: list[Span], window: Span) -> float:
    return max((_hours(s) for s in spans if window[0] <= s[0] < window[1]), default=0.0)


def _best_windows(both: list[Span], bounds: Span) -> list[dict[str, Any]]:
    """Non-overlapping synodic-month Windows inside the year, most Sun-and-Earth time first."""
    length = timedelta(hours=DEFAULT_DURATION_HOURS)
    candidates: list[tuple[float, datetime]] = []
    cursor = bounds[0]
    while cursor + length <= bounds[1]:
        candidates.append((_clip(both, (cursor, cursor + length)), cursor))
        cursor += WINDOW_STEP
    candidates.sort(key=lambda c: (-c[0], c[1]))
    chosen: list[tuple[float, datetime]] = []
    for hours, start in candidates:
        if all(abs(start - other) >= length for _, other in chosen):
            chosen.append((hours, start))
        if len(chosen) == BEST_WINDOWS:
            break
    return [
        {
            "start": iso_z(start),
            "end": iso_z(start + length),
            "duration_hours": DEFAULT_DURATION_HOURS,
            "sun_and_earth_hours": hours,
        }
        for hours, start in chosen
    ]


def compute(site: Site, year: int, height_m: float) -> dict[str, Any]:
    bounds = year_bounds(year)
    months = _months(year)
    periods = sky(site, months, height_m)
    sunlit, night, earth_up, both = periods.sunlit, periods.night, periods.earth_up, periods.both

    month_rows = [
        {
            "month": index,
            "start": iso_z(window[0]),
            "end": iso_z(window[1]),
            "sunlit_hours": _clip(sunlit, window),
            "earth_visible_hours": _clip(earth_up, window),
            "sun_and_earth_hours": _clip(both, window),
            "longest_sunlit_period_hours": _longest_starting(sunlit, window),
            "longest_shadow_hours": _longest_starting(night, window),
        }
        for index, window in enumerate(months, start=1)
    ]
    sunlit_hours = _clip(sunlit, bounds)
    return {
        "site": site,
        "year": year,
        "observer_height_m": height_m,
        "start": iso_z(bounds[0]),
        "end": iso_z(bounds[1]),
        "months": month_rows,
        "totals": {
            "sunlit_hours": sunlit_hours,
            "sunlit_days": sunlit_hours / 24.0,
            "earth_visible_hours": _clip(earth_up, bounds),
            "sun_and_earth_hours": _clip(both, bounds),
            "lcip_hours": max((_hours(s) for s in sunlit), default=0.0),
            "lcsp_hours": max((_hours(s) for s in night), default=0.0),
        },
        "best_windows": _best_windows(both, bounds),
    }
