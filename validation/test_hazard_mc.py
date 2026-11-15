"""Eduardo's multiresolution statistics, recomputed from the data in the repository.

The rules and tolerances are in hazard/rules.py and were committed before any result. The
data is `backend/app/data/hazard/tiles.json` (the 52 Monte Carlo runs, 26 tiles at a 60 m and
a 20 m starting grid, copied from his `resumo.json` files by import_eduardo_bundle.py) and
`data/hazard_equal_false_alarm.json` (the equal-false-alarm arm of the same files, copied by
hazard/extract_equal_false_alarm.py). Nothing here reads a raster: the rerun from the PGDA 78
layers and the coverage of the laser need gigabytes, run on the server and stay pending
until `data/hazard_mc_rerun.json` and `data/hazard_coverage.json` are committed.

If a number does not reproduce, its entry says what we got and stays failed.
"""

from __future__ import annotations

import copy
import itertools
import json
import random
import statistics
import subprocess
import sys
from pathlib import Path
from typing import Any

import proof
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent / "hazard"))
import coverage
import mc_lola
import numpy as np
import rules

SCRIPT = "validation/test_hazard_mc.py"
ROOT = Path(__file__).resolve().parents[1]
DATA = Path(__file__).resolve().parent / "data"
TILES_JSON = ROOT / "backend" / "app" / "data" / "hazard" / "tiles.json"
EQUAL_FA = DATA / "hazard_equal_false_alarm.json"
RERUN = DATA / "hazard_mc_rerun.json"
COVERAGE = DATA / "hazard_coverage.json"


def comma(value: float, decimals: int = 2) -> str:
    return f"{value:.{decimals}f}".replace(".", ",")


REFERENCE_BASE = (
    "Eduardo's Monte Carlo on 26 PGDA 78 tiles (Barker et al. 2021, PSS 203, 105119; mc_lola.py), "
    "5-fold cross-validation on cells with a laser shot, 100 draws of Normal(slp, slperr), "
    "slope limit 15°, his commit 2195fcb; numbers from "
    "backend/app/data/hazard/tiles.json and validation/data/hazard_equal_false_alarm.json. "
)
ROUNDING = proof.text(
    "Reproduces when our number, rounded to the decimals he prints, is his number (half a unit "
    "of his last digit); counts exact; p-values at the figures he prints. Fixed in "
    "validation/hazard/rules.py before the first run",
    "Reproduz quando o nosso número, arredondado às casas que ele imprime, é o dele (meia "
    "unidade do último algarismo); contagens exatas; valores p nos algarismos que ele imprime. "
    "Fixado em validation/hazard/rules.py antes da primeira rodada",
)
NOT_COVERED_COMMON_EN = (
    "Slope, not Sun or Earth: nothing here says anything about illumination or visibility. "
    "The truth is the PGDA 78 slope on cells that have a laser shot (about 7 % of the 5 m "
    "cells; the rest of LOLA 5 m is interpolated, ADR 0003), hidden from the method by "
    "cross-validation: it measures how well the method predicts held-out shot cells, not the "
    "whole surface, and shots cluster where orbit tracks cross, on rougher ground. The 'true' "
    "slope of each cell is drawn independently from Normal(slp, slperr); the PGDA's correlated "
    "error clones are not used. The 15° limit and the margins (sigma 0.8° near data, 2.0° far) "
    "are Eduardo's rules, not measurements. The 26 tiles are the PGDA's, not a random sample "
    "of the pole. "
)
NOT_COVERED_COMMON_PT = (
    "Declive, não Sol nem Terra: nada aqui diz algo sobre iluminação ou visibilidade. A "
    "verdade é o declive do PGDA 78 nas células que têm disparo do laser (cerca de 7 % das "
    "células de 5 m; o resto do LOLA 5 m é interpolado, ADR 0003), escondidas do método por "
    "validação cruzada: mede o quanto o método prevê células com disparo que ele não viu, não "
    "a superfície inteira, e os disparos se concentram onde as órbitas se cruzam, em terreno "
    "mais acidentado. O declive 'verdadeiro' de cada célula é sorteado de forma independente "
    "de Normal(slp, slperr); os clones de erro correlacionado do PGDA não são usados. O limite "
    "de 15° e as margens (sigma 0,8° perto de dado, 2,0° longe) são regras do Eduardo, não "
    "medidas. Os 26 recortes são os do PGDA, não uma amostra aleatória do polo. "
)

