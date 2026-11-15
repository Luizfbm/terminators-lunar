"""Sub-solar and sub-Earth points from /visibility against JPL Horizons (the requirement).

The tolerance was written before the first comparison: 0.05° of great-circle separation
per point. Both sides work in MOON_ME; the rest (Horizons looks from the Earth's centre,
the backend from the Moon's) moves the points by under 0.001°.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import proof

SCRIPT = "validation/test_sub_points.py"
DATA = Path(__file__).resolve().parent / "data" / "horizons_sub_points.json"
TOLERANCE_DEG = 0.05
REFERENCE = "JPL Horizons, Moon (301) from the Earth's centre, quantities 14 and 15, MOON_ME, 12 instants 2025-2032"
TOL_TEXT = proof.text("≤ 0.05° per point", "≤ 0,05° por ponto")
NOT_COVERED = proof.text(
    "Only where the Sun and the Earth are overhead on the Moon, for the globe; nothing about terrain.",
    "Só onde o Sol e a Terra estão a pino na Lua, para o globo; nada sobre o relevo.",
)
for body, en, pt in (
    ("sun", "Sub-solar point vs JPL Horizons", "Ponto subsolar contra o JPL Horizons"),
    ("earth", "Sub-Earth point vs JPL Horizons", "Ponto sub-Terra contra o JPL Horizons"),
):
    proof.declare(
        f"horizons-sub-{body}",
        title=proof.text(en, pt),
        reference=REFERENCE,
        tolerance=TOL_TEXT,
        not_covered=NOT_COVERED,
        script_path=SCRIPT,
    )
proof.declare(
    "negative-control-sub-points-time-shift",
    title=proof.text(
        "Negative control: sub-solar point 2 h later",
        "Controle negativo: ponto subsolar 2 h depois",
    ),
    reference="The sub-solar check with the backend asked 2 hours later",
    tolerance=proof.text("must exceed 0.05°", "tem que passar de 0,05°"),
    not_covered=proof.text(
        "Only shows the check is sensitive to time.",
        "Só mostra que a checagem é sensível ao tempo.",
    ),
    script_path=SCRIPT,
)


def separation(a: dict[str, float], b: dict[str, float]) -> float:
    lat1, lat2 = math.radians(a["latitude_deg"]), math.radians(b["latitude_deg"])
    dlon = math.radians(a["longitude_deg"] - b["longitude_deg"])
    cos = math.sin(lat1) * math.sin(lat2) + math.cos(lat1) * math.cos(lat2) * math.cos(dlon)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def backend_point(client: Any, instant: str, shift_hours: float = 0.0) -> dict[str, Any]:
    start = datetime.fromisoformat(instant) + timedelta(hours=shift_hours)
    response = client.get(
        "/visibility",
        params={"site_id": "001", "start": start.isoformat(), "duration_hours": 1},
    )
    assert response.status_code == 200, response.text
    first: dict[str, Any] = response.json()["sub_points"]["samples"][0]
    return first


def worst(test_client: Any, body: str, shift_hours: float = 0.0) -> tuple[float, str]:
    points = json.loads(DATA.read_text("utf-8"))["points"]
    result = (0.0, "")
    for point in points:
        ours = backend_point(test_client, point["t"], shift_hours)[body]
        gap = separation(ours, point[body])
        result = max(result, (gap, point["t"]))
    return result


def check(test_client: Any, body: str) -> None:
    gap, at = worst(test_client, body)
    passed = gap <= TOLERANCE_DEG
    en, pt = proof.deg(gap, 4)
    proof.record(
        f"horizons-sub-{body}",
        "passed" if passed else "failed",
        proof.text(f"max separation {en} over 12 instants", f"separação máxima de {pt} em 12 instantes"),
    )
    assert passed, f"{body} sub-point off by {gap:.4f}° at {at}"


def test_sub_solar_point_against_jpl_horizons(test_client: Any) -> None:
    check(test_client, "sun")


def test_sub_earth_point_against_jpl_horizons(test_client: Any) -> None:
    check(test_client, "earth")


def test_negative_control_sub_points_time_shift(test_client: Any) -> None:
    gap, _ = worst(test_client, "sun", shift_hours=2)
    failed_as_expected = gap > TOLERANCE_DEG
    en, pt = proof.deg(gap, 3)
    proof.record(
        "negative-control-sub-points-time-shift",
        "passed" if failed_as_expected else "failed",
        proof.text(f"failed as expected ({en})", f"falhou como esperado ({pt})")
        if failed_as_expected
        else proof.text(f"did not fail ({en})", f"não falhou ({pt})"),
    )
    assert failed_as_expected
