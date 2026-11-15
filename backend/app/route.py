"""A drive across Eduardo's 10 x 10 km hazard grid, planned twice (the requirement).

Ported from his engine, `src/js/rover_tese_engine.js` at commit 2195fcb on
origin/eduardo/cockpit-multirresolucao: `planGridAStar` (only his rung 0, Normal navigation, and
rung 4, Multiresolution), `resamplePath`, `evaluateWaypoints` inside `simulateRouteComparison`,
the swarm's five generations and, from `src/js/tese_ui.js`, `generateSolarPickups` (without the
"+180 Wh" he gives each pickup). Left out on purpose: the MLP, rungs 1 to 3, the directional
shield scan and `createSyntheticGrid` (invented terrain).

The port is faithful to the arithmetic, not only to the idea, because the tests compare the API
with what his JavaScript prints under Node: `gScore` is a float32 array, the binary heap breaks
ties in his own way, `Math.floor`, `Math.round` and `toFixed` round as JavaScript rounds, and
`Math.hypot` is V8's (scale by the largest value, Kahan sum, then the square root). The planner's
costs, the speed and the battery model are his choices, not measurements: they are the constants
below and `ASSUMPTIONS` hands every one of them to the screen by name (ADR 0003 says the same of
anything that is not measured).

The swarm is an illustration for the animation: 100 agents per generation are blended toward the
Multiresolution path as the generations go, and the first two die on a lowered slope limit. Its
survival counts are not evidence for either navigation.
"""

from __future__ import annotations

import math
from array import array
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import IntEnum
from functools import lru_cache
from typing import Any, Literal

import numpy as np
from numpy.typing import NDArray

from . import catalog, hazard_data, rovers
from .problems import ApiProblem, missing_site


class CoarseM(IntEnum):
    """The grid Normal navigation reads: 60 m or 20 m (an enum so the query string "60" parses)."""

    M60 = 60
    M20 = 20


Level = Literal["P50", "P90", "P99"]
Navigation = Literal["normal", "multiresolution"]

# z of the margin per confidence level: his Z_CONF (`rover_tese_engine.js` line 11).
Z_CONF: dict[str, float] = {"P50": 0.0, "P90": 1.282, "P99": 2.326}

# Eduardo's choices (`planGridAStar`, `evaluateWaypoints`). Names as in `ASSUMPTIONS`.
SPEED_M_S = 0.35
WAYPOINT_STEP_M = 50
SOLAR_EFFICIENCY = 0.7
SLOPE_POWER_PER_DEG_ABOVE_5 = 0.04
SLOPE_POWER_THRESHOLD_DEG = 5
NORMAL_COST_OVER_LIMIT = 1200
NORMAL_COST_PER_DEG_OVER_LIMIT = 200
NORMAL_COST_PER_DEG = 0.6
MULTI_COST_OVER_LIMIT_5M = 7500
MULTI_COST_PER_DEG_OVER_LIMIT_5M = 900
MULTI_COST_MARGIN_OVER_LIMIT = 520
MULTI_COST_PER_DEG_MARGIN_OVER_LIMIT = 80
MULTI_COST_PER_DEG = 1.4
MULTI_COST_LOW_DENSITY = 12
MULTI_LOW_DENSITY_BELOW = 0.05
MARGIN_WEIGHT = 0.55
HEURISTIC_WEIGHT = 1.05
VETO_LOOKAHEAD_M = 75
REACHED_WITHIN_M = 120
MARGIN_BASE_DEG = 1.0
SIGMA_MEASURED_MIN_DEG = 0.8
SIGMA_MEASURED_PER_SLOPE_ERROR = 0.35
SIGMA_UNMEASURED_MIN_DEG = 2.0
SIGMA_UNMEASURED_PER_SLOPE_ERROR = 0.75
MEASURED_DENSITY_FROM = 0.12
LASER_WEIGHT_K = 0.08
DIAGONAL_STEP_COST = 1.4142
PLANNER_ITERATION_CAP = 65000
STEEP_SLOPE_FRACTION_OF_LIMIT = 0.72
STEEP_SPEED_FACTOR = 0.8

# The swarm (an illustration).
SWARM_AGENTS = 100
SWARM_GENERATIONS = 5

DEFAULT_GOAL_OFFSET_M = (1400.0, 1100.0)

