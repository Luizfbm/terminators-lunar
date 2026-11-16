"""Spatial graph tests; these do not validate rover safety."""
import math
from dataclasses import replace

import numpy as np
import pytest

from app.constants import MOON_RADIUS_M as R
from app.heights import Grid
from app.routes import shortest_path


def grid(values, projection="eqc", latitude=0):
    return Grid("test-grid", 20, projection, 20, -10,
                R * math.radians(latitude) + 10, np.array(values, dtype=float))


def test_flat_distance_and_provenance():
    result = shortest_path(grid([[0, 0, 0]]), (0, 0), (0, 2), 0)
    assert result.status == "found"
    assert result.cells == ((0, 0), (0, 1), (0, 2))
    assert result.length_m == pytest.approx(40, abs=1e-8)
    assert result.max_segment_slope_deg == 0
    assert (result.product, result.resolution_m) == ("test-grid", 20)


def test_cylindrical_scale():
    result = shortest_path(grid([[0, 0]], latitude=60), (0, 0), (0, 1), 0)
    assert result.length_m == pytest.approx(10, abs=1e-7)


@pytest.mark.parametrize("projection", ["polar", "polar_north"])
def test_polar_scale(projection):
    result = shortest_path(grid([[0, 0]], projection), (0, 0), (0, 1), 0)
    assert result.length_m == pytest.approx(2*R*math.atan(20/(2*R)), abs=1e-8)


def test_same_pixel():
    result = shortest_path(grid([[12]]), (0, 0), (0, 0), 5)
    assert result.length_m == 0
    assert result.cells == ((0, 0),)


@pytest.mark.parametrize("missing", [np.nan, np.inf, -np.inf])
def test_nodata_barrier(missing):
    result = shortest_path(grid([[0, missing, 0]]), (0, 0), (0, 2), 20)
    assert result.status == "no_path_in_window"
    assert result.cells == ()
    assert result.length_m is None


def test_no_diagonal_corner_cutting():
    for obstacle in (np.nan, 100):
        result = shortest_path(grid([[0, obstacle], [obstacle, 0]]), (0, 0), (1, 1), 10)
        assert result.status == "no_path_in_window"


def test_detour_is_deterministic():
    terrain = grid([[0, 0, 0], [0, np.nan, 0], [0, 0, 0]])
    result = shortest_path(terrain, (1, 0), (1, 2), 0)
    assert result.status == "found"
    assert len(result.cells) == 5
    assert result.length_m == pytest.approx(80, abs=1e-6)
    assert shortest_path(terrain, (1, 0), (1, 2), 0) == result


def test_grade_and_inclined_length_both_directions():
    terrain = grid([[0, 10]])
    for start, end in (((0, 0), (0, 1)), ((0, 1), (0, 0))):
        assert shortest_path(terrain, start, end, 26).status == "no_path_in_window"
        result = shortest_path(terrain, start, end, 27)
        run = 20 * (R + 5) / R
        assert result.length_m == pytest.approx(math.hypot(run, 10))
        assert result.max_segment_slope_deg == pytest.approx(math.degrees(math.atan2(10, run)))


@pytest.mark.parametrize("start", [(-1, 0), (0, 3), (0.5, 0)])
def test_bad_endpoint(start):
    with pytest.raises(ValueError):
        shortest_path(grid([[0, 0]]), start, (0, 1), 10)


@pytest.mark.parametrize("limit", [-1, 90, math.nan, math.inf])
def test_bad_limit(limit):
    with pytest.raises(ValueError):
        shortest_path(grid([[0]]), (0, 0), (0, 0), limit)


def test_bad_geometry():
    base = grid([[0, 0]])
    invalid = [replace(base, projection="unknown"), replace(base, metres_per_pixel=0),
               replace(base, y_max_m=math.inf), grid([[0, np.nan]]), grid([[-R, 0]]),
               grid([[0, 0]], latitude=90), replace(base, heights=np.zeros((512, 512))), grid([])]
    for terrain in invalid:
        with pytest.raises(ValueError):
            shortest_path(terrain, (0, 0), (0, 1), 20)


def test_cost_against_independent_all_pairs_reference():
    # Floyd-Warshall with haversine, independent of heap search and unit vectors.
    heights = np.array([[0, 2, 5], [3, 1, 4]], dtype=float)
    terrain = grid(heights, latitude=-85)
    cells = list(np.ndindex(heights.shape))
    costs = np.full((6, 6), np.inf)
    np.fill_diagonal(costs, 0)
    for i, (r, c) in enumerate(cells):
        for j, (s, d) in enumerate(cells):
            if i == j or max(abs(r-s), abs(c-d)) > 1:
                continue
            lat1, lat2 = math.radians(-85)-r*20/R, math.radians(-85)-s*20/R
            hav = math.sin((lat1-lat2)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((c-d)*10/R)**2
            run = 2*math.asin(math.sqrt(hav))*(R+(heights[r,c]+heights[s,d])/2)
            costs[i,j] = math.hypot(run, heights[r,c]-heights[s,d])
    for k in range(6):
        for i in range(6):
            for j in range(6):
                costs[i,j] = min(costs[i,j], costs[i,k]+costs[k,j])
    for i, start in enumerate(cells):
        for j, goal in enumerate(cells):
            assert shortest_path(terrain, start, goal, 89).length_m == pytest.approx(costs[i,j], abs=1e-7)
