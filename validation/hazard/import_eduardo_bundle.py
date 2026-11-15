"""Build the backend's hazard data from Eduardo's branch (the requirement), once.

Eduardo's multiresolution work lives on `origin/eduardo/cockpit-multirresolucao`, a research
workspace with no common history with main. This script reads, at a fixed commit, only what the
app serves:

- `src/assets/tese_bundle/pgda78/<tile>.json`: the 26 PGDA 78 grids (central 10 x 10 km of each
  tile, 200 x 200 cells of 50 m), built by his `src/build_map_bundle.py` from the official 5 m
  layers surf, ldec, slp and slperr (PGDA product 78, Barker et al. 2021);
- `src/assets/tese_bundle/sites_master.json`: each tile's centre, LROC NAC survey and terrain
  statistics, and each Wueller Site's nearest tile;
- `simulacao_rover/monte_carlo_lola/resultados{,_20m}/<tile>/resumo.json`: his Monte Carlo
  (`mc_lola.py`) from the 60 m and the 20 m grid;
- `docs/tabelas_tese/sitios_numerados.csv`: the share of 5 m cells with a laser shot inside each
  Site's Landing ellipse (`ldec5`, from LDEC_875S_5M by his `analise_cobertura_lola.py`).

It writes `backend/app/data/hazard/grids.npz` (the arrays, as stored in the bundle) and
`backend/app/data/hazard/tiles.json` (everything else, in the contract's units: fractions from 0
to 1, not percentages). Nothing is recomputed or rounded beyond what the bundle holds.

    uv run --project backend python validation/hazard/import_eduardo_bundle.py
"""

from __future__ import annotations

import base64
import csv
import io
import json
import subprocess
from pathlib import Path
from typing import Any

import numpy as np

COMMIT = "2195fcb"
BRANCH = "origin/eduardo/cockpit-multirresolucao"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "backend" / "app" / "data" / "hazard"
METHODS = (
    ("normal", None, "Grade {coarse} m"),
    ("multiresolution", "P50", "Tese P50 (margem nominal)"),
    ("multiresolution", "P90", "Tese P90 (margem nominal)"),
    ("multiresolution", "P99", "Tese P99 (margem nominal)"),
)
FALSE_ALARMS = (5, 10, 15, 20, 25, 30)