ASSUMPTIONS: dict[str, float] = {
    "speed_m_s": SPEED_M_S,
    "waypoint_step_m": WAYPOINT_STEP_M,
    "solar_efficiency": SOLAR_EFFICIENCY,
    "slope_power_per_deg_above_5": SLOPE_POWER_PER_DEG_ABOVE_5,
    "normal_cost_over_limit": NORMAL_COST_OVER_LIMIT,
    "normal_cost_per_deg_over_limit": NORMAL_COST_PER_DEG_OVER_LIMIT,
    "normal_cost_per_deg": NORMAL_COST_PER_DEG,
    "multi_cost_over_limit_5m": MULTI_COST_OVER_LIMIT_5M,
    "multi_cost_per_deg_over_limit_5m": MULTI_COST_PER_DEG_OVER_LIMIT_5M,
    "multi_cost_margin_over_limit": MULTI_COST_MARGIN_OVER_LIMIT,
    "multi_cost_per_deg_margin_over_limit": MULTI_COST_PER_DEG_MARGIN_OVER_LIMIT,
    "multi_cost_per_deg": MULTI_COST_PER_DEG,
    "multi_cost_low_density": MULTI_COST_LOW_DENSITY,
    "margin_weight": MARGIN_WEIGHT,
    "heuristic_weight": HEURISTIC_WEIGHT,
    "veto_lookahead_m": VETO_LOOKAHEAD_M,
    "reached_within_m": REACHED_WITHIN_M,
    "slope_power_threshold_deg": SLOPE_POWER_THRESHOLD_DEG,
    "multi_low_density_below": MULTI_LOW_DENSITY_BELOW,
    "margin_base_deg": MARGIN_BASE_DEG,
    "sigma_measured_min_deg": SIGMA_MEASURED_MIN_DEG,
    "sigma_measured_per_slope_error": SIGMA_MEASURED_PER_SLOPE_ERROR,
    "sigma_unmeasured_min_deg": SIGMA_UNMEASURED_MIN_DEG,
    "sigma_unmeasured_per_slope_error": SIGMA_UNMEASURED_PER_SLOPE_ERROR,
    "measured_density_from": MEASURED_DENSITY_FROM,
    "laser_weight_k": LASER_WEIGHT_K,
    "diagonal_step_cost": DIAGONAL_STEP_COST,
    "planner_iteration_cap": PLANNER_ITERATION_CAP,
    "steep_slope_fraction_of_limit": STEEP_SLOPE_FRACTION_OF_LIMIT,
    "steep_speed_factor": STEEP_SPEED_FACTOR,
}

Point = tuple[float, float]


# --- JavaScript's arithmetic, where Python's differs -------------------------------------------


def _js_hypot(*values: float) -> float:
    """V8's `Math.hypot`: scale by the largest value, Kahan-sum the squares, take the root."""
    absolute = [abs(v) for v in values]
    peak = max(absolute)
    if peak == 0:
        return 0.0
    total = 0.0
    compensation = 0.0
    for value in absolute:
        n = value / peak
        summand = n * n - compensation
        preliminary = total + summand
        compensation = (preliminary - total) - summand
        total = preliminary
    return math.sqrt(total) * peak


def _js_hypot2_vec(a: NDArray[np.float64], b: NDArray[np.float64]) -> NDArray[np.float64]:
    """`_js_hypot(a, b)` over arrays. The Kahan term is 0 after the first square, so the sum is
    plain: (a/peak)**2 + (b/peak)**2, as V8 evaluates it."""
    abs_a, abs_b = np.abs(a), np.abs(b)
    peak = np.maximum(abs_a, abs_b)
    safe = np.where(peak == 0, 1.0, peak)
    n_a, n_b = abs_a / safe, abs_b / safe
    out: NDArray[np.float64] = np.where(peak == 0, 0.0, np.sqrt(n_a * n_a + n_b * n_b) * safe)
    return out


def _js_round(value: float) -> int:
    """`Math.round` for the values used here (never negative): halves go up."""
    floor = math.floor(value)
    return floor + 1 if value - floor >= 0.5 else floor


def _to_fixed(value: float, digits: int) -> float:
    """`+value.toFixed(digits)`: the exact binary value rounded, halves away from zero."""
    quantum = Decimal(1).scaleb(-digits)
    return float(Decimal(value).quantize(quantum, rounding=ROUND_HALF_UP))


def _wrap_deg(angle: float) -> float:
    """His `((a % 360) + 360) % 360`, with JavaScript's `%` (C `fmod`, the sign of the dividend)."""
    return math.fmod(math.fmod(angle, 360) + 360, 360)


def _clamp(value: float, low: float, high: float) -> float:
    return low if value < low else min(value, high)


# --- The grid, as lists the planner can index quickly ------------------------------------------


