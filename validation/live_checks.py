"""Live checks against the public API, which runs on the full polar DEMs.

The DEM fixtures in this repo only cover about 20 km around the pole, so these checks
cannot run in CI. They ask https://lunar-api.luizfbm.win one request at a time, compare
with published references and write the results to `validation/data/live_results.json`.
`proof.write` merges that file into what `/validations` serves, so every pytest run of
the suite keeps the latest live results.

    uv run --project backend python validation/live_checks.py

Tolerances and pass rules below are fixed for validation. Never change them to
make a check pass.
"""

from __future__ import annotations

import csv
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
import proof

API = "https://lunar-api.luizfbm.win"
PAUSE_S = 1.0
SCRIPT = "validation/live_checks.py"
DATA = Path(__file__).resolve().parent / "data"
WUELLER_CSV = DATA / "wueller2026_sites.csv"
OUTPUT = DATA / "live_results.json"

# Wueller et al. 2026: longest run of consecutive sunlit days inside the southern
# mid-summer window of each year (subsolar latitude <= -1.5 deg), 2 m panel height.
# The 2026 window is 06/11-27/11, 21 days, as defined by the cited source data.
WUELLER_YEAR = 2026
WUELLER_START = "2026-11-06T00:00:00Z"
WUELLER_HOURS = 21 * 24
# Tolerance for Wueller 2026: "within 1 day".
WUELLER_TOL_DAYS = 1.0

# IM-2 Athena: landed ~11:30 CST 06/03/2025, mission ended ~00:15 CST 07/03/2025
# (NASA release 25-025, Spaceflight Now 07/03/2025). CST = UTC-6.
IM2_START = "2025-03-06T17:30:00Z"
IM2_HOURS = 12.75


def get(client: httpx.Client, path: str, **params: Any) -> Any:
    """One request; a 5xx from the gateway gets one retry after a longer pause."""
    for attempt in (1, 2):
        time.sleep(PAUSE_S if attempt == 1 else 10.0)
        response = client.get(f"{API}{path}", params=params, timeout=120)
        if response.status_code < 500 or attempt == 2:
            response.raise_for_status()
            return response.json()
    raise AssertionError("unreachable")


