"""The Rovers a mission can bring: Eduardo's cockpit catalogue (commit 2195fcb), eight of them.

`data/rovers.json` holds the numbers as he wrote them in `const ROVERS` (src/cockpit_missao_lunar.html),
with the source of each in English and Portuguese and the fields his catalogue marks as estimated.
Darkness tolerance is the GLOSSARY's: stored energy divided by the power draw in shadow, with the
RTG's constant output taken off the draw; null when the RTG covers the load.
"""

from __future__ import annotations

import json
from decimal import ROUND_HALF_UP, Decimal
from functools import cache
from pathlib import Path
from typing import Any

DATA = Path(__file__).parent / "data" / "rovers.json"


def darkness_tolerance_hours(
    battery_wh: float, power_shadow_w: float, rtg_w: float
) -> float | None:
    """Hours the battery carries the Rover through shadow, to 0.01 h; None when nothing drains it."""
    net_w = power_shadow_w - rtg_w
    if net_w <= 0:
        return None
    return float(Decimal(battery_wh / net_w).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


@cache
def _rows() -> tuple[dict[str, Any], ...]:
    with DATA.open(encoding="utf-8") as handle:
        rows: list[dict[str, Any]] = json.load(handle)["rovers"]
    return tuple(rows)


def _with_tolerance(row: dict[str, Any]) -> dict[str, Any]:
    return {
        **row,
        "darkness_tolerance_hours": darkness_tolerance_hours(
            row["battery_wh"], row["power_shadow_w"], row["rtg_w"]
        ),
    }


def listing() -> dict[str, Any]:
    """The `RoverList` of the contract, Moon Rovers first as in the cockpit."""
    return {"rovers": [_with_tolerance(row) for row in _rows()]}


def find(rover_id: str) -> dict[str, Any] | None:
    for row in _rows():
        if row["id"] == rover_id:
            return _with_tolerance(row)
    return None