@dataclass(frozen=True)
class Layers:
    """One tile's layers as Python lists of doubles, row-major as his `grid.surf[gy * n + gx]`."""

    grid: hazard_data.Grid
    n: int
    cell_m: float
    half_m: float
    surf: list[float]
    slp5: list[float]
    slp20: list[float]
    slp60: list[float]
    slperr: list[float]
    ldec_density: list[float]
    ldec_any: list[bool]

    def cell(self, x_m: float, y_m: float) -> int:
        """Flat index of the cell holding a point: his `sampleGrid(...).idx`."""
        row, col = self.grid.index(x_m, y_m)
        return row * self.n + col


@lru_cache(maxsize=4)
def layers(tile_id: str) -> Layers:
    g = hazard_data.grid(tile_id)
    tile = hazard_data.tiles()[tile_id]
    # His decodePGDA stores `z_mid + int16 * 0.1` computed in doubles into a Float32Array;
    # hazard_data keeps the sum in float32, which can differ by one float32 step.
    surf = (
        np.float64(tile["z_mid_m"])
        + hazard_data.raw_layer(tile_id, "surf_i16").astype(np.float64) * 0.1
    ).astype(np.float32)

    def doubles(array_: NDArray[Any]) -> list[float]:
        out: list[float] = array_.astype(np.float64).ravel().tolist()
        return out

    return Layers(
        grid=g,
        n=g.n,
        cell_m=g.cell_m,
        half_m=g.half_m,
        surf=doubles(surf),
        slp5=doubles(g.slope_5m_deg),
        slp20=doubles(g.slope_20m_deg),
        slp60=doubles(g.slope_60m_deg),
        slperr=doubles(g.slope_error_deg),
        ldec_density=doubles(g.ldec_density),
        ldec_any=g.ldec_any.ravel().tolist(),
    )


def _coarse(lay: Layers, coarse_m: int) -> list[float]:
    return lay.slp20 if coarse_m == 20 else lay.slp60


def _margin(density: float, slope_error: float, z: float) -> float:
    """The shield's margin at a cell: `1 + z * sigma`, sigma wider where no laser shot measured."""
    if density >= MEASURED_DENSITY_FROM:
        sigma = max(SIGMA_MEASURED_MIN_DEG, slope_error * SIGMA_MEASURED_PER_SLOPE_ERROR)
    else:
        sigma = max(SIGMA_UNMEASURED_MIN_DEG, slope_error * SIGMA_UNMEASURED_PER_SLOPE_ERROR)
    return MARGIN_BASE_DEG + z * sigma


def _effective_slope(lay: Layers, i: int, coarse_m: int, z: float) -> float:
    """His `evalCell(sample, 4, ...)`: the 5 m detail blended in where the laser measured, plus margin."""
    coarse = _coarse(lay, coarse_m)[i]
    density = lay.ldec_density[i]
    weight = density / (density + LASER_WEIGHT_K)
    multi = coarse + weight * (lay.slp5[i] - coarse)
    margin = _margin(density, lay.slperr[i], z)
    return max(multi, lay.slp5[i] if lay.ldec_any[i] else coarse) + margin


# --- The planner -------------------------------------------------------------------------------


def _cost_add(
    lay: Layers, navigation: Navigation, coarse_m: int, z: float, slope_limit: float
) -> NDArray[np.float64]:
    """What entering each cell adds to a step's cost, in his order of operations."""
    coarse = np.array(_coarse(lay, coarse_m), dtype=np.float64)
    slp5 = np.array(lay.slp5, dtype=np.float64)
    if navigation == "normal":
        over = NORMAL_COST_OVER_LIMIT + (coarse - slope_limit) * NORMAL_COST_PER_DEG_OVER_LIMIT
        out: NDArray[np.float64] = np.where(
            coarse > slope_limit, over, coarse * NORMAL_COST_PER_DEG
        )
        return out
    density = np.array(lay.ldec_density, dtype=np.float64)
    slope_error = np.array(lay.slperr, dtype=np.float64)
    sigma = np.where(
        density >= MEASURED_DENSITY_FROM,
        np.maximum(SIGMA_MEASURED_MIN_DEG, slope_error * SIGMA_MEASURED_PER_SLOPE_ERROR),
        np.maximum(SIGMA_UNMEASURED_MIN_DEG, slope_error * SIGMA_UNMEASURED_PER_SLOPE_ERROR),
    )
    margin = MARGIN_BASE_DEG + z * sigma
    effective = np.maximum(slp5, coarse) + margin * MARGIN_WEIGHT
    steep = MULTI_COST_OVER_LIMIT_5M + (slp5 - slope_limit) * MULTI_COST_PER_DEG_OVER_LIMIT_5M
    risky = MULTI_COST_MARGIN_OVER_LIMIT + (effective - slope_limit) * (
        MULTI_COST_PER_DEG_MARGIN_OVER_LIMIT
    )
    calm = slp5 * MULTI_COST_PER_DEG + np.where(density < MULTI_LOW_DENSITY_BELOW, 12, 0)
    out = np.where(slp5 > slope_limit, steep, np.where(effective > slope_limit, risky, calm))
    return out


