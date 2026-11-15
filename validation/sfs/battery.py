"""Eduardo's battery of simulated traverses, N0 to N3: the rule and the arithmetic (issue #92).

Written before any result. Nothing here changes after one: if a number does not reproduce, the
entry says what came out and stays failed.

What it is. His simulation sends rovers across real LOLA strips: 16 test lanes (8 Sites, 2
strips each), 100 traverses per lane, so 1,600 per configuration and level, with the same
seeds for every configuration, so two configurations are paired lane by lane and traverse by
traverse. A traverse ends in one of five ways: it reaches the goal, runs out of time, leaves
the map, tumbles (a slope past the rover's limit) or gets stuck. The levels make the terrain
harder: N0 the strips as measured (4.9 % of cells above 15°); N1 the relief times 1.3 (20.1 %
above 15°); N2 N1 plus a slope error 1.5 times the published one and a camera range 0.75
times as long; N3 N1 plus a slope error twice the published one, a camera half as long that
loses 35 % of its readings, and no replanning on board. A battery is run with a time cap of
800 s (`com_teto`) or of 4,000 s (`sem_teto`).

The two variants his report compares, in our words (the Proof uses only these two):
- Normal navigation, config `R60`: the planner reads a 60 m grid, with no margin;
- Multiresolution, config `RT_nom`: the planner reads the 60 m grid and the 5 m terrain
  where it matters, with the nominal P90 margin ("Tese 60->5 m" in his files).
Six more configurations are in the files (20 m grid, 20->5 m, LOLA 5 m, ...), compared in his
CSV in the eight pairs of `PAIRS`.

What is checked. The per-traverse outcomes are `data/traverse_outcomes.json` (made from his raw
files by `extract_battery.py`). The check recomputes from them every row of his paired-statistics
CSV (`data/traverse_paired_stats_pop100.csv`, byte for byte his file of the same name without
the `dados_` prefix: 64 rows, two batteries, four levels, eight pairs), and the numbers his plan
quotes for Multiresolution against Normal navigation at N0, N1 and N2 (`QUOTES`, section 5 of
his `docs/PLANO_INTEGRACAO_COCKPIT_TESE.md`, battery com_teto). The N3 figure of that plan comes
from another run; see `N3_QUOTE`.

The statistics are his (`analisa_dif_multi.py` and `gerar_figs_estatisticas_pop100.py`), written
out here because scipy is not a dependency:
- arrival of a lane: the share of its 100 traverses that reach the goal, in %; the difference of
  two configurations: the mean over the 16 lanes of the lane differences;
- Wilcoxon signed-rank on the 16 lane arrival rates: two-sided, the normal approximation with the
  tie correction, zero differences dropped, no continuity correction. That is what his scipy
  returned (checked on all 64 rows; scipy's exact test on the ties would give other numbers);
- rank-biserial r of the same paired differences;
- McNemar on the 1,600 pairs: the exact two-sided binomial test of the traverses only A reaches
  against those only B reaches, and the odds ratio (a + 0.5) / (b + 0.5);
- the same difference and Wilcoxon for the tumbling share;
- bootstrap intervals of the mean difference (5,000 resamples of the 16 lanes, seed 42). They
  depend on the random generator, so they are computed and shown, and never judged.

Tolerances, from the digits he prints: arrival and tumbling in %, 0.005 (two decimals); r,
0.0005; the odds ratio, 0.005; counts of traverses and of lanes, exact; p-values, a relative
difference of 1e-6 (he writes them in full). A number he quotes in a document is compared at the
digits the document prints.
"""

from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

Floats = npt.NDArray[np.float64]
Bools = npt.NDArray[np.bool_]

DATA = Path(__file__).resolve().parents[1] / "data"
OUTCOMES_PATH = DATA / "traverse_outcomes.json"
PAIRED_PATH = DATA / "traverse_paired_stats_pop100.csv"
LADDER_PATH = DATA / "traverse_ladder_pop30.csv"
SOURCES_PATH = DATA / "traverse_sources.json"

NORMAL = "R60"  # Normal navigation
MULTIRES = "RT_nom"  # Multiresolution
BATTERIES = ("com_teto", "sem_teto")
LEVELS = (0, 1, 2, 3)
LANES = 16
PER_LANE = 100
BOOTSTRAP_RESAMPLES = 5000
BOOTSTRAP_SEED = 42

