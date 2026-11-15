"""The check against the PGDA average illumination maps (the requirement), written before any result.

The maps: PGDA product 69 (Mazarico et al. 2011, Icarus 211, 1066-1081,
doi:10.1016/j.icarus.2010.10.030), `AVGVISIB_85S_060M_201608` (Sun) and its `_EARTH` twin.
Their PDS labels define each value as "the percentage of timesteps where each pixel was
sunlit (by any fraction of the solar disc)", DN x 0.00004, over hourly steps across 18.6
years, at the surface. The survey behind every choice here is the comment on the implementation.

What is compared, per point:
- Sun: the share of hourly steps with any part of the Sun's disc above the Horizon mask
  (`Look.above("sun")`, the engine's own Sunrise and Sunset rule), against the Sun map.
  Mean Sun fraction is reported next to it and not judged: it is another quantity.
- Earth: the share of hourly steps with any part of the Earth's disc above the Horizon
  mask, against the Earth map. Our Earth visible goes by the centre; that share is
  reported and not judged.

This module holds the rule that picks the points and the tolerance, and they do not change
after a result: if the check fails, it stays failed and is reported.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

# --- The maps ---------------------------------------------------------------------------

BASE_URL = "https://pgda.gsfc.nasa.gov/data/MoonIllumination"
MAPS: dict[str, dict[str, Any]] = {
    "sun": {
        "file": "AVGVISIB_85S_060M_201608.TIF",
        "bytes": 33_994_464,
        "sha256": "ccf67d4f39e0a970c111196da7d6551ffcf50d075470b93067fb3904c0b05806",
    },
    "earth": {
        "file": "AVGVISIB_85S_060M_201608_EARTH.TIF",
        "bytes": 24_862_958,
        "sha256": "d71dc5adfff653e0e924e0a4cbf03795b996caa30b4ace3d5843a70a5ab2f3d2",
    },
}
SCALE = 0.00004  # the labels' SCALING_FACTOR; OFFSET is 0
MOON_RADIUS_M = 1_737_400.0  # the labels' sphere

# --- The point rule ---------------------------------------------------------------------

SEED = 20261114
LATITUDE_LIMIT_DEG = -85.0  # pixel centres at or south of this: the maps' full coverage
SMOOTH = 0.05  # every one of the 8 neighbours within this of the pixel, in both maps
SUN_STRATA = [(i / 10, (i + 1) / 10) for i in range(9)]  # the Sun map tops out at 0.884
EARTH_STRATA = [(i / 10, (i + 1) / 10) for i in range(10)]
SUN_PER_STRATUM = 6
EARTH_PER_STRATUM = 5

# --- Bright ridges: shown for information, never judged -----------------------------------
# Added after the draw above and before any engine result: the rule left every Sun stratum
# from 0.6 up empty, and those ridges and rims are where landers want to go. These points
# have no smoothness filter on purpose; the map cannot place a value inside a 60 m pixel
# there. Their RMSE and mean difference are shown and never enter the pass or the fail.

BRIGHT_SEED = 20261115  # its own seed, so the judged draw does not move by a single point
BRIGHT_STRATA = [(0.6, 0.7), (0.7, 0.8), (0.8, 0.9)]
BRIGHT_PER_STRATUM = 6

# --- The engine side --------------------------------------------------------------------

OBSERVER_HEIGHT_M = 0.0  # the surface, as the maps imply
STEP = timedelta(hours=1)  # the maps' hourly steps
CYCLE_DAYS = 6798  # one lunar nodal cycle, 18.6 years
JUDGED_START = datetime(2023, 8, 1, tzinfo=UTC)
# The maps' own cycle is not published. A second cycle, half a cycle later, measures how much
# that choice moves the answer; it is reported and not judged.
SECOND_START = JUDGED_START + timedelta(days=CYCLE_DAYS // 2)
CONTROL_LONGITUDE_SHIFT_DEG = 180.0  # the negative control: another place, same latitude

# --- The tolerance, per quantity, in percentage points ------------------------------------

RMSE_MAX_PP = 5.0
MEAN_DIFFERENCE_MAX_PP = 2.0


def pixel_centre(row: int, col: int, west: float, north: float, cell: float) -> tuple[float, float]:
    """Latitude and longitude of a pixel centre on the maps' south polar stereographic grid."""
    x = west + (col + 0.5) * cell
    y = north - (row + 0.5) * cell
    rho = math.hypot(x, y)
    latitude = math.degrees(2.0 * math.atan(rho / (2.0 * MOON_RADIUS_M))) - 90.0
    longitude = math.degrees(math.atan2(x, y)) % 360.0
    return latitude, longitude


def compare(pairs: list[tuple[float, float]]) -> dict[str, Any]:
    """RMSE and mean difference (ours minus the map), in percentage points."""
    differences = [(ours - theirs) * 100.0 for ours, theirs in pairs]
    rmse = math.sqrt(sum(d * d for d in differences) / len(differences))
    mean = sum(differences) / len(differences)
    worst = max(differences, key=abs)
    return {
        "points": len(differences),
        "rmse_pp": rmse,
        "mean_difference_pp": mean,
        "largest_difference_pp": worst,
        "passed": rmse <= RMSE_MAX_PP and abs(mean) <= MEAN_DIFFERENCE_MAX_PP,
    }