def _to_cell(lay: Layers, point: Point) -> tuple[int, int]:
    row, col = lay.grid.index(point[0], point[1])
    return col, row


def _plan_grid_astar(
    lay: Layers,
    start: Point,
    goal: Point,
    navigation: Navigation,
    coarse_m: int,
    z: float,
    slope_limit: float,
) -> list[Point]:
    """His `planGridAStar`: A* over the grid's cells, 8 neighbours, `Float32Array` g-scores.

    The grid is padded by one closed cell all round so no neighbour needs a bounds check; the
    padding changes no index in his arithmetic, only how cells are numbered inside this function.
    """
    n, cell, half = lay.n, lay.cell_m, lay.half_m
    side = n + 2
    sgx, sgy = _to_cell(lay, start)
    ggx, ggy = _to_cell(lay, goal)

    def padded(gx: int, gy: int) -> int:
        return (gy + 1) * side + gx + 1

    s_idx, g_idx = padded(sgx, sgy), padded(ggx, ggy)

    add = np.zeros((side, side))
    add[1:-1, 1:-1] = _cost_add(lay, navigation, coarse_m, z, slope_limit).reshape(n, n)
    heuristic = np.zeros((side, side))
    d_col = np.broadcast_to(ggx - np.arange(n, dtype=np.float64)[None, :], (n, n))
    d_row = np.broadcast_to(ggy - np.arange(n, dtype=np.float64)[:, None], (n, n))
    heuristic[1:-1, 1:-1] = _js_hypot2_vec(d_col, d_row) * cell
    add_l: list[float] = add.ravel().tolist()
    h_l: list[float] = (heuristic * HEURISTIC_WEIGHT).ravel().tolist()

    g_score = array("f", [1e9]) * (side * side)
    parent = [-1] * (side * side)
    closed = bytearray(side * side)
    for k in range(side):
        closed[k] = closed[(side - 1) * side + k] = closed[k * side] = closed[
            k * side + side - 1
        ] = 1
    g_score[s_idx] = 0

    steps = (
        (-1, 1.0 * cell), (1, 1.0 * cell), (-side, 1.0 * cell), (side, 1.0 * cell),
        (-side - 1, DIAGONAL_STEP_COST * cell), (-side + 1, DIAGONAL_STEP_COST * cell),
        (side - 1, DIAGONAL_STEP_COST * cell), (side + 1, DIAGONAL_STEP_COST * cell),
    )  # fmt: skip

    # His min-heap of [f, index] pairs, kept as two lists. Sift-up stops on `<=`, sift-down
    # picks the left child unless the right is strictly smaller: ties resolve as in his code.
    heap_f = [_js_hypot(ggx - sgx, ggy - sgy) * cell]
    heap_i = [s_idx]

    iterations = 0
    while heap_f and iterations < PLANNER_ITERATION_CAP:
        iterations += 1
        cur = heap_i[0]
        last_f = heap_f.pop()
        last_i = heap_i.pop()
        size = len(heap_f)
        if size:
            heap_f[0] = last_f
            heap_i[0] = last_i
            i = 0
            while True:
                left = 2 * i + 1
                right = left + 1
                best = i
                if left < size and heap_f[left] < heap_f[best]:
                    best = left
                if right < size and heap_f[right] < heap_f[best]:
                    best = right
                if best == i:
                    break
                heap_f[i], heap_f[best] = heap_f[best], heap_f[i]
                heap_i[i], heap_i[best] = heap_i[best], heap_i[i]
                i = best
        if closed[cur]:
            continue
        if cur == g_idx:
            break
        closed[cur] = 1
        base = g_score[cur]
        for offset, step in steps:
            nxt = cur + offset
            if closed[nxt]:
                continue
            cand = base + (step + add_l[nxt])
            if cand < g_score[nxt]:
                g_score[nxt] = cand
                parent[nxt] = cur
                f = cand + h_l[nxt]
                heap_f.append(f)
                heap_i.append(nxt)
                j = len(heap_f) - 1
                while j > 0:
                    p = (j - 1) >> 1
                    if heap_f[p] <= heap_f[j]:
                        break
                    heap_f[p], heap_f[j] = heap_f[j], heap_f[p]
                    heap_i[p], heap_i[j] = heap_i[j], heap_i[p]
                    j = p

    cur = g_idx
    if parent[cur] == -1 and cur != s_idx:
        return [start, goal]
    raw: list[Point] = []
    while cur != -1:
        gx, gy = cur % side - 1, cur // side - 1
        raw.append((-half + (gx + 0.5) * cell, half - (gy + 0.5) * cell))
        if cur == s_idx:
            break
        cur = parent[cur]
    raw.reverse()
    if raw:
        raw[0] = (start[0], start[1])
        raw[-1] = (goal[0], goal[1])
    return raw


