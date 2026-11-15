"""The same Window started on other days, at one Curated Site.

One Window per day from `first_shift_days` to `last_shift_days` around the planned
start, at its time of day and with its duration. The Site's periods come month by month
from spans.sky, the months `/sites/{site_id}/year` asks for, so a year either route
computed is reused by the other. Each Window's hours are those periods clipped to it.
The answer is cached by cache.windows.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .catalog import Site
from .constants import WINDOW_MAX, WINDOW_MIN
from .spans import Span, clip, clipped, month_spans, sky
from .timeutil import iso_z

STEP_DAYS = 1


def shifted(
    start: datetime, duration_hours: float, first_shift_days: int, last_shift_days: int
) -> list[tuple[int, Span]]:
    """The Windows inside engine coverage, earliest first; the others are left out."""
    out: list[tuple[int, Span]] = []
    for shift in range(first_shift_days, last_shift_days + 1, STEP_DAYS):
        try:
            begin = start + timedelta(days=shift)
            end = begin + timedelta(hours=duration_hours)
        except OverflowError:
            # Past year 1 or 9999: as far outside coverage as a date can be.
            continue
        if WINDOW_MIN <= begin and end <= WINDOW_MAX:
            out.append((shift, (begin, end)))
    return out


def _rank(rows: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Best, typical (the lower median) and worst by Sun-and-Earth time, earlier on a tie."""
    hours = sorted(r["sun_and_earth_hours"] for r in rows)

    def earliest(value: float) -> dict[str, Any]:
        # rows are earliest first
        return next(r for r in rows if r["sun_and_earth_hours"] == value)

    return earliest(hours[-1]), earliest(hours[(len(hours) - 1) // 2]), earliest(hours[0])


def compute(
    site: Site,
    start: datetime,
    duration_hours: float,
    height_m: float,
    first_shift_days: int,
    last_shift_days: int,
) -> dict[str, Any]:
    plan = shifted(start, duration_hours, first_shift_days, last_shift_days)
    if not plan:
        raise ValueError("no Window inside engine coverage")
    periods = sky(site, month_spans(plan[0][1][0], plan[-1][1][1]), height_m)
    rows = [
        {
            "shift_days": shift,
            "start": iso_z(window[0]),
            "end": iso_z(window[1]),
            "sun_and_earth_hours": clip(periods.both, window),
            "sunlit_hours": clip(periods.sunlit, window),
            "earth_visible_hours": clip(periods.earth_up, window),
            "lcsp_hours": max(clipped(periods.night, window), default=0.0),
        }
        for shift, window in plan
    ]
    best, typical, worst = _rank(rows)
    return {
        "site": site,
        "planned_start": iso_z(start),
        "duration_hours": duration_hours,
        "observer_height_m": height_m,
        "step_days": STEP_DAYS,
        "windows": rows,
        "best": best,
        "typical": typical,
        "worst": worst,
    }
