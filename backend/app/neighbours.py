"""The nearby Sites that still work when a launch slips (the requirement).

A launch slips and the Window moves to a new date. The question is then which nearby
Site to move to. The nearby Sites are the other Curated Sites of the same Region, or,
for a Site with no Region, the Curated Sites within NEARBY_KM, nearest first and at most
MAX_NEARBY of them. Each one is
answered over the same Window exactly as `/visibility` answers it, through the same
answer cache, so the numbers here are the `/visibility` numbers and a click on one of
them opens an answer that is already computed.

They are ranked by Sun-and-Earth time, most first; a tie goes to the nearer Site, then
to the lower id, so the order never depends on the order of the catalogue.
"""

from __future__ import annotations

import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any

from . import cache, catalog
from .catalog import Site
from .constants import MOON_RADIUS_KM

# For a Site with no Region: how far a Curated Site may be and still count as nearby.
NEARBY_KM = 50.0
# And how many: as many as a Region can give (the largest holds 11 Sites). IM-2's Site
# has 30 Curated Sites within 50 km, and 31 cold engine runs would take longer than the
# 100 s Cloudflare waits for an answer.
MAX_NEARBY = 10


def distance_km(a: Site, b: Site) -> float:
    """Great-circle distance between two Sites on the 1737.4 km sphere (haversine)."""
    lat_a, lat_b = math.radians(a["latitude_deg"]), math.radians(b["latitude_deg"])
    d_lat = lat_b - lat_a
    d_lon = math.radians(b["longitude_deg"] - a["longitude_deg"])
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat_a) * math.cos(lat_b) * math.sin(d_lon / 2) ** 2
    return 2 * MOON_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def nearby(site: Site) -> list[Site]:
    """The Sites of the same Region, or the nearest Curated Sites within NEARBY_KM; never the Site."""
    others = [s for s in catalog.SITES if s["id"] != site["id"]]
    if site["region_id"] is not None:
        return [s for s in others if s["region_id"] == site["region_id"]]
    near = sorted(
        (s for s in others if distance_km(site, s) <= NEARBY_KM),
        key=lambda s: (distance_km(site, s), s["id"]),
    )
    return near[:MAX_NEARBY]


def compute(
    site: Site, start: datetime, duration_hours: float, height_m: float
) -> tuple[dict[str, Any], bool]:
    """The Site's own answer and its nearby Sites ranked, and whether all came from the cache.

    Raises horizon.DemUnavailable if any of them has no DEM, as the Landing scatter does:
    a list with a Site quietly missing would rank the wrong Sites.
    """
    sites = [site, *nearby(site)]
    # As many at once as the engine has slots; each run still queues at the gate.
    with ThreadPoolExecutor(max_workers=max(1, cache.ENGINE_RUNS)) as pool:
        answers = list(
            pool.map(lambda s: cache.calculate(s, start, duration_hours, height_m), sites)
        )
    parsed = [json.loads(raw) for raw, _ in answers]
    rows = [
        {
            "site": other,
            "distance_km": distance_km(site, other),
            "metrics": answer["metrics"],
        }
        for other, answer in zip(sites[1:], parsed[1:], strict=True)
    ]
    rows.sort(
        key=lambda r: (-r["metrics"]["sun_and_earth_hours"], r["distance_km"], r["site"]["id"])
    )
    own = parsed[0]
    body = {"query": own["query"], "metrics": own["metrics"], "neighbours": rows}
    return body, all(hit for _, hit in answers)
