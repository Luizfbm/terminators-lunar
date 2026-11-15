"""Flat Sunsets from /visibility/flat against JPL Horizons (the requirement).

At a Sunset the last edge of the Sun goes below the horizon, so on the Flat horizon the
Sun's upper limb is at minus the dip when the engine says the Sun sets. Horizons gives the
Sun's apparent elevation and angular diameter for the same Site on the 1737.4 km sphere,
at the Observer height, at each of those instants; the upper limb is the elevation plus
half the diameter. Tolerance written in the requirement before the first comparison: 0.02°,
the one the Proof page already uses for sky positions.

The instants are the engine's, saved with the reference (fetch_flat_sunsets.py). If the
engine moves a Sunset or finds another one, the saved instants no longer match and the
check fails until the reference is fetched again.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import proof

SCRIPT = "validation/test_flat_horizon.py"
DATA = Path(__file__).resolve().parent / "data" / "horizons_flat_sunsets.json"
TOLERANCE_DEG = 0.02
REFERENCE = (
    "JPL Horizons, Sun from a surface observer (coord@301 on the 1737.4 km sphere, airless) "
    "at the Observer height: elevation plus half the angular diameter, at each flat Sunset "
    "of 5 Queries (Site 001 and 4 custom Sites from 84.5°S to 89.9°S, 0, 2 and 10 m), 2025-2032"
)
proof.declare(
    "horizons-flat-sunset",
    title=proof.text(
        "Flat horizon: the Sun's upper limb at each Sunset vs JPL Horizons",
        "Horizonte plano: a borda de cima do Sol em cada pôr do Sol contra o JPL Horizons",
    ),
    reference=REFERENCE,
    tolerance=proof.text("≤ 0.02° from the dip", "≤ 0,02° do mergulho do horizonte"),
    not_covered=proof.text(
        "Bare sphere only: it checks the Sunset definition and the dip, nothing about terrain.",
        "Só a esfera nua: confere a definição de pôr do Sol e o mergulho, nada sobre o relevo.",
    ),
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-flat-sunset-centre",
    title=proof.text(
        "Negative control: the Sun's centre at each flat Sunset",
        "Controle negativo: o centro do Sol em cada pôr do Sol no horizonte plano",
    ),
    reference="The flat Sunset check with the Sun's centre in place of its upper limb",
    tolerance=proof.text("must exceed 0.02°", "tem que passar de 0,02°"),
    not_covered=proof.text(
        "Only shows the check tells the edge of the Sun from its centre.",
        "Só mostra que a checagem distingue a borda do Sol do seu centro.",
    ),
    script_path=SCRIPT,
)


def gaps(test_client: Any, limb: float) -> list[tuple[float, str]]:
    """|Horizons' elevation + limb × radius − engine's Flat horizon| at each engine Sunset."""
    out: list[tuple[float, str]] = []
    for query in json.loads(DATA.read_text("utf-8"))["queries"]:
        response = test_client.get("/visibility/flat", params=query["params"])
        assert response.status_code == 200, response.text
        answer = response.json()
        ours = [e["t"] for e in answer["events"] if e["type"] == "sunset"]
        saved = [s["t"] for s in query["sunsets"]]
        assert ours == saved, f"{query['params']}: Sunsets {ours} vs reference {saved}; refetch"
        for sun in query["sunsets"]:
            radius = sun["angular_diameter_arcsec"] / 7200.0
            edge = sun["elevation_deg"] + limb * radius
            out.append((abs(edge - answer["horizon_elevation_deg"]), sun["t"]))
    return out


@proof.check("horizons-flat-sunset")
def test_the_upper_limb_is_on_the_flat_horizon_at_each_sunset(test_client: Any) -> None:
    found = gaps(test_client, limb=1.0)
    worst, at = max(found)
    passed = worst <= TOLERANCE_DEG and len(found) >= 20
    en, pt = proof.deg(worst, 5)
    proof.record(
        "horizons-flat-sunset",
        "passed" if passed else "failed",
        proof.text(
            f"max error {en} over {len(found)} Sunsets",
            f"erro máximo de {pt} em {len(found)} pores do Sol",
        ),
    )
    assert passed, f"upper limb off the dip by {worst:.5f}° at {at} ({len(found)} Sunsets)"


@proof.check("negative-control-flat-sunset-centre")
def test_negative_control_the_suns_centre_is_not_on_the_horizon(test_client: Any) -> None:
    nearest, at = min(gaps(test_client, limb=0.0))
    failed_as_expected = nearest > TOLERANCE_DEG
    en, pt = proof.deg(nearest, 3)
    proof.record(
        "negative-control-flat-sunset-centre",
        "passed" if failed_as_expected else "failed",
        proof.text(f"failed as expected ({en})", f"falhou como esperado ({pt})")
        if failed_as_expected
        else proof.text(f"did not fail ({en})", f"não falhou ({pt})"),
    )
    assert failed_as_expected, f"the Sun's centre was {nearest:.4f}° off at {at}"
