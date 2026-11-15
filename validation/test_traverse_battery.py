"""Eduardo's battery of simulated traverses, N0 to N3, recomputed (issue #92).

The rule, the tolerances and the statistics are in sfs/battery.py and were written before any
result. The data is the outcome of each simulated traverse, `data/traverse_outcomes.json`,
made from his raw files by `sfs/extract_battery.py` (the SHA-256 of each is in the file). This
is Eduardo's simulation, not ours: the check shows that the statistics of his plan follow from
his per-traverse results, and says nothing about whether the simulated rover is a real one.
If a number does not reproduce, the entry says what came out and stays failed.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import proof
import pytest
from sfs import battery

SCRIPT = "validation/test_traverse_battery.py"
HERE = Path(__file__).resolve().parent

REFERENCE = (
    "Eduardo's battery of simulated traverses (commit 2195fcb of his branch "
    "eduardo/cockpit-multirresolucao, a research workspace with no common history with this "
    "repository): {what}. Ours: the same, recomputed from the outcome of each of the 1,600 "
    "traverses per configuration and level, data/traverse_outcomes.json (made by "
    "validation/sfs/extract_battery.py from his 64 raw files, whose SHA-256 it lists). His "
    "scripts that made the raw files are in validation/sfs/eduardo/ (exp_dif.js, "
    "rodar_dif_multi.js). It is Eduardo's simulation, which plans with his shadow engine, not ours"
)

proof.declare(
    "eduardo-traverse-battery-pop100",
    title=proof.text(
        "Eduardo's battery of simulated traverses: Multiresolution against Normal navigation, "
        "N0 to N2",
        "Bateria de travessias simuladas do Eduardo: Multirresolução contra Navegação Normal, "
        "N0 a N2",
    ),
    reference=REFERENCE.format(
        what=(
            "every row of his paired-statistics CSV (two batteries, four difficulty levels, "
            "eight pairs of configurations: arrival and tumbling, the difference, the Wilcoxon "
            "test over 16 lanes, the McNemar test over 1,600 traverses, the odds ratio and r), "
            "and the numbers his plan quotes for Multiresolution against Normal navigation at "
            "N0, N1 and N2 (arrival 78.06 / 48.62 / 47.75 % against 67.31 / 35.44 / 35.44 %)"
        ),
    ),
    tolerance=proof.text(
        "arrival and tumbling within 0.005 points, r within 0.0005, the odds ratio within "
        "0.005, p-values within a relative 1e-6, counts of traverses and of lanes exact; "
        "numbers quoted in his plan at the digits it prints",
        "chegada e tombamento a 0,005 ponto, r a 0,0005, a razão de chances a 0,005, valores-p "
        "a uma diferença relativa de 1e-6, contagens de travessias e de faixas exatas; números "
        "citados no plano dele nos dígitos em que ele os imprime",
    ),
    not_covered=proof.text(
        "Eduardo's simulation, built on his shadow engine, not ours. It shows his statistics follow from his per-traverse "
        "results, not that the simulated rover resembles a real one: the traverses are a "
        "simulation of his rover model, over 16 strips of LOLA elevation from 8 Sites, and the "
        "harder levels are synthetic (relief times 1.3, a larger slope error, a worse camera). "
        "The simulation itself was not re-run (64 runs under Node.js, hours; the scripts are "
        "kept in validation/sfs/eduardo/), so the outcomes are his. McNemar treats the 1,600 "
        "traverses as independent although 100 of them share each lane, so its p-values "
        "(1e-31, 1e-47) overstate the evidence; the Wilcoxon over the 16 lanes is the one to "
        "read, it is a normal approximation with ties on 16 values, and the CSV holds 64 tests "
        "with no correction for that. The time cap hides part of the difference: about a fifth "
        "of the traverses end by time or off the map in every configuration. N3 is in its own "
        "entry.",
        "Simulação do Eduardo, feita sobre o motor de sombras dele, não a nossa. Mostra que as estatísticas dele seguem dos "
        "resultados por travessia dele, não que o rover simulado se pareça com um real: as "
        "travessias são uma simulação do modelo de rover dele, sobre 16 faixas de elevação LOLA "
        "de 8 Sites, e os níveis mais difíceis são sintéticos (relevo vezes 1,3, erro de "
        "declive maior, câmera pior). A simulação em si não foi rodada de novo (64 execuções "
        "em Node.js, horas; os scripts ficam guardados em validation/sfs/eduardo/), então os "
        "resultados são dele. O McNemar trata as 1.600 travessias como independentes embora "
        "100 delas dividam cada faixa, então os valores-p dele (1e-31, 1e-47) exageram a "
        "evidência; o Wilcoxon sobre as 16 faixas é o que se deve ler, é uma aproximação normal "
        "com empates em 16 valores, e o CSV traz 64 testes sem correção para isso. O teto de "
        "tempo esconde parte da diferença: cerca de um quinto das travessias termina por tempo "
        "ou fora do mapa em toda configuração. O N3 tem entrada própria.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "eduardo-traverse-n3-quote",
    title=proof.text(
        "Eduardo's N3 figure (+30.0 %) against his POP = 100 battery",
        "Número do N3 do Eduardo (+30,0 %) contra a bateria POP = 100 dele",
    ),
    reference=REFERENCE.format(
        what=(
            "the N3 figure of his plan (docs/PLANO_INTEGRACAO_COCKPIT_TESE.md, section 5, listed "
            "with the POP = 100 numbers in sections 6 and 7): Multiresolution 40.0 % against "
            "Normal navigation 30.8 %, +30.0 % relative, Wilcoxon p = 0.043"
        ),
    ),
    tolerance=proof.text(
        "the same as the N0 to N2 entry: arrival within 0.005 points of the 40.0 and 30.8 he "
        "prints (taken as exact), the gain within 0.05, the p-value at the two digits printed",
        "o mesmo da entrada N0 a N2: chegada a 0,005 ponto dos 40,0 e 30,8 que ele imprime "
        "(tomados como exatos), o ganho a 0,05, o valor-p nos dois dígitos impressos",
    ),
    not_covered=proof.text(
        "Eduardo's simulation, built on his shadow engine, not ours. The 40.0 and 30.8 are the POP = 30 difficulty ladder "
        "(his dados_escada.csv has exactly those values), 480 traverses per cell, whose "
        "per-traverse files are not on his branch, so that run cannot be recomputed here; the "
        "plan's own bullet says 'POP = 30', its summary and prompt list the figure with the "
        "POP = 100 ones. This entry judges the figure against the POP = 100 battery, where "
        "it is presented, and says nothing against the POP = 30 run itself.",
        "Simulação do Eduardo, feita sobre o motor de sombras dele, não a nossa. Os 40,0 e 30,8 são da escada de dificuldade com "
        "POP = 30 (o dados_escada.csv dele tem exatamente esses valores), 480 travessias por "
        "célula, cujos arquivos por travessia não estão na branch dele, então essa rodada não "
        "pode ser recalculada aqui; o item do plano diz 'POP = 30', mas o resumo e o prompt "
        "listam o número junto com os de POP = 100. Esta entrada julga o número contra a "
        "bateria POP = 100, onde ele é apresentado, e não diz nada contra a rodada POP = 30 em "
        "si.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-eduardo-traverse-pairing",
    title=proof.text(
        "Negative control: the same battery with the traverses paired with the wrong lane",
        "Controle negativo: a mesma bateria com as travessias pareadas com a faixa errada",
    ),
    reference=(
        "Eduardo's battery, Multiresolution against Normal navigation at N0 to N3 (800 s cap), with the "
        "outcomes of Normal navigation shifted by one lane before they are paired"
    ),
    tolerance=proof.text(
        "must break the pairing: the McNemar counts change at every level",
        "tem que quebrar o pareamento: as contagens do McNemar mudam em todos os níveis",
    ),
    not_covered=proof.text(
        "Shows the check can fail; says nothing about his simulation.",
        "Mostra que a checagem pode falhar; não diz nada sobre a simulação dele.",
    ),
    script_path=SCRIPT,
)


def comma(value: float, spec: str = ".2f") -> str:
    """A number as the Portuguese text writes it, with the decimal comma."""
    return format(value, spec).replace(".", ",")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def p_text(p: float) -> str:
    return f"{p:.2g}" if p < 0.001 else f"{p:.3f}"


_OUTCOMES: dict[str, Any] = {}


def outcomes() -> dict[str, Any]:
    if not _OUTCOMES:
        _OUTCOMES.update(battery.load_outcomes())
    return _OUTCOMES


# --- The data is the data he made ---------------------------------------------------------------


def test_the_data_files_are_the_ones_on_his_branch() -> None:
    sources = json.loads(battery.SOURCES_PATH.read_text("utf-8"))
    assert sources["commit"] == "2195fcb2d0ee447b1e72c877f4497b82371b917e"
    for name, meta in sources["files"].items():
        assert sha256(battery.DATA / name) == meta["sha256"], name
    data = outcomes()
    assert data["source"]["commit"] == sources["commit"]
    assert len(data["files"]) == 64
    assert all(len(sha) == 64 for sha in data["files"].values())


def test_the_outcomes_are_16_lanes_of_100_traverses_in_five_kinds() -> None:
    data = outcomes()
    assert (
        data["lanes"] == battery.LANES
        and data["traverses_per_lane"] == battery.PER_LANE
    )
    assert set(data["codes"]) == {"M", "T", "F", "B", "P"}
    for name in battery.BATTERIES:
        for level in battery.LEVELS:
            block = data["batteries"][name]["levels"][str(level)]
            assert len(block["lanes"]) == battery.LANES
            assert len(block["configs"]) == 8
            for config, code in block["configs"].items():
                assert len(code) == battery.LANES * battery.PER_LANE, (
                    name,
                    level,
                    config,
                )
                assert set(code) <= set(data["codes"]), (name, level, config)


def test_his_csv_has_every_pair_at_every_level_of_both_batteries() -> None:
    reference = battery.paired_reference()
    assert len(reference) == 64
    keys = {(r["bateria"], int(r["niv_idx"]), *battery.pair_of(r)) for r in reference}
    wanted = {
        (b, level, x, y)
        for b in battery.BATTERIES
        for level in battery.LEVELS
        for x, y, _ in battery.PAIRS
    }
    assert keys == wanted


def test_the_quotes_are_the_ones_in_the_plan() -> None:
    # Transcribed from section 5 of his plan; a typo here would read as a failure of his.
    n0, n1, n2 = battery.QUOTES
    assert (n0.multires_pct, n0.normal_pct, n0.delta_pp, n0.relative_pct) == (
        78.06,
        67.31,
        10.75,
        16.0,
    )
    assert (n1.multires_pct, n1.normal_pct, n1.delta_pp, n1.relative_pct) == (
        48.62,
        35.44,
        13.19,
        37.2,
    )
    assert (n2.multires_pct, n2.normal_pct, n2.delta_pp, n2.relative_pct) == (
        47.75,
        35.44,
        12.31,
        34.7,
    )
    assert battery.N3_QUOTE.multires_pct == 40.0 and battery.N3_QUOTE.normal_pct == 30.8
    # The N3 values are rows of the POP = 30 ladder he committed.
    for method, value in battery.N3_LADDER.items():
        assert battery.ladder_value(method, 3) == value


# --- The statistics, on cases small enough to do by hand ----------------------------------------


def test_ranks_share_the_mean_of_tied_positions() -> None:
    ranks = battery.rank_average(np.array([3.0, 1.0, 3.0, 2.0, 3.0]))
    assert ranks.tolist() == [4.0, 1.0, 4.0, 2.0, 4.0]


def test_wilcoxon_on_five_differences() -> None:
    # d = 1..5, all positive: the smaller rank sum is 0, the variance 5·6·11/24, so
    # z = -7.5 / sqrt(13.75) = -2.0226 and the two-sided normal p is 0.0431.
    x = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    assert battery.wilcoxon_p(x, np.zeros(5)) == pytest.approx(0.0431, abs=5e-5)
    assert battery.wilcoxon_p(x, x) == 1.0  # nothing left once the zeros are dropped


def test_wilcoxon_drops_the_zeros_and_corrects_for_ties() -> None:
    # Eight lanes unchanged, eight up by 100: eight differences, all tied at rank 4.5.
    # Variance 8·9·17/24 - (8^3 - 8)/48 = 40.5, z = -18/sqrt(40.5) = -2*sqrt(2), and the
    # two-sided p is erfc(2) = 0.004677735 (a constant, not computed with the code under test).
    x = np.array([0.0] * 8 + [100.0] * 8)
    assert battery.wilcoxon_p(x, np.zeros(16)) == pytest.approx(0.004677735, rel=1e-6)


def test_rank_biserial_of_three_differences() -> None:
    # d = +3, -1, +2: ranks 3, 1, 2; (3 + 2 - 1) / 6.
    assert battery.rank_biserial(
        np.array([3.0, -1.0, 2.0]), np.zeros(3)
    ) == pytest.approx(2 / 3)
    assert battery.rank_biserial(np.zeros(3), np.zeros(3)) == 0.0


def test_mcnemar_exact_and_the_odds_ratio() -> None:
    p, odds = battery.mcnemar(3, 0)  # 2 · (1 / 8)
    assert p == pytest.approx(0.25) and odds == pytest.approx(3.5 / 0.5)
    p, _ = battery.mcnemar(5, 5)  # a dead heat is p = 1, not more
    assert p == 1.0
    p, odds = battery.mcnemar(10, 2)  # 2 · (1 + 12 + 66) / 4096
    assert p == pytest.approx(158 / 4096) and odds == pytest.approx(4.2)
    assert battery.mcnemar(0, 0)[0] == 1.0
    # A p far below 1e-300 would underflow in floats: the integer arithmetic keeps it exact.
    assert battery.mcnemar(800, 0)[0] == pytest.approx(2.0**-799, rel=1e-12)


def test_a_comparison_of_two_made_up_configurations() -> None:
    # A reaches the goal everywhere; B in the first 8 lanes only.
    everything = "M" * 1600
    half = "M" * 800 + "T" * 800
    data = {
        "batteries": {
            "com_teto": {
                "levels": {"0": {"configs": {"A": everything, "B": half}}},
            }
        }
    }
    row = battery.compare(data, "com_teto", 0, "A", "B")
    assert (row["cheg_a"], row["cheg_b"], row["delta_pp"]) == (100.0, 50.0, 50.0)
    assert (row["mcnemar_a"], row["mcnemar_b"], row["mcnemar_p"]) == (800, 0, 2.0**-799)
    assert (row["faixas_a_gt_b"], row["faixas_a_lt_b"]) == (8, 0)
    assert row["wilcoxon_p"] == pytest.approx(0.004677735, rel=1e-6)
    assert (
        row["delta_tomb_pp"] == 0.0 and row["tomb_wilcoxon_p"] == 1.0
    )  # nobody tumbles
    assert battery.relative_pct(row) == pytest.approx(100.0)


def test_a_printed_p_value_is_compared_at_the_digits_printed() -> None:
    assert battery.printed(0.0464) == 0.046
    assert battery.printed(3.3282e-31) == 3.3e-31
    assert battery.printed(0.01240) == 0.012


def test_the_comparison_flags_a_number_that_is_off() -> None:
    row = battery.paired_reference()[0]
    ours = battery.compare(
        outcomes(), row["bateria"], int(row["niv_idx"]), *battery.pair_of(row)
    )
    assert battery.row_differences(row, ours) == []
    off = dict(ours, mcnemar_a=ours["mcnemar_a"] + 1, delta_pp=ours["delta_pp"] + 0.01)
    assert {c for c, _, _ in battery.row_differences(row, off)} == {
        "mcnemar_a",
        "delta_pp",
    }
    near = dict(
        ours,
        cheg_a=float(row["cheg_a"]) + 0.004,  # inside half of his last digit
        wilcoxon_p=ours["wilcoxon_p"] * (1 + 1e-7),
    )
    assert battery.row_differences(row, near) == []


# --- The checks -----------------------------------------------------------------------------------


@proof.check("eduardo-traverse-battery-pop100")
def test_his_statistics_follow_from_his_traverses() -> None:
    data = outcomes()
    reference = battery.paired_reference()
    off_rows: list[tuple[str, int, str, list[tuple[str, float, float]]]] = []
    shown = 0
    for row in reference:
        a, b = battery.pair_of(row)
        ours = battery.compare(data, row["bateria"], int(row["niv_idx"]), a, b)
        off = battery.row_differences(row, ours)
        if off:
            off_rows.append((row["bateria"], int(row["niv_idx"]), row["comp"], off))
        shown += battery.intervals_match(row, ours)
    rows = {
        quote.level: battery.compare(
            data, "com_teto", quote.level, battery.MULTIRES, battery.NORMAL
        )
        for quote in battery.QUOTES
    }
    quote_off = [
        (quote.level, off)
        for quote in battery.QUOTES
        if (off := battery.quote_differences(quote, rows[quote.level]))
    ]
    passed = not off_rows and not quote_off
    en_parts, pt_parts = [], []
    for level, measured in rows.items():
        wil = p_text(measured["wilcoxon_p"])
        mcn = p_text(measured["mcnemar_p"])
        en_parts.append(
            f"N{level} {measured['cheg_a']:.2f} % against {measured['cheg_b']:.2f} % "
            f"({measured['delta_pp']:+.2f} points, {battery.relative_pct(measured):+.1f} %), "
            f"Wilcoxon over the 16 lanes p = {wil}, McNemar p = {mcn}"
        )
        pt_parts.append(
            f"N{level} {comma(measured['cheg_a'])} % contra {comma(measured['cheg_b'])} % "
            f"({comma(measured['delta_pp'], '+.2f')} pontos, "
            f"{comma(battery.relative_pct(measured), '+.1f')} %), "
            f"Wilcoxon sobre as 16 faixas p = {wil.replace('.', ',')}, "
            f"McNemar p = {mcn.replace('.', ',')}"
        )
    significant = [f"N{lv}" for lv, m in rows.items() if m["wilcoxon_p"] < 0.05]
    if passed:
        result = proof.text(
            f"All {len(reference)} rows of his CSV reproduce from the per-traverse outcomes, and "
            f"so do the numbers his plan quotes at N0, N1 and N2. Multiresolution against "
            f"Normal navigation, 800 s cap: {'; '.join(en_parts)}. The lane-level test is below "
            f"0.05 at {', '.join(significant) or 'none of them'} (N3 of this battery is in its "
            f"own entry). His bootstrap intervals came out the same in {shown} of "
            f"{len(reference)} rows (shown, not judged)",
            f"As {len(reference)} linhas do CSV dele reproduzem a partir dos resultados por "
            f"travessia, e os números que o plano dele cita em N0, N1 e N2 também. "
            f"Multirresolução contra Navegação Normal, teto de 800 s: {'; '.join(pt_parts)}. "
            f"O teste por faixa fica abaixo de 0,05 em {', '.join(significant) or 'nenhum'} (o N3 "
            f"desta bateria tem entrada própria). Os intervalos bootstrap dele saíram iguais em "
            f"{shown} de {len(reference)} linhas (mostrados, não julgados)",
        )
    else:
        detail = f"rows {off_rows[:3]}; quotes {quote_off}"
        result = proof.text(f"does not reproduce: {detail}", f"não reproduz: {detail}")
    proof.record(
        "eduardo-traverse-battery-pop100", "passed" if passed else "failed", result
    )
    assert passed, (off_rows, quote_off)


@proof.check("eduardo-traverse-n3-quote")
def test_the_n3_figure_against_the_pop_100_battery() -> None:
    data = outcomes()
    quote = battery.N3_QUOTE
    capped = battery.compare(data, "com_teto", 3, battery.MULTIRES, battery.NORMAL)
    uncapped = battery.compare(data, "sem_teto", 3, battery.MULTIRES, battery.NORMAL)
    off = battery.quote_differences(quote, capped)
    passed = not off
    ladder = {m: battery.ladder_value(m, 3) for m in battery.N3_LADDER}
    en = (
        f"does not reproduce. On his POP = 100 battery (800 s cap) at N3 Multiresolution "
        f"reaches the goal in {capped['cheg_a']:.2f} % of traverses against "
        f"{capped['cheg_b']:.2f} % for Normal navigation ({capped['delta_pp']:+.2f} points, "
        f"{battery.relative_pct(capped):+.1f} %, Wilcoxon over the 16 lanes p = "
        f"{p_text(capped['wilcoxon_p'])}, McNemar p = {p_text(capped['mcnemar_p'])}); with the "
        f"4,000 s cap {uncapped['cheg_a']:.2f} % against {uncapped['cheg_b']:.2f} % "
        f"({uncapped['delta_pp']:+.2f} points, p = {p_text(uncapped['wilcoxon_p'])}). The plan "
        f"quotes {quote.multires_pct:.1f} % against {quote.normal_pct:.1f} % "
        f"({quote.relative_pct:+.1f} %, p = {quote.wilcoxon_arrival_p}). The 40.0 and 30.8 are "
        f"the POP = 30 ladder ({ladder['Tese 60→5 m (regra)']:.1f} and "
        f"{ladder['Grade 60 m']:.1f} in his dados_escada.csv), which cannot be recomputed here"
    )
    pt_text = (
        f"não reproduz. Na bateria POP = 100 dele (teto de 800 s), no N3, a Multirresolução "
        f"chega à meta em {comma(capped['cheg_a'])} % das travessias contra "
        f"{comma(capped['cheg_b'])} % da Navegação Normal ({comma(capped['delta_pp'], '+.2f')} "
        f"pontos, {comma(battery.relative_pct(capped), '+.1f')} %, Wilcoxon sobre as 16 faixas "
        f"p = {p_text(capped['wilcoxon_p']).replace('.', ',')}, McNemar p = "
        f"{p_text(capped['mcnemar_p']).replace('.', ',')}); com o teto de 4.000 s "
        f"{comma(uncapped['cheg_a'])} % contra {comma(uncapped['cheg_b'])} % "
        f"({comma(uncapped['delta_pp'], '+.2f')} pontos, p = "
        f"{p_text(uncapped['wilcoxon_p']).replace('.', ',')}). O plano cita "
        f"{comma(quote.multires_pct, '.1f')} % contra {comma(quote.normal_pct, '.1f')} % "
        f"({comma(quote.relative_pct, '+.1f')} %, p = "
        f"{str(quote.wilcoxon_arrival_p).replace('.', ',')}). Os 40,0 e 30,8 são da escada com "
        f"POP = 30 ({comma(ladder['Tese 60→5 m (regra)'], '.1f')} e "
        f"{comma(ladder['Grade 60 m'], '.1f')} no dados_escada.csv dele), que não dá para "
        f"recalcular aqui"
    )
    result = (
        proof.text("matches the POP = 100 battery", "bate com a bateria POP = 100")
        if passed
        else proof.text(en, pt_text)
    )
    proof.record("eduardo-traverse-n3-quote", "passed" if passed else "failed", result)
    # This entry is meant to report a finding, not to gate the suite: his N3 figure does not
    # reproduce from the POP = 100 battery (his plan's bullet says it is the POP = 30 run). The
    # test pins the numbers behind the verdict, so a change in the data or the rule shows up
    # here, and the entry on the Proof page says `failed` with them. Nothing is tuned.
    assert not passed and [what for what, _, _ in off] == [
        "Multiresolution arrival %",
        "Normal navigation arrival %",
        "difference, points",
        "relative gain %",
        "Wilcoxon p, arrival",
    ]
    assert capped["cheg_a"] == pytest.approx(34.875) and capped[
        "cheg_b"
    ] == pytest.approx(29.625)
    assert capped["wilcoxon_p"] == pytest.approx(0.27104128, rel=1e-6)
    assert (ladder["Tese 60→5 m (regra)"], ladder["Grade 60 m"]) == (40.0, 30.8)


@proof.check("negative-control-eduardo-traverse-pairing")
def test_the_negative_control_breaks_the_pairing() -> None:
    data = outcomes()
    reference = {
        (r["bateria"], int(r["niv_idx"])): (int(r["mcnemar_a"]), int(r["mcnemar_b"]))
        for r in battery.paired_reference()
        if battery.pair_of(r) == (battery.MULTIRES, battery.NORMAL)
    }
    shifted: dict[int, tuple[int, int]] = {}
    for level in battery.LEVELS:
        ok_a = battery.arrival(data, "com_teto", level, battery.MULTIRES)
        ok_b = np.roll(
            battery.arrival(data, "com_teto", level, battery.NORMAL), 1, axis=0
        )
        shifted[level] = (int((ok_a & ~ok_b).sum()), int((~ok_a & ok_b).sum()))
    broke = all(
        shifted[level] != reference[("com_teto", level)] for level in battery.LEVELS
    )
    en = "; ".join(
        f"N{level} {shifted[level][0]} / {shifted[level][1]} instead of "
        f"{reference[('com_teto', level)][0]} / {reference[('com_teto', level)][1]}"
        for level in battery.LEVELS
    )
    pt_text = "; ".join(
        f"N{level} {shifted[level][0]} / {shifted[level][1]} em vez de "
        f"{reference[('com_teto', level)][0]} / {reference[('com_teto', level)][1]}"
        for level in battery.LEVELS
    )
    proof.record(
        "negative-control-eduardo-traverse-pairing",
        "passed" if broke else "failed",
        proof.text(
            f"broke the McNemar counts at every level ({en})"
            if broke
            else f"did not change the counts at every level ({en})",
            f"quebrou as contagens do McNemar em todos os níveis ({pt_text})"
            if broke
            else f"não mudou as contagens em todos os níveis ({pt_text})",
        ),
    )
    assert broke, shifted


def test_the_constant_quoted_in_the_hand_checks_is_erfc_of_two() -> None:
    assert math.isclose(math.erfc(2.0), 0.004677734981047266)
