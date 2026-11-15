"""The Sun and the Earth over a span longer than one engine run, asked month by month.

`/sites/{site_id}/year` and `/sites/{site_id}/windows` both need a Site's periods over
many weeks. The engine takes at most 1440 h per run, so the span is asked one calendar
month at a time through the cache (cache.month_periods), which keeps each month's
periods for both routes: a month one of them computed is not computed again by the
other. The periods are stitched where the months meet, so a period that crosses a month
boundary is one period, counted once.
"""

from __future__ import annotations

import bisect
import calendar
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from . import cache
from .catalog import Site
from .constants import WINDOW_MAX

Span = tuple[datetime, datetime]


def month_spans(start: datetime, end: datetime) -> list[Span]:
    """The calendar months that cover [start, end), the last one cut at WINDOW_MAX."""
    out: list[Span] = []
    cursor = datetime(start.year, start.month, 1, tzinfo=UTC)
    while cursor < end:
        days = calendar.monthrange(cursor.year, cursor.month)[1]
        following = cursor + timedelta(days=days)
        out.append((cursor, min(following, WINDOW_MAX)))
        cursor = following
    return out


def stitch(chunks: list[list[dict[str, Any]]], body: str) -> list[tuple[str, Span]]:
    """Join a body's periods across chunks; equal states that touch become one period."""
    out: list[tuple[str, Span]] = []
    for chunk in chunks:
        for p in chunk:
            if p["body"] != body:
                continue
            span = (datetime.fromisoformat(p["start"]), datetime.fromisoformat(p["end"]))
            if out and out[-1][0] == p["state"] and out[-1][1][1] == span[0]:
                out[-1] = (p["state"], (out[-1][1][0], span[1]))
            else:
                out.append((p["state"], span))
    return out


def hours(span: Span) -> float:
    return (span[1] - span[0]).total_seconds() / 3600.0


def clipped(spans: list[Span], window: Span) -> Iterator[float]:
    """Hours of each span inside the window, in order; `spans` sorted and disjoint."""
    first = bisect.bisect_right(spans, window[0], key=lambda s: s[1])
    for a, b in spans[first:]:
        if a >= window[1]:
            break
        yield max(0.0, (min(b, window[1]) - max(a, window[0])).total_seconds() / 3600.0)


def clip(spans: list[Span], window: Span) -> float:
    # Start from 0.0: with no span inside, sum() alone gives the int 0, written "0" and
    # not "0.0", and /sites/{site_id}/year must stay byte-identical.
    return sum(clipped(spans, window), 0.0)


def intersect(a: list[Span], b: list[Span]) -> list[Span]:
    """Where two sorted lists of disjoint spans overlap, in order."""
    out: list[Span] = []
    i = j = 0
    while i < len(a) and j < len(b):
        lo, hi = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if lo < hi:
            out.append((lo, hi))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


@dataclass(frozen=True)
class Sky:
    """A Site's stitched periods over whole calendar months."""

    months: list[Span]
    sunlit: list[Span]
    night: list[Span]
    earth_up: list[Span]
    both: list[Span]


def sky(site: Site, months: list[Span], height_m: float) -> Sky:
    chunks = [cache.month_periods(site, start, end, height_m) for start, end in months]
    sun = stitch(chunks, "sun")
    earth = stitch(chunks, "earth")
    sunlit = [s for state, s in sun if state == "visible"]
    earth_up = [s for state, s in earth if state == "visible"]
    return Sky(
        months=months,
        sunlit=sunlit,
        night=[s for state, s in sun if state == "hidden"],
        earth_up=earth_up,
        both=intersect(sunlit, earth_up),
    )