@lru_cache(maxsize=64)
def _plan_cached(
    tile_id: str,
    start: Point,
    goal: Point,
    navigation: Navigation,
    coarse_m: int,
    level: Level,
    slope_limit: float,
) -> tuple[Point, ...]:
    """The raw A* path, kept: the Sun's fraction and azimuth change as the Cursor moves, the
    path does not. Normal navigation never reads the level, so it is not part of its key."""
    return tuple(
        _plan_grid_astar(
            layers(tile_id), start, goal, navigation, coarse_m, Z_CONF[level], slope_limit
        )
    )


def plan(
    tile_id: str,
    start: Point,
    goal: Point,
    navigation: Navigation,
    coarse_m: int,
    level: Level,
    slope_limit: float,
) -> tuple[Point, ...]:
    return _plan_cached(
        tile_id,
        start,
        goal,
        navigation,
        coarse_m,
        level if navigation != "normal" else "P90",
        slope_limit,
    )


def resample_path(points: tuple[Point, ...], step_m: float) -> list[Point]:
    """His `resamplePath`: a point every `step_m` along the polyline, and the end if it is over 8 m on."""
    if len(points) < 2:
        return list(points)
    out: list[Point] = [points[0]]
    acc = 0.0
    for i in range(1, len(points)):
        ax, ay = points[i - 1]
        bx, by = points[i]
        seg = _js_hypot(bx - ax, by - ay)
        while acc + seg >= step_m and seg > 1e-3:
            need = step_m - acc
            t = need / seg
            ax += (bx - ax) * t
            ay += (by - ay) * t
            out.append((ax, ay))
            seg -= need
            acc = 0.0
        acc += seg
    last = points[-1]
    if _js_hypot(last[0] - out[-1][0], last[1] - out[-1][1]) > 8:
        out.append(last)
    return out


# --- Driving a plan -----------------------------------------------------------------------------


@dataclass(frozen=True)
class RoverNumbers:
    slope_limit_deg: float
    battery_wh: float
    power_shadow_w: float
    solar_w: float
    rtg_w: float


@dataclass(frozen=True)
class Drive:
    """What `evaluateWaypoints` returns for one plan (his `socMin`, `distanceM`, `timeH`, ...)."""

    reached: bool
    soc_min: float
    hazards_hit: int
    vetoes: int
    distance_m: int
    time_h: float
    path: list[Point]
    soc: list[float]
    slope_5m: list[float]
    hazard: list[bool]
    veto: list[bool]


def evaluate_waypoints(
    lay: Layers,
    navigation: Navigation,
    raw: tuple[Point, ...],
    goal: Point,
    start: Point,
    rover: RoverNumbers,
    sun_fraction: float,
    coarse_m: int,
    z: float,
) -> Drive:
    """His `evaluateWaypoints`: drive the path at 50 m steps and score it on the 5 m slope."""
    multi = navigation == "multiresolution"
    points = resample_path(raw, WAYPOINT_STEP_M)
    slope_limit = rover.slope_limit_deg
    capacity = rover.battery_wh
    bat = capacity
    min_soc = 100.0
    dist = 0.0
    time_h = 0.0
    hazards_hit = 0
    vetoes = 0
    soc_out: list[float] = []
    slope_out: list[float] = []
    hazard_out: list[bool] = []
    veto_out: list[bool] = []
    # `solarW * sunFrac * 0.7 + rtgW` does not change along the drive.
    generation_w = rover.solar_w * sun_fraction * SOLAR_EFFICIENCY + rover.rtg_w

    for i, p in enumerate(points):
        prev = points[i - 1] if i > 0 else p
        seg = _js_hypot(p[0] - prev[0], p[1] - prev[1]) if i > 0 else 0.0
        dist += seg
        cell = lay.cell(p[0], p[1])
        slp5 = lay.slp5[cell]
        is_hazard = slp5 > slope_limit
        if i > 0 and is_hazard:
            hazards_hit += 1

        veto = False
        speed_factor = 1.0
        if multi:
            # Would the shield have blocked the straight line to the goal from here?
            bearing = _wrap_deg(math.atan2(goal[0] - p[0], goal[1] - p[1]) * 180 / math.pi)
            rad = bearing * math.pi / 180
            ahead = lay.cell(
                p[0] + math.sin(rad) * VETO_LOOKAHEAD_M, p[1] + math.cos(rad) * VETO_LOOKAHEAD_M
            )
            if (
                lay.slp5[ahead] > slope_limit
                or _effective_slope(lay, ahead, coarse_m, z) > slope_limit
            ):
                veto = True
                vetoes += 1
            if slp5 > slope_limit * STEEP_SLOPE_FRACTION_OF_LIMIT:
                speed_factor = STEEP_SPEED_FACTOR

        dt_h = (seg / (SPEED_M_S * speed_factor)) / 3600 if seg > 0 else 0.0
        time_h += dt_h
        slope_penalty_w = 1 + max(0, slp5 - SLOPE_POWER_THRESHOLD_DEG) * SLOPE_POWER_PER_DEG_ABOVE_5
        load_w = rover.power_shadow_w * slope_penalty_w
        bat = _clamp(bat + (generation_w - load_w) * dt_h, 0, capacity)
        soc_now = (bat / capacity) * 100
        min_soc = min(min_soc, soc_now)

        soc_out.append(_to_fixed(soc_now, 1))
        slope_out.append(_to_fixed(slp5, 1))
        hazard_out.append(is_hazard)
        veto_out.append(veto)

    last = points[-1] if points else start
    return Drive(
        reached=_js_hypot(goal[0] - last[0], goal[1] - last[1]) < REACHED_WITHIN_M,
        soc_min=_to_fixed(min_soc, 1),
        hazards_hit=hazards_hit,
        vetoes=vetoes,
        distance_m=_js_round(dist),
        time_h=_to_fixed(time_h, 2),
        path=points,
        soc=soc_out,
        slope_5m=slope_out,
        hazard=hazard_out,
        veto=veto_out,
    )


