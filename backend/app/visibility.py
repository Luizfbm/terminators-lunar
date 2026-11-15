"""Period and metric aggregation over refined visibility transitions."""

import itertools
from datetime import datetime
from typing import Any, Literal

from .constants import SHORT_SHADOW_MAX_HOURS
from .timeutil import iso_z

Sample = dict[str, Any]
Period = dict[str, Any]


def periods(
    boundaries: list[datetime], states: list[bool], body: Literal["sun", "earth"]
) -> list[Period]:
    """One period per gap between boundaries; `states[i]` says if the body is up in gap i."""
    out: list[Period] = []
    for (begin, end), up in zip(itertools.pairwise(boundaries), states, strict=True):
        hours = (end - begin).total_seconds() / 3600.0
        period: Period = {
            "body": body,
            "state": "visible" if up else "hidden",
            "start": iso_z(begin),
            "end": iso_z(end),
            "duration_hours": hours,
        }
        if body == "sun" and not up:
            period["short_shadow"] = hours < SHORT_SHADOW_MAX_HOURS
        out.append(period)
    return out


def metrics(period_list: list[Period], samples: list[Sample]) -> dict[str, float]:
    sun_visible = _hours(period_list, "sun", "visible")
    sun_hidden = _hours(period_list, "sun", "hidden")
    earth_visible = _hours(period_list, "earth", "visible")
    return {
        "sun_and_earth_hours": _intersection_hours(period_list),
        "sunlit_hours": sum(sun_visible),
        "earth_visible_hours": sum(earth_visible),
        "lcip_hours": max(sun_visible, default=0.0),
        "lcsp_hours": max(sun_hidden, default=0.0),
        "mean_sun_fraction": sum(float(s["sun"]["fraction"]) for s in samples) / len(samples),
    }


def _hours(period_list: list[Period], body: str, state: str) -> list[float]:
    return [
        float(p["duration_hours"]) for p in period_list if p["body"] == body and p["state"] == state
    ]


def _intersection_hours(period_list: list[Period]) -> float:
    def span(p: Period) -> tuple[datetime, datetime]:
        return (
            datetime.fromisoformat(p["start"]),
            datetime.fromisoformat(p["end"]),
        )

    sun = [span(p) for p in period_list if p["body"] == "sun" and p["state"] == "visible"]
    earth = [span(p) for p in period_list if p["body"] == "earth" and p["state"] == "visible"]
    return sum(
        max(0.0, (min(a2, b2) - max(a1, b1)).total_seconds() / 3600.0)
        for a1, a2 in sun
        for b1, b2 in earth
    )
