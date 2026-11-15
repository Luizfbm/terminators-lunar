"""The battery's panel pointing against Eduardo's panel-geometry model (the requirement).

The reference is Eduardo's `calcular_potencia_painel` (src/solar_panel_math.py, commit 170350d), evaluated by
`fetch_panel_incidence.py` and saved in data/eduardo_panel_incidence.json. It builds the
Sun's direction and the panel's normal as vectors and takes their dot product; ours
writes the closed forms. The tolerance was fixed in the specification before implementation: 1e-9 on
the incidence factor.

His three geometries map onto ours: `horizontal` is `flat`, `vertical_fixed` facing P is
`fixed` with `panel_azimuth_deg` = P, and `vertical_tracking` (upright, turning with the
Sun) is `fixed` facing the Sun's azimuth. Our `sun` pointing, factor 1, has no
counterpart in his model.

His function returns 0 whenever the Sun's centre is at or below 0°, a horizon on the bare
sphere. Ours has no such cut: the terrain horizon is the Sun fraction's job, and at
Connecting Ridge 001 the horizon dips below 0°, so the Sun is often up with its centre
below 0°. The upright rows at or below 0° are therefore left out of the comparison, and a
separate check pins that they differ for that reason only. The flat rows agree there, as
sin E ≤ 0.

Two seams: the grid goes to the engine's incidence function directly, because the Sun
never reaches 10° at the pole and no Query could ask for it; the Site 001 points go
through `GET /visibility/energy`, reading the factor off one 15-minute step of the Charge.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import proof
import pytest
from app.energy import incidence_factor

SCRIPT = "validation/test_panel_incidence.py"
DATA = Path(__file__).resolve().parent / "data" / "eduardo_panel_incidence.json"
TOLERANCE = 1e-9
REFERENCE = (
    "Eduardo's panel-geometry model, calcular_potencia_painel (independent reference, commit 170350d): "
    "3,000 Sun directions, elevations −2° to 10°, azimuths all round, "
    "flat, upright fixed (0°, 90°, 213.5°) and upright tracking; and the Sun's direction at "
    "Site 001 at 8 instants, through the API"
)
STEP = {"panel_power_w": 1000.0, "load_w": 2000.0, "battery_wh": 1000.0}

proof.declare(
    "eduardo-panel-incidence",
    title=proof.text(
        "Panel pointing vs Eduardo's panel-geometry model",
        "Apontamento dos painéis contra o modelo de geometria de painel do Eduardo",
    ),
    reference=REFERENCE,
    tolerance=proof.text("≤ 1e-9 on the incidence factor", "≤ 1e-9 no fator de incidência"),
    not_covered=proof.text(
        "Only the angle between the panels and the Sun's centre. Upright panels with the Sun's "
        "centre at or below 0° are left out: his function gates on the horizon of the bare "
        "sphere and ours on the terrain, through the Sun fraction, and at Connecting Ridge 001 "
        "most sunlit hours of some months have the Sun's centre below 0°. No thermal model, no "
        "tracking error, no shadow of the lander on its own panels.",
        "Só o ângulo entre os painéis e o centro do Sol. Painéis em pé com o centro do Sol a 0° "
        "ou abaixo ficam de fora: a função dele corta no horizonte da esfera lisa e a nossa no "
        "terreno, pela fração do Sol, e na Connecting Ridge 001 a maior parte das horas de Sol "
        "de alguns meses tem o centro do Sol abaixo de 0°. Sem modelo térmico, sem erro de "
        "rastreamento, sem sombra do módulo sobre os próprios painéis.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-panel-azimuth-turned",
    title=proof.text(
        "Negative control: the panels turned 180°",
        "Controle negativo: os painéis virados 180°",
    ),
    reference="The same table, with our upright panels facing the opposite way",
    tolerance=proof.text("must exceed 1e-9", "tem que passar de 1e-9"),
    not_covered=proof.text(
        "Only shows the table can tell which way the panels face.",
        "Só mostra que a tabela distingue para que lado os painéis olham.",
    ),
    script_path=SCRIPT,
)


def table() -> dict[str, Any]:
    loaded: dict[str, Any] = json.loads(DATA.read_text("utf-8"))
    return loaded


def ours(row: dict[str, Any], turn_deg: float = 0.0) -> float:
    """Our incidence factor for one row of his table, the upright panels turned by `turn_deg`."""
    azimuth, elevation = row["sun_azimuth_deg"], row["sun_elevation_deg"]
    geometry = row["geometry"]
    if geometry == "horizontal":
        return incidence_factor("flat", None, azimuth, elevation)
    panel = row["panel_azimuth_deg"] if geometry == "vertical_fixed" else azimuth
    return incidence_factor("fixed", (panel + turn_deg) % 360.0, azimuth, elevation)


def compared(row: dict[str, Any]) -> bool:
    """The rows both models mean the same thing by: every one with the Sun's centre above
    0°, and the flat ones below it."""
    return bool(row["sun_elevation_deg"] > 0.0 or row["geometry"] == "horizontal")


def step_power(client: Any, instant: str, pointing: dict[str, Any]) -> float:
    query = {"site_id": "001", "start": instant, "duration_hours": 0.25}
    answer = client.get("/visibility/energy", params={**query, **STEP, **pointing})
    assert answer.status_code == 200, answer.text
    series = answer.json()["charge_fraction"]
    assert len(series) == 2 and series[0] == 1.0 and series[1] > 0.0
    return float((series[1] - 1.0) * STEP["battery_wh"] / 0.25 + STEP["load_w"])


def api_factors(client: Any, point: dict[str, Any]) -> dict[str, float]:
    """The incidence factors the route used at one instant, read off the Charge."""
    instant, azimuth = point["t"], point["sun_azimuth_deg"]
    full = step_power(client, instant, {"panel_pointing": "sun"})
    return {
        "horizontal": step_power(client, instant, {"panel_pointing": "flat"}) / full,
        "vertical_fixed_90": step_power(
            client, instant, {"panel_pointing": "fixed", "panel_azimuth_deg": 90}
        )
        / full,
        "vertical_tracking": step_power(
            client, instant, {"panel_pointing": "fixed", "panel_azimuth_deg": azimuth}
        )
        / full,
    }


@proof.check("eduardo-panel-incidence")
def test_panel_incidence_against_eduardos_model(test_client: Any) -> None:
    data = table()
    rows = [row for row in data["grid"] if compared(row)]
    grid_gap = max(abs(ours(row) - row["incidence_factor"]) for row in rows)
    api_gap = 0.0
    for point in data["site_001"]:
        # The Sun is whole and above 0° at each of these instants, so both models agree on
        # what they compute and the route's factor can be read off the Charge.
        assert point["sun_fraction"] > 0.99 and point["sun_elevation_deg"] > 0.0, point["t"]
        for name, value in api_factors(test_client, point).items():
            api_gap = max(api_gap, abs(value - point[name]))
    gap = max(grid_gap, api_gap)
    passed = gap <= TOLERANCE
    n_en = f"{len(rows):,}"
    n_pt = n_en.replace(",", ".")
    gap_en = f"{gap:.1e}"
    gap_pt = gap_en.replace(".", ",")
    proof.record(
        "eduardo-panel-incidence",
        "passed" if passed else "failed",
        proof.text(
            f"max error {gap_en} over {n_en} Sun directions and 8 instants through the API",
            f"erro máximo de {gap_pt} em {n_pt} direções do Sol e 8 instantes pela API",
        ),
    )
    assert passed, f"incidence factor off by {gap:.3e} (grid {grid_gap:.3e}, API {api_gap:.3e})"


def test_the_upright_rows_left_out_differ_only_by_the_horizon_cut() -> None:
    # The rows the check leaves out are the upright ones with the Sun's centre at or below
    # 0°. There his function says 0 because of its horizon cut, and ours says
    # cos E · cos(A − P): the light a panel gets from a Sun that the terrain, not the bare
    # sphere, decides is up. If either side changes this, the comparison above is no longer
    # leaving out what it says it does.
    left_out = [row for row in table()["grid"] if not compared(row)]
    assert len(left_out) == 5 * 24 * 4
    assert all(row["incidence_factor"] == 0.0 for row in left_out)
    facing = [row for row in left_out if ours(row) > 0.0]
    assert facing, "an upright panel facing a Sun just below 0° must get light"
    for row in facing:
        elevation = math.radians(row["sun_elevation_deg"])
        panel = row.get("panel_azimuth_deg", row["sun_azimuth_deg"])
        turn = math.radians(row["sun_azimuth_deg"] - panel)
        assert ours(row) == pytest.approx(math.cos(elevation) * math.cos(turn), abs=1e-12)


@proof.check("negative-control-panel-azimuth-turned")
def test_negative_control_panel_azimuth_turned() -> None:
    rows = [row for row in table()["grid"] if compared(row) and row["geometry"] != "horizontal"]
    gap = max(abs(ours(row, turn_deg=180.0) - row["incidence_factor"]) for row in rows)
    failed_as_expected = gap > TOLERANCE
    en = f"{gap:.2f}"
    pt = en.replace(".", ",")
    proof.record(
        "negative-control-panel-azimuth-turned",
        "passed" if failed_as_expected else "failed",
        proof.text(f"failed as expected ({en})", f"falhou como esperado ({pt})")
        if failed_as_expected
        else proof.text(f"did not fail ({en})", f"não falhou ({pt})"),
    )
    assert failed_as_expected