# --- The swarm and the solar points --------------------------------------------------------------


def _swarm_agent(
    lay: Layers,
    tese_path: list[Point],
    start: Point,
    goal: Point,
    slope_limit: float,
    generation: int,
    k: int,
) -> tuple[list[Point], bool]:
    """One swarm agent of one generation: a wave around a blend of the straight line and the
    Multiresolution path, dead where it stands on ground steeper than the generation's limit."""
    dx, dy = goal[0] - start[0], goal[1] - start[1]
    span = max(200.0, _js_hypot(dx, dy))
    nx, ny = -dy / span, dx / span
    progress = generation / SWARM_GENERATIONS
    amp = (1 - progress) ** 1.8 * min(950.0, span * 0.42)

    # A deterministic pseudo-random pair per generation and agent.
    h1 = math.sin(k * 12.9898 + generation * 78.233) * 43758.5453
    r1 = h1 - math.floor(h1)
    h2 = math.sin(k * 39.346 + generation * 19.17) * 24634.6345
    r2 = h2 - math.floor(h2)

    phase = r1 * 2 - 1
    freq = 1 + math.floor(r2 * 3)
    is_elite = r2 < progress * 0.92
    blend = 1.0 if is_elite else 0.15 + 0.5 * progress
    agent_amp = amp * 0.22 if is_elite else amp

    pts: list[Point] = []
    dead = False
    max_steps = max(4, len(tese_path))
    for idx in range(max_steps):
        t = idx / max(1, max_steps - 1)
        env = math.sin(t * math.pi)
        p = tese_path[min(idx, len(tese_path) - 1)]
        lx = start[0] + dx * t
        ly = start[1] + dy * t
        wave = math.sin(t * math.pi * freq + r1 * 3.14) * agent_amp * phase * env
        wx = lx * (1 - blend) + p[0] * blend + nx * wave
        wy = ly * (1 - blend) + p[1] * blend + ny * wave
        pts.append((wx, wy))

        if 2 <= idx < max_steps - 1:
            slp5 = lay.slp5[lay.cell(wx, wy)]
            limit = slope_limit * (0.72 + generation * 0.1) if generation <= 2 else slope_limit
            if slp5 > limit or (
                generation == 1 and t > 0.18 + r2 * 0.52 and slp5 > slope_limit * 0.55
            ):
                dead = True
                break
    return pts, dead


