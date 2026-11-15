"""DSN pass edges from /visibility/dsn against JPL Horizons (the requirement).

The tolerances were written in the spec (the requirement) before the first comparison: at each
pass edge, the Moon's elevation from that antenna per Horizons is the minimum elevation
within 0.05°, and Horizons' own crossing of the minimum elevation is within 2 minutes of
the edge. Horizons' rows come from `fetch_dsn_horizons.py`, one per minute from 12 minutes
before each edge to 12 minutes after; between rows the elevation is interpolated linearly
(it moves at most about 0.25° a minute, and bends far less within one).
"""

from __future__ import annotations

import itertools
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import proof

SCRIPT = "validation/test_horizons_dsn.py"
DATA = Path(__file__).resolve().parent / "data" / "horizons_dsn.json"
ELEVATION_TOLERANCE_DEG = 0.05
EDGE_TOLERANCE_S = 120.0
# The minimum elevation is read in DSN 810-005; the backend says which value it used.
SOURCE = (
    "Minimum elevation 6° from DSN 810-005, module 302 Rev. E (1 July 2024), Table 1, page 8 "
    "(elevation motion limits of the 70-m antennas, 6° to 89.5°)"
)
REFERENCE = (
    "JPL Horizons, Moon (301) from DSS-14, DSS-43 and DSS-63 (coord@399 at the geodetic "
    "coordinates of DSN 810-005 module 301, airless), every minute around each pass edge "
    "in ten 30 h Windows 2023-2032. " + SOURCE
)
NOT_COVERED = proof.text(
    "Geometry only, with the Moon's centre for the Site: no antenna schedule, no link budget, "
    "no terrain around the stations, no refraction, only the three 70 m antennas.",
    "Só geometria, com o centro da Lua no lugar do Site: sem escala das antenas, sem "
    "orçamento de enlace, sem relevo em volta das estações, sem refração, só as três "
    "antenas de 70 m.",
)
proof.declare(
    "horizons-dsn-elevation",
    title=proof.text(
        "Moon elevation at each DSN pass edge vs JPL Horizons",
        "Elevação da Lua em cada borda de passagem da DSN contra o JPL Horizons",
    ),
    reference=REFERENCE,
    tolerance=proof.text("≤ 0.05° from 6°", "≤ 0,05° de 6°"),
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)
proof.declare(
    "horizons-dsn-pass-edges",
    title=proof.text(
        "DSN pass start and end vs JPL Horizons' crossing of 6°",
        "Início e fim das passagens da DSN contra o cruzamento de 6° do JPL Horizons",
    ),
    reference=REFERENCE,
    tolerance=proof.text("≤ 2 min", "≤ 2 min"),
    not_covered=NOT_COVERED,
    script_path=SCRIPT,
)
proof.declare(
    "negative-control-dsn-edges-shifted",
    title=proof.text(
        "Negative control: DSN pass edges 10 minutes late",
        "Controle negativo: bordas das passagens da DSN 10 minutos atrasadas",
    ),
    reference="The elevation check with every edge moved 10 minutes later",
    tolerance=proof.text("must exceed 0.05°", "tem que passar de 0,05°"),
    not_covered=proof.text(
        "Only shows the check is sensitive to time.",
        "Só mostra que a checagem é sensível ao tempo.",
    ),
    script_path=SCRIPT,
)


def instant(stamp: str) -> datetime:
    return datetime.fromisoformat(stamp)


def elevation_at(rows: list[dict[str, Any]], when: datetime) -> float:
    for left, right in itertools.pairwise(rows):
        a, b = instant(left["t"]), instant(right["t"])
        if a <= when <= b:
            share = (when - a).total_seconds() / (b - a).total_seconds()
            return float(
                left["elevation_deg"]
                + share * (right["elevation_deg"] - left["elevation_deg"])
            )
    raise AssertionError(f"{when} is outside Horizons' rows")


def crossing(rows: list[dict[str, Any]], level: float) -> datetime:
    found = []
    for left, right in itertools.pairwise(rows):
        e1, e2 = left["elevation_deg"] - level, right["elevation_deg"] - level
        if e1 == 0:
            found.append(instant(left["t"]))
        elif e1 * e2 < 0:
            a, b = instant(left["t"]), instant(right["t"])
            found.append(a + (b - a) * (e1 / (e1 - e2)))
    assert len(found) == 1, f"{len(found)} crossings of {level}° in Horizons' rows"
    return found[0]