# The pairs of his CSV: (A, B, label). A is compared against B.
PAIRS = (
    ("RT_nom", "R60", "Tese 60->5 vs Grade 60"),
    ("R20", "R60", "Grade 20 vs Grade 60"),
    ("RT20", "R20", "Tese 20->5 vs Grade 20 bruta"),
    ("RT20", "R20_marg", "Tese 20->5 vs Grade 20 + P90"),
    ("RT20", "RT_nom", "Tese 20->5 vs Tese 60->5"),
    ("RLOLA5_marg", "RLOLA5", "LOLA 5 m marg. vs bruto"),
    ("RT_nom", "R_oraculo", "Tese 60->5 vs Oraculo 5 m"),
    ("RT20", "R_oraculo", "Tese 20->5 vs Oraculo 5 m"),
)

ABS_PP = 0.005
ABS_R = 0.0005
ABS_OR = 0.005
REL_P = 1e-6
EPSILON = 1e-9


@dataclass(frozen=True)
class Quote:
    """What his plan prints for Multiresolution against Normal navigation at one level."""

    level: int
    multires_pct: float
    normal_pct: float
    delta_pp: float
    relative_pct: float
    mcnemar_p: float | None = None
    odds_ratio: float | None = None
    r: float | None = None
    wilcoxon_arrival_p: float | None = None
    tomb_delta_pp: float | None = None
    wilcoxon_tomb_p: float | None = None


# docs/PLANO_INTEGRACAO_COCKPIT_TESE.md section 5, com_teto (800 s). At N2 the plan prints
# "Wilcoxon p = 0,012" after the tumbling difference: it is the tumbling test.
QUOTES = (
    Quote(0, 78.06, 67.31, 10.75, 16.0, mcnemar_p=3.3e-31, odds_ratio=5.99, r=0.714),
    Quote(
        1,
        48.62,
        35.44,
        13.19,
        37.2,
        mcnemar_p=3.3e-47,
        odds_ratio=11.82,
        r=0.905,
        wilcoxon_arrival_p=0.046,
        tomb_delta_pp=-2.44,
    ),
    Quote(2, 47.75, 35.44, 12.31, 34.7, tomb_delta_pp=-2.81, wilcoxon_tomb_p=0.012),
)

# The plan's N3: "escada POP = 30", 40,0 % against 30,8 %, +30,0 % relative, Wilcoxon p = 0,043,
# Rover A 21,7 % arrival and 45,4 % tumbling. Judged against the POP = 100 battery, where its
# claim is made (section 6 and the prompt in section 7 list it with the POP = 100 numbers).
N3_QUOTE = Quote(3, 40.0, 30.8, 9.2, 30.0, wilcoxon_arrival_p=0.043)
N3_LADDER = {
    "Tese 60→5 m (regra)": 40.0,
    "Grade 60 m": 30.8,
}  # rows of traverse_ladder_pop30.csv


# --- The outcomes -----------------------------------------------------------------------------


def load_outcomes(path: Path = OUTCOMES_PATH) -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(path.read_text("utf-8"))
    return loaded


def codes(outcomes: dict[str, Any], battery: str, level: int, config: str) -> str:
    code: str = outcomes["batteries"][battery]["levels"][str(level)]["configs"][config]
    return code


def lane_matrix(code: str, wanted: str) -> Bools:
    """The traverses with outcome `wanted`, as 16 lanes by 100 traverses."""
    flat = np.array([c == wanted for c in code], dtype=np.bool_)
    return flat.reshape(LANES, PER_LANE)


def arrival(outcomes: dict[str, Any], battery: str, level: int, config: str) -> Bools:
    return lane_matrix(codes(outcomes, battery, level, config), "M")


def tumble(outcomes: dict[str, Any], battery: str, level: int, config: str) -> Bools:
    return lane_matrix(codes(outcomes, battery, level, config), "B")


def lane_pct(matrix: Bools) -> Floats:
    return np.asarray(matrix.mean(axis=1) * 100.0, dtype=np.float64)


# --- The statistics ---------------------------------------------------------------------------