def _solar_points(
    lay: Layers,
    tese_path: list[Point],
    aux_path: list[Point],
    plane_azimuth_deg: float,
    slope_limit: float,
) -> list[Point]:
    """His `generateSolarPickups`: lit spots along the Multiresolution path and one swarm path.

    "Lit" is his local hillshade rule: the surface normal from the heights 50 m either side,
    dotted with the Sun's direction in the grid plane, plus 0.18, over the normal's length.
    """
    sun_rad = (plane_azimuth_deg * math.pi) / 180
    sdx, sdy = math.sin(sun_rad), math.cos(sun_rad)

    def is_lit(x: float, y: float) -> bool:
        if lay.slp5[lay.cell(x, y)] > slope_limit:
            return False
        e_left = lay.surf[lay.cell(x - 50, y)]
        e_right = lay.surf[lay.cell(x + 50, y)]
        e_down = lay.surf[lay.cell(x, y - 50)]
        e_up = lay.surf[lay.cell(x, y + 50)]
        nx = -(e_right - e_left) / 100
        ny = -(e_up - e_down) / 100
        dot = (nx * sdx + ny * sdy + 0.18) / _js_hypot(nx, ny, 1)
        return dot > 0.04

    candidates = [tese_path[i] for i in range(2, len(tese_path) - 1, 3)]
    candidates += [aux_path[i] for i in range(4, len(aux_path) - 2, 6)]
    out: list[Point] = []
    for pt in candidates:
        if len(out) >= 16:
            break
        if not is_lit(pt[0], pt[1]):
            continue
        if any(_js_hypot(q[0] - pt[0], q[1] - pt[1]) < 160 for q in out):
            continue
        out.append(pt)
    return out


# --- The answer ----------------------------------------------------------------------------------


def _plan_json(drive: Drive, navigation: Navigation) -> dict[str, Any]:
    path = [
        {
            "x_m": p[0],
            "y_m": p[1],
            "slope_5m_deg": drive.slope_5m[i],
            "hazard": drive.hazard[i],
            "veto": drive.veto[i],
            "battery_fraction": _to_fixed(drive.soc[i] / 100, 3),
        }
        for i, p in enumerate(drive.path)
    ]
    return {
        "navigation": navigation,
        "reached": drive.reached,
        "distance_m": drive.distance_m,
        "duration_hours": drive.time_h,
        "hazards_hit": drive.hazards_hit,
        "vetoes": drive.vetoes,
        "battery_min_fraction": _to_fixed(drive.soc_min / 100, 3),
        "path": path,
    }


