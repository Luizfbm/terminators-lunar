"""The three checks from Larissa's independent work (the requirement), written before any result.

Larissa computed some things on her own, with her own code and her own DEM, in the prototype
she shared as the independent work (prototype source, `prototypes/moon/`). the independent work is not
merged; only the reference data named below comes in, under `validation/data/`, with its
source and SHA-256. Her floor rule (`silhouette = max(terrain, -0.087°)`) is wrong for an
Observer 5.3 km above the sphere, so nothing here reads her `elevacao_graus` column or any
number derived from it.

1. Our Horizon mask at the IM-2 Athena point against her terrain-only silhouette.
2. The Sun at the two LROC NAC images of the Athena site, against the incidence angle in
   the PDS index of the LROC volume, plus the Earth over the transmission as a fact.
3. The total lunar eclipse of 14/03/2025, local contacts, against SPICE `gfoclt`, and
   inside NASA's whole-Moon contacts (Espenak).

This module holds the points, the instants and the tolerances. They do not change after a
result: a check that fails stays failed and is reported.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

# --- The Athena point ---------------------------------------------------------------------

# LROC 1408: Athena's resting point.
ATHENA_LATITUDE_DEG = -84.7906
ATHENA_LONGITUDE_DEG = 29.1957
OBSERVER_HEIGHT_M = 2.0

# --- 1. The Horizon mask against Larissa's silhouette -------------------------------------

# The tolerance per azimuth is atan(δh / d) + 0.01°, d being the blocking distance in her
# file (committed reference data, so it is fixed before our engine runs).
#
# δh is the height error between the Observer's ground and the Occluder, in two independent
# LOLA products. Ours, LDEM_80S_*_ADJ (PGDA product 90): the adjusted LOLA maps have
# "typical RMS values of ~0.30-0.50 m" of surface height uncertainty (Barker et al. 2021,
# Planetary and Space Science 203, 105119, abstract). Hers, LDEM_80S_20M and LDEM_75S_30M
# (LRO-L-LOLA-4-GDR-V1.0, 2017): not adjusted, so on top of the same interpolation error
# they carry the LRO orbit error, ~0.5 m radial (Mazarico et al. 2018, as quoted in Barker
# et al. 2021, section 1). In quadrature, sqrt(0.5² + 0.5² + 0.5²) = 0.87 m; we take 1 m.
HEIGHT_ERROR_M = 1.0
# The two ray walks differ (hers: 10 m steps from 40 m, then steps growing to 0.5 % of the
# distance; ours: half a pixel with a zoom on the peaks), and for far Occluders atan(δh / d)
# vanishes: 1 m at 16 km is 0.004°. This floor covers the walks.
WALK_FLOOR_DEG = 0.01
MIN_SHARE_WITHIN = 0.99
RMS_MAX_DEG = 0.03
CONTROL_ROTATION_DEG = 1.0
# Fixed before evaluating the comparison (the requirement): ours − hers on our 720
# azimuths, mean −0.0022°, RMS 0.0197°, largest 0.090° at 190°, P95 0.051°.

# --- 2. The LROC NAC images and the transmission ------------------------------------------

LROC_IMAGES = ("M1495922531LE", "M1496181900LE")
# Mid-exposure, halfway between START_TIME and STOP_TIME in each image's PDS label
# (test_athena.py checks these against data/lroc_athena.json).
LROC_MID_EXPOSURE = {
    "M1495922531LE": datetime(2025, 3, 6, 17, 48, 0, 225000, tzinfo=UTC),
    "M1496181900LE": datetime(2025, 3, 9, 17, 50, 47, 147000, tzinfo=UTC),
}
# Both the incidence and the image centre are published to 0.01°.
INCIDENCE_TOLERANCE_DEG = 0.015
# The transmission: landed ~11:30 CST 06/03/2025, mission ended ~00:15 CST 07/03/2025
# (NASA 25-025, Spaceflight Now 07/03/2025), as the existing landing entry says.
TRANSMISSION_START = datetime(2025, 3, 6, 17, 30, tzinfo=UTC)
TRANSMISSION_END = datetime(2025, 3, 7, 6, 15, tzinfo=UTC)
TRANSMISSION_STEP_S = 60.0

# --- 3. The eclipse ------------------------------------------------------------------------

# The `ECLIPSE_2025` point of backend/tests/test_regressions.py: inside the DEM fixtures,
# the whole Sun clear of the terrain all night, the Earth passing in front of it.
ECLIPSE_FIXTURE = {"latitude_deg": -89.4, "longitude_deg": 90.0}
ECLIPSE_START = datetime(2025, 3, 14, 3, 0, tzinfo=UTC)
ECLIPSE_END = datetime(2025, 3, 14, 11, 0, tzinfo=UTC)
# Our engine draws the Earth as a sphere of 6,378.1366 km; gfoclt uses the pck00011
# ellipsoid, whose polar radius is 21.4 km shorter. 21.4 km at ~390,000 km is 0.0031°, and
# the Sun and the Earth move across each other at ~0.55°/h seen from the Moon, so a contact
# can move by ~20 s. Add the bisection (0.1 s) and the stellar aberration gfoclt cannot
# apply (the same, to well under 0.1", for two bodies a degree apart): 30 s.
CONTACT_TOLERANCE_S = 30.0
CONTROL_EARTH_RADIUS_SCALE = 1.01
CONTACTS = ("leaves 1", "reaches 0", "leaves 0", "returns to 1")


def horizon_tolerance_deg(distance_km: float) -> float:
    return math.degrees(math.atan(HEIGHT_ERROR_M / (distance_km * 1000.0))) + WALK_FLOOR_DEG


def compare_horizon(
    ours: dict[float, float], theirs: dict[float, tuple[float, float]], rotation_deg: float = 0.0
) -> dict[str, Any]:
    """Ours − hers on our azimuths; hers rotated by `rotation_deg` for the negative control.

    `ours` maps azimuth to elevation; `theirs` maps azimuth to (terrain elevation, blocking
    distance in km), on her 0.1° grid.
    """
    rows = []
    for azimuth, elevation in sorted(ours.items()):
        key = round((azimuth + rotation_deg) % 360.0, 1)
        their_elevation, distance_km = theirs[key]
        delta = elevation - their_elevation
        rows.append((azimuth, delta, distance_km, abs(delta) <= horizon_tolerance_deg(distance_km)))
    deltas = [d for _, d, _, _ in rows]
    rms = math.sqrt(sum(d * d for d in deltas) / len(deltas))
    within = sum(1 for *_, ok in rows if ok) / len(rows)
    worst = max(rows, key=lambda r: abs(r[1]))
    ordered = sorted(abs(d) for d in deltas)
    return {
        "azimuths": len(rows),
        "mean_deg": sum(deltas) / len(deltas),
        "rms_deg": rms,
        "p95_deg": ordered[math.ceil(0.95 * len(ordered)) - 1],
        "largest_deg": worst[1],
        "largest_at_deg": worst[0],
        "largest_distance_km": worst[2],
        "share_within": within,
        "passed": within >= MIN_SHARE_WITHIN and rms <= RMS_MAX_DEG,
        "broke_both": within < MIN_SHARE_WITHIN and rms > RMS_MAX_DEG,
    }


def nasa_intervals_hold(contacts: dict[str, datetime], nasa: dict[str, datetime]) -> bool:
    """NASA's whole-Moon contacts as intervals: a point enters the umbra in [U1, U2], leaves
    it in [U3, U4], and every contact falls in [P1, P4]."""
    return (
        nasa["U1"] <= contacts["reaches 0"] <= nasa["U2"]
        and nasa["U3"] <= contacts["leaves 0"] <= nasa["U4"]
        and all(nasa["P1"] <= t <= nasa["P4"] for t in contacts.values())
    )