def rank_average(values: Floats) -> Floats:
    """Ranks from 1, ties sharing the mean of their ranks."""
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(len(values), dtype=np.float64)
    sorted_values = values[order]
    start = 0
    while start < len(values):
        stop = start
        while (
            stop + 1 < len(values) and sorted_values[stop + 1] == sorted_values[start]
        ):
            stop += 1
        ranks[order[start : stop + 1]] = (start + stop) / 2.0 + 1.0
        start = stop + 1
    return ranks


def wilcoxon_p(x: Floats, y: Floats) -> float:
    """Two-sided Wilcoxon signed-rank p, normal approximation with the tie correction."""
    d = x - y
    d = d[d != 0.0]
    n = len(d)
    if n == 0:
        return 1.0
    ranks = rank_average(np.abs(d))
    smaller = float(min(ranks[d > 0].sum(), ranks[d < 0].sum()))
    _, tied = np.unique(ranks, return_counts=True)
    variance = n * (n + 1) * (2 * n + 1) / 24.0 - float((tied**3 - tied).sum()) / 48.0
    z = (smaller - n * (n + 1) / 4.0) / math.sqrt(variance)
    return min(1.0, math.erfc(abs(z) / math.sqrt(2.0)))


def rank_biserial(x: Floats, y: Floats) -> float:
    d = x - y
    d = d[d != 0.0]
    n = len(d)
    if n == 0:
        return 0.0
    ranks = rank_average(np.abs(d))
    return float((ranks[d > 0].sum() - ranks[d < 0].sum()) / (n * (n + 1) / 2.0))


def mcnemar(a_only: int, b_only: int) -> tuple[float, float]:
    """Exact two-sided McNemar p and the odds ratio (a + 0.5) / (b + 0.5)."""
    n = a_only + b_only
    odds = (a_only + 0.5) / (b_only + 0.5)
    if n == 0:
        return 1.0, odds
    tail = sum(math.comb(n, i) for i in range(min(a_only, b_only) + 1))
    return min(1.0, float(Fraction(2 * tail, 2**n))), odds


def bootstrap_ci(d: Floats) -> tuple[float, float, float]:
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    idx = rng.integers(0, len(d), size=(BOOTSTRAP_RESAMPLES, len(d)))
    means = d[idx].mean(axis=1)
    low, high = np.percentile(means, [2.5, 97.5])
    return float(d.mean()), float(low), float(high)


def compare(
    outcomes: dict[str, Any], battery: str, level: int, a: str, b: str
) -> dict[str, Any]:
    """Every column of his CSV row, for config `a` against config `b`."""
    ok_a, ok_b = (
        arrival(outcomes, battery, level, a),
        arrival(outcomes, battery, level, b),
    )
    lane_a, lane_b = lane_pct(ok_a), lane_pct(ok_b)
    d = lane_a - lane_b
    mean_d, ci_low, ci_high = bootstrap_ci(d)
    only_a = int((ok_a & ~ok_b).sum())
    only_b = int((~ok_a & ok_b).sum())
    p_mcnemar, odds = mcnemar(only_a, only_b)
    tomb_a = lane_pct(tumble(outcomes, battery, level, a))
    tomb_b = lane_pct(tumble(outcomes, battery, level, b))
    dt = tomb_a - tomb_b
    mean_dt, dt_low, dt_high = bootstrap_ci(dt)
    return {
        "cheg_a": float(lane_a.mean()),
        "cheg_b": float(lane_b.mean()),
        "delta_pp": mean_d,
        "ci95_lo": ci_low,
        "ci95_hi": ci_high,
        "wilcoxon_p": wilcoxon_p(lane_a, lane_b),
        "rank_biserial_r": rank_biserial(lane_a, lane_b),
        "mcnemar_a": only_a,
        "mcnemar_b": only_b,
        "mcnemar_or": odds,
        "mcnemar_p": p_mcnemar,
        "delta_tomb_pp": mean_dt,
        "tomb_ci95_lo": dt_low,
        "tomb_ci95_hi": dt_high,
        "tomb_wilcoxon_p": wilcoxon_p(tomb_a, tomb_b),
        "faixas_a_gt_b": int((d > 0).sum()),
        "faixas_a_lt_b": int((d < 0).sum()),
    }


# --- Against his CSV ---------------------------------------------------------------------------