def our_edges(
    client: Any, window_start: str, window_hours: float
) -> dict[tuple[str, str], list[datetime]]:
    params = {"site_id": "001", "start": window_start, "duration_hours": window_hours}
    response = client.get("/visibility/dsn", params=params)
    assert response.status_code == 200, response.text
    answer = response.json()
    first, last = answer["query"]["start"], answer["query"]["end"]
    out: dict[tuple[str, str], list[datetime]] = {}
    for station in answer["stations"]:
        for item in station["passes"]:
            for field, kind in (("start", "rise"), ("end", "set")):
                if item[field] not in (first, last):
                    out.setdefault((station["id"], kind), []).append(
                        instant(item[field])
                    )
    return out


def comparisons(client: Any) -> tuple[float, float, list[float], float, int]:
    """Worst elevation gap, worst edge gap (s), shifted gaps, minimum elevation, edges."""
    data = json.loads(DATA.read_text("utf-8"))
    cache: dict[str, dict[tuple[str, str], list[datetime]]] = {}
    worst_elevation = worst_edge = 0.0
    shifted: list[float] = []
    level = None
    count = 0
    for item in data["edges"]:
        start = item["window_start"]
        if start not in cache:
            cache[start] = our_edges(client, start, data["window_hours"])
            answer = client.get(
                "/visibility/dsn",
                params={
                    "site_id": "001",
                    "start": start,
                    "duration_hours": data["window_hours"],
                },
            ).json()
            level = answer["min_elevation_deg"]
        assert level is not None
        reference = instant(item["edge"])
        candidates = cache[start].get((item["station"], item["kind"]), [])
        ours = min(candidates, key=lambda when: abs((when - reference).total_seconds()))
        rows = item["rows"]
        worst_elevation = max(worst_elevation, abs(elevation_at(rows, ours) - level))
        worst_edge = max(
            worst_edge, abs((crossing(rows, level) - ours).total_seconds())
        )
        shifted.append(abs(elevation_at(rows, ours + timedelta(minutes=10)) - level))
        count += 1
    assert level is not None
    return worst_elevation, worst_edge, shifted, level, count


@proof.check("horizons-dsn-elevation")
def test_moon_elevation_at_pass_edges(test_client: Any) -> None:
    worst, _edge, _shifted, level, count = comparisons(test_client)
    ok = worst <= ELEVATION_TOLERANCE_DEG
    en, pt = proof.deg(worst)
    proof.record(
        "horizons-dsn-elevation",
        "passed" if ok else "failed",
        proof.text(
            f"max error {en} from {level:g}° over {count} pass edges",
            f"erro máximo de {pt} de {level:g}° em {count} bordas de passagem",
        ),
    )
    assert count >= 30
    assert ok, worst


@proof.check("horizons-dsn-pass-edges")
def test_pass_edges_match_horizons_crossings(test_client: Any) -> None:
    _worst, edge, _shifted, _level, count = comparisons(test_client)
    ok = edge <= EDGE_TOLERANCE_S
    proof.record(
        "horizons-dsn-pass-edges",
        "passed" if ok else "failed",
        proof.text(
            f"max gap {edge:.1f} s over {count} pass edges",
            f"diferença máxima de {edge:.1f} s em {count} bordas de passagem".replace(
                ".", ","
            ),
        ),
    )
    assert ok, edge


@proof.check("negative-control-dsn-edges-shifted")
def test_shifted_edges_fail(test_client: Any) -> None:
    _worst, _edge, shifted, _level, count = comparisons(test_client)
    smallest = min(shifted)
    ok = smallest > ELEVATION_TOLERANCE_DEG
    en, pt = proof.deg(smallest)
    proof.record(
        "negative-control-dsn-edges-shifted",
        "passed" if ok else "failed",
        proof.text(
            f"smallest error {en} over {count} edges moved 10 min",
            f"menor erro de {pt} em {count} bordas deslocadas 10 min",
        ),
    )
    assert ok, smallest