def show(path: str) -> str:
    return subprocess.run(
        ["git", "show", f"{COMMIT}:{path}"], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def interval(values: list[float], scale: float) -> dict[str, float]:
    mean, low, high = values
    return {"mean": mean * scale, "low": low * scale, "high": high * scale}


def run(tile: str, coarse: int, flat: dict[str, Any]) -> dict[str, Any]:
    folder = "resultados" if coarse == 60 else "resultados_20m"
    resumo = json.loads(show(f"simulacao_rover/monte_carlo_lola/{folder}/{tile}/resumo.json"))
    res, par, tests = resumo["resumo"], resumo["parametros"], resumo["testes"]
    assert par["grossa"] == coarse and par["limite"] == 15.0, (tile, par)
    methods = []
    for navigation, level, key in METHODS:
        m = res[key.format(coarse=coarse)]
        methods.append(
            {
                "navigation": navigation,
                "confidence_level": level,
                "missed_hazard": interval(m["perigo_nao_vetado_%"], 0.01),
                "false_alarm": interval(m["falso_alarme_%"], 0.01),
                "coverage": interval(m["cobertura_%"], 0.01),
                "mean_abs_error_deg": interval(m["erro_abs_medio"], 1.0),
            }
        )
    return {
        "coarse_m": coarse,
        "cells_checked": tests["n_celulas_conferidas"],
        "draws": par["sorteios"],
        "folds": par["dobras"],
        "seed": par["semente"],
        "methods": methods,
        "trade_off": {
            "normal": [
                {"false_alarm": f / 100, "missed_hazard": flat[f"curva_grade_FA{f}"] / 100}
                for f in FALSE_ALARMS
            ],
            "multiresolution": [
                {"false_alarm": f / 100, "missed_hazard": flat[f"curva_tese_FA{f}"] / 100}
                for f in FALSE_ALARMS
            ],
        },
        "median_error_deg": {
            "normal": tests["erro_abs_mediano_grade"],
            "multiresolution": tests["erro_abs_mediano_tese"],
        },
        "paired_tests": {
            "mcnemar_b": tests["mcnemar_b_so_grade_detecta"],
            "mcnemar_c": tests["mcnemar_c_so_tese_detecta"],
            "mcnemar_p": tests["mcnemar_p"],
            "wilcoxon_p": tests["wilcoxon_p_erro_abs_grade_vs_tese"],
            "wilcoxon_n": tests["n_wilcoxon"],
        },
    }


def main() -> None:
    master = json.loads(show("src/assets/tese_bundle/sites_master.json"))
    ellipse = {
        row["sitio"]: float(row["ldec5"]) / 100
        for row in csv.DictReader(io.StringIO(show("docs/tabelas_tese/sitios_numerados.csv")))
        if row["ldec5"]
    }
    arrays: dict[str, np.ndarray] = {}
    tiles: dict[str, Any] = {}
    for p in master["pgda78"]:
        tile = p["sitio"]
        raw = json.loads(show(f"src/assets/tese_bundle/pgda78/{tile}.json"))
        n = raw["n"]
        for key, dtype in (
            ("surf_i16", "<i2"),
            ("slp5_u8", "u1"),
            ("slp20_u8", "u1"),
            ("slp60_u8", "u1"),
            ("slperr_u8", "u1"),
            ("ldec_u8", "u1"),
        ):
            arrays[f"{tile}/{key}"] = np.frombuffer(
                base64.b64decode(raw[key]), dtype=dtype
            ).reshape(n, n)
        st, lroc = p["terrain_stats"], p["lroc"]
        tiles[tile] = {
            "id": tile,
            "latitude_deg": p["lat"],
            "longitude_deg": p["lon"],
            "n": n,
            "cell_m": raw["cell_m"],
            "span_m": raw["span_km"] * 1000,
            "z_mid_m": raw["z_mid_m"],
            "z_min_m": raw["z_min_m"],
            "z_max_m": raw["z_max_m"],
            "scales": raw["scales"],
            "lroc": {
                "images_covering": lroc["n_cobrindo"],
                "best_resolution_m_px": lroc["melhor_res_m_px"],
                "best_incidence_deg": lroc["melhor_inc"],
                "best_product": lroc["melhor_produto"],
                "viewer_url": lroc["melhor_viewer"],
            },
            "stats": {
                "elevation_min_m": st["elev_min_m"],
                "elevation_max_m": st["elev_max_m"],
                "slope_median_deg": st["slp_median_deg"],
                "slope_p90_deg": st["slp_p90_deg"],
                "slope_max_deg": st["slp_max_deg"],
                "over_limit_fraction_5m": st["pct_over_15_real"] / 100,
                "over_limit_fraction_20m": st["pct_over_15_20m"] / 100,
                "over_limit_fraction_60m": st["pct_over_15_60m"] / 100,
                "slope_error_median_deg": st["slperr_median_deg"],
            },
            "grid_fraction": st["pct_ldec_pos"] / 100,
            "runs": [run(tile, 60, p["mc60"]), run(tile, 20, p["mc20"])],
        }
    sites = {
        s["code"]: {
            "nearest_tile": s.get("pgda78_match"),
            "nearest_tile_distance_km": s.get("pgda78_dist_km"),
            "ellipse_fraction": ellipse.get(s["code"]),
        }
        for s in master["sites"]
    }
    OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT / "grids.npz", **arrays)
    doc = {
        "source": {
            "branch": BRANCH,
            "commit": COMMIT,
            "grids": "PGDA product 78 (Barker et al. 2021, Planetary and Space Science 203, 105119), "
            "5 m surf, ldec, slp, slperr; central 10 x 10 km at 50 m by build_map_bundle.py",
            "monte_carlo": "mc_lola.py, 5 folds, 100 draws of Normal(slope, slperr), seed 2026, limit 15°",
            "ellipse_fraction": "LDEC_875S_5M inside the 100 m Landing ellipse, analise_cobertura_lola.py",
        },
        "tiles": tiles,
        "sites": sites,
    }
    (OUT / "tiles.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