EXACT = ("mcnemar_a", "mcnemar_b", "faixas_a_gt_b", "faixas_a_lt_b")
ABSOLUTE = {
    "cheg_a": ABS_PP,
    "cheg_b": ABS_PP,
    "delta_pp": ABS_PP,
    "delta_tomb_pp": ABS_PP,
    "rank_biserial_r": ABS_R,
    "mcnemar_or": ABS_OR,
}
P_VALUES = ("wilcoxon_p", "mcnemar_p", "tomb_wilcoxon_p")
SHOWN_ONLY = ("ci95_lo", "ci95_hi", "tomb_ci95_lo", "tomb_ci95_hi")


def paired_reference(path: Path = PAIRED_PATH) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def pair_of(row: dict[str, str]) -> tuple[str, str]:
    a, b = row["comp"].split(" vs ")
    return a, b


def row_differences(
    row: dict[str, str], ours: dict[str, Any]
) -> list[tuple[str, float, float]]:
    """The judged columns of one CSV row that `ours` does not reproduce: (column, his, ours)."""
    off: list[tuple[str, float, float]] = []
    for column in EXACT:
        if int(row[column]) != ours[column]:
            off.append((column, float(row[column]), float(ours[column])))
    for column, tolerance in ABSOLUTE.items():
        if abs(float(row[column]) - ours[column]) > tolerance + EPSILON:
            off.append((column, float(row[column]), float(ours[column])))
    for column in P_VALUES:
        theirs = float(row[column])
        if abs(theirs - ours[column]) > REL_P * max(theirs, 1e-300):
            off.append((column, theirs, float(ours[column])))
    return off


def intervals_match(row: dict[str, str], ours: dict[str, Any]) -> bool:
    return all(abs(float(row[c]) - ours[c]) <= ABS_PP + EPSILON for c in SHOWN_ONLY)


def printed(value: float, digits: int = 2) -> float:
    """`value` at `digits` significant digits, as a document prints a p-value."""
    return float(f"{value:.{digits}g}")


def relative_pct(ours: dict[str, Any]) -> float:
    return float(100.0 * ours["delta_pp"] / ours["cheg_b"])


def quote_differences(
    quote: Quote, ours: dict[str, Any]
) -> list[tuple[str, float, float]]:
    """The numbers of `quote` that `ours` does not reproduce: (what, his, ours)."""
    off: list[tuple[str, float, float]] = []

    def pp(what: str, theirs: float, mine: float, tolerance: float) -> None:
        if abs(theirs - mine) > tolerance + EPSILON:
            off.append((what, theirs, mine))

    def sig(what: str, theirs: float | None, mine: float) -> None:
        if theirs is not None and printed(mine, 2) != theirs:
            off.append((what, theirs, mine))

    pp("Multiresolution arrival %", quote.multires_pct, ours["cheg_a"], ABS_PP)
    pp("Normal navigation arrival %", quote.normal_pct, ours["cheg_b"], ABS_PP)
    pp("difference, points", quote.delta_pp, ours["delta_pp"], ABS_PP)
    pp("relative gain %", quote.relative_pct, relative_pct(ours), 0.05)
    sig("McNemar p", quote.mcnemar_p, ours["mcnemar_p"])
    sig("Wilcoxon p, arrival", quote.wilcoxon_arrival_p, ours["wilcoxon_p"])
    sig("Wilcoxon p, tumbling", quote.wilcoxon_tomb_p, ours["tomb_wilcoxon_p"])
    if quote.odds_ratio is not None:
        pp("odds ratio", quote.odds_ratio, ours["mcnemar_or"], ABS_OR)
    if quote.r is not None:
        pp("rank-biserial r", quote.r, ours["rank_biserial_r"], ABS_R)
    if quote.tomb_delta_pp is not None:
        pp(
            "tumbling difference, points",
            quote.tomb_delta_pp,
            ours["delta_tomb_pp"],
            ABS_PP,
        )
    return off


def ladder_value(method: str, level: int, path: Path = LADDER_PATH) -> float:
    """Arrival % of a method at a level in his POP = 30 ladder (aggregates only)."""
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["metrica"] == "chegada" and row["metodo"] == method:
                return float(row[f"nivel{level}"])
    raise KeyError(method)
