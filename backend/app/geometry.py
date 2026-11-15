"""Angular disc geometry for horizon visibility and eclipses."""

import math
from collections.abc import Callable
from typing import Any

import numpy as np
import numpy.typing as npt


def disc_above(center: float, radius: float) -> float:
    if center - radius >= 0:
        return 1.0
    if center + radius <= 0:
        return 0.0
    x = max(-1.0, min(1.0, center / radius))
    return 0.5 + math.asin(x) / math.pi + x * math.sqrt(max(0.0, 1.0 - x * x)) / math.pi


def angle_between(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    magnitude = math.sqrt(sum(x * x for x in a) * sum(y * y for y in b))
    return math.acos(max(-1.0, min(1.0, dot / magnitude)))


def circle_overlap_fraction(r1: float, r2: float, separation: float) -> float:
    if separation >= r1 + r2:
        return 0.0
    if r2 >= separation + r1:
        return 1.0
    if r1 >= separation + r2:
        return (r2 / r1) ** 2
    c1 = (separation**2 + r1**2 - r2**2) / (2 * separation * r1)
    c2 = (separation**2 + r2**2 - r1**2) / (2 * separation * r2)
    area = (
        r1**2 * math.acos(c1)
        + r2**2 * math.acos(c2)
        - 0.5
        * math.sqrt(
            max(
                0.0,
                (-separation + r1 + r2)
                * (separation + r1 - r2)
                * (separation - r1 + r2)
                * (separation + r1 + r2),
            )
        )
    )
    return max(0.0, min(1.0, area / (math.pi * r1**2)))


DISC_STRIPS = 32


def disc_over_profile(
    center: float, radius: float, profile: Callable[[npt.NDArray[np.float64]], Any]
) -> float:
    """Fraction of a disc above a horizon profile, in vertical strips across the disc.

    `profile(offsets)` gives the horizon elevation at horizontal angular offsets from the
    disc's centre. Each strip is a chord of the disc; the part above the profile counts.
    """
    width = 2.0 * radius / DISC_STRIPS
    offsets = np.asarray(-radius + (np.arange(DISC_STRIPS) + 0.5) * width, dtype=np.float64)
    half = np.sqrt(np.maximum(0.0, radius * radius - offsets * offsets))
    floor = np.maximum(np.asarray(profile(offsets), dtype=np.float64), center - half)
    visible = np.maximum(0.0, center + half - floor)
    return float(max(0.0, min(1.0, visible.sum() / (2.0 * half).sum())))
