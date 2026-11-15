"""The Sun and the Earth against NASA's 18.6-year maps (PGDA product 69), the requirement.

The rule, the spans and the tolerance are in pgda.py and were committed before any result.
The reference values are `data/pgda_points.json` (fetch_pgda_points.py); the engine's
are `data/pgda_engine.json` (run_pgda_engine.py, in the backend container on the server,
because the span runs past the app's coverage). Until that file is in the repo the
entries stay pending. If the check fails, it stays failed.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pgda
import proof
import pytest

SCRIPT = "validation/test_pgda.py"
DATA = Path(__file__).resolve().parent / "data"
POINTS = DATA / "pgda_points.json"
ENGINE = DATA / "pgda_engine.json"

REFERENCE = (
    "PGDA product 69 (Mazarico et al. 2011, Icarus 211, 1066-1081), "
    "AVGVISIB_85S_060M_201608{suffix}.TIF, 60 m, hourly over 18.6 years, at points drawn by a "
    "seeded rule stratified by the map's own value"
)
TOLERANCE = proof.text(
    f"RMSE ≤ {pgda.RMSE_MAX_PP:g} percentage points and mean difference ≤ "
    f"{pgda.MEAN_DIFFERENCE_MAX_PP:g} points",
    f"RMSE ≤ {pgda.RMSE_MAX_PP:g} pontos percentuais e diferença média ≤ "
    f"{pgda.MEAN_DIFFERENCE_MAX_PP:g} pontos",
)
NOT_COVERED = proof.text(
    "Only where the map is smooth (no neighbouring pixel more than 5 points away), so no "
    "Sun value from 0.6 up: the map has no smooth pixel that bright. At the surface (0 m). "
    "Over one nodal cycle from 2023; the map's own cycle is not published. Bright ridges "
    "(Sun map at 0.6 or more, 18 points, no smoothness filter) are shown for information "
    "and never judged: the map cannot place a value inside a 60 m pixel there.",
    "Só onde o mapa é suave (nenhum pixel vizinho a mais de 5 pontos), então nenhum valor de "
    "Sol a partir de 0,6: o mapa não tem pixel suave tão claro. Na superfície (0 m). Num ciclo "
    "nodal a partir de 2023; o ciclo do próprio mapa não é publicado. Cristas claras (mapa do "
    "Sol em 0,6 ou mais, 18 pontos, sem filtro de suavidade) aparecem só como informação e "
    "nunca são julgadas: ali o mapa não consegue situar um valor dentro de um pixel de 60 m.",
)

proof.declare(
    "pgda-sun-visibility",
    title=proof.text(
        "Share of time with the Sun up, against NASA's 18.6-year map",
        "Parte do tempo com Sol, contra o mapa de 18,6 anos da NASA",
    ),
    reference=REFERENCE.format(suffix=""),
    tolerance=TOLERANCE,
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)
proof.declare(
    "pgda-earth-visibility",
    title=proof.text(
        "Share of time with the Earth visible, against NASA's 18.6-year map",
        "Parte do tempo com a Terra visível, contra o mapa de 18,6 anos da NASA",
    ),
    reference=REFERENCE.format(suffix="_EARTH"),
    tolerance=TOLERANCE,
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-pgda-longitude",
    title=proof.text(
        "Negative control: the same points at longitude + 180°",
        "Controle negativo: os mesmos pontos na longitude + 180°",
    ),
    reference="The PGDA Sun and Earth checks with the engine run at each point's longitude + 180°",
    tolerance=proof.text(
        f"must break both checks (RMSE above {pgda.RMSE_MAX_PP:g} points)",
        f"precisa quebrar as duas checagens (RMSE acima de {pgda.RMSE_MAX_PP:g} pontos)",
    ),
    not_covered=proof.text(
        "Shows the check can fail; says nothing about the engine.",
        "Mostra que a checagem pode falhar; não diz nada sobre o motor.",
    ),
    script_path=SCRIPT,
)


def points(key: str = "points") -> list[dict[str, Any]]:
    loaded: list[dict[str, Any]] = json.loads(POINTS.read_text("utf-8"))[key]
    return loaded


def pt(value: float, spec: str = "+.2f") -> str:
    """A number as the Portuguese text writes it, with the decimal comma."""
    return format(value, spec).replace(".", ",")


def describe(summary: dict[str, Any], extra_en: str, extra_pt: str) -> dict[str, str]:
    rmse, mean, largest = (
        summary["rmse_pp"],
        summary["mean_difference_pp"],
        summary["largest_difference_pp"],
    )
    count = summary["points"]
    return proof.text(
        f"RMSE {rmse:.2f} points, mean difference {mean:+.2f} points over {count} points "
        f"(largest {largest:+.2f}); {extra_en}",
        f"RMSE de {pt(rmse, '.2f')} pontos, diferença média de {pt(mean)} pontos em {count} "
        f"pontos (maior {pt(largest)}); {extra_pt}",
    )


# --- What runs now: the committed points follow the committed rule ------------------------


def test_the_points_follow_the_rule() -> None:
    drawn = json.loads(POINTS.read_text("utf-8"))
    assert drawn["rule"]["seed"] == pgda.SEED
    assert {name: spec["sha256"] for name, spec in drawn["maps"].items()} == {
        name: spec["sha256"] for name, spec in pgda.MAPS.items()
    }
    ids = [p["id"] for p in drawn["points"]]
    assert len(ids) == len(set(ids))
    for p in drawn["points"]:
        assert p["latitude_deg"] <= pgda.LATITUDE_LIMIT_DEG
        low, high = p["stratum"]
        value = p[f"map_{p['drawn_for']}"]
        assert low <= value <= high
        assert 0.0 <= p["map_sun"] <= 1.0 and 0.0 <= p["map_earth"] <= 1.0
    for name, per, strata in (
        ("sun", pgda.SUN_PER_STRATUM, pgda.SUN_STRATA),
        ("earth", pgda.EARTH_PER_STRATUM, pgda.EARTH_STRATA),
    ):
        for low, _ in strata:
            n = sum(1 for p in drawn["points"] if p["drawn_for"] == name and p["stratum"][0] == low)
            assert n <= per


def test_the_bright_ridges_follow_their_rule_and_leave_the_judged_points_alone() -> None:
    drawn = json.loads(POINTS.read_text("utf-8"))
    assert drawn["bright_rule"]["seed"] == pgda.BRIGHT_SEED != pgda.SEED
    assert drawn["bright_rule"]["judged"] is False
    judged = {(p["row"], p["col"]) for p in drawn["points"]}
    for p in drawn["bright_points"]:
        assert p["map_sun"] >= 0.6 and p["latitude_deg"] <= pgda.LATITUDE_LIMIT_DEG
        assert p["stratum"][0] <= p["map_sun"] <= p["stratum"][1]
        assert (p["row"], p["col"]) not in judged
    for low, _ in pgda.BRIGHT_STRATA:
        n = sum(1 for p in drawn["bright_points"] if p["stratum"][0] == low)
        assert n == pgda.BRIGHT_PER_STRATUM


def test_the_comparison_arithmetic() -> None:
    summary = pgda.compare([(0.50, 0.47), (0.20, 0.24), (0.90, 0.90)])
    assert summary["points"] == 3
    assert summary["rmse_pp"] == pytest.approx((9 + 16 + 0) ** 0.5 / 3**0.5)
    assert summary["mean_difference_pp"] == pytest.approx((3 - 4 + 0) / 3)
    assert summary["largest_difference_pp"] == pytest.approx(-4.0)
    assert summary["passed"] is True
    assert pgda.compare([(0.5, 0.4)] * 3)["passed"] is False  # 10 points off


def test_pixel_centres_on_the_maps_grid() -> None:
    # The four pixels around the pole are 30 m from it in x and y: 42.4 m, 1.4e-3° of latitude.
    lat, lon = pgda.pixel_centre(2528, 2529, -151_740.0, 151_740.0, 60.0)
    assert lat == pytest.approx(
        -90 + 42.426 / pgda.MOON_RADIUS_M * 180 / 3.141592653589793, abs=1e-5
    )
    assert lon == pytest.approx(45.0)


# --- What needs the engine's output -------------------------------------------------------


def engine_output() -> dict[str, Any]:
    if not ENGINE.exists():
        pytest.skip("no engine output yet: run run_pgda_engine.py on the server")
    loaded: dict[str, Any] = json.loads(ENGINE.read_text("utf-8"))
    assert loaded["days"] == pgda.CYCLE_DAYS, "the output is not the full cycle"
    assert loaded["step_hours"] == 1.0 and loaded["observer_height_m"] == pgda.OBSERVER_HEIGHT_M
    assert loaded["judged_start"] == pgda.JUDGED_START.isoformat()
    assert sorted(p["id"] for p in loaded["points"]) == sorted(p["id"] for p in points())
    bright_ids = sorted(p["id"] for p in loaded["bright_points"])
    assert bright_ids == sorted(p["id"] for p in points("bright_points"))
    return loaded


def pairs(
    output: dict[str, Any], run: str, field: str, quantity: str, key: str = "points"
) -> list[tuple[float, float]]:
    """(ours, the map's) at every point of a set, for one run and one field of ours."""
    ours = {p["id"]: p[run] for p in output[key]}
    return [(ours[p["id"]][field], p[f"map_{quantity}"]) for p in points(key)]


@proof.check("pgda-sun-visibility")
def test_the_sun_against_the_map() -> None:
    output = engine_output()
    summary = pgda.compare(pairs(output, "judged", "sun_any", "sun"))
    second = pgda.compare(pairs(output, "second_cycle", "sun_any", "sun"))
    fraction = pgda.compare(pairs(output, "judged", "sun_mean_fraction", "sun"))
    shift = second["mean_difference_pp"] - summary["mean_difference_pp"]
    # Shown for information; never part of the pass or the fail above.
    ridges = pgda.compare(pairs(output, "judged", "sun_any", "sun", "bright_points"))
    proof.record(
        "pgda-sun-visibility",
        "passed" if summary["passed"] else "failed",
        describe(
            summary,
            f"a second cycle moves the mean by {shift:+.2f} points; mean Sun fraction, "
            f"not judged, is off by {fraction['mean_difference_pp']:+.2f} on average. Bright "
            f"ridges, shown for information (the map cannot place a value inside a 60 m pixel "
            f"there): RMSE {ridges['rmse_pp']:.2f}, mean difference "
            f"{ridges['mean_difference_pp']:+.2f} points over {ridges['points']} points",
            f"um segundo ciclo muda a média em {pt(shift)} pontos; a fração média do Sol, "
            f"não julgada, fica em média {pt(fraction['mean_difference_pp'])} pontos fora. "
            f"Cristas claras, só como informação (ali o mapa não consegue situar um valor "
            f"dentro de um pixel de 60 m): RMSE de {pt(ridges['rmse_pp'], '.2f')}, diferença "
            f"média de {pt(ridges['mean_difference_pp'])} pontos em {ridges['points']} pontos",
        ),
    )
    assert summary["passed"], summary


@proof.check("pgda-earth-visibility")
def test_the_earth_against_the_map() -> None:
    output = engine_output()
    summary = pgda.compare(pairs(output, "judged", "earth_any", "earth"))
    second = pgda.compare(pairs(output, "second_cycle", "earth_any", "earth"))
    centre = pgda.compare(pairs(output, "judged", "earth_centre", "earth"))
    shift = second["mean_difference_pp"] - summary["mean_difference_pp"]
    proof.record(
        "pgda-earth-visibility",
        "passed" if summary["passed"] else "failed",
        describe(
            summary,
            f"a second cycle moves the mean by {shift:+.2f} points; by the Earth's centre, "
            f"as the app counts it, the mean is {centre['mean_difference_pp']:+.2f} points",
            f"um segundo ciclo muda a média em {pt(shift)} pontos; pelo centro da Terra, como o "
            f"app conta, a média fica em {pt(centre['mean_difference_pp'])} pontos",
        ),
    )
    assert summary["passed"], summary


@proof.check("negative-control-pgda-longitude")
def test_the_negative_control_breaks_both_checks() -> None:
    output = engine_output()
    sun = pgda.compare(pairs(output, "control", "sun_any", "sun"))
    earth = pgda.compare(pairs(output, "control", "earth_any", "earth"))
    broke = sun["rmse_pp"] > pgda.RMSE_MAX_PP and earth["rmse_pp"] > pgda.RMSE_MAX_PP
    en = f"Sun RMSE {sun['rmse_pp']:.2f}, Earth RMSE {earth['rmse_pp']:.2f} points"
    pt_text = f"RMSE do Sol {pt(sun['rmse_pp'], '.2f')}, RMSE da Terra {pt(earth['rmse_pp'], '.2f')} pontos"
    proof.record(
        "negative-control-pgda-longitude",
        "passed" if broke else "failed",
        proof.text(f"broke both checks ({en})", f"quebrou as duas checagens ({pt_text})")
        if broke
        else proof.text(f"did not break both checks ({en})", f"não quebrou as duas ({pt_text})"),
    )
    assert broke, (sun, earth)
