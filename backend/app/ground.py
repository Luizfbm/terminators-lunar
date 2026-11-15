"""`GET /terrain`: the ground around a Site, a property of the Site with no Window.

The Slope (slope.py) and, when the server has the map, the nearest permanently shadowed
region (psr.py).
"""

from __future__ import annotations

from typing import Any

from . import catalog, horizon, psr, slope
from .constants import CUSTOM_MAX_LATITUDE_DEG
from .problems import ApiProblem, missing_site


def site_for(
    site_id: str | None, latitude_deg: float | None, longitude_deg: float | None
) -> catalog.Site:
    """The Site of the request, with the same problems and in the same order as /visibility."""
    custom = latitude_deg is not None or longitude_deg is not None
    if site_id is None and not custom:
        raise ApiProblem("missing_site", "Missing Site", "Pass site_id or both custom coordinates.")
    if site_id is not None and custom:
        raise ApiProblem(
            "ambiguous_site", "Ambiguous Site", "Pass site_id or custom coordinates, not both."
        )
    if custom and (latitude_deg is None or longitude_deg is None):
        raise ApiProblem("ambiguous_site", "Ambiguous Site", "Pass both custom coordinates.")
    if site_id is not None:
        found = catalog.find_site(site_id)
        if found is None:
            raise missing_site(site_id)
        return found
    assert latitude_deg is not None and longitude_deg is not None
    if latitude_deg > CUSTOM_MAX_LATITUDE_DEG:
        raise ApiProblem(
            "outside_coverage", "Outside coverage", "Custom Sites must be at or south of 80°S."
        )
    return catalog.custom_site(latitude_deg, longitude_deg)


def terrain(site: catalog.Site, radius_m: float, slope_limit_deg: float) -> dict[str, Any]:
    """The contract's `TerrainResult`, or the 422 that says why there is none."""
    try:
        found = slope.measure(
            site["latitude_deg"],
            site["longitude_deg"],
            radius_m,
            slope_limit_deg,
            site["id"] if site["curated"] else None,
        )
    except horizon.DemUnavailable as missing:
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"No DEM covers {radius_m:g} m around this Site ({missing}).",
        ) from missing
    except slope.NoCellInRadius as empty:
        raise ApiProblem(
            "outside_coverage",
            "Outside coverage",
            f"The DEM is too coarse for this radius: {empty}.",
        ) from empty
    answer: dict[str, Any] = {
        "site": site,
        "radius_m": radius_m,
        "slope": slope.as_json(found),
        "dem": {"product": found.product, "resolution_m": found.resolution_m},
    }
    shadow = psr.nearest(site["latitude_deg"], site["longitude_deg"])
    # Left out with no map or outside it; null when the map has no shadowed cell in range.
    if shadow is not psr.ABSENT:
        answer["permanent_shadow"] = shadow
    return answer
