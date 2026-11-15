"""Names the terrain an Occluder sits on, from the IAU Gazetteer (app/data/features.json).

The Gazetteer gives each feature a centre and a diameter, nothing more, so every feature
is treated as a circle. For one Occluder point we measure the surface distance d to each
centre and compare it with the radius r:

- rim: |d - r| <= rim band, where the rim band is max(15 % of r, 0.3 km). Crater rims
  are not perfect circles and the Gazetteer diameters are rounded, so the band has to be
  wide enough to catch a real rim crest; 15 % keeps Shackleton's band (r ~ 10.5 km)
  near 1.6 km, about the width of its rim crest. Only craters have a rim.
- inside: d < r - rim band (for a non-crater, d <= r).
- near: r + rim band < d <= r + min(25 % of r, 3 km). Only craters and montes, whose
  extent the circle describes reasonably; for maria and the other broad features the
  edge is too vague to say "near". The cap is tight on purpose: at 10 km, the ground
  around Site 001 on Connecting Ridge came out "near Henson", a crater whose rim is
  5 km away, which a reader would take as the Sun setting behind Henson.

The answer is the smallest feature with a rim or inside relation (the most specific name
for that patch of ground). Only when there is none do we take the near feature with the
smallest gap to its edge. Features under 1 km are ignored: at the DEM's 20 m and the
Gazetteer's precision their circles are not reliable. Anything else gives None: no
name is better than a wrong one.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from .constants import MOON_RADIUS_M

_FILE = Path(__file__).resolve().parent / "data" / "features.json"

MIN_DIAMETER_KM = 1.0
RIM_FRACTION = 0.15
RIM_MIN_KM = 0.3
NEAR_FRACTION = 0.25
NEAR_MAX_KM = 3.0
HAS_RIM = {"crater"}
HAS_NEAR = {"crater", "mons"}


@lru_cache(maxsize=1)
def _table() -> tuple[list[dict[str, Any]], np.ndarray, np.ndarray, np.ndarray]:
    document = json.loads(_FILE.read_text("utf-8"))
    rows = [f for f in document["features"] if f["diameter_km"] >= MIN_DIAMETER_KM]
    lat = np.radians([f["latitude_deg"] for f in rows])
    lon = np.radians([f["longitude_deg"] for f in rows])
    radius = np.array([f["diameter_km"] / 2 for f in rows])
    return rows, lat, lon, radius


def feature_at(latitude_deg: float, longitude_deg: float) -> dict[str, str] | None:
    """The named feature at this point and how the point relates to it, or None."""
    rows, lat, lon, radius = _table()
    phi = math.radians(latitude_deg)
    lam = math.radians(longitude_deg)
    # Haversine, stable at the short distances that matter here.
    h = np.sin((lat - phi) / 2) ** 2 + math.cos(phi) * np.cos(lat) * np.sin((lon - lam) / 2) ** 2
    distance = 2 * MOON_RADIUS_M / 1000 * np.arcsin(np.sqrt(np.clip(h, 0, 1)))
    band = np.maximum(RIM_FRACTION * radius, RIM_MIN_KM)
    gap = distance - radius

    contained: list[tuple[float, int, str]] = []
    near: list[tuple[float, int]] = []
    for i in map(
        int, np.flatnonzero(distance <= radius + np.minimum(NEAR_FRACTION * radius, NEAR_MAX_KM))
    ):
        kind = rows[i]["type"]
        if kind in HAS_RIM:
            if abs(gap[i]) <= band[i]:
                contained.append((radius[i], i, "rim"))
            elif gap[i] < 0:
                contained.append((radius[i], i, "inside"))
            elif kind in HAS_NEAR:
                near.append((gap[i], i))
        elif gap[i] <= 0:
            contained.append((radius[i], i, "inside"))
        elif kind in HAS_NEAR:
            near.append((gap[i], i))
    if contained:
        _, index, relation = min(contained)
    elif near:
        _, index = min(near)
        relation = "near"
    else:
        return None
    return {"name": rows[index]["name"], "type": rows[index]["type"], "relation": relation}


def name_occluders(answer: dict[str, Any]) -> dict[str, Any]:
    """Adds `feature` to every Occluder of an engine answer, in place, and returns it."""
    seen: dict[tuple[float, float], dict[str, str] | None] = {}
    occluders = [sample["occluder"] for sample in answer["horizon"]["samples"]]
    occluders += [event["occluder"] for event in answer["events"] if event.get("occluder")]
    for occluder in occluders:
        if "feature" in occluder:  # a cached answer, already named
            continue
        key = (occluder["latitude_deg"], occluder["longitude_deg"])
        if key not in seen:
            seen[key] = feature_at(*key)
        occluder["feature"] = seen[key]
    return answer
