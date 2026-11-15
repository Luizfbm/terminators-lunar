"""Live checks at real landers outside the polar DEM, against the public API.

    uv run --project backend python validation/live_landings.py

Writes `validation/data/live_landings.json`; `proof.write` merges it after
`live_results.json`, so its entries replace the pending ones that `live_checks.py` writes.
A Site the API does not know yet (404) is recorded as pending, never as failed.

Tolerances and pass rules below were written before the first query. Never change them to
make a check pass.
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
import proof
from live_checks import API, get

SCRIPT = "validation/live_landings.py"
OUTPUT = Path(__file__).resolve().parent / "data" / "live_landings.json"

# Blue Ghost 1. Firefly press release, 17/03/2025: "operating just over 5 hours into the
# lunar night with the final data received around 6:15 pm CDT on March 16" (CDT = UTC-5).
# https://fireflyspace.com/news/firefly-aerospace-successfully-completes-14-days-of-surface-operations-on-the-moon/
BG1_FINAL_DATA = datetime(2025, 3, 16, 23, 15, tzinfo=UTC)
# Pass rule, fixed before the first query: our Sunset at the landing point falls 5 to 6 h
# before the final data ("just over 5 hours"), i.e. between 17:15 and 18:15 UTC on 16/03.
BG1_MIN_BEFORE_H = 5.0
BG1_MAX_BEFORE_H = 6.0
BG1_WINDOW_START = "2025-03-10T00:00:00Z"
BG1_WINDOW_HOURS = 240.0

# Chandrayaan-3. ISRO updates page (https://www.isro.gov.in/Chandrayaan3.html):
# "September 04, 2023 The lander and rover are in sleep mode. Awaiting their awakening
# around September 22, 2023." The coverage of the engine starts in 2025, so the check
# can only run once both the Site (CH3) and a 2023 Window are served.
CH3_SLEEP = datetime(2023, 9, 4, tzinfo=UTC)
CH3_WINDOW_START = "2023-08-23T00:00:00Z"
CH3_WINDOW_HOURS = 720.0

# Apollo 11 vs Site 001: a teaching example, no tolerance.
CONTRAST_START = "2026-11-06T00:00:00Z"
CONTRAST_HOURS = 708.73


def iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%d %H:%M UTC")


def parse(t: str) -> datetime:
    return datetime.fromisoformat(t)


def site_exists(client: httpx.Client, site_id: str) -> bool:
    try:
        get(client, f"/sites/{site_id}")
        return True
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return False
        raise


def occluder_text(event: dict[str, Any]) -> str:
    occ = event.get("occluder") or {}
    if not occ:
        return "no Occluder reported"
    name = occ.get("feature") or {}
    label = name.get("name") if isinstance(name, dict) else name
    where = f"{occ['distance_m'] / 1000:.1f} km at azimuth {occ['azimuth_deg']:.1f}°"
    return f"{label}, {where}" if label else where


def entry(
    validation_id: str,
    title: dict[str, str],
    reference: str,
    tolerance: dict[str, str],
    result: dict[str, str],
    status: str,
    not_covered: dict[str, str],
    run_at: str,
) -> dict[str, Any]:
    return {
        "id": validation_id,
        "title": title,
        "reference": reference,
        "tolerance": tolerance,
        "result": result,
        "status": status,
        "not_covered": not_covered,
        "script_path": SCRIPT,
        "run_at": run_at,
    }


def check_bg1(client: httpx.Client, run_at: str, engine: str) -> tuple[dict[str, Any], Any]:
    title = proof.text(
        "Blue Ghost 1 Sunset vs end of the mission", "Sunset do Blue Ghost 1 contra o fim da missão"
    )
    reference = (
        "Firefly press release 17/03/2025: final data ~23:15 UTC 16/03/2025, "
        f"just over 5 h into the lunar night | live: {API}, engine {engine}"
    )
    tolerance = proof.text(
        "our Sunset 5 to 6 h before the final data",
        "nosso Sunset de 5 a 6 h antes dos últimos dados",
    )
    not_covered = proof.text(
        "The 17:15-18:15 UTC band is inferred from the press release phrase 'just over 5 hours "
        "into the lunar night', not from a published sunset instant; no primary source with the "
        "local sunset time was found yet. Our Sunset is when the last edge of the Sun's disc goes "
        "behind the terrain, which need not be what a mission release calls the start of night. "
        "The deploy's SLDEM2015 crop resampled the terrain on a grid shifted by a fraction of a "
        "pixel and made a false wall. The corrected crop gives 19:44:27 UTC. "
        "Landing point from the CLPS SPICE archive, terrain from SLDEM2015 (~59 m). "
        "Compared after the numbers were known, so not a check: JPL Horizons puts the Sun's "
        "centre on the geometric horizon (no terrain) at 20:10:39 UTC on 16/03/2025 "
        "(docs/validation/sources-wueller-blue-ghost.md), 26 min after our terrain Sunset; the rule's "
        "band sits about 2 h before that. The check stays failed against the original rule.",
        "A faixa de 17:15 a 18:15 UTC vem da frase 'just over 5 hours into the lunar night' do "
        "comunicado, não de um instante de pôr do Sol publicado; ainda não achamos fonte primária "
        "com a hora do pôr do Sol no local. Nosso Sunset é quando a última borda do disco do Sol "
        "some atrás do relevo, o que pode não ser o que um comunicado chama de início da noite. "
        "O recorte do SLDEM2015 no deploy reamostrava o relevo numa grade deslocada de fração de "
        "pixel e criava uma parede falsa. O recorte corrigido dá 19h44m27 UTC. "
        "Ponto de pouso do arquivo SPICE do CLPS, relevo do SLDEM2015 (~59 m). "
        "Comparado depois de conhecer os números, então não é checagem: o JPL Horizons põe o "
        "centro do Sol no horizonte geométrico (sem relevo) às 20:10:39 UTC de 16/03/2025 "
        "(docs/validation/sources-wueller-blue-ghost.md), 26 min depois do nosso Sunset com relevo; a "
        "faixa da regra fica umas 2 h antes disso. A checagem continua failed contra a regra original.",
    )
    if not site_exists(client, "BG1"):
        res = proof.text(
            "did not run: the API does not serve Site BG1 yet",
            "não rodou: a API ainda não serve o Site BG1",
        )
        return entry(
            "landing-blue-ghost-1", title, reference, tolerance, res, "pending", not_covered, run_at
        ), None
    answer = get(
        client,
        "/visibility",
        site_id="BG1",
        start=BG1_WINDOW_START,
        duration_hours=BG1_WINDOW_HOURS,
        observer_height_m=2,
    )
    sunsets = [
        e for e in answer["events"] if e["type"] == "sunset" and parse(e["t"]) <= BG1_FINAL_DATA
    ]
    if not sunsets:
        res = proof.text("no Sunset before the final data", "nenhum Sunset antes dos últimos dados")
        return entry(
            "landing-blue-ghost-1", title, reference, tolerance, res, "failed", not_covered, run_at
        ), answer["events"]
    sunset = sunsets[-1]
    before_h = (BG1_FINAL_DATA - parse(sunset["t"])).total_seconds() / 3600
    status = "passed" if BG1_MIN_BEFORE_H <= before_h <= BG1_MAX_BEFORE_H else "failed"
    occ = occluder_text(sunset)
    res = proof.text(
        f"our Sunset {iso(parse(sunset['t']))}, {before_h:.2f} h before the final data; Occluder: {occ}",
        f"nosso Sunset {iso(parse(sunset['t']))}, {before_h:.2f} h antes dos últimos dados; Occluder: {occ}".replace(
            ".", ","
        ),
    )
    raw = {"sunset": sunset, "hours_before_final_data": before_h, "events": answer["events"]}
    return entry(
        "landing-blue-ghost-1", title, reference, tolerance, res, status, not_covered, run_at
    ), raw


def check_ch3(client: httpx.Client, run_at: str, engine: str) -> tuple[dict[str, Any], Any]:
    title = proof.text(
        "Chandrayaan-3 Sunset vs ISRO sleep date",
        "Sunset do Chandrayaan-3 contra a data em que a ISRO o pôs para dormir",
    )
    reference = (
        "ISRO Chandrayaan-3 updates: lander and rover in sleep mode on 04/09/2023, awakening "
        f"expected around 22/09/2023 | live: {API}, engine {engine}"
    )
    tolerance = proof.text(
        "our Sunset after 04/09/2023 (ISRO slept them before sunset)",
        "nosso Sunset depois de 04/09/2023 (a ISRO os pôs para dormir antes do pôr do Sol)",
    )
    not_covered = proof.text(
        "ISRO put the lander and rover to sleep before the local sunset, as an operations "
        "decision, and its updates page gives the date (04/09/2023) but no time for the sleep or "
        "for the expected sunset. So this only checks that our first Sunset in the Window does not "
        "come before that date; it is not a comparison with a measured instant. The awakening "
        "expected around 22/09/2023 is not checked. Terrain from the PGDA 60°S DEMs.",
        "A ISRO pôs o módulo e o rover para dormir antes do pôr do Sol local, por decisão de "
        "operação, e a página de atualizações dá a data (04/09/2023), mas não a hora do repouso "
        "nem a do pôr do Sol esperado. Então isto só confere que o nosso primeiro Sunset na Window "
        "não vem antes dessa data; não é comparação com um instante medido. O despertar esperado "
        "por volta de 22/09/2023 não é conferido. Relevo dos DEMs PGDA de 60°S.",
    )
    if not site_exists(client, "CH3"):
        res = proof.text(
            "did not run: the API does not serve Site CH3 yet (the requirement)",
            "não rodou: a API ainda não serve o Site CH3 (the requirement)",
        )
        return entry(
            "landing-chandrayaan-3",
            title,
            reference,
            tolerance,
            res,
            "pending",
            not_covered,
            run_at,
        ), None
    try:
        answer = get(
            client,
            "/visibility",
            site_id="CH3",
            start=CH3_WINDOW_START,
            duration_hours=CH3_WINDOW_HOURS,
            observer_height_m=2,
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 422:
            raise
        res = proof.text(
            "did not run: the engine's Window coverage does not reach 2023",
            "não rodou: a cobertura de Window do motor não chega a 2023",
        )
        return entry(
            "landing-chandrayaan-3",
            title,
            reference,
            tolerance,
            res,
            "pending",
            not_covered,
            run_at,
        ), None
    sunsets = [e for e in answer["events"] if e["type"] == "sunset"]
    if not sunsets:
        res = proof.text("no Sunset in the Window", "nenhum Sunset na Window")
        return entry(
            "landing-chandrayaan-3", title, reference, tolerance, res, "failed", not_covered, run_at
        ), answer["events"]
    first = parse(sunsets[0]["t"])
    status = "passed" if first >= CH3_SLEEP else "failed"
    res = proof.text(
        f"our first Sunset {iso(first)}; Occluder: {occluder_text(sunsets[0])}",
        f"nosso primeiro Sunset {iso(first)}; Occluder: {occluder_text(sunsets[0])}".replace(
            ".", ","
        ),
    )
    return entry(
        "landing-chandrayaan-3", title, reference, tolerance, res, status, not_covered, run_at
    ), answer["events"]


def max_sun(client: httpx.Client, site_id: str) -> float:
    answer = get(
        client,
        "/visibility",
        site_id=site_id,
        start=CONTRAST_START,
        duration_hours=CONTRAST_HOURS,
        observer_height_m=2,
    )
    return float(max(s["sun"]["elevation_deg"] for s in answer["timeline"]["samples"]))


def contrast(client: httpx.Client, run_at: str, engine: str) -> tuple[dict[str, Any], Any]:
    title = proof.text(
        "Example: how high the Sun gets, Apollo 11 vs the pole",
        "Exemplo: até onde o Sol sobe, Apollo 11 contra o polo",
    )
    reference = f"Engine output only, Window from {CONTRAST_START}, one synodic month | live: {API}, engine {engine}"
    tolerance = proof.text(
        "none: an example, not a check", "nenhuma: é um exemplo, não uma checagem"
    )
    not_covered = proof.text(
        "Nothing is compared to a reference here.", "Nada é comparado com uma referência aqui."
    )
    if not site_exists(client, "APOLLO11"):
        res = proof.text(
            "did not run: the API does not serve Site APOLLO11 yet",
            "não rodou: a API ainda não serve o Site APOLLO11",
        )
        return entry(
            "example-sun-height-apollo11",
            title,
            reference,
            tolerance,
            res,
            "pending",
            not_covered,
            run_at,
        ), None
    a11, s001 = max_sun(client, "APOLLO11"), max_sun(client, "001")
    res = proof.text(
        f"highest Sun: {a11:.1f}° at Apollo 11, {s001:.1f}° at Site 001",
        f"Sol mais alto: {a11:.1f}° no Apollo 11, {s001:.1f}° no Site 001".replace(".", ","),
    )
    return entry(
        "example-sun-height-apollo11",
        title,
        reference,
        tolerance,
        res,
        "pending",
        not_covered,
        run_at,
    ), {"apollo11_max_sun_deg": a11, "site001_max_sun_deg": s001}


def main() -> None:
    run_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    with httpx.Client(headers={"User-Agent": "terminators-lunar-validation"}) as client:
        engine = get(client, "/meta")["engine_version"]
        bg1, bg1_raw = check_bg1(client, run_at, engine)
        ch3, ch3_raw = check_ch3(client, run_at, engine)
        ex, ex_raw = contrast(client, run_at, engine)
    entries = [bg1, ch3, ex]
    OUTPUT.write_text(
        json.dumps(
            {
                "run_at": run_at,
                "api": API,
                "engine_version": engine,
                "entries": entries,
                "raw": {"bg1": bg1_raw, "ch3": ch3_raw, "contrast": ex_raw},
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "utf-8",
    )
    for e in entries:
        print(e["id"], e["status"], e["result"]["en"])
    print(f"merged into {proof.write_live_only()}")


if __name__ == "__main__":
    main()
