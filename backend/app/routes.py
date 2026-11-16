"""Internal spatial route prototype over measured DEM pixel centres.

No API contract yet. A shortest graph path is not a safe rover trajectory: lateral
slope, subpixel hazards, vehicle footprint, illumination and energy are not modelled.
Distances use spherical arcs at the mean endpoint elevation plus elevation change.
Nodata must already be decoded as NaN, as in heights.grid; never fill missing pixels.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass
from typing import Literal

import numpy as np

from .constants import MOON_RADIUS_M
from .heights import Grid

Cell = tuple[int, int]
MAX_CELLS = 511 * 511


@dataclass(frozen=True)
class SpatialRoute:
    status: Literal["found", "no_path_in_window"]
    cells: tuple[Cell, ...]
    length_m: float | None
    max_segment_slope_deg: float | None
    product: str
    resolution_m: float


def shortest_path(grid: Grid, start: Cell, goal: Cell, max_slope_deg: float) -> SpatialRoute:
    """Shortest distance on an eight-neighbour graph within this window only.

    Reject invalid input; return no_path_in_window for disconnected valid endpoints.
    The slope limit applies to absolute grade along each segment, not surface slope.
    """
    z = np.asarray(grid.heights, dtype=float)
    if z.ndim != 2 or not z.size or z.size > MAX_CELLS:
        raise ValueError("Expected a nonempty 2D grid of at most 511 squared cells")
    if not math.isfinite(max_slope_deg) or not 0 <= max_slope_deg < 90:
        raise ValueError("Segment slope limit must be finite and in [0, 90)")
    if (
        not all(
            math.isfinite(v)
            for v in (grid.metres_per_pixel, grid.x_min_m, grid.y_max_m, grid.resolution_m)
        )
        or min(grid.metres_per_pixel, grid.resolution_m) <= 0
    ):
        raise ValueError("Invalid grid geometry or resolution")
    rows, cols = z.shape
    for cell in (start, goal):
        if (
            len(cell) != 2
            or any(type(v) is not int for v in cell)
            or not (0 <= cell[0] < rows and 0 <= cell[1] < cols)
        ):
            raise ValueError("Endpoint outside grid or not an integer pixel index")
        if not np.isfinite(z[cell]):
            raise ValueError("Endpoint has no measured elevation")
    valid = np.isfinite(z)
    if np.any(z[valid] <= -MOON_RADIUS_M):
        raise ValueError("Elevation must lie above the lunar centre")
    x, y = np.meshgrid(
        grid.x_min_m + (np.arange(cols) + 0.5) * grid.metres_per_pixel,
        grid.y_max_m - (np.arange(rows) + 0.5) * grid.metres_per_pixel,
    )
    if grid.projection == "eqc":
        lat = y / MOON_RADIUS_M
        if np.any(np.abs(lat) >= math.pi / 2):
            raise ValueError("Cylindrical pixel centres must lie strictly between the poles")
        lon = x / MOON_RADIUS_M + math.pi
    elif grid.projection in ("polar", "polar_north"):
        colat = 2 * np.arctan(np.hypot(x, y) / (2 * MOON_RADIUS_M))
        north = grid.projection == "polar_north"
        lat = math.pi / 2 - colat if north else colat - math.pi / 2
        lon = np.arctan2(x, -y if north else y)
    else:
        raise ValueError("Unsupported DEM projection")
    vectors = np.stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)), axis=-1)

    def edge(a: Cell, b: Cell) -> tuple[float, float] | None:
        if not valid[a] or not valid[b]:
            return None
        # Chord of unit vectors avoids cancellation in acos for metre-scale edges.
        chord = float(np.linalg.norm(vectors[a] - vectors[b]))
        angle = 2 * math.asin(min(1.0, chord / 2))
        run = angle * (MOON_RADIUS_M + float(z[a] + z[b]) / 2)
        rise = abs(float(z[b] - z[a]))
        if run <= 0:
            return None
        slope = math.degrees(math.atan2(rise, run))
        return (math.hypot(run, rise), slope) if slope <= max_slope_deg else None

    distances = {start: 0.0}
    previous: dict[Cell, tuple[Cell, float]] = {}
    queue = [(0.0, start)]
    while queue:
        distance, cell = heapq.heappop(queue)
        if distance != distances[cell]:
            continue
        if cell == goal:
            path = [goal]
            peak = 0.0
            while path[-1] != start:
                parent, grade = previous[path[-1]]
                peak = max(peak, grade)
                path.append(parent)
            return SpatialRoute(
                "found", tuple(reversed(path)), distance, peak, grid.product, grid.resolution_m
            )
        r, c = cell
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                target = (r + dr, c + dc)
                if not (dr or dc) or not 0 <= target[0] < rows or not 0 <= target[1] < cols:
                    continue
                segment = edge(cell, target)
                if segment is None:
                    continue
                if dr and dc:
                    sides = ((r + dr, c), (r, c + dc))
                    if any(
                        edge(cell, side) is None or edge(side, target) is None for side in sides
                    ):
                        continue
                candidate = distance + segment[0]
                if candidate < distances.get(target, math.inf):
                    distances[target] = candidate
                    previous[target] = (cell, segment[1])
                    heapq.heappush(queue, (candidate, target))
    return SpatialRoute("no_path_in_window", (), None, None, grid.product, grid.resolution_m)
