"""The Sun-distance factor of the battery's Charge against JPL Horizons (the requirement).

The tolerance is defined in the specification: (1 au / d)² within 0.1 %,
with d the Sun's distance from JPL Horizons. The route does not print the factor, so the
check reads it off the Charge through the public API: over one 15-minute step from a full
battery, with a load larger than the panels can give,

    Charge after the step = 1 + (panel × Sun fraction × factor − load) × 0.25 h / capacity

so factor = ((Charge − 1) × capacity / 0.25 h + load) / (panel × Sun fraction), with the
Sun fraction from `/visibility` for the same Query. Both sides use 1 au = 149 597 870.7 km
(IAU 2012 Resolution B2), which Horizons prints in its header.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import proof

SCRIPT = "validation/test_sun_distance.py"
DATA = Path(__file__).resolve().parent / "data" / "horizons_sun_distance.json"
TOLERANCE = 0.001
PANEL_W = 1000.0
LOAD_W = 2000.0
BATTERY_WH = 1_000_000.0
STEP_HOURS = 0.25

proof.declare(
    "horizons-sun-distance-factor",
    title=proof.text(
        "Sun-distance factor of the battery vs JPL Horizons",
        "Fator de distância do Sol na bateria contra o JPL Horizons",
    ),
    reference="JPL Horizons, Sun (10) from Site 001 (coord@301, 2 m), quantity 20 (range), "
    "12 instants 2025-2032",
    tolerance=proof.text("≤ 0.1 % of (1 au / d)²", "≤ 0,1 % de (1 au / d)²"),
    not_covered=proof.text(
        "Only how far the Sun is. The panel pointing has its own check against our group's "
        "model; the rest of the panel model (no heat, constant load) has no outside reference.",
        "Só a distância do Sol. O apontamento dos painéis tem a sua própria checagem contra o "
        "modelo do nosso grupo; o resto do modelo (sem calor, carga constante) não tem referência "
        "externa.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-sun-distance-ignored",
    title=proof.text(
        "Negative control: the battery with the Sun always at 1 au",
        "Controle negativo: a bateria com o Sol sempre a 1 au",
    ),
    reference="The same Horizons distances against a factor of 1",
    tolerance=proof.text("must exceed 0.1 %", "tem que passar de 0,1 %"),
    not_covered=proof.text(
        "Only shows the chosen dates are far enough from 1 au for the check to see the distance.",
        "Só mostra que as datas escolhidas estão longe o bastante de 1 au para a checagem ver a "
        "distância.",
    ),
    script_path=SCRIPT,
)


def points() -> list[dict[str, Any]]:
    loaded: list[dict[str, Any]] = json.loads(DATA.read_text("utf-8"))["points"]
    return loaded


def engine_factor(client: Any, instant: str) -> float:
    query = {"site_id": "001", "start": instant, "duration_hours": STEP_HOURS}
    sky = client.get("/visibility", params=query)
    assert sky.status_code == 200, sky.text
    fraction = sky.json()["timeline"]["samples"][0]["sun"]["fraction"]
    assert fraction > 0.5, f"the Sun is not up at {instant} (fraction {fraction})"
    answer = client.get(
        "/visibility/energy",
        params={**query, "panel_power_w": PANEL_W, "load_w": LOAD_W, "battery_wh": BATTERY_WH},
    )
    assert answer.status_code == 200, answer.text
    series = answer.json()["charge_fraction"]
    assert len(series) == 2 and series[0] == 1.0
    return ((series[1] - 1.0) * BATTERY_WH / STEP_HOURS + LOAD_W) / (PANEL_W * fraction)


def relative_gap(value: float, reference: float) -> float:
    return abs(value - reference) / reference


def test_sun_distance_factor_against_jpl_horizons(test_client: Any) -> None:
    worst = (0.0, "")
    for point in points():
        reference = (1.0 / point["delta_au"]) ** 2
        gap = relative_gap(engine_factor(test_client, point["t"]), reference)
        worst = max(worst, (gap, point["t"]))
    gap, at = worst
    passed = gap <= TOLERANCE
    en = f"{gap * 100:.1e} %"
    proof.record(
        "horizons-sun-distance-factor",
        "passed" if passed else "failed",
        proof.text(
            f"max error {en} over 12 instants",
            f"erro máximo de {en.replace('.', ',')} em 12 instantes",
        ),
    )
    assert passed, f"distance factor off by {gap:.6%} at {at}"


def test_negative_control_sun_distance_ignored() -> None:
    gap = max(relative_gap(1.0, (1.0 / point["delta_au"]) ** 2) for point in points())
    failed_as_expected = gap > TOLERANCE
    en = f"{gap * 100:.2f} %"
    pt = en.replace(".", ",")
    proof.record(
        "negative-control-sun-distance-ignored",
        "passed" if failed_as_expected else "failed",
        proof.text(f"failed as expected ({en})", f"falhou como esperado ({pt})")
        if failed_as_expected
        else proof.text(f"did not fail ({en})", f"não falhou ({pt})"),
    )
    assert failed_as_expected