def _tile_for(site: catalog.Site) -> tuple[str | None, float | None]:
    """The grid for a Site and its distance: his row for a Wueller Site, else the nearest centre
    within 15 km (great circle on the 1737.4 km sphere)."""
    entry = hazard_data.site_entry(site["id"])
    if entry is not None:
        tile = entry["nearest_tile"]
        return (tile, float(entry["nearest_tile_distance_km"])) if tile else (None, None)
    best: tuple[str | None, float | None] = (None, None)
    lat1, lon1 = math.radians(site["latitude_deg"]), math.radians(site["longitude_deg"])
    for tile_id, t in hazard_data.tiles().items():
        lat2, lon2 = math.radians(t["latitude_deg"]), math.radians(t["longitude_deg"])
        a = (
            math.sin((lat2 - lat1) / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
        )
        km = 2 * hazard_data.MOON_RADIUS_M / 1000 * math.asin(math.sqrt(a))
        if km <= hazard_data.MAX_TILE_DISTANCE_KM and (best[1] is None or km < best[1]):
            best = (tile_id, km)
    return best


def sun_direction_in_plane_deg(site_longitude_deg: float, local_azimuth_deg: float) -> float:
    """The Sun's direction in the grid's plane, as an angle from +y toward +x.

    The plane is the south polar stereographic one of `hazard_data.polar_xy`: x = rho sin(lon),
    y = rho cos(lon). Local north (toward lower latitude magnitude, away from the pole) is
    (sin lon, cos lon) and local east (growing longitude) is (cos lon, -sin lon); the stereographic
    projection is conformal, so a bearing `az` from north is the direction
    (sin(lon + az), cos(lon + az)). His hillshade rule reads `sin` and `cos` of this angle.
    """
    return local_azimuth_deg + site_longitude_deg


def _no_grid(site_id: str) -> ApiProblem:
    return ApiProblem(
        "no_hazard_grid",
        "No hazard grid",
        f"No 5 m grid lies within 15 km of Site '{site_id}'.",
    )


def _outside(name: str, x: float, y: float, half: float) -> ApiProblem:
    return ApiProblem(
        "invalid_parameter",
        "Invalid parameter",
        f"The {name} ({x:g}, {y:g}) is outside the {2 * half / 1000:g} x {2 * half / 1000:g} km grid.",
    )


def compare(
    site_id: str,
    *,
    rover_id: str,
    slope_limit_deg: float | None,
    battery_wh: float | None,
    power_shadow_w: float | None,
    solar_w: float | None,
    rtg_w: float | None,
    start_x_m: float | None,
    start_y_m: float | None,
    goal_x_m: float | None,
    goal_y_m: float | None,
    coarse_m: int,
    confidence_level: Level,
    sun_fraction: float,
    sun_azimuth_deg: float | None,
    swarm: bool,
) -> dict[str, Any]:
    """The `RouteComparison` for a Site: both plans, scored on the 5 m slope."""
    site = catalog.find_site(site_id)
    if site is None:
        raise missing_site(site_id)
    tile_id, _ = _tile_for(site)
    if tile_id is None:
        raise _no_grid(site_id)
    catalogue = rovers.find(rover_id)
    if catalogue is None:
        raise ApiProblem(
            "invalid_parameter", "Invalid parameter", f"Unknown rover_id '{rover_id}'."
        )

    given = {
        "slope_limit_deg": slope_limit_deg,
        "battery_wh": battery_wh,
        "power_shadow_w": power_shadow_w,
        "solar_w": solar_w,
        "rtg_w": rtg_w,
    }
    numbers = {k: (v if v is not None else catalogue[k]) for k, v in given.items()}
    changed = any(v is not None and v != catalogue[k] for k, v in given.items())
    rover = RoverNumbers(
        slope_limit_deg=float(numbers["slope_limit_deg"]),
        battery_wh=float(numbers["battery_wh"]),
        power_shadow_w=float(numbers["power_shadow_w"]),
        solar_w=float(numbers["solar_w"]),
        rtg_w=float(numbers["rtg_w"]),
    )

    lay = layers(tile_id)
    offset = hazard_data.offset_in_tile(tile_id, site["latitude_deg"], site["longitude_deg"])
    start = (
        offset[0] if start_x_m is None else start_x_m,
        offset[1] if start_y_m is None else start_y_m,
    )
    goal = (
        start[0] + DEFAULT_GOAL_OFFSET_M[0] if goal_x_m is None else goal_x_m,
        start[1] + DEFAULT_GOAL_OFFSET_M[1] if goal_y_m is None else goal_y_m,
    )
    for name, point in (("start", start), ("goal", goal)):
        if not lay.grid.contains(*point):
            raise _outside(name, point[0], point[1], lay.half_m)

    z = Z_CONF[confidence_level]
    drives: dict[Navigation, Drive] = {}
    for navigation in ("normal", "multiresolution"):
        raw = plan(
            tile_id, start, goal, navigation, coarse_m, confidence_level, rover.slope_limit_deg
        )
        drives[navigation] = evaluate_waypoints(
            lay, navigation, raw, goal, start, rover, sun_fraction, coarse_m, z
        )
    normal, multi = drives["normal"], drives["multiresolution"]

    swarm_json: dict[str, Any] | None = None
    aux_path: list[Point] = []
    if swarm:
        generations = []
        for g in range(1, SWARM_GENERATIONS + 1):
            agents = [
                _swarm_agent(lay, multi.path, start, goal, rover.slope_limit_deg, g, k)
                for k in range(SWARM_AGENTS)
            ]
            if g == 3:
                aux_path = agents[1][0]
            generations.append(
                {
                    "generation": g,
                    "survivors": sum(1 for _, dead in agents if not dead),
                    "agents": [
                        {
                            "dead": dead,
                            "path": [[round(x, 1), round(y, 1)] for x, y in pts],
                        }
                        for pts, dead in agents
                    ],
                }
            )
        swarm_json = {
            "illustration": True,
            "agents_per_generation": SWARM_AGENTS,
            "generations": generations,
        }

    solar: list[Point] = []
    if sun_azimuth_deg is not None:
        if not swarm:
            aux_path = _swarm_agent(lay, multi.path, start, goal, rover.slope_limit_deg, 3, 1)[0]
        solar = _solar_points(
            lay,
            multi.path,
            aux_path,
            sun_direction_in_plane_deg(site["longitude_deg"], sun_azimuth_deg),
            rover.slope_limit_deg,
        )

    return {
        "site_id": site_id,
        "grid_id": tile_id,
        "rover": {
            "rover_id": None if changed else rover_id,
            "slope_limit_deg": rover.slope_limit_deg,
            "battery_wh": rover.battery_wh,
            "power_shadow_w": rover.power_shadow_w,
            "solar_w": rover.solar_w,
            "rtg_w": rover.rtg_w,
        },
        "coarse_m": coarse_m,
        "confidence_level": confidence_level,
        "sun_fraction": sun_fraction,
        "start": {"x_m": start[0], "y_m": start[1]},
        "goal": {"x_m": goal[0], "y_m": goal[1]},
        "plans": [_plan_json(normal, "normal"), _plan_json(multi, "multiresolution")],
        "hazards_avoided": max(0, normal.hazards_hit - multi.hazards_hit),
        "assumptions": {**ASSUMPTIONS, "margin_z": z},
        "swarm": swarm_json,
        "solar_points": [{"x_m": x, "y_m": y} for x, y in solar],
    }
