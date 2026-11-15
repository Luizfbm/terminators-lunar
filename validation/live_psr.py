"""Live check of the nearest permanently shadowed region against Wueller et al. 2026.

Wueller et al. 2026 kept only Sites with a permanently shadowed region within 2 km, so
each of their 130 Sites should get `permanent_shadow.distance_m` ≤ 2000 from the public
API, which reads the real map (PGDA product 69, LPSR_85S_060M_201608). The repo has no
copy of that map, so this runs against https://lunar-api.luizfbm.win after the map is on
the server, one request at a time, and writes `validation/data/live_psr.json`;
`proof.write` merges it into what `/validations` serves.

    uv run --project backend python validation/live_psr.py

The rule is fixed for validation: a Site agrees when the field is there and the
distance is at most 2000 m; the check passes when all 130 agree. The count is reported
either way. Never change the rule or the 2 km to make it pass.
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
SCRIPT = "validation/live_psr.py"
DATA = Path(__file__).resolve().parent / "data"
WUELLER_CSV = DATA / "wueller2026_sites.csv"
OUTPUT = DATA / "live_psr.json"
WITHIN_M = 2000.0


def site_ids() -> list[str]:
    with open(WUELLER_CSV, encoding="utf-8") as f:
        return [row["sitio"] for row in csv.DictReader(f)]


def nearest(client: httpx.Client, site_id: str) -> dict[str, Any]:
    time.sleep(PAUSE_S)
    response = client.get(f"{API}/terrain", params={"site_id": site_id}, timeout=60)
    if response.status_code != 200:
        return {"site": site_id, "distance_m": None, "error": f"HTTP {response.status_code}"}
    payload = response.json()
    if "permanent_shadow" not in payload:
        return {"site": site_id, "distance_m": None, "error": "field left out (no map)"}
    shadow = payload["permanent_shadow"]
    if shadow is None:
        return {"site": site_id, "distance_m": None, "error": "none within the search radius"}
    return {
        "site": site_id,
        "distance_m": shadow["distance_m"],
        "azimuth_deg": shadow["azimuth_deg"],
        "product": shadow["product"],
        "error": None,
    }


def main() -> None:
    run_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    with httpx.Client(headers={"User-Agent": "terminators-lunar-validation"}) as client:
        meta = client.get(f"{API}/meta", timeout=60).json()
        table = [nearest(client, site) for site in site_ids()]
    agree = [r for r in table if r["distance_m"] is not None and r["distance_m"] <= WITHIN_M]
    total = len(table)
    products = sorted({r["product"] for r in table if r.get("product")})
    passed = len(agree) == total
    entry = {
        "id": "wueller2026-psr-within-2-km",
        "title": proof.text(
            "Permanent shadow within 2 km of the 130 Sites of Wueller et al. 2026",
            "Sombra permanente a até 2 km dos 130 Sites de Wueller et al. 2026",
        ),
        "reference": (
            "Wueller et al. 2026, JGR Planets 131(3), e2025JE009434: every Site has a PSR within "
            f"2 km | map: {', '.join(products) or 'none'} (PGDA product 69) | live: {API}, "
            f"engine {meta['engine_version']}"
        ),
        "tolerance": proof.text("all 130 within 2000 m", "todos os 130 a até 2000 m"),
        "result": proof.text(
            f"{len(agree)} of {total} Sites within 2 km",
            f"{len(agree)} de {total} Sites a até 2 km",
        ),
        "status": "passed" if passed else "failed",
        "not_covered": proof.text(
            "Distance to the centre of the nearest 60 m shadowed cell of the PGDA map; every shadowed cell counts, however small the patch. Checked live against the public API, not in CI.",
            "Distância ao centro da célula de 60 m sombreada mais próxima no mapa do PGDA; toda célula sombreada conta, por menor que seja a mancha. Conferido ao vivo na API pública, fora do CI.",
        ),
        "script_path": SCRIPT,
        "run_at": run_at,
    }
    OUTPUT.write_text(
        json.dumps(
            {"run_at": run_at, "api": API, "meta": meta, "entries": [entry], "table": table},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "utf-8",
    )
    print(f"wrote {OUTPUT}")
    print(entry["status"], entry["result"]["en"])
    for row in table:
        if row not in agree:
            print("  disagrees:", row)
    proof.write_live_only()
    print(f"merged into {proof.output_path()}")


if __name__ == "__main__":
    main()