def wueller_rows() -> list[dict[str, str]]:
    with open(WUELLER_CSV, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def check_wueller(client: httpx.Client, run_at: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    for row in wueller_rows():
        site = row["sitio"]
        published = float(row[f"dias_sol_{WUELLER_YEAR}"])
        try:
            answer = get(
                client,
                "/visibility",
                site_id=site,
                start=WUELLER_START,
                duration_hours=WUELLER_HOURS,
                observer_height_m=2,
            )
            ours = answer["metrics"]["lcip_hours"] / 24.0
            error = None
        except httpx.HTTPError as exc:
            ours, error = None, str(exc)
        diff = None if ours is None else ours - published
        rows.append(
            {
                "site": site,
                "published_days": published,
                "ours_days": None if ours is None else round(ours, 3),
                "diff_days": None if diff is None else round(diff, 3),
                "error": error,
            }
        )
        print(
            f"{site:12s} published {published:5.1f}  ours {ours if ours is None else round(ours, 2)}"
        )

    answered = [r for r in rows if r["diff_days"] is not None]
    within = [r for r in answered if abs(r["diff_days"]) <= WUELLER_TOL_DAYS]
    worst = max(answered, key=lambda r: abs(r["diff_days"])) if answered else None
    status = "passed" if answered and len(within) == len(rows) else "failed"
    n, k = len(rows), len(within)
    # Reported, not used for the pass rule.
    nonzero = [r for r in answered if r["published_days"] > 0]
    nz_within = sum(abs(r["diff_days"]) <= WUELLER_TOL_DAYS for r in nonzero)
    zeros = sum(r["published_days"] == 0 for r in rows)
    unanswered = [r["site"] for r in rows if r["diff_days"] is None]
    worst_en = worst_pt = ""
    if worst:
        worst_en = f"; largest gap {worst['diff_days']:+.2f} d at {worst['site']}"
        worst_pt = f"; maior diferença {worst['diff_days']:+.2f} d em {worst['site']}".replace(
            ".", ","
        )
    entry = {
        "id": "wueller2026-sunlit-days",
        "title": proof.text(
            "Consecutive sunlit days at the Artemis Sites vs Wueller et al. 2026",
            "Dias seguidos de Sol nos Sites do Artemis contra Wueller et al. 2026",
        ),
        "reference": (
            "Wueller et al. 2026, JGR Planets 131(3), e2025JE009434, data Zenodo 17084058: "
            f"longest run of sunlit days in the {WUELLER_YEAR} southern mid-summer (06/11-27/11), 2 m"
        ),
        "tolerance": proof.text(
            f"≤ {WUELLER_TOL_DAYS:g} day per Site", f"≤ {WUELLER_TOL_DAYS:g} dia por Site"
        ),
        "result": proof.text(
            f"{k} of {n} Sites within 1 day{worst_en}. Of the {len(nonzero)} with a published "
            f"value above 0, {nz_within} within 1 day. {zeros} Sites are published as 0 days"
            + (f"; no answer for {', '.join(unanswered)}" if unanswered else "")
            + ".",
            f"{k} de {n} Sites dentro de 1 dia{worst_pt}. Dos {len(nonzero)} com valor publicado "
            f"acima de 0, {nz_within} dentro de 1 dia. {zeros} Sites aparecem publicados com 0 dia"
            + (f"; sem resposta para {', '.join(unanswered)}" if unanswered else "")
            + ".",
        ),
        "status": status,
        "not_covered": proof.text(
            f"Only {WUELLER_YEAR}. Wueller used LROC QuickMap TerrainShadows on a 60 m map, 12 h steps "
            "and shadows to 150 km; we use 20/80/240 m DEMs to 300 km and 15 min steps, and count "
            "any part of the Sun's disc as sunlit. "
            "Not the same quantity: they publish a 60 m pixel, we answer for a point, and their own map "
            "changes by many days within ±180 m (CR01: 1.5 to 15 days around a 3.5 day pixel). Ours falls "
            "within ±1 day of that ±180 m range at 90 of 130 Sites. Their values are truncated to whole "
            "days. MMO07 to MMO10 are blank in the source for 2025-2028 and published as 0 (the paper's "
            "rasters give MMO09 19.5 days in 2026); they still count against us here. Our engine agrees "
            "with an independent DEM walk at CR01 and NR204; see docs/validation/wueller-2026.md. Checked "
            "live against the public API, not in CI.",
            f"Só {WUELLER_YEAR}. O Wueller usou o TerrainShadows do LROC QuickMap num mapa de 60 m, passos "
            "de 12 h e sombras até 150 km; nós usamos DEMs de 20/80/240 m até 300 km e passos de 15 min, "
            "e contamos qualquer parte do disco do Sol como Sol. "
            "Não é a mesma grandeza: eles publicam um pixel de 60 m, nós respondemos por um ponto, e o "
            "próprio mapa deles muda muitos dias em ±180 m (CR01: de 1,5 a 15 dias em volta de um pixel de "
            "3,5). O nosso cai a ±1 dia dessa faixa de ±180 m em 90 de 130 Sites. Os valores deles são "
            "truncados em dias inteiros. MMO07 a MMO10 estão em branco na fonte em 2025-2028 e publicados "
            "como 0 (os rasters do artigo dão 19,5 dias para MMO09 em 2026); mesmo assim contam contra nós "
            "aqui. O nosso motor bate com uma caminhada independente do DEM em CR01 e NR204; veja "
            "docs/validation/wueller-2026.md. Conferido ao vivo na API pública, fora do CI.",
        ),
        "script_path": SCRIPT,
        "run_at": run_at,
    }
    return entry, rows


def check_im2(client: httpx.Client, run_at: str) -> tuple[dict[str, Any], dict[str, Any]]:
    answer = get(
        client,
        "/visibility",
        site_id="IM2",
        start=IM2_START,
        duration_hours=IM2_HOURS,
        observer_height_m=2,
    )
    m = answer["metrics"]
    elevations = [s["sun"]["elevation_deg"] for s in answer["timeline"]["samples"]]
    events = [e["type"] for e in answer["events"]]
    raw = {
        "metrics": m,
        "events": answer["events"],
        "sun_elevation_range_deg": [min(elevations), max(elevations)] if elevations else None,
    }
    el = f"{min(elevations):.2f}° to {max(elevations):.2f}°" if elevations else "n/a"
    entry = {
        "id": "landing-im2-athena",
        "title": proof.text("IM-2 Athena landing point", "Ponto de pouso do IM-2 Athena"),
        "reference": (
            "LROC 1408 (resting point -84.7906°, 29.1957°); NASA 25-025 and Spaceflight Now: "
            "landed ~17:30 UTC 06/03/2025, mission ended ~06:15 UTC 07/03/2025"
        ),
        "tolerance": proof.text("no comparable number", "sem número comparável"),
        "result": proof.text(
            f"engine at the resting point: sunlit {m['sunlit_hours']:.2f} h of 12.75 h, "
            f"mean Sun fraction {m['mean_sun_fraction']:.2f}, Sun elevation {el}, events: {', '.join(events) or 'none'}",
            (
                f"motor no ponto final: Sol {m['sunlit_hours']:.2f} h de 12,75 h, "
                f"fração média do Sol {m['mean_sun_fraction']:.2f}, elevação do Sol {el}, eventos: "
                f"{', '.join(events) or 'nenhum'}"
            ).replace(".", ","),
        ),
        "status": "pending",
        "not_covered": proof.text(
            "Athena tipped over inside a ~20 m crater, smaller than our 20 m DEM resolves, and its "
            "panels faced away from the Sun. The end of the mission was not a terrain Sunset, so there "
            "is no published time to compare. This only shows what the engine says about the grazing "
            "Sun at the reconstructed point.",
            "O Athena tombou dentro de uma cratera de ~20 m, menor do que o DEM de 20 m resolve, e os "
            "painéis ficaram de costas para o Sol. O fim da missão não foi um Sunset do terreno, então não "
            "há horário publicado para comparar. Isto só mostra o que o motor diz do Sol rasante no ponto "
            "reconstruído.",
        ),
        "script_path": SCRIPT,
        "run_at": run_at,
    }
    return entry, raw


def pending_landing(
    validation_id: str, en: str, pt: str, reference: str, run_at: str
) -> dict[str, Any]:
    return {
        "id": validation_id,
        "title": proof.text(f"{en} Sunset", f"Sunset do {pt}"),
        "reference": reference,
        "tolerance": proof.text("not set yet", "ainda não definida"),
        "result": proof.text("did not run", "não rodou"),
        "status": "pending",
        "not_covered": proof.text(
            "Waiting on the requirement: the landing point is outside the polar DEM, so the engine cannot "
            "answer it yet. The tolerance will be defined with the validation.",
            "Espera a the requirement: o ponto de pouso fica fora do DEM polar, então o motor ainda não "
            "responde. A tolerância será escrita antes da primeira rodada.",
        ),
        "script_path": SCRIPT,
        "run_at": run_at,
    }


def main() -> None:
    run_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    with httpx.Client(headers={"User-Agent": "terminators-lunar-validation"}) as client:
        meta = get(client, "/meta")
        wueller_entry, wueller_table = check_wueller(client, run_at)
        # The engine's numbers at Athena's resting point, kept as raw data. The Proof entry
        # landing-im2-athena is written by test_athena.py since the requirement.
        _, im2_raw = check_im2(client, run_at)
    entries = [
        wueller_entry,
        pending_landing(
            "landing-blue-ghost-1",
            "Blue Ghost 1",
            "Blue Ghost 1",
            "NASA, end of the Blue Ghost Mission 1 surface operations (date to be cited with the implementation)",
            run_at,
        ),
        pending_landing(
            "landing-chandrayaan-3",
            "Chandrayaan-3",
            "Chandrayaan-3",
            "ISRO, date the Vikram lander was put to sleep (date to be cited with the implementation)",
            run_at,
        ),
    ]
    for e in entries:
        e["reference"] += f" | live: {API}, engine {meta['engine_version']}"
    OUTPUT.write_text(
        json.dumps(
            {
                "run_at": run_at,
                "api": API,
                "engine_version": meta["engine_version"],
                "meta": meta,
                "entries": entries,
                "wueller_table": wueller_table,
                "im2": im2_raw,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "utf-8",
    )
    print(f"wrote {OUTPUT}")
    for e in entries:
        print(e["id"], e["status"], e["result"]["en"])
    proof.write_live_only()
    print(f"merged into {proof.output_path()}")


if __name__ == "__main__":
    main()
