"""The check against Gläser et al. 2018 (the requirement), written before any result.

The reference: Gläser, Hanssen, Hanselman et al. 2018, "Illumination conditions at the lunar
poles: Implications for future exploration", Planetary and Space Science 162, 170-178 (PII
S0032063317300478). Table 2 (p. 12 of the submitted preprint, NASA NTRS 20170007365; the
text is on p. 11) lists the Connecting Ridge point "C1" at 2 m above the ground:
(-89.4398°, 222.83°E), solar visibility 92.1 % and maximum average illumination 88.0 %,
hourly from 2017-01-01 to 2037-01-01, on the authors' own 20 m DTM. Their words, p. 6-7:
"average illumination" is the mean over the period of the visible fraction of the Sun's
disc; "solar visibility" is the share of the period in which any part of the Sun is
visible. The 92.27 % of the 2014 Icarus abstract (their earlier DTM, 0.17 points higher at
the same place) is context only and is never judged.

What is compared, per quantity, taken on its own (the paper says the two maxima do not
always fall on the same pixel):
- Sun visibility: the maximum, over the points within 250 m of C1, of the share of hourly
  steps with any part of the Sun's disc above the Horizon mask (`Look.above("sun")`, the
  engine's own Sunrise and Sunset rule), against 92.1 %.
- Mean Sun fraction: the maximum over the same points of the mean Sun fraction, terrain
  only (the Earth's eclipse of the Sun is not in it, as the GLOSSARY defines the Sun
  fraction), against 88.0 %.

The tolerance is 5 percentage points either way. The neighbourhood is 250 m (the radius of
the app's Landing scatter) in steps of 25 m. The negative control is the same grid at
longitude + 180°. Site 001's own values, the best point of its 100 m Landing ellipse, the
value at C1 itself, the Sun fraction with the Earth's eclipse, the year-to-year spread and
the sensitivity to the time step are shown and never judged.

This module holds the rule and the vectorised scan that applies it. The scan gives the
same Sun fraction as `engine.Look` (test_glaser.py checks it to 1e-5), but takes one Sun
vector per step for the whole neighbourhood (the parallax between points 250 m apart is
2e-9 rad) and one Horizon mask per point. If the check fails, it stays failed and is
reported: nothing here changes after a result.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np
import numpy.typing as npt

Array = npt.NDArray[np.float64]

# --- The reference ----------------------------------------------------------------------

REFERENCE_SOURCE = (
    "Gläser et al. 2018, Planetary and Space Science 162, 170-178, Table 2 (p. 12 of the "
    "NASA NTRS preprint 20170007365), point C1"
)
CENTRE_LATITUDE_DEG = -89.4398
CENTRE_LONGITUDE_DEG = 222.83  # east, as the paper writes it
OBSERVER_HEIGHT_M = 2.0
SUN_VISIBILITY_PCT = 92.1  # "solar visibility", any part of the Sun's disc
MEAN_SUN_FRACTION_PCT = 88.0  # "maximum average illumination"
CONTEXT_2014_SUN_VISIBILITY_PCT = 92.27  # Icarus 243, 78-90 abstract: context, never judged

# --- The tolerance, per quantity, in percentage points, either direction -----------------

TOLERANCE_PP = 5.0

# --- The neighbourhood ------------------------------------------------------------------

RADIUS_M = 250.0  # scatter.DEFAULT_RADIUS_M
SPACING_M = 25.0
NODES = 317  # the lattice points with i² + j² ≤ (RADIUS_M / SPACING_M)²
CONTROL_LONGITUDE_SHIFT_DEG = 180.0  # the negative control: the other side of the pole

# Site 001 (Connecting Ridge 001), 800 m from C1, and its Landing ellipse (GLOSSARY: 100 m).
SITE_001_ID = "001"
SITE_001_LATITUDE_DEG = -89.4661
SITE_001_LONGITUDE_DEG = -136.949
ELLIPSE_RADIUS_M = 100.0

# Points that also get the time-step sensitivities: C1 and 100 m east, west, north, south.
SENSITIVITY_OFFSETS = ((0, 0), (4, 0), (-4, 0), (0, 4), (0, -4))  # (i, j) in SPACING_M steps

# --- The period and the step ------------------------------------------------------------

PERIOD_START = datetime(2017, 1, 1, tzinfo=UTC)
PERIOD_END = datetime(2037, 1, 1, tzinfo=UTC)
STEP = timedelta(hours=1)  # the paper's step
PERIOD_DAYS = (PERIOD_END - PERIOD_START).days
STEPS = int(timedelta(days=PERIOD_DAYS) / STEP)  # 175,320
SUBSTEPS = 4  # the engine's own 15 min step, for the sensitivity run
FIXTURE_START = datetime(2023, 8, 1, tzinfo=UTC)  # the app's first Window
FIXTURE_END = datetime(2033, 1, 1, tzinfo=UTC)  # what the committed SPICE fixture can answer
BLOCK = 20_000  # steps per block of the scan, about 5 MB per temporary


def rule() -> dict[str, Any]:
    """The rule as the engine output echoes it, so the check can refuse a different one."""
    return {
        "reference": REFERENCE_SOURCE,
        "centre": [CENTRE_LATITUDE_DEG, CENTRE_LONGITUDE_DEG],
        "observer_height_m": OBSERVER_HEIGHT_M,
        "sun_visibility_pct": SUN_VISIBILITY_PCT,
        "mean_sun_fraction_pct": MEAN_SUN_FRACTION_PCT,
        "tolerance_pp": TOLERANCE_PP,
        "radius_m": RADIUS_M,
        "spacing_m": SPACING_M,
        "nodes": NODES,
        "control_longitude_shift_deg": CONTROL_LONGITUDE_SHIFT_DEG,
        "site_001": [SITE_001_LATITUDE_DEG, SITE_001_LONGITUDE_DEG],
        "ellipse_radius_m": ELLIPSE_RADIUS_M,
        "period": [PERIOD_START.isoformat(), PERIOD_END.isoformat()],
        "step_hours": STEP.total_seconds() / 3600.0,
    }


# --- The points -------------------------------------------------------------------------


def node_id(i: int, j: int) -> str:
    """`i` steps east and `j` steps north of the centre, in SPACING_M steps."""
    return f"g{i:+03d}{j:+03d}"


def lattice(radius_m: float, spacing_m: float = SPACING_M) -> list[tuple[int, int]]:
    """The (i, j) steps with the point inside the radius, south to north, west to east."""
    reach = int(radius_m / spacing_m + 1e-9)
    limit = (radius_m / spacing_m) ** 2 + 1e-9
    return [
        (i, j)
        for j in range(-reach, reach + 1)
        for i in range(-reach, reach + 1)
        if i * i + j * j <= limit
    ]


def is_edge(i: int, j: int, radius_m: float = RADIUS_M, spacing_m: float = SPACING_M) -> bool:
    """A node on the rim of the neighbourhood: one of its four neighbours is outside it."""
    limit = (radius_m / spacing_m) ** 2 + 1e-9
    return any((i + a) ** 2 + (j + b) ** 2 > limit for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))


def grid(
    latitude_deg: float,
    longitude_deg: float,
    radius_m: float = RADIUS_M,
    spacing_m: float = SPACING_M,
) -> list[dict[str, Any]]:
    """The nodes around a centre, placed along great circles on the 1737.4 km sphere.

    The same placement as `scatter.place`: the bearing is from true north at the centre.
    The sensitivity nodes come first, so a smoke run with `--limit` still gets them.
    """
    from app import horizon

    steps = lattice(radius_m, spacing_m)
    first = [step for step in SENSITIVITY_OFFSETS if step in steps]
    ordered = first + [step for step in steps if step not in first]
    east = np.array([i * spacing_m for i, _ in ordered])
    north = np.array([j * spacing_m for _, j in ordered])
    distance = np.hypot(east, north)
    bearing = np.degrees(np.arctan2(east, north)) % 360.0
    # `scatter.place` keeps a Site off the exact pole; C1 and Site 001 are 17 km from it.
    lat, lon = horizon._destination(
        max(latitude_deg, horizon.POLE_LATITUDE_DEG),
        longitude_deg,
        bearing,
        distance[:, np.newaxis],
    )
    nodes: list[dict[str, Any]] = []
    for k, (i, j) in enumerate(ordered):
        centre = i == 0 and j == 0
        nodes.append(
            {
                "id": node_id(i, j),
                "i": i,
                "j": j,
                "distance_m": float(distance[k]),
                "bearing_deg": float(bearing[k]),
                "latitude_deg": latitude_deg if centre else float(lat[k, 0]),
                "longitude_deg": longitude_deg % 360.0 if centre else float(lon[k, 0]) % 360.0,
                "edge": is_edge(i, j, radius_m, spacing_m),
                "sensitivity": (i, j) in SENSITIVITY_OFFSETS,
            }
        )
    return nodes


def control_longitude(longitude_deg: float) -> float:
    return (longitude_deg + CONTROL_LONGITUDE_SHIFT_DEG) % 360.0


# --- The comparison ---------------------------------------------------------------------


def compare(ours: float, reference_pct: float) -> dict[str, Any]:
    """Ours (a share from 0 to 1) against the reference (percent), in percentage points."""
    ours_pct = ours * 100.0
    difference = ours_pct - reference_pct
    return {
        "ours_pct": ours_pct,
        "reference_pct": reference_pct,
        "difference_pp": difference,
        "passed": abs(difference) <= TOLERANCE_PP,
    }


def maximum(points: list[dict[str, Any]], value: Any) -> dict[str, Any]:
    """The point with the largest `value(point)`; the first one when several tie."""
    best = points[0]
    for point in points[1:]:
        if value(point) > value(best):
            best = point
    return best


# --- The vectorised scan ----------------------------------------------------------------


@dataclass(frozen=True)
class Series:
    """Sun (and Earth) vectors, km in MOON_ME, from the observer at the neighbourhood centre."""

    start: datetime
    step_s: float
    sun: Array
    earth: Array | None = None


def build_series(
    latitude_deg: float,
    longitude_deg: float,
    height_m: float,
    start: datetime,
    step_s: float,
    count: int,
    earth: bool = False,
) -> Series:
    """`count` steps of `step_s` from `start`, with the engine's own `ephemeris.apparent`.

    `height_m` is the observer's height above the 1737.4 km sphere: the DEM height at the
    centre plus the Observer height, as the engine puts it.
    """
    from app import ephemeris

    observer = ephemeris.make_observer(latitude_deg, longitude_deg, height_m)
    first = ephemeris.et(start)
    sun = np.empty((count, 3))
    earth_vectors = np.empty((count, 3)) if earth else None
    for k in range(count):
        # Stepping in ephemeris seconds, as run_pgda_engine.py does; no leap second falls
        # between 2017 and 2037 in naif0012.tls.
        epoch = first + k * step_s
        sun[k] = ephemeris.apparent("SUN", epoch, observer).vector_km
        if earth_vectors is not None:
            earth_vectors[k] = ephemeris.apparent("EARTH", epoch, observer).vector_km
    return Series(start, step_s, sun, earth_vectors)


def eclipse_cover(series: Series, sun_radius_km: float, earth_radius_km: float) -> Array:
    """The share of the Sun's disc the Earth covers at each step, by `Look.sun_fraction`'s rule."""
    from app import ephemeris, geometry

    assert series.earth is not None
    sun, earth = series.sun, series.earth
    sun_distance = np.linalg.norm(sun, axis=1)
    earth_distance = np.linalg.norm(earth, axis=1)
    sun_radius = np.arcsin(np.minimum(sun_radius_km / sun_distance, 1.0))
    earth_radius = np.arcsin(np.minimum(earth_radius_km / earth_distance, 1.0))
    cosine = (sun * earth).sum(axis=1) / (sun_distance * earth_distance)
    separation = np.arccos(np.clip(cosine, -1.0, 1.0))
    cover = np.zeros(len(sun))
    # The overlap is zero past the sum of the radii, so only the few steps near an eclipse
    # go through the engine's own function.
    for k in np.nonzero(separation < sun_radius + earth_radius + 1e-6)[0]:
        sun_r = ephemeris.angular_radius_rad(float(sun_distance[k]), sun_radius_km)
        earth_r = ephemeris.angular_radius_rad(float(earth_distance[k]), earth_radius_km)
        angle = geometry.angle_between(
            (float(sun[k, 0]), float(sun[k, 1]), float(sun[k, 2])),
            (float(earth[k, 0]), float(earth[k, 1]), float(earth[k, 2])),
        )
        cover[k] = geometry.circle_overlap_fraction(sun_r, earth_r, angle)
    return cover


def sun_fraction(
    mask: Any, frame: Any, vectors: Array, sun_radius_km: float, block: int = BLOCK
) -> Array:
    """The share of the Sun's disc above the Horizon mask at each step, terrain only.

    `Look._sun_over_terrain` for a whole array at once: the azimuth and elevation from the
    point's own (east, north, up), the 32 strips of `geometry.disc_over_profile` as a matrix,
    the same mask interpolation and the same 1/cos(elevation) stretch.
    """
    from app import geometry

    east = np.array(frame.east)
    north = np.array(frame.north)
    up = np.array(frame.up)
    strips = np.arange(geometry.DISC_STRIPS) + 0.5
    out = np.empty(len(vectors))
    for lo in range(0, len(vectors), block):
        v = np.asarray(vectors[lo : lo + block], dtype=np.float64)
        e, n, u = v @ east, v @ north, v @ up
        azimuth = np.degrees(np.arctan2(e, n)) % 360.0
        elevation = np.arctan2(u, np.hypot(e, n))
        radius = np.arcsin(np.minimum(sun_radius_km / np.linalg.norm(v, axis=1), 1.0))
        stretch = 1.0 / np.maximum(np.cos(elevation), 1e-6)
        width = 2.0 * radius / geometry.DISC_STRIPS
        offsets = -radius[:, None] + strips[None, :] * width[:, None]
        half = np.sqrt(np.maximum(0.0, radius[:, None] ** 2 - offsets**2))
        profile = np.radians(
            mask.elevation_at(azimuth[:, None] + np.degrees(offsets) * stretch[:, None])
        )
        floor = np.maximum(profile, elevation[:, None] - half)
        visible = np.maximum(0.0, elevation[:, None] + half - floor)
        out[lo : lo + block] = np.clip(visible.sum(axis=1) / (2.0 * half).sum(axis=1), 0.0, 1.0)
    return out


def span_stats(fraction: Array, cover: Array | None = None) -> dict[str, Any]:
    """Steps, the share with any part of the Sun up, and the mean Sun fraction, of one span."""
    steps = len(fraction)
    stats: dict[str, Any] = {
        "steps": steps,
        # Look.above("sun"): any part of the disc over the terrain.
        "sun_any": float(np.count_nonzero(fraction > 0.0)) / steps,
        "sun_mean_fraction": float(fraction.sum()) / steps,
    }
    if cover is not None:
        stats["sun_mean_fraction_with_earth_eclipse"] = (
            float((fraction * (1.0 - cover)).sum()) / steps
        )
    return stats


def hour_index(start: datetime, instant: datetime) -> int | None:
    """The index of `instant` in an hourly series from `start`, or None if it is off the grid."""
    delta = instant - start
    if delta % STEP:
        return None
    return delta // STEP


def spans(start: datetime, steps: int) -> dict[str, slice]:
    """The spans of an hourly series that lie inside it: the fixture span and calendar years."""
    found: dict[str, slice] = {}
    candidates = {"fixture_span": (FIXTURE_START, FIXTURE_END)}
    for year in range(PERIOD_START.year, PERIOD_END.year):
        candidates[f"{year}"] = (
            datetime(year, 1, 1, tzinfo=UTC),
            datetime(year + 1, 1, 1, tzinfo=UTC),
        )
    for name, (first, last) in candidates.items():
        lo, hi = hour_index(start, first), hour_index(start, last)
        if lo is not None and hi is not None and 0 <= lo < hi <= steps:
            found[name] = slice(lo, hi)
    return found


def scan_point(
    mask: Any,
    frame: Any,
    sun_radius_km: float,
    series: Series,
    cover: Array | None,
    sensitivity: bool,
) -> dict[str, Any]:
    """Everything the check reads for one point, from one Horizon mask.

    `series` is hourly, or, for a sensitivity point, every SUBSTEPS-th step of it is the
    hourly one (the engine's 15 min step), so the same series gives the hourly judged run,
    the 15 min run and a run shifted by half an hour.
    """
    result: dict[str, Any] = {}
    if sensitivity:
        fine = sun_fraction(mask, frame, series.sun, sun_radius_km)
        hourly = fine[::SUBSTEPS]
        result["sensitivity"] = {
            "step_15min": span_stats(fine),
            "offset_30min": span_stats(fine[SUBSTEPS // 2 :: SUBSTEPS]),
        }
    else:
        hourly = sun_fraction(mask, frame, series.sun, sun_radius_km)
    steps = len(hourly)
    result["judged"] = span_stats(hourly, cover)
    parts = spans(series.start, steps)
    if "fixture_span" in parts:
        result["fixture_span"] = span_stats(
            hourly[parts["fixture_span"]], cover_slice(cover, parts["fixture_span"])
        )
    years = {
        name: span_stats(hourly[part]) for name, part in parts.items() if name != "fixture_span"
    }
    if years:
        result["years"] = years
    return result


def cover_slice(cover: Array | None, part: slice) -> Array | None:
    return None if cover is None else cover[part]
