"""Pull the equal-false-alarm arm of Eduardo's Monte Carlo out of his commit, once.

`backend/app/data/hazard/tiles.json` (built by import_eduardo_bundle.py) holds his four
methods and his trade-off curves, but not the control he calls fair: the Normal grid with a
uniform margin chosen, per tile, to have the same false alarm as Multiresolution P90. That
arm is in each tile's `resumo.json` under "Grade 60 m + margem (mesmo falso alarme da tese
P90)" (and the same with 20 m). This script copies those numbers, and next to them the
Multiresolution P90 numbers of the same file, into `validation/data/hazard_equal_false_alarm.json`,
so the test can recompute his Table 06 offline. Nothing is rounded or recomputed.

    uv run --project backend python validation/hazard/extract_equal_false_alarm.py

It reads the commit with `git show`, so it needs his branch fetched; the test does not.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import rules

ROOT = Path(__file__).resolve().parents[2]
TILES_JSON = ROOT / "backend" / "app" / "data" / "hazard" / "tiles.json"
OUT = ROOT / "validation" / "data" / "hazard_equal_false_alarm.json"
FOLDERS = {60: "resultados", 20: "resultados_20m"}


def show(path: str) -> str:
    return subprocess.run(
        ["git", "show", f"{rules.COMMIT}:{path}"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def mean(entry: dict[str, list[float]], key: str) -> float:
    return entry[key][0]


def build() -> dict[str, Any]:
    tiles = sorted(json.loads(TILES_JSON.read_text("utf-8"))["tiles"])
    out: dict[str, Any] = {}
    for tile in tiles:
        out[tile] = {}
        for coarse, folder in FOLDERS.items():
            resumo = json.loads(
                show(f"simulacao_rover/monte_carlo_lola/{folder}/{tile}/resumo.json")
            )
            res = resumo["resumo"]
            grade = res[f"Grade {coarse} m"]
            fair = res[f"Grade {coarse} m + margem (mesmo falso alarme da tese P90)"]
            p90 = res["Tese P90 (margem nominal)"]
            out[tile][str(coarse)] = {
                "grade_missed_pct": mean(grade, "perigo_nao_vetado_%"),
                "grade_false_alarm_pct": mean(grade, "falso_alarme_%"),
                "grade_margin_missed_pct": mean(fair, "perigo_nao_vetado_%"),
                "grade_margin_false_alarm_pct": mean(fair, "falso_alarme_%"),
                "grade_margin_deg": resumo["margens_calibradas"]["grade_mesmoFA"][0],
                "p90_missed_pct": mean(p90, "perigo_nao_vetado_%"),
                "p90_false_alarm_pct": mean(p90, "falso_alarme_%"),
            }
    return {
        "source": {
            "branch": rules.BRANCH,
            "commit": rules.COMMIT,
            "files": "simulacao_rover/monte_carlo_lola/{resultados,resultados_20m}/<tile>/resumo.json",
            "arm": "Grade N m + margem (mesmo falso alarme da tese P90), bisection on 20 "
            "calibration draws (mc_lola.py), against Tese P90 (margem nominal)",
            "units": "percent, mean over the 100 draws of each tile",
        },
        "tiles": out,
    }


if __name__ == "__main__":
    OUT.write_text(json.dumps(build(), indent=1, ensure_ascii=False) + "\n", "utf-8")
    print(f"wrote {OUT}")
