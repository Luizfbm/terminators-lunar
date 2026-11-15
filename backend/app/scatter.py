"""Landing scatter: the Query answered at 19 points around the Site (the requirement).

The Site itself, 6 points at half of the radius every 60° from north and 12 at the
radius every 30° from north, placed along great circles on the 1737.4 km sphere. Each
point is an ordinary engine run for its own coordinate, with its own Horizon mask and
its own local frame: near the pole 250 m turns local north by about a degree, so
nothing is reused between points. Only the metrics come back.

This is landing error, where the lander ends up. The Resolution ladder and the
Uncertainty band are map error (ADR 0003); the two are kept apart.

The points run one after the other, each through the engine gate on its own, so a
scatter never holds more than one engine slot and lets queued visitors in between
points (`cache.engine_run(polite=True)`).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import numpy as np

from . import cache, catalog, horizon
from .catalog import Site

# The miss Intuitive Machines reported for IM-2 Athena in March 2025.
DEFAULT_RADIUS_M = 250.0
INNER_BEARINGS_DEG = tuple(float(b) for b in range(0, 360, 60))
OUTER_BEARINGS_DEG = tuple(float(b) for b in range(0, 360, 30))
METRICS = (
    "sun_and_earth_hours",
    "sunlit_hours",
    "earth_visible_hours",
    "lcip_hours",
    "lcsp_hours",
    "mean_sun_fraction",
)


def offsets(radius_m: float) -> list[tuple[float, float]]:
    """(distance, bearing) of each point in answer order: the Site, the inner ring, the outer."""
    return (
        [(0.0, 0.0)]
        + [(radius_m / 2.0, bearing) for bearing in INNER_BEARINGS_DEG]
        + [(radius_m, bearing) for bearing in OUTER_BEARINGS_DEG]
    )


def place(site: Site, distance_m: float, bearing_deg: float) -> tuple[float, float]:
    """The coordinate `distance_m` from the Site along the great circle at `bearing_deg`."""
    # At exactly -90° every bearing leaves along one meridian and the 18 points would fall
    # on top of each other. The mask moves such a Site 3 cm off the pole for the same
    # reason (horizon.POLE_LATITUDE_DEG); its local north is then the Site's longitude.
    latitude = max(site["latitude_deg"], horizon.POLE_LATITUDE_DEG)
    lat, lon = horizon._destination(
        latitude, site["longitude_deg"], np.array([bearing_deg]), np.array([distance_m])
    )
    return float(lat[0, 0]), float(lon[0, 0])


def _point_site(site: Site, latitude_deg: float, longitude_deg: float) -> Site:
    """A point as a custom Site that reads the same DEM windows as the Site it surrounds.

    The engine finds a Site's DEMs by its id (horizon.ladder_for): an off-pole Curated
    Site has its own crop, every other Site the polar ladder. Keeping the id is what
    makes a point of an off-pole Site read that crop; for every other Site the ladder is
    the polar one either way, so the point is exactly a custom Site at that coordinate.
    """
    return {**catalog.custom_site(latitude_deg, longitude_deg), "id": site["id"]}


def compute(
    site: Site, start: datetime, duration_hours: float, height_m: float, radius_m: float
) -> dict[str, Any]:
    """The Landing scatter of one Query. Raises horizon.DemUnavailable if any point has no DEM."""
    # The centre is the /visibility answer itself, from its cache when it is there.
    raw, _ = cache.calculate(site, start, duration_hours, height_m)
    centre = json.loads(raw)
    points: list[dict[str, Any]] = [
        {
            "distance_m": 0.0,
            "azimuth_deg": 0.0,
            "latitude_deg": site["latitude_deg"],
            "longitude_deg": site["longitude_deg"],
            "metrics": centre["metrics"],
        }
    ]
    for distance, bearing in offsets(radius_m)[1:]:
        latitude, longitude = place(site, distance, bearing)
        answer = cache.engine_run(
            _point_site(site, latitude, longitude), start, duration_hours, height_m, polite=True
        )
        points.append(
            {
                "distance_m": distance,
                "azimuth_deg": bearing,
                "latitude_deg": latitude,
                "longitude_deg": longitude,
                "metrics": answer["metrics"],
            }
        )
    return {
        "query": centre["query"],
        "radius_m": radius_m,
        "points": points,
        "band": band(points),
    }


def band(points: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Minimum and maximum of each metric, and the first point that gives each."""
    result: dict[str, dict[str, Any]] = {}
    for name in METRICS:
        values = [point["metrics"][name] for point in points]
        # min() and max() keep the first of equal keys, so a tie names the earlier point.
        low = min(range(len(values)), key=values.__getitem__)
        high = max(range(len(values)), key=values.__getitem__)
        result[name] = {
            "min": values[low],
            "max": values[high],
            "min_point": low,
            "max_point": high,
        }
    return result
