"""The checks of Eduardo's multiresolution statistics, written before any judgement.

Eduardo's work (https://github.com/Luizfbm/Luna-Investigation is the research repository we
cite; his branch is read here only at the fixed commit below) publishes aggregate numbers for
the Monte Carlo he ran on 26 PGDA 78 tiles (`mc_lola.py`, product 78 of the PGDA, Barker et
al. 2021). The rule of this project is that a number of his enters the Proof only if the
scripts and data in this repository produce it, together with what it proves and what it does
not. This module holds the rule for each number and its tolerance. The test file applies it;
nothing here changes after a result. If a number does not reproduce, its entry stays failed
and says what we got.

Where the numbers come from, and what each one is
--------------------------------------------------
His Monte Carlo, per tile (a 10 x 10 km window of the 5 m PGDA 78 layers), takes the cells
that have a laser shot (LDEC > 0), hides one fifth of them at a time from the method (5-fold
cross-validation), and compares the method's slope with the product's own slope on the hidden
cells, 100 times, drawing the "true" slope of each cell from Normal(slp, slperr). Two
navigation variants:

- Normal navigation: the coarse grid alone (60 m or 20 m block mean, interpolated back to 5 m),
  with no margin;
- Multiresolution: the coarse grid plus a local correction where laser shots exist, with a
  slope margin per cell, 1 + z * sigma, sigma = 0.8 deg near data and 2.0 deg far from it
  (z = 0 / 1.282 / 2.326 for P50 / P90 / P99). The 0.8 and 2.0 are his rule, not measured.

A cell is vetoed when its estimated slope plus its margin exceeds 15 deg. "Missed hazard" is
the share of cells really above 15 deg that the method does not veto; "false alarm" is the
share of cells really at or below 15 deg that it vetoes.

Quantities judged (each against the number he prints, in his own words)
------------------------------------------------------------------------
A. PLANO_INTEGRACAO_COCKPIT_TESE.md section 5 (and the repeat in its section 6 list), 60 m,
   nominal margin, the mean over the 26 tiles of each tile's mean:
   missed hazard 31.48 % (Normal navigation) -> 6.38 % (Multiresolution P90), -79.7 %;
   median slope error 1.04 deg -> 0.59 deg, -42.9 %. The mean over tiles of each tile's
   median |slope error|. These are two methods at two different false alarms; see
   not_covered in the entries.
B. MONTE_CARLO_LOLA_TESE.md 6.2 and Relatorio_Consolidado_Tese_2026.md 5.2, Table 06, the
   comparison at equal false alarm: against the Normal grid with a uniform margin chosen
   per tile, by bisection on 20 independent calibration draws, so that its false alarm equals
   the one of Multiresolution P90 (his rodar_todos.py calls it the fair control). Per tile
   the missed hazard of the two is compared; the test across tiles is a paired two-sided
   Wilcoxon signed-rank test, the tile being the unit (N = 26), as his rodar_todos.py does
   (`scipy.stats.wilcoxon(grade_with_margin, multiresolution_p90)`).
C. Relatorio 5.2, Table 07, the trade-off curves: missed hazard at a fixed false alarm of
   5, 10, 15, 20, 25 and 30 %, the Normal grid with a uniform margin against the
   Multiresolution margin by data density, the same test and the same count.
D. The coverage of the LOLA laser (LDEC_875S_5M inside 87.5 deg S): the share of cells with
   at least one shot at 5, 10, 20, 40 and 60 m (his analise_cobertura_lola.py). Needs the
   raster: it runs on the server.

How a printed number is judged: it reproduces when the number we recompute, rounded to the
decimals he prints, is the number he prints (the tolerance is half a unit of his last digit).
That rule depends only on how many digits he printed, not on what we got. A count (26 of 26)
must be exact. A p-value printed with one or two significant figures is compared at those
figures. A relative reduction is the median over tiles of 100 * (1 - Multiresolution / Normal
with margin), tile by tile, which is what his 38.5 % [IQR 32-44 %, range 18-56 %] describes.

Negative control (C below): the same comparison B, but with the grade allowed a false alarm
of 30 % instead of 17.9 %. A fair method comparison must be able to say "the grade is not
worse": Multiresolution P90 must no longer beat it in 26 of 26 tiles, and the median
reduction must not be positive.

The rerun on the server (A and the coverage D): with the same seed, the same layers and the
same code, the rerun must give, for each of the 26 tiles, both coarse grids, and each of the
four methods of the contract (Normal, Multiresolution P50, P90, P99), the mean missed hazard
and the mean false alarm within 0.5 percentage points of the committed value (the 95 %
interval of 100 draws is about 0.2 points wide), and the median slope error within 0.02 deg.
Different library versions move the random stream and the float32 filters a little, which is
why it is not exact. The coverage must match his printed values to 0.005 points (two
decimals). If it does not, the entry fails and says what the rerun gave.

What these numbers prove and what they do not is in the entries' `not_covered` and in
docs/validation/eduardo-multiresolution.md.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

# --- Where the data comes from ------------------------------------------------------------

COMMIT = "2195fcb"
BRANCH = "origin/eduardo/cockpit-multirresolucao"
RESEARCH_REPO = "https://github.com/Luizfbm/Luna-Investigation"
TILES = 26
LIMIT_DEG = 15.0
FOLDS = 5
DRAWS = 100
SEED = 2026
CALIBRATION_DRAWS = 20
FALSE_ALARM_TARGETS = (5, 10, 15, 20, 25, 30)
SIGMA_NEAR_DEG = 0.8
SIGMA_FAR_DEG = 2.0
Z_LEVELS = {"P50": 0.0, "P90": 1.282, "P99": 2.326}

# --- What he prints: A, the nominal margin, 60 m (PLANO section 5) ------------------------
# (value, decimals printed)

A_NORMAL_MISSED_MEAN_PCT = (31.48, 2)
A_P90_MISSED_MEAN_PCT = (6.38, 2)
A_MISSED_REDUCTION_PCT = (79.7, 1)  # 1 - 6.38 / 31.48, relative
A_NORMAL_MEDIAN_ERROR_DEG = (1.04, 2)
A_P90_MEDIAN_ERROR_DEG = (0.59, 2)
A_MEDIAN_ERROR_REDUCTION_PCT = (42.9, 1)

# --- B, the equal false alarm (Table 06; MONTE_CARLO_LOLA_TESE.md 6.2) --------------------
# Per coarse grid: grade with margin (median over tiles), Multiresolution P90 (median over
# tiles), reduction (median over tiles) with its IQR and range, tiles where Multiresolution
# is better, the Wilcoxon p-value (value, significant figures), the median false alarm.

B: dict[int, dict[str, Any]] = {
    60: {
        "grade_margin_median_pct": (6.45, 2),
        "p90_median_pct": (3.88, 2),
        "reduction_median_pct": (38.5, 1),
        "reduction_iqr_pct": ((32, 44), 0),
        "reduction_range_pct": ((18, 56), 0),
        "wins": 26,
        "p": (3e-8, 1),
        "false_alarm_median_pct": (17.9, 1),
    },
    20: {
        "grade_margin_median_pct": (3.57, 2),
        "p90_median_pct": (3.19, 2),
        "reduction_median_pct": (12, 0),
        "reduction_iqr_pct": ((7, 16), 0),
        "wins": 24,
        "p": (7.5e-7, 2),
        "false_alarm_median_pct": (18, 0),  # he writes "cerca de 18%"
    },
}
# At 60 m the maximum difference of false alarm between the two arms, per tile, that he states
# for the bisection: "0,02 ponto". It is a property of the data, shown, not judged.

# --- C, the curves at a fixed false alarm (Table 07), 60 m -------------------------------
C_GRADE_MEDIAN_PCT = {5: 23.3, 10: 14.3, 15: 10.1, 20: 6.9, 25: 4.7, 30: 3.5}
C_MULTIRES_MEDIAN_PCT = {5: 16.6, 10: 9.5, 15: 6.0, 20: 4.1, 25: 3.1, 30: 2.1}
C_REDUCTION_MEDIAN_PCT = {5: 29, 10: 35, 15: 38, 20: 40, 25: 41, 30: 42}
C_WINS = {5: 26, 10: 26, 15: 26, 20: 26, 25: 26, 30: 25}
C_P = {5: (3e-8, 1), 10: (3e-8, 1), 15: (3e-8, 1), 20: (3e-8, 1), 25: (3e-8, 1), 30: (6e-8, 1)}
C_DECIMALS = 1  # medians printed with one decimal; reductions as whole numbers

# --- Negative control: the grade is allowed this false alarm ------------------------------
CONTROL_FALSE_ALARM_PCT = 30

# --- D, the laser coverage inside 87.5 deg S (his cobertura_multiescala.csv) --------------
D_RESOLUTIONS_M = (5, 10, 20, 40, 60)
D_COVERAGE_PCT = {5: 7.29, 10: 25.90, 20: 67.97, 40: 95.93, 60: 99.40}
D_DECIMALS = 2
D_CAP_LATITUDE_DEG = -87.5
D_RASTER = "LDEC_875S_5M.IMG"
D_RASTER_SIZE = 30336  # cells per side, 5 m
D_STRIP = 96  # rows per strip, divisible by 2, 4, 8, 12

# --- The rerun on the server ----------------------------------------------------------------
RERUN_TOLERANCE_PP = 0.5
RERUN_MEDIAN_ERROR_TOLERANCE_DEG = 0.02
RERUN_METHODS = ("normal", "P50", "P90", "P99")


def rule() -> dict[str, Any]:
    """The rule as a server output echoes it, so the check can refuse a different one."""
    return {
        "commit": COMMIT,
        "tiles": TILES,
        "limit_deg": LIMIT_DEG,
        "folds": FOLDS,
        "draws": DRAWS,
        "seed": SEED,
        "sigma_deg": [SIGMA_NEAR_DEG, SIGMA_FAR_DEG],
        "z_levels": Z_LEVELS,
        "rerun_tolerance_pp": RERUN_TOLERANCE_PP,
        "rerun_median_error_tolerance_deg": RERUN_MEDIAN_ERROR_TOLERANCE_DEG,
        "coverage_resolutions_m": list(D_RESOLUTIONS_M),
        "coverage_decimals": D_DECIMALS,
    }


# --- Judging a printed number -------------------------------------------------------------


def half_unit(decimals: int) -> float:
    """Half a unit of the last printed digit."""
    return 0.5 * 10.0 ** (-decimals)


def reproduces(value: float, printed: float, decimals: int) -> bool:
    """The recomputed value, rounded to the printed decimals, is the printed number.

    Written as an interval so that a value on the edge is judged by the same rule on both
    sides: [printed - half, printed + half). A tiny slack absorbs the binary rounding of the
    printed number itself.
    """
    half = half_unit(decimals)
    return printed - half - 1e-12 <= value < printed + half + 1e-12


def p_reproduces(value: float, printed: float, significant: int) -> bool:
    """A p-value agrees with the printed one at its significant figures."""
    if value <= 0.0:
        return False
    digits = significant - 1 - math.floor(math.log10(printed))
    return round(value, digits) == round(printed, digits)


# --- The statistic ------------------------------------------------------------------------


def wilcoxon_signed_rank(first: Sequence[float], second: Sequence[float]) -> dict[str, float]:
    """The paired two-sided Wilcoxon signed-rank test, exact, as `scipy.stats.wilcoxon` does it
    for N <= 50 without ties or zero differences (its default).

    Differences of zero are dropped. The p-value is the share of all 2^n sign assignments,
    each equally likely under the null, whose statistic is at least as far from its mean as
    the observed one. Ranks are doubled to integers so ties (average ranks) stay exact.
    """
    diffs = [a - b for a, b in zip(first, second, strict=True) if a != b]
    n = len(diffs)
    if n == 0:
        return {"n": 0, "w_plus": 0.0, "w_minus": 0.0, "p": 1.0}
    order = sorted(range(n), key=lambda i: abs(diffs[i]))
    ranks2 = [0] * n  # twice the average rank
    start = 0
    while start < n:
        end = start
        while end + 1 < n and abs(diffs[order[end + 1]]) == abs(diffs[order[start]]):
            end += 1
        for k in range(start, end + 1):
            ranks2[order[k]] = start + end + 2  # twice the average of ranks start+1..end+1
        start = end + 1
    total2 = sum(ranks2)
    observed2 = sum(r for r, d in zip(ranks2, diffs, strict=True) if d > 0)
    # counts[s] = number of sign assignments whose doubled positive-rank sum is s
    counts = [0] * (total2 + 1)
    counts[0] = 1
    for r in ranks2:
        for s in range(total2, r - 1, -1):
            counts[s] += counts[s - r]
    mean2 = total2 / 2
    distance = abs(observed2 - mean2)
    extreme = sum(c for s, c in enumerate(counts) if abs(s - mean2) >= distance - 1e-9)
    return {
        "n": float(n),
        "w_plus": observed2 / 2,
        "w_minus": (total2 - observed2) / 2,
        "p": extreme / 2.0**n,
    }


def median(values: Sequence[float]) -> float:
    ordered = sorted(values)
    mid = len(ordered) // 2
    return ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2


def percentile(values: Sequence[float], q: float) -> float:
    """Linear interpolation between order statistics (numpy's default)."""
    ordered = sorted(values)
    position = (len(ordered) - 1) * q / 100.0
    low = math.floor(position)
    high = math.ceil(position)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)