proof.declare(
    "eduardo-mc-missed-hazard-nominal",
    title=proof.text(
        "Missed hazard, Normal navigation 60 m against Multiresolution P90 (Eduardo, 26 tiles)",
        "Perigo não vetado, Navegação Normal 60 m contra Multirresolução P90 (Eduardo, 26 recortes)",
    ),
    reference=REFERENCE_BASE
    + "Mean over the 26 tiles of each tile's mean missed hazard: 31.48 % (Normal navigation, "
    "60 m grid, no margin) to 6.38 % (Multiresolution P90, nominal margin), -79.7 %",
    tolerance=ROUNDING,
    not_covered=proof.text(
        NOT_COVERED_COMMON_EN
        + "The two methods are at different false alarms (about 5 % and 18 %): the nominal "
        "margin trades missed hazard for false alarm, so this is not the fair comparison; the "
        "equal-false-alarm entries are. It is a mean over tiles, not over cells.",
        NOT_COVERED_COMMON_PT
        + "Os dois métodos estão em falsos alarmes diferentes (cerca de 5 % e 18 %): a margem "
        "nominal troca perigo por falso alarme, então esta não é a comparação justa; as "
        "entradas de igual falso alarme são. É média entre recortes, não entre células.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "eduardo-mc-median-error",
    title=proof.text(
        "Median slope error, Normal navigation 60 m against Multiresolution (Eduardo, 26 tiles)",
        "Erro mediano do declive, Navegação Normal 60 m contra Multirresolução (Eduardo, 26 recortes)",
    ),
    reference=REFERENCE_BASE
    + "Mean over the 26 tiles of each tile's median |slope error| on the hidden shot cells: "
    "1.04° (Normal navigation, 60 m) to 0.59° (Multiresolution), -42.9 %",
    tolerance=ROUNDING,
    not_covered=proof.text(
        NOT_COVERED_COMMON_EN
        + "The error is against the product's own slope on shot cells, a 5 m slope computed "
        "from a surface that is itself uncertain; it is the slope, not the elevation error.",
        NOT_COVERED_COMMON_PT
        + "O erro é contra o declive do próprio produto nas células com disparo, um declive "
        "de 5 m calculado de uma superfície que também tem incerteza; é o declive, não o erro "
        "de elevação.",
    ),
    script_path=SCRIPT,
)
for _coarse in (60, 20):
    proof.declare(
        f"eduardo-equal-false-alarm-{_coarse}",
        title=proof.text(
            f"Missed hazard at equal false alarm, {_coarse} m to 5 m (Eduardo, 26 tiles)",
            f"Perigo não vetado a igual falso alarme, {_coarse} m para 5 m (Eduardo, 26 recortes)",
        ),
        reference=REFERENCE_BASE
        + f"Normal navigation {_coarse} m with a uniform margin chosen per tile (bisection on "
        "20 calibration draws) to have the false alarm of Multiresolution P90, against "
        "Multiresolution P90; his Table 06 and MONTE_CARLO_LOLA_TESE.md 6.2: "
        + (
            "6.45 % to 3.88 %, -38.5 % (median of tiles), better in 26 of 26, Wilcoxon p = 3e-8"
            if _coarse == 60
            else "3.57 % to 3.19 %, -12 % (median of tiles), better in 24 of 26, Wilcoxon "
            "p = 7.5e-7"
        ),
        tolerance=ROUNDING,
        not_covered=proof.text(
            NOT_COVERED_COMMON_EN
            + "The test is a paired two-sided Wilcoxon signed-rank test across the 26 tiles. "
            "With 26 of 26 in the same direction its p-value is 2/2^26 = 3e-8, the smallest "
            "it can be: it says the direction is the same in every tile, not how large the "
            "effect is, and it is not a statement about other tiles. The 100 draws of a tile "
            "are not 100 tiles. 'Equal false alarm' holds per tile to about 0.02 points on "
            "his calibration draws. Starting from 20 m, the grade with margin is already "
            "about as good as Multiresolution from 60 m (his own correction): the gain shrinks "
            "as the starting map improves. Rerunning from the PGDA layers is pending on the "
            "server.",
            NOT_COVERED_COMMON_PT
            + "O teste é o Wilcoxon de postos sinalizados pareado, bilateral, entre os 26 "
            "recortes. Com 26 de 26 no mesmo sentido o valor p é 2/2^26 = 3e-8, o menor "
            "possível: diz que o sentido é o mesmo em todo recorte, não o tamanho do efeito, e "
            "não é uma afirmação sobre outros recortes. Os 100 sorteios de um recorte não são "
            "100 recortes. O 'igual falso alarme' vale por recorte até cerca de 0,02 ponto nos "
            "sorteios de calibração dele. Partindo de 20 m, a grade com margem já fica quase "
            "tão boa quanto a Multirresolução a partir de 60 m (correção do próprio Eduardo): o "
            "ganho encolhe quanto melhor o mapa de partida. A rodada a partir das camadas do "
            "PGDA está pendente no servidor.",
        ),
        script_path=SCRIPT,
    )
proof.declare(
    "eduardo-tradeoff-curves",
    title=proof.text(
        "Missed hazard at a fixed false alarm, 5 % to 30 % (Eduardo, 26 tiles, 60 m)",
        "Perigo não vetado a falso alarme fixado, 5 % a 30 % (Eduardo, 26 recortes, 60 m)",
    ),
    reference=REFERENCE_BASE
    + "His Table 07: at a fixed false alarm of 5, 10, 15, 20, 25 and 30 %, the Normal navigation "
    "grid with a uniform margin against Multiresolution with a margin by data density (medians "
    "over tiles 23.3 to 16.6 % at 5 %, down to 3.5 to 2.1 % at 30 %; reduction 29 to 42 %; "
    "better in 26 of 26, 25 of 26 at 30 %; Wilcoxon p = 3e-8, 6e-8 at 30 %)",
    tolerance=ROUNDING,
    not_covered=proof.text(
        NOT_COVERED_COMMON_EN
        + "A curve is a sweep of the margin size on 20 draws apart from the evaluation ones; "
        "it is not a mission rule and it does not pick an operating point. It shows the "
        "Multiresolution margin is better placed than a uniform one at every false alarm, on "
        "these tiles. The same sign-test limit applies: 26 of 26 gives the smallest p-value.",
        NOT_COVERED_COMMON_PT
        + "Uma curva é a varredura do tamanho da margem em 20 sorteios à parte dos de "
        "avaliação; não é regra de missão e não escolhe um ponto de operação. Mostra que a "
        "margem da Multirresolução fica melhor posta que uma uniforme em todo falso alarme, "
        "nesses recortes. Vale o mesmo limite do teste de sinais: 26 de 26 dá o menor valor p.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-eduardo-equal-false-alarm",
    title=proof.text(
        "Negative control: the Normal grid allowed a 30 % false alarm",
        "Controle negativo: a grade Normal com 30 % de falso alarme permitido",
    ),
    reference="The comparison of the 60 m equal-false-alarm check with the Normal grid's margin "
    "set for a false alarm of 30 % instead of 17.9 %, against Multiresolution P90 as before",
    tolerance=proof.text(
        "Multiresolution P90 must no longer be better in 26 of 26 tiles, and the median "
        "reduction must not be positive",
        "A Multirresolução P90 não pode mais ser melhor nos 26 recortes, e a redução mediana "
        "não pode ser positiva",
    ),
    not_covered=proof.text(
        "Shows the comparison can come out the other way when the grade is allowed to veto "
        "more; says nothing about the engine.",
        "Mostra que a comparação pode dar o contrário quando a grade pode vetar mais; não diz "
        "nada sobre o motor.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "eduardo-mc-rerun-pgda78",
    title=proof.text(
        "Eduardo's Monte Carlo rerun from the PGDA 78 layers (52 runs)",
        "Monte Carlo do Eduardo re-rodado a partir das camadas do PGDA 78 (52 rodadas)",
    ),
    reference="validation/hazard/mc_lola.py (a port of his mc_lola.py, same seed 2026) run on "
    "the PGDA 78 5 m layers surf, ldec, slp and slperr of the 26 tiles, 60 m and 20 m starting "
    "grids, against the 52 runs in backend/app/data/hazard/tiles.json",
    tolerance=proof.text(
        f"each method's mean missed hazard and false alarm within {rules.RERUN_TOLERANCE_PP:g} "
        f"percentage points, the median slope error within "
        f"{rules.RERUN_MEDIAN_ERROR_TOLERANCE_DEG:g}°, on every run. Fixed in "
        "validation/hazard/rules.py before the first run",
        f"a média de perigo não vetado e de falso alarme de cada método a "
        f"{comma(rules.RERUN_TOLERANCE_PP, 1)} ponto percentual, o erro mediano do declive a "
        f"{comma(rules.RERUN_MEDIAN_ERROR_TOLERANCE_DEG)}°, em toda rodada. Fixado em "
        "validation/hazard/rules.py antes da primeira rodada",
    ),
    not_covered=proof.text(
        "The rerun checks that the code and the layers give his numbers, not that the "
        "numbers mean what the product page says. " + NOT_COVERED_COMMON_EN,
        "A rodada confere que o código e as camadas dão os números dele, não que os números "
        "significam o que a página do produto diz. " + NOT_COVERED_COMMON_PT,
    ),
    script_path=SCRIPT,
)
proof.declare(
    "eduardo-ldec-coverage",
    title=proof.text(
        "Share of cells with a laser shot, 5 m to 60 m, inside 87.5°S (Eduardo)",
        "Fração de células com disparo do laser, 5 m a 60 m, dentro de 87,5°S (Eduardo)",
    ),
    reference="validation/hazard/coverage.py (a port of the coverage part of his "
    "analise_cobertura_lola.py) on LDEC_875S_5M.IMG (PGDA, Smith et al. LOLA 5 m): a cell of "
    "5, 10, 20, 40 or 60 m counts when any 5 m cell inside it has a shot; his "
    "cobertura_multiescala.csv: 7.29, 25.90, 67.97, 95.93 and 99.40 %",
    tolerance=proof.text(
        "each share within half a unit of the two decimals he prints (0.005 points). Fixed in "
        "validation/hazard/rules.py before the first run",
        "cada fração a meia unidade das duas casas que ele imprime (0,005 ponto). Fixado em "
        "validation/hazard/rules.py antes da primeira rodada",
    ),
    not_covered=proof.text(
        "Cells with a shot, not cells with a good measurement: one shot inside a 60 m cell "
        "counts as measured, and the shot may be far from the cell's centre. Only the cap "
        "south of 87.5°S, where the 5 m raster exists; the PGDA 78 tiles and the ~90 % of 5 m "
        "cells that are interpolated are the reason ADR 0003 keeps the uncertainty band.",
        "Células com disparo, não células bem medidas: um disparo dentro de uma célula de 60 m "
        "já conta como medida, e o disparo pode estar longe do centro dela. Só a calota ao sul "
        "de 87,5°S, onde existe o raster de 5 m; os recortes do PGDA 78 e os ~90 % das "
        "células de 5 m que são interpoladas são a razão de o ADR 0003 manter a faixa de "
        "incerteza.",
    ),
    script_path=SCRIPT,
)


# --- Reading the data -----------------------------------------------------------------------


def tiles() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(TILES_JSON.read_text("utf-8"))["tiles"]
    return data


def run_of(tile: dict[str, Any], coarse: int) -> dict[str, Any]:
    return next(r for r in tile["runs"] if r["coarse_m"] == coarse)


def method_of(run: dict[str, Any], navigation: str, level: str | None) -> dict[str, Any]:
    return next(
        m
        for m in run["methods"]
        if m["navigation"] == navigation and m["confidence_level"] == level
    )


def equal_fa() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(EQUAL_FA.read_text("utf-8"))["tiles"]
    return data


class Claim:
    """One printed number, the number we recompute, and the verdict of the rule."""

    def __init__(self, label: tuple[str, str], spec: tuple[float, int], value: float):
        self.label = label
        self.printed, self.decimals = spec
        self.value = value
        self.unit = ""
        self.ok = rules.reproduces(value, self.printed, self.decimals)

    def text(self, unit: str = "") -> tuple[str, str]:
        unit = unit or self.unit
        d = max(self.decimals, 1) + (1 if self.decimals >= 1 else 0)
        en = f"{self.label[0]}: Eduardo {self.printed:.{self.decimals}f}{unit}, ours {self.value:.{d}f}{unit}"
        pt = (
            f"{self.label[1]}: Eduardo {comma(self.printed, self.decimals)}{unit}, "
            f"nosso {comma(self.value, d)}{unit}"
        )
        return en + (" (reproduces)" if self.ok else " (DOES NOT reproduce)"), pt + (
            " (reproduz)" if self.ok else " (NÃO reproduz)"
        )


class Count:
    def __init__(self, label: tuple[str, str], printed: int, value: int, total: int):
        self.label, self.printed, self.value, self.total = label, printed, value, total
        self.ok = printed == value

    def text(self, unit: str = "") -> tuple[str, str]:
        en = f"{self.label[0]}: Eduardo {self.printed} of {self.total}, ours {self.value} of {self.total}"
        pt = f"{self.label[1]}: Eduardo {self.printed} de {self.total}, nosso {self.value} de {self.total}"
        return en + (" (reproduces)" if self.ok else " (DOES NOT reproduce)"), pt + (
            " (reproduz)" if self.ok else " (NÃO reproduz)"
        )


class PValue:
    def __init__(self, label: tuple[str, str], printed: float, significant: int, value: float):
        self.label, self.printed, self.value = label, printed, value
        self.ok = rules.p_reproduces(value, printed, significant)

    def text(self, unit: str = "") -> tuple[str, str]:
        en = f"{self.label[0]}: Eduardo {self.printed:.2g}, ours {self.value:.2g}"
        pt = f"{self.label[1]}: Eduardo {self.printed:.2g}, nosso {self.value:.2g}".replace(
            ".", ","
        )
        return en + (" (reproduces)" if self.ok else " (DOES NOT reproduce)"), pt + (
            " (reproduz)" if self.ok else " (NÃO reproduz)"
        )


def verdict(
    claims: list[Any], units: list[str] | None = None
) -> tuple[proof.Status, dict[str, str]]:
    units = units or [""] * len(claims)
    texts = [c.text(u) for c, u in zip(claims, units, strict=True)]
    ok = all(c.ok for c in claims)
    en = "; ".join(t[0] for t in texts)
    pt = "; ".join(t[1] for t in texts)
    status: proof.Status = "passed" if ok else "failed"
    return status, proof.text(en, pt)


# --- The recomputations -----------------------------------------------------------------------


def nominal_60() -> dict[str, float]:
    """A: means over tiles of each tile's mean missed hazard and median slope error, 60 m."""
    all_tiles = tiles()
    assert len(all_tiles) == rules.TILES
    normal = [
        100 * method_of(run_of(t, 60), "normal", None)["missed_hazard"]["mean"]
        for t in all_tiles.values()
    ]
    p90 = [
        100 * method_of(run_of(t, 60), "multiresolution", "P90")["missed_hazard"]["mean"]
        for t in all_tiles.values()
    ]
    err_n = [run_of(t, 60)["median_error_deg"]["normal"] for t in all_tiles.values()]
    err_m = [run_of(t, 60)["median_error_deg"]["multiresolution"] for t in all_tiles.values()]
    mn, mp = statistics.fmean(normal), statistics.fmean(p90)
    en, em = statistics.fmean(err_n), statistics.fmean(err_m)
    return {
        "normal_missed": mn,
        "p90_missed": mp,
        "missed_reduction": 100 * (1 - mp / mn),
        "normal_error": en,
        "multires_error": em,
        "error_reduction": 100 * (1 - em / en),
        "normal_false_alarm_median": rules.median(
            [
                100 * method_of(run_of(t, 60), "normal", None)["false_alarm"]["mean"]
                for t in all_tiles.values()
            ]
        ),
        "p90_false_alarm_median": rules.median(
            [
                100 * method_of(run_of(t, 60), "multiresolution", "P90")["false_alarm"]["mean"]
                for t in all_tiles.values()
            ]
        ),
    }


def paired(grade: list[float], multires: list[float]) -> dict[str, Any]:
    """Tile by tile: reductions, wins, medians and the Wilcoxon test (grade first)."""
    reductions = [100 * (1 - m / g) for g, m in zip(grade, multires, strict=True)]
    test = rules.wilcoxon_signed_rank(grade, multires)
    return {
        "grade_median": rules.median(grade),
        "multires_median": rules.median(multires),
        "reductions": reductions,
        "reduction_median": rules.median(reductions),
        "reduction_q1": rules.percentile(reductions, 25),
        "reduction_q3": rules.percentile(reductions, 75),
        "reduction_min": min(reductions),
        "reduction_max": max(reductions),
        "wins": sum(1 for g, m in zip(grade, multires, strict=True) if m < g),
        "n": len(grade),
        "p": test["p"],
    }


def equal_false_alarm(coarse: int) -> dict[str, Any]:
    arms = [equal_fa()[t][str(coarse)] for t in sorted(equal_fa())]
    out = paired([a["grade_margin_missed_pct"] for a in arms], [a["p90_missed_pct"] for a in arms])
    out["false_alarm_median"] = rules.median([a["p90_false_alarm_pct"] for a in arms])
    out["max_false_alarm_gap"] = max(
        abs(a["grade_margin_false_alarm_pct"] - a["p90_false_alarm_pct"]) for a in arms
    )
    return out


def curves() -> dict[int, dict[str, Any]]:
    """C: at each fixed false alarm, the 60 m grade curve against the Multiresolution curve."""
    out: dict[int, dict[str, Any]] = {}
    all_tiles = tiles()
    for fa in rules.FALSE_ALARM_TARGETS:

        def at(tile: dict[str, Any], key: str, target: int = fa) -> float:
            point = next(
                p
                for p in run_of(tile, 60)["trade_off"][key]
                if abs(p["false_alarm"] - target / 100) < 1e-9
            )
            return 100 * float(point["missed_hazard"])

        out[fa] = paired(
            [at(t, "normal") for t in all_tiles.values()],
            [at(t, "multiresolution") for t in all_tiles.values()],
        )
    return out


def control() -> dict[str, Any]:
    """The 60 m check with the grade's margin set for a 30 % false alarm."""
    all_tiles = tiles()
    grade = [
        100
        * next(
            p
            for p in run_of(t, 60)["trade_off"]["normal"]
            if abs(p["false_alarm"] - rules.CONTROL_FALSE_ALARM_PCT / 100) < 1e-9
        )["missed_hazard"]
        for _, t in sorted(all_tiles.items())
    ]
    multires = [equal_fa()[name]["60"]["p90_missed_pct"] for name in sorted(all_tiles)]
    return paired(grade, multires)


# --- The rule and the arithmetic ----------------------------------------------------------------


def test_the_decided_values_are_the_ones_in_the_rule() -> None:
    # Every number here was decided before any result. Changing one to make a check pass is
    # tuning: the repo rule is to report, not to tune.
    assert rules.COMMIT == "2195fcb" and rules.TILES == 26
    assert rules.LIMIT_DEG == 15.0 and rules.FOLDS == 5 and rules.DRAWS == 100
    assert rules.SEED == 2026 and rules.CALIBRATION_DRAWS == 20
    assert (rules.SIGMA_NEAR_DEG, rules.SIGMA_FAR_DEG) == (0.8, 2.0)
    assert rules.Z_LEVELS == {"P50": 0.0, "P90": 1.282, "P99": 2.326}
    assert rules.A_NORMAL_MISSED_MEAN_PCT == (31.48, 2)
    assert rules.A_P90_MISSED_MEAN_PCT == (6.38, 2)
    assert rules.A_MISSED_REDUCTION_PCT == (79.7, 1)
    assert rules.A_NORMAL_MEDIAN_ERROR_DEG == (1.04, 2)
    assert rules.A_P90_MEDIAN_ERROR_DEG == (0.59, 2)
    assert rules.A_MEDIAN_ERROR_REDUCTION_PCT == (42.9, 1)
    assert rules.B[60]["grade_margin_median_pct"] == (6.45, 2)
    assert rules.B[60]["p90_median_pct"] == (3.88, 2)
    assert rules.B[60]["reduction_median_pct"] == (38.5, 1)
    assert rules.B[60]["wins"] == 26 and rules.B[60]["p"] == (3e-8, 1)
    assert rules.B[20]["grade_margin_median_pct"] == (3.57, 2)
    assert rules.B[20]["p90_median_pct"] == (3.19, 2)
    assert rules.B[20]["reduction_median_pct"] == (12, 0)
    assert rules.B[20]["wins"] == 24 and rules.B[20]["p"] == (7.5e-7, 2)
    assert rules.FALSE_ALARM_TARGETS == (5, 10, 15, 20, 25, 30)
    assert rules.C_WINS == {5: 26, 10: 26, 15: 26, 20: 26, 25: 26, 30: 25}
    assert rules.C_REDUCTION_MEDIAN_PCT == {5: 29, 10: 35, 15: 38, 20: 40, 25: 41, 30: 42}
    assert rules.CONTROL_FALSE_ALARM_PCT == 30
    assert rules.RERUN_TOLERANCE_PP == 0.5 and rules.RERUN_MEDIAN_ERROR_TOLERANCE_DEG == 0.02
    assert rules.D_COVERAGE_PCT == {5: 7.29, 10: 25.90, 20: 67.97, 40: 95.93, 60: 99.40}
    assert rules.D_DECIMALS == 2 and rules.D_CAP_LATITUDE_DEG == -87.5


def test_a_printed_number_is_judged_by_its_own_digits() -> None:
    assert rules.reproduces(31.4789, 31.48, 2)
    assert not rules.reproduces(31.4851, 31.48, 2)
    assert rules.reproduces(79.72, 79.7, 1) and not rules.reproduces(79.76, 79.7, 1)
    assert rules.reproduces(12.16, 12, 0) and not rules.reproduces(12.6, 12, 0)
    assert rules.p_reproduces(2.98e-8, 3e-8, 1) and not rules.p_reproduces(4.2e-8, 3e-8, 1)
    assert rules.p_reproduces(7.46e-7, 7.5e-7, 2) and not rules.p_reproduces(7.2e-7, 7.5e-7, 2)
    assert not rules.p_reproduces(0.0, 3e-8, 1)


def brute_force_wilcoxon(first: list[float], second: list[float]) -> float:
    """Every sign assignment, written out, with average ranks for ties."""
    diffs = [abs(a - b) for a, b in zip(first, second, strict=True) if a != b]
    observed_sign = [1 if a > b else -1 for a, b in zip(first, second, strict=True) if a != b]
    n = len(diffs)
    ranks = []
    for d in diffs:
        below = sum(1 for x in diffs if x < d)
        equal = sum(1 for x in diffs if x == d)
        ranks.append(below + (equal + 1) / 2)
    mean = sum(ranks) / 2
    observed = sum(r for r, s in zip(ranks, observed_sign, strict=True) if s > 0)
    hits = 0
    for signs in itertools.product((0, 1), repeat=n):
        w = sum(r for r, s in zip(ranks, signs, strict=True) if s)
        if abs(w - mean) >= abs(observed - mean) - 1e-9:
            hits += 1
    return float(hits / 2**n)


def test_the_wilcoxon_test_is_the_exact_one() -> None:
    rng = random.Random(20261115)
    for n in (1, 2, 5, 8, 11):
        for tie in (False, True):
            first = [round(rng.uniform(0, 10), 1 if tie else 6) for _ in range(n)]
            second = [round(rng.uniform(0, 10), 1 if tie else 6) for _ in range(n)]
            got = rules.wilcoxon_signed_rank(first, second)["p"]
            assert got == pytest.approx(brute_force_wilcoxon(first, second), abs=1e-12)
    # 26 of 26 in one direction: the smallest two-sided p-value of an N = 26 test
    first = [float(i + 2) for i in range(26)]
    second = [1.0] * 26
    assert rules.wilcoxon_signed_rank(first, second)["p"] == pytest.approx(2 / 2**26, rel=1e-12)
    # 25 of 26, the one against being the smallest difference (W- = 1): 2 * 2 / 2^26 = 6e-8
    mixed = [-1.0, *[float(i) for i in range(2, 27)]]
    assert rules.wilcoxon_signed_rank(mixed, [0.0] * 26)["p"] == pytest.approx(4 / 2**26, rel=1e-12)
    # zeros are dropped; an all-zero test has nothing to say
    assert rules.wilcoxon_signed_rank([1.0, 2.0], [1.0, 2.0])["p"] == 1.0
    # the textbook example (Wilcoxon 1945): W = 9 for n = 9 pairs, two-sided p = 0.0391
    x = [1.83, 0.50, 1.62, 2.48, 1.68, 1.88, 1.55, 3.06, 1.30]
    y = [0.878, 0.647, 0.598, 2.05, 1.06, 1.29, 1.06, 3.14, 1.29]
    book = rules.wilcoxon_signed_rank(x, y)
    assert book["w_minus"] == 5 and book["p"] == pytest.approx(0.0390625, abs=1e-12)


def test_the_median_and_percentile_are_numpys() -> None:
    values = [3.0, 1.0, 4.0, 1.5, 9.0, 2.6]
    assert rules.median(values) == pytest.approx(2.8)
    assert rules.percentile(values, 25) == pytest.approx(1.775)
    assert rules.percentile(values, 75) == pytest.approx(3.75)


def test_the_wilcoxon_test_agrees_with_scipy_when_it_is_installed() -> None:
    stats = pytest.importorskip("scipy.stats")
    rng = random.Random(7)
    for _ in range(5):
        first = [rng.uniform(0, 10) for _ in range(26)]
        second = [a - rng.uniform(-1, 3) for a in first]
        assert rules.wilcoxon_signed_rank(first, second)["p"] == pytest.approx(
            stats.wilcoxon(first, second).pvalue, rel=1e-9
        )


# --- The data ---------------------------------------------------------------------------------


def test_the_data_is_26_tiles_by_two_grids() -> None:
    all_tiles = tiles()
    assert len(all_tiles) == 26
    assert sum(len(t["runs"]) for t in all_tiles.values()) == 52
    for t in all_tiles.values():
        assert sorted(r["coarse_m"] for r in t["runs"]) == [20, 60]
        for r in t["runs"]:
            assert (r["draws"], r["folds"], r["seed"]) == (100, 5, 2026)
            assert [(m["navigation"], m["confidence_level"]) for m in r["methods"]] == [
                ("normal", None),
                ("multiresolution", "P50"),
                ("multiresolution", "P90"),
                ("multiresolution", "P99"),
            ]


def test_the_equal_false_alarm_file_agrees_with_the_tiles() -> None:
    # The same Multiresolution P90 and Normal numbers, copied from the same resumo.json files
    # by two scripts, must be the same numbers.
    file = equal_fa()
    assert sorted(file) == sorted(tiles())
    for name, t in tiles().items():
        for coarse in (60, 20):
            run = run_of(t, coarse)
            arm = file[name][str(coarse)]
            assert arm["p90_missed_pct"] == pytest.approx(
                100 * method_of(run, "multiresolution", "P90")["missed_hazard"]["mean"], rel=1e-9
            )
            assert arm["p90_false_alarm_pct"] == pytest.approx(
                100 * method_of(run, "multiresolution", "P90")["false_alarm"]["mean"], rel=1e-9
            )
            assert arm["grade_missed_pct"] == pytest.approx(
                100 * method_of(run, "normal", None)["missed_hazard"]["mean"], rel=1e-9
            )


def test_the_equal_false_alarm_file_is_what_his_commit_holds() -> None:
    probe = subprocess.run(
        ["git", "cat-file", "-e", f"{rules.COMMIT}^{{commit}}"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if probe.returncode != 0:
        pytest.skip(f"commit {rules.COMMIT} is not fetched here")
    sys.path.insert(0, str(Path(__file__).resolve().parent / "hazard"))
    import extract_equal_false_alarm

    assert extract_equal_false_alarm.build()["tiles"] == equal_fa()


# --- The judgement ----------------------------------------------------------------------------


@proof.check("eduardo-mc-missed-hazard-nominal")  # type: ignore[untyped-decorator]
def test_the_missed_hazard_at_the_nominal_margin() -> None:
    a = nominal_60()
    claims = [
        Claim(
            (
                "Normal navigation 60 m, mean missed hazard",
                "Navegação Normal 60 m, perigo não vetado médio",
            ),
            rules.A_NORMAL_MISSED_MEAN_PCT,
            a["normal_missed"],
        ),
        Claim(
            (
                "Multiresolution P90, mean missed hazard",
                "Multirresolução P90, perigo não vetado médio",
            ),
            rules.A_P90_MISSED_MEAN_PCT,
            a["p90_missed"],
        ),
        Claim(
            ("relative reduction", "redução relativa"),
            rules.A_MISSED_REDUCTION_PCT,
            a["missed_reduction"],
        ),
    ]
    status, result = verdict(claims, [" %", " %", " %"])
    result = proof.text(
        result["en"]
        + f". For information, median false alarm {a['normal_false_alarm_median']:.1f} % and "
        f"{a['p90_false_alarm_median']:.1f} %: the two methods do not veto the same amount",
        result["pt"]
        + f". Para informação, falso alarme mediano {comma(a['normal_false_alarm_median'], 1)} % "
        f"e {comma(a['p90_false_alarm_median'], 1)} %: os dois métodos não vetam a mesma quantidade",
    )
    proof.record("eduardo-mc-missed-hazard-nominal", status, result)
    assert status == "passed"


@proof.check("eduardo-mc-median-error")  # type: ignore[untyped-decorator]
def test_the_median_slope_error() -> None:
    a = nominal_60()
    claims = [
        Claim(
            ("Normal navigation 60 m", "Navegação Normal 60 m"),
            rules.A_NORMAL_MEDIAN_ERROR_DEG,
            a["normal_error"],
        ),
        Claim(
            ("Multiresolution", "Multirresolução"),
            rules.A_P90_MEDIAN_ERROR_DEG,
            a["multires_error"],
        ),
        Claim(
            ("relative reduction", "redução relativa"),
            rules.A_MEDIAN_ERROR_REDUCTION_PCT,
            a["error_reduction"],
        ),
    ]
    status, result = verdict(claims, ["°", "°", " %"])
    proof.record("eduardo-mc-median-error", status, result)
    assert status == "passed"


def in_percent(claims: list[Any]) -> list[Any]:
    for c in claims:
        if isinstance(c, Claim):
            c.unit = " %"
    return claims


def equal_false_alarm_claims(coarse: int) -> list[Any]:
    got = equal_false_alarm(coarse)
    want = rules.B[coarse]
    claims: list[Any] = [
        Claim(
            (
                "Normal grid with margin, median missed hazard",
                "grade Normal com margem, perigo não vetado mediano",
            ),
            want["grade_margin_median_pct"],
            got["grade_median"],
        ),
        Claim(
            (
                "Multiresolution P90, median missed hazard",
                "Multirresolução P90, perigo não vetado mediano",
            ),
            want["p90_median_pct"],
            got["multires_median"],
        ),
        Claim(
            ("median reduction over tiles", "redução mediana entre recortes"),
            want["reduction_median_pct"],
            got["reduction_median"],
        ),
        Claim(
            ("median false alarm", "falso alarme mediano"),
            want["false_alarm_median_pct"],
            got["false_alarm_median"],
        ),
        Count(
            ("tiles where Multiresolution is better", "recortes em que a Multirresolução é melhor"),
            want["wins"],
            got["wins"],
            got["n"],
        ),
        PValue(("paired Wilcoxon p", "Wilcoxon pareado p"), want["p"][0], want["p"][1], got["p"]),
    ]
    q1, q3 = want["reduction_iqr_pct"][0]
    claims.append(
        Claim(
            ("reduction, first quartile", "redução, primeiro quartil"), (q1, 0), got["reduction_q1"]
        )
    )
    claims.append(
        Claim(
            ("reduction, third quartile", "redução, terceiro quartil"), (q3, 0), got["reduction_q3"]
        )
    )
    if "reduction_range_pct" in want:
        lo, hi = want["reduction_range_pct"][0]
        claims.append(
            Claim(
                ("reduction, smallest tile", "redução, menor recorte"),
                (lo, 0),
                got["reduction_min"],
            )
        )
        claims.append(
            Claim(
                ("reduction, largest tile", "redução, maior recorte"), (hi, 0), got["reduction_max"]
            )
        )
    return claims


@proof.check("eduardo-equal-false-alarm-60")  # type: ignore[untyped-decorator]
def test_the_equal_false_alarm_comparison_from_60_m() -> None:
    claims = in_percent(equal_false_alarm_claims(60))
    status, result = verdict(claims)
    gap = equal_false_alarm(60)["max_false_alarm_gap"]
    result = proof.text(
        result["en"]
        + f". Largest false-alarm gap between the two arms in a tile: {gap:.3f} points",
        result["pt"]
        + f". Maior diferença de falso alarme entre os dois braços num recorte: {comma(gap, 3)} pontos",
    )
    proof.record("eduardo-equal-false-alarm-60", status, result)
    assert status == "passed"


@proof.check("eduardo-equal-false-alarm-20")  # type: ignore[untyped-decorator]
def test_the_equal_false_alarm_comparison_from_20_m() -> None:
    claims = in_percent(equal_false_alarm_claims(20))
    status, result = verdict(claims)
    gap = equal_false_alarm(20)["max_false_alarm_gap"]
    result = proof.text(
        result["en"]
        + f". Largest false-alarm gap between the two arms in a tile: {gap:.3f} points",
        result["pt"]
        + f". Maior diferença de falso alarme entre os dois braços num recorte: {comma(gap, 3)} pontos",
    )
    proof.record("eduardo-equal-false-alarm-20", status, result)
    assert status == "passed"


@proof.check("eduardo-tradeoff-curves")  # type: ignore[untyped-decorator]
def test_the_tradeoff_curves() -> None:
    got = curves()
    claims: list[Any] = []
    for fa in rules.FALSE_ALARM_TARGETS:
        g = got[fa]
        claims += [
            Claim(
                (f"FA {fa} %: grade, median", f"FA {fa} %: grade, mediana"),
                (rules.C_GRADE_MEDIAN_PCT[fa], 1),
                g["grade_median"],
            ),
            Claim(
                (f"FA {fa} %: Multiresolution, median", f"FA {fa} %: Multirresolução, mediana"),
                (rules.C_MULTIRES_MEDIAN_PCT[fa], 1),
                g["multires_median"],
            ),
            Claim(
                (f"FA {fa} %: median reduction", f"FA {fa} %: redução mediana"),
                (rules.C_REDUCTION_MEDIAN_PCT[fa], 0),
                g["reduction_median"],
            ),
            Count(
                (f"FA {fa} %: tiles better", f"FA {fa} %: recortes melhores"),
                rules.C_WINS[fa],
                g["wins"],
                g["n"],
            ),
            PValue((f"FA {fa} %: p", f"FA {fa} %: p"), rules.C_P[fa][0], rules.C_P[fa][1], g["p"]),
        ]
    in_percent(claims)
    status, _ = verdict(claims)
    bad = [c for c in claims if not c.ok]
    if bad:
        # the whole list is long; the entry shows what failed, and the count that passed
        en = (
            f"{len(claims) - len(bad)} of {len(claims)} printed numbers reproduce; not: "
            + "; ".join(c.text()[0] for c in bad)
        )
        pt = (
            f"{len(claims) - len(bad)} de {len(claims)} números impressos reproduzem; não: "
            + "; ".join(c.text()[1] for c in bad)
        )
    else:
        en = (
            f"all {len(claims)} printed numbers reproduce: medians {got[5]['grade_median']:.1f} to "
            f"{got[5]['multires_median']:.1f} % at 5 % false alarm, {got[30]['grade_median']:.1f} to "
            f"{got[30]['multires_median']:.1f} % at 30 %; median reduction "
            f"{got[5]['reduction_median']:.1f} % to {got[30]['reduction_median']:.1f} %; better in "
            f"{got[5]['wins']} of 26 at 5 to 25 %, {got[30]['wins']} of 26 at 30 %; "
            f"p = {got[5]['p']:.2g} and {got[30]['p']:.2g}"
        )
        pt = (
            f"os {len(claims)} números impressos reproduzem: medianas {comma(got[5]['grade_median'], 1)} para "
            f"{comma(got[5]['multires_median'], 1)} % a 5 % de falso alarme, {comma(got[30]['grade_median'], 1)} "
            f"para {comma(got[30]['multires_median'], 1)} % a 30 %; redução mediana "
            f"{comma(got[5]['reduction_median'], 1)} % a {comma(got[30]['reduction_median'], 1)} %; melhor em "
            f"{got[5]['wins']} de 26 de 5 a 25 %, {got[30]['wins']} de 26 a 30 %; "
            f"p = {comma(got[5]['p'], 2)} e {comma(got[30]['p'], 2)}"
        ).replace("e-0", "e-")
    proof.record("eduardo-tradeoff-curves", status, proof.text(en, pt))
    assert status == "passed"


@proof.check("negative-control-eduardo-equal-false-alarm")  # type: ignore[untyped-decorator]
def test_the_negative_control_lets_the_grade_win() -> None:
    got = control()
    ok = got["wins"] < got["n"] and got["reduction_median"] <= 0
    status: proof.Status = "passed" if ok else "failed"
    proof.record(
        "negative-control-eduardo-equal-false-alarm",
        status,
        proof.text(
            f"with a {rules.CONTROL_FALSE_ALARM_PCT} % false alarm the grade's median missed hazard "
            f"is {got['grade_median']:.2f} % against {got['multires_median']:.2f} % for Multiresolution "
            f"P90; Multiresolution is better in {got['wins']} of {got['n']} tiles, median "
            f"reduction {got['reduction_median']:+.1f} %",
            f"com {rules.CONTROL_FALSE_ALARM_PCT} % de falso alarme o perigo não vetado mediano da grade é "
            f"{comma(got['grade_median'])} % contra {comma(got['multires_median'])} % da Multirresolução "
            f"P90; a Multirresolução é melhor em {got['wins']} de {got['n']} recortes, redução "
            f"mediana {comma(got['reduction_median'], 1)} %",
        ),
    )
    assert ok


# --- The server side: the rerun and the coverage -------------------------------------------------


def judge_rerun(rerun: dict[str, Any], committed: dict[str, Any]) -> dict[str, Any]:
    """Compare a rerun with the committed runs under the rule; return the deviations."""
    worst_pp = 0.0
    worst_err = 0.0
    worst_at = ""
    missing = []
    count = 0
    for name, t in committed.items():
        for coarse in (60, 20):
            run = run_of(t, coarse)
            got = rerun["runs"].get(name, {}).get(str(coarse))
            if got is None:
                missing.append(f"{name}/{coarse}")
                continue
            count += 1
            for key, (nav, level) in {
                "normal": ("normal", None),
                "P50": ("multiresolution", "P50"),
                "P90": ("multiresolution", "P90"),
                "P99": ("multiresolution", "P99"),
            }.items():
                m = method_of(run, nav, level)
                for metric, field in (
                    ("missed_pct", "missed_hazard"),
                    ("false_alarm_pct", "false_alarm"),
                ):
                    d = abs(got["methods"][key][metric] - 100 * m[field]["mean"])
                    if d > worst_pp:
                        worst_pp, worst_at = d, f"{name}/{coarse}/{key}/{metric}"
            for key in ("normal", "multiresolution"):
                d = abs(got["median_error_deg"][key] - run["median_error_deg"][key])
                worst_err = max(worst_err, d)
    ok = (
        not missing
        and worst_pp <= rules.RERUN_TOLERANCE_PP
        and (worst_err <= rules.RERUN_MEDIAN_ERROR_TOLERANCE_DEG)
    )
    return {
        "ok": ok,
        "runs": count,
        "missing": missing,
        "worst_pp": worst_pp,
        "worst_at": worst_at,
        "worst_error_deg": worst_err,
    }


def coverage_claims(coverage: dict[str, Any]) -> list[Claim]:
    return [
        Claim(
            (f"{res} m cells with a shot", f"células de {res} m com disparo"),
            (rules.D_COVERAGE_PCT[res], rules.D_DECIMALS),
            float(coverage["coverage_pct"][str(res)]),
        )
        for res in rules.D_RESOLUTIONS_M
    ]


def pending(validation_id: str, why_en: str, why_pt: str) -> None:
    proof.record(validation_id, "pending", proof.text(why_en, why_pt))


def sample_rerun(shift: float = 0.0) -> dict[str, Any]:
    """A rerun file built from the committed runs, every mean moved by `shift` points."""
    runs: dict[str, Any] = {}
    for name, t in tiles().items():
        runs[name] = {}
        for coarse in (60, 20):
            run = run_of(t, coarse)
            runs[name][str(coarse)] = {
                "methods": {
                    key: {
                        "missed_pct": 100 * method_of(run, nav, level)["missed_hazard"]["mean"]
                        + shift,
                        "false_alarm_pct": 100 * method_of(run, nav, level)["false_alarm"]["mean"],
                    }
                    for key, (nav, level) in {
                        "normal": ("normal", None),
                        "P50": ("multiresolution", "P50"),
                        "P90": ("multiresolution", "P90"),
                        "P99": ("multiresolution", "P99"),
                    }.items()
                },
                "median_error_deg": copy.deepcopy(run["median_error_deg"]),
            }
    return {"runs": runs}


def test_the_rerun_judge_accepts_the_committed_runs_and_refuses_a_shifted_one() -> None:
    committed = tiles()
    assert judge_rerun(sample_rerun(), committed)["ok"]
    assert judge_rerun(sample_rerun(0.4), committed)["ok"]
    shifted = judge_rerun(sample_rerun(0.6), committed)
    assert not shifted["ok"] and shifted["worst_pp"] == pytest.approx(0.6)
    incomplete = sample_rerun()
    del incomplete["runs"]["DM1"]["20"]
    assert judge_rerun(incomplete, committed)["missing"] == ["DM1/20"]
    slow = sample_rerun()
    slow["runs"]["DM1"]["60"]["median_error_deg"]["normal"] += 0.03
    assert not judge_rerun(slow, committed)["ok"]


def test_the_coverage_judge_follows_the_printed_digits() -> None:
    exact = {"coverage_pct": {str(k): v for k, v in rules.D_COVERAGE_PCT.items()}}
    assert all(c.ok for c in coverage_claims(exact))
    near = {"coverage_pct": {**exact["coverage_pct"], "5": 7.2873}}
    assert all(c.ok for c in coverage_claims(near))
    far = {"coverage_pct": {**exact["coverage_pct"], "5": 7.30}}
    assert not all(c.ok for c in coverage_claims(far))


@proof.check("eduardo-mc-rerun-pgda78")  # type: ignore[untyped-decorator]
def test_the_rerun_against_the_committed_runs() -> None:
    if not RERUN.exists():
        pending(
            "eduardo-mc-rerun-pgda78",
            "did not run: needs the PGDA 78 layers of the 26 tiles (gigabytes), so it runs on "
            "the server; see validation/README.md section 12",
            "não rodou: precisa das camadas do PGDA 78 dos 26 recortes (gigabytes), então roda "
            "no servidor; ver validation/README.md seção 12",
        )
        pytest.skip("data/hazard_mc_rerun.json is not in the repo yet: it comes from the server")
    rerun = json.loads(RERUN.read_text("utf-8"))
    assert not rerun.get("smoke"), "a smoke run is not a result"
    assert rerun["rule"] == rules.rule(), "the rerun was made under another rule"
    got = judge_rerun(rerun, tiles())
    proof.record(
        "eduardo-mc-rerun-pgda78",
        "passed" if got["ok"] else "failed",
        proof.text(
            f"{got['runs']} of 52 runs rerun; largest difference in a mean "
            f"{got['worst_pp']:.3f} percentage points ({got['worst_at'] or 'none'}), largest in a "
            f"median slope error {got['worst_error_deg']:.4f}°; missing: {got['missing'] or 'none'}",
            f"{got['runs']} de 52 rodadas re-rodadas; maior diferença numa média "
            f"{comma(got['worst_pp'], 3)} ponto percentual ({got['worst_at'] or 'nenhuma'}), maior "
            f"num erro mediano do declive {comma(got['worst_error_deg'], 4)}°; faltando: "
            f"{got['missing'] or 'nenhuma'}",
        ),
    )
    assert got["ok"]


@proof.check("eduardo-ldec-coverage")  # type: ignore[untyped-decorator]
def test_the_laser_coverage() -> None:
    if not COVERAGE.exists():
        pending(
            "eduardo-ldec-coverage",
            "did not run: needs LDEC_875S_5M.IMG (about 1 GB), so it runs on the server; see "
            "validation/README.md section 12",
            "não rodou: precisa do LDEC_875S_5M.IMG (cerca de 1 GB), então roda no servidor; "
            "ver validation/README.md seção 12",
        )
        pytest.skip("data/hazard_coverage.json is not in the repo yet: it comes from the server")
    coverage = json.loads(COVERAGE.read_text("utf-8"))
    assert not coverage.get("smoke"), "a smoke run is not a result"
    assert coverage["rule"] == rules.rule(), "the coverage was made under another rule"
    status, result = verdict(coverage_claims(coverage), [" %"] * len(rules.D_RESOLUTIONS_M))
    proof.record("eduardo-ldec-coverage", status, result)
    assert status == "passed"


# --- The ports: coverage.py needs only numpy, mc_lola.py needs scipy --------------------------


def brute_coverage(ldec: Any, size: int, centre: float, radius_m: float) -> dict[int, float]:
    """The share of cells with a shot per resolution, a cell at a time."""
    out = {}
    for res, k in coverage.FACTORS.items():
        measured = total = 0
        for r in range(0, size, k):
            for c in range(0, size, k):
                y = (centre - (r + k / 2.0)) * 5.0
                x = (c + k / 2.0 - centre) * 5.0
                if (x * x + y * y) ** 0.5 > radius_m:
                    continue
                total += 1
                measured += 1 if (ldec[r : r + k, c : c + k] > 0).any() else 0
        out[res] = 100.0 * measured / total
    return out


def test_the_coverage_is_the_cell_by_cell_count() -> None:
    size, strip, centre = 48, 24, 24.0
    radius = 100.0  # 20 cells of 5 m: the circle cuts through the cells of every resolution
    rng = np.random.default_rng(3)
    ldec = (rng.random((size, size)) < 0.05).astype(np.uint8) * rng.integers(1, 9, (size, size))
    got = coverage.percentages(
        coverage.coverage_counts(ldec, size=size, strip=strip, centre=centre, radius_m=radius)
    )
    want = brute_coverage(ldec, size, centre, radius)
    for res in coverage.FACTORS:
        assert got[res] == pytest.approx(want[res], abs=1e-9), res
    # coarser cells are measured more often, never less
    shares = [got[r] for r in sorted(got)]
    assert shares == sorted(shares)


def test_the_coverage_of_an_empty_a_full_and_a_one_shot_raster() -> None:
    size, strip, centre, radius = 48, 24, 24.0, 100.0
    kwargs: dict[str, Any] = {"size": size, "strip": strip, "centre": centre, "radius_m": radius}
    empty = coverage.percentages(coverage.coverage_counts(np.zeros((size, size), "u1"), **kwargs))
    full = coverage.percentages(coverage.coverage_counts(np.ones((size, size), "u1"), **kwargs))
    assert set(empty.values()) == {0.0} and set(full.values()) == {100.0}
    one = np.zeros((size, size), "u1")
    one[24, 24] = 3  # a single shot at the pole
    counts = coverage.coverage_counts(one, **kwargs)
    assert all(measured == 1 for measured, _ in counts.values())
    # the cells of every resolution inside the circle: the 5 m ones are the disc of 20 cells
    assert counts[5][1] == pytest.approx(3.14159 * 20**2, rel=0.05)


def test_the_cap_is_the_stereographic_circle_of_87_5_south() -> None:
    radius = coverage.stereographic_radius_m(-87.5)
    # the series of 2 R tan(theta / 2), theta the colatitude of 2.5 degrees, written out
    theta = 2.5 * 3.141592653589793 / 180
    series = 1_737_400.0 * theta * (1 + theta**2 / 12 + theta**4 / 120)
    assert radius == pytest.approx(series, rel=1e-8)
    assert 75_800.0 < radius < 75_850.0  # a little more than the arc, 75,811 m
    assert coverage.stereographic_radius_m(-90.0) == 0.0
    assert rules.D_RASTER_SIZE % rules.D_STRIP == 0
    assert all(
        rules.D_STRIP % k == 0 and rules.D_RASTER_SIZE % k == 0 for k in coverage.FACTORS.values()
    )


def synthetic_tile(size: int = 240, seed: int = 11) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    z = (
        40 * np.sin(xx / 17.0) * np.cos(yy / 23.0)
        + 15 * np.sin(xx / 5.0 + yy / 7.0)
        + rng.normal(0, 0.4, (size, size))
    ).astype(np.float32)
    slp = mc_lola.slope_deg(z)
    ldec = (rng.random((size, size)) < 0.15).astype(np.float32)
    return {"surf": z, "ldec": ldec, "slp": slp, "slperr": np.full((size, size), 0.6, np.float32)}


def test_the_slope_of_a_ramp_and_the_margin_are_what_the_physics_says() -> None:
    ramp = np.tile(np.arange(60, dtype=np.float32) * 5.0 * np.tan(np.radians(10.0)), (60, 1))
    assert mc_lola.slope_deg(ramp)[30, 30] == pytest.approx(10.0, abs=1e-4)
    assert mc_lola.slope_deg(np.zeros((9, 9), np.float32)).max() == 0.0
    den = np.array([0.0, 0.0, 1.0, 1.0])  # the median is 0.5: two near, two far
    assert mc_lola.nominal_margin(den, 0.0).tolist() == [1.0] * 4
    p90 = mc_lola.nominal_margin(den, rules.Z_LEVELS["P90"])
    assert p90[:2] == pytest.approx([1 + 1.282 * 2.0] * 2) and p90[2:] == pytest.approx(
        [1 + 1.282 * 0.8] * 2
    )
    assert 1 + 1.282 * 0.8 == pytest.approx(2.03, abs=0.005)  # his "2,03°"
    assert 1 + 1.282 * 2.0 == pytest.approx(3.56, abs=0.005)  # his "3,56°"


def test_the_coarse_grid_and_the_multiresolution_estimate_keep_their_promises() -> None:
    pytest.importorskip("scipy")
    flat = np.full((48, 48), 7.0, np.float32)
    assert mc_lola.coarse_grid(flat, 12) == pytest.approx(7.0)
    layers = synthetic_tile()
    z, measured = layers["surf"], layers["ldec"] > 0
    zg = mc_lola.coarse_grid(z, 12)
    ze, den = mc_lola.multiresolution(z, zg, measured, 2.0)
    assert (ze[measured] == z[measured]).all()  # where there is a shot, the data wins
    assert den.min() >= 0.0 and den.max() <= 1.0 + 1e-6
    nothing, _ = mc_lola.multiresolution(z, zg, np.zeros_like(measured), 2.0)
    assert nothing == pytest.approx(zg)  # no data: no invented relief


def test_the_monte_carlo_is_deterministic_and_orders_the_margins() -> None:
    pytest.importorskip("scipy")
    layers = synthetic_tile()
    first = mc_lola.analyse(layers, coarse=60, window=240, draws=6, log=None)
    again = mc_lola.analyse(layers, coarse=60, window=240, draws=6, log=None)
    other = mc_lola.analyse(layers, coarse=60, window=240, draws=6, seed=7)
    assert first["resumo"] == again["resumo"] and first["testes"] == again["testes"]
    assert first["resumo"] != other["resumo"]
    res = first["resumo"]
    missed = [
        res[f"Tese {k} (margem nominal)"]["perigo_nao_vetado_%"][0] for k in ("P50", "P90", "P99")
    ]
    alarm = [res[f"Tese {k} (margem nominal)"]["falso_alarme_%"][0] for k in ("P50", "P90", "P99")]
    assert missed == sorted(missed, reverse=True) and alarm == sorted(alarm)
    # the fair control has the false alarm of Multiresolution P90, as his bisection promises
    fair = res["Grade 60 m + margem (mesmo falso alarme da tese P90)"]["falso_alarme_%"][0]
    assert fair == pytest.approx(res["Tese P90 (margem nominal)"]["falso_alarme_%"][0], abs=0.5)
    shaped = mc_lola.contract_shape(first)
    assert set(shaped["methods"]) == {"normal", "P50", "P90", "P99"}
    assert shaped["cells_checked"] == first["testes"]["n_celulas_conferidas"] > 0
    assert set(shaped["trade_off_pct"]["Tese, margem por densidade de dado"]) == {
        str(f) for f in rules.FALSE_ALARM_TARGETS
    }


def test_with_no_slope_error_every_draw_is_the_same() -> None:
    pytest.importorskip("scipy")
    layers = synthetic_tile()
    layers["slperr"] = np.zeros_like(layers["slperr"])
    result = mc_lola.analyse(layers, coarse=60, window=240, draws=4)
    for name, metrics in result["resumo"].items():
        mean, low, high = metrics["perigo_nao_vetado_%"]
        assert low == pytest.approx(mean) and high == pytest.approx(mean), name


@pytest.mark.parametrize("coarse", [60, 20])
def test_the_port_gives_the_numbers_of_his_script_on_the_same_layers(
    coarse: int, tmp_path: Path
) -> None:
    """His own mc_lola.py, read from his commit and run on a synthetic tile, against the port.

    Every mean, interval, test statistic, calibrated margin and curve point must be identical.
    It needs scipy, matplotlib (his script imports it) and tifffile (it reads the layers), and
    his commit fetched: `uv run --project backend --with scipy --with matplotlib --with tifffile
    pytest validation/test_hazard_mc.py`. Without them it is skipped.
    """
    pytest.importorskip("scipy")
    pytest.importorskip("matplotlib")
    tifffile = pytest.importorskip("tifffile")
    source = subprocess.run(
        ["git", "show", f"{rules.COMMIT}:simulacao_rover/monte_carlo_lola/mc_lola.py"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if source.returncode != 0:
        pytest.skip(f"commit {rules.COMMIT} is not fetched here")
    script = tmp_path / "simulacao_rover" / "monte_carlo_lola" / "mc_lola.py"
    script.parent.mkdir(parents=True)
    script.write_bytes(source.stdout)
    layers = synthetic_tile(size=300, seed=5)
    layers["slperr"] = (0.3 + 0.5 * np.random.default_rng(6).random((300, 300))).astype(np.float32)
    folder = tmp_path / "dados" / "acervo_tese" / "02_PGDA_78_5M" / "Syn"
    folder.mkdir(parents=True)
    for name, values in layers.items():
        tifffile.imwrite(folder / f"Syn_final_adj_5mpp_{name}.tif", values)
    done = subprocess.run(
        [sys.executable, str(script), "--sitio", "Syn", "--recorte", "288", "--sorteios", "12"]
        + ["--grossa", str(coarse)],
        capture_output=True,
        check=False,
    )
    assert done.returncode == 0, done.stderr.decode()[-2000:]
    out = "resultados" if coarse == 60 else "resultados_20m"
    his = json.loads((script.parent / out / "Syn" / "resumo.json").read_text("utf-8"))
    mine = mc_lola.analyse(layers, coarse=coarse, window=288, draws=12)
    assert set(his["resumo"]) == set(mine["resumo"])
    for name, metrics in his["resumo"].items():
        for key, triple in metrics.items():
            assert mine["resumo"][name][key] == pytest.approx(triple, abs=1e-9), (name, key)
    for key, value in his["testes"].items():
        assert mine["testes"][key] == pytest.approx(value, abs=1e-9), key
    for key, pair in his["margens_calibradas"].items():
        assert mine["margens_calibradas"][key] == pytest.approx(pair, abs=1e-12), key
    for family, points in mine["curvas_no_alvo"].items():
        for target, value in points.items():
            assert value == pytest.approx(his["curvas"][family]["no_alvo"][target], abs=1e-9)
