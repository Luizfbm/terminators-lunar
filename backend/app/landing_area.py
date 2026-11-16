"""Level 3's bounded, co-registered native DEM inspection (no synthetic fallback)."""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from . import ground, heights, horizon
from .problems import ApiProblem

# Selection scope of the original cockpit's real south-polar core, not a 5 m claim.
MAX_LATITUDE_DEG = -87.5
HALF_M = 5000.0


def area(latitude_deg: float, longitude_deg: float) -> dict[str, Any]:
    if not (math.isfinite(latitude_deg) and math.isfinite(longitude_deg)
            and -90 <= latitude_deg <= MAX_LATITUDE_DEG and -180 <= longitude_deg <= 180):
        raise ApiProblem("outside_coverage", "Outside Level 3", "Select a centre between 87.5 and 90 degrees south.")
    site = ground.site_for(None, latitude_deg, longitude_deg)
    folder, _ = horizon.slope_bands(None, latitude_deg)
    bands = [horizon.Band("LDEM_80S_80MPP_ADJ", 80., 0., HALF_M),
             horizon.Band("LDEM_80S_20MPP_ADJ", 20., 0., HALF_M)]
    x, y = horizon._project(bands[0], np.array([latitude_deg]), np.array([longitude_deg]))
    bounds = {"x_min_m": float(x[0])-HALF_M, "x_max_m": float(x[0])+HALF_M,
              "y_min_m": float(y[0])-HALF_M, "y_max_m": float(y[0])+HALF_M}
    grids = []
    for band in bands:
        try:
            found = heights._grid(str(folder), (band,), latitude_deg, longitude_deg, HALF_M + band.resolution_m)
        except horizon.DemUnavailable as missing:
            raise ApiProblem("outside_coverage", "Terrain unavailable", "Both native 80 m and 20 m DEMs must cover the complete landing area.") from missing
        # Pixel centres must surround the full shared rectangle, so triangle interpolation
        # at its border never extrapolates. _grid may cap the number of native pixels.
        step = found.metres_per_pixel
        n = found.heights.shape[0]
        if (found.x_min_m+step/2 > bounds["x_min_m"] or
                found.x_min_m+(n-.5)*step < bounds["x_max_m"] or
                found.y_max_m-step/2 < bounds["y_max_m"] or
                found.y_max_m-(n-.5)*step > bounds["y_min_m"]):
            raise ApiProblem("outside_coverage", "Incomplete terrain", "The native grid does not surround the full 10 km square.")
        grids.append({"site": site, **heights.as_json(found, HALF_M)})
    return {"site": site, "selection_max_latitude_deg": MAX_LATITUDE_DEG,
            "width_m": 10000, "bounds": bounds, "before": grids[0], "after": grids[1]}
