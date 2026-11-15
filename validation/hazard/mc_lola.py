"""Eduardo's Monte Carlo on the PGDA 78 layers, ported (the requirement).

A port of `simulacao_rover/monte_carlo_lola/mc_lola.py` (his commit 2195fcb), without the
figures and the HTML report, reading the PGDA 78 tiles from a folder instead of his project
tree. The arithmetic, the order of every random draw and the seeds are his, so the same
layers give his numbers (and the rerun on the server checks that they do: see
test_hazard_mc.py and rules.py, which hold the tolerance).

What it does. For a tile (a 10 x 10 km window at the centre of the 5 m layers surf, ldec,
slp, slperr of PGDA product 78, Barker et al. 2021, Planetary and Space Science 203, 105119):

- the coarse grid: the 5 m surface averaged in blocks (60 m: 12 x 12 cells, or 20 m: 4 x 4)
  and interpolated back to 5 m, with the slope computed from it ("Normal navigation");
- the multiresolution estimate ("Multiresolution"): the coarse grid plus the residual
  observed only where a laser shot exists (ldec > 0), spread by a Gaussian normalised
  convolution that goes to zero away from data, so it never invents relief;
- the truth: the product's own slope on the cells that have a shot, hidden from the method
  by 5-fold cross-validation (a fifth of the shot cells at a time), because over 90 % of the
  5 m cells are interpolated (ADR 0003);
- 100 Monte Carlo draws of each cell's "true" slope from Normal(slp, slperr), slperr being
  the product's per-cell error;
- the margins 1 + z * sigma (sigma 0.8 deg near data, 2.0 deg far, z = 0, 1.282, 2.326 for
  P50, P90, P99), the calibrated margins, the control that gives the grade a uniform margin
  with the same false alarm as Multiresolution P90 (bisection), the trade-off curves, and
  the paired tests on the official slope.

Needs scipy (ndimage, stats), which the backend does not depend on, so run it with
`--with scipy`; rasterio reads the GeoTIFFs. Nothing runs here without the layers (about
one gigabyte per tile set): the coordinator runs it on the server.

    uv run --project backend --with scipy python validation/hazard/mc_lola.py \\
        --pgda-dir /data/pgda78 --out /tmp/hazard/hazard_mc_rerun.json

The folder holds one directory per tile, `<tile>/<tile>_final_adj_5mpp_<layer>.tif`, as
fetch_pgda78.py leaves it. The output is resumable: every finished (tile, grid) is appended
to `<out>.partial.jsonl`, and a second run carries on from there (`--fresh` starts over).
`--sorteios` and `--limit` shorten it for a smoke run; the output then says `"smoke": true`
and test_hazard_mc.py refuses it.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import rasterio  # type: ignore[import-untyped]

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rules

Array = npt.NDArray[Any]

CEL = 5.0  # m per cell of the LOLA 5 m layers
LAYERS = ("surf", "ldec", "slp", "slperr")
TILES_JSON = (
    Path(__file__).resolve().parents[2] / "backend" / "app" / "data" / "hazard" / "tiles.json"
)
METHOD_KEYS = {
    "normal": "Grade {coarse} m",
    "P50": "Tese P50 (margem nominal)",
    "P90": "Tese P90 (margem nominal)",
    "P99": "Tese P99 (margem nominal)",
}


def scipy_modules() -> tuple[Any, Any]:
    """scipy, imported late: only the Monte Carlo needs it, and the backend does not ship it."""
    try:
        from scipy import ndimage, stats  # type: ignore[import-untyped,import-not-found,unused-ignore]
    except ImportError as error:  # pragma: no cover - the message is the point
        raise SystemExit(
            "mc_lola.py needs scipy: run it with `uv run --project backend --with scipy ...`"
        ) from error
    return ndimage, stats


def read_layer(path: Path) -> Array:
    with rasterio.open(path) as source:
        return np.asarray(source.read(1), dtype=np.float32)


def slope_deg(z: Array) -> Array:
    """Slope by central gradient, which is how the official slp layer is computed."""
    gy, gx = np.gradient(z, CEL)
    out: Array = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    return out


def coarse_grid(z: Array, block: int) -> Array:
    """Block means (block x block cells) and bilinear interpolation back to 5 m."""
    ndimage, _ = scipy_modules()
    ny, nx = z.shape
    by, bx = ny // block, nx // block
    zc = z[: by * block, : bx * block].reshape(by, block, bx, block).mean(axis=(1, 3))
    fy = np.clip((np.arange(ny) + 0.5) / block - 0.5, 0, by - 1)
    fx = np.clip((np.arange(nx) + 0.5) / block - 0.5, 0, bx - 1)
    return np.asarray(
        ndimage.map_coordinates(zc, np.meshgrid(fy, fx, indexing="ij"), order=1, mode="nearest"),
        dtype=np.float32,
    )


def multiresolution(
    z: Array, zg: Array, measured: Array, sigma_cells: float
) -> tuple[Array, Array]:
    """The coarse grid plus the residual (z - grid) observed only on the measured cells,
    spread by Gaussian normalised convolution. With little data the residual goes to zero.
    Returns the estimated surface and the local data density (0 to 1) used for the margin.
    """
    ndimage, _ = scipy_modules()
    m = measured.astype(np.float32)
    r = np.where(measured, z - zg, 0).astype(np.float32)
    num = ndimage.gaussian_filter(r, sigma_cells, mode="nearest")
    den = ndimage.gaussian_filter(m, sigma_cells, mode="nearest")
    weight = den / (den + 0.02)  # confidence in the local correction
    resid = np.where(den > 1e-6, num / np.maximum(den, 1e-6), 0) * weight
    ze = zg + resid
    ze = np.where(measured, z, ze)  # where there is a shot, the data wins
    return ze.astype(np.float32), den


def nominal_margin(den: Array, z: float) -> Array:
    """The shield's margin as in the simulator: 1 + z * sigma, sigma 0.8 deg near data (density
    at or above the median) and 2.0 deg far from it."""
    sig = np.where(den >= np.median(den), rules.SIGMA_NEAR_DEG, rules.SIGMA_FAR_DEG)
    return 1.0 + z * sig


def metrics(
    truth: Array, perigo: Array, estimate: Array, margin: Any, limit: float
) -> dict[str, float]:
    veta = estimate + margin > limit
    return {
        "perigos": int(perigo.sum()),
        "perigo_nao_vetado_%": 100 * (perigo & ~veta).sum() / max(1, perigo.sum()),
        "falso_alarme_%": 100 * (~perigo & veta).sum() / max(1, (~perigo).sum()),
        "cobertura_%": 100 * (truth <= estimate + margin).mean(),
        "erro_abs_medio": float(np.abs(estimate - truth).mean()),
    }


def summarise(lines: list[dict[str, Any]]) -> dict[str, dict[str, tuple[float, float, float]]]:
    names = list(dict.fromkeys(line["metodo"] for line in lines))
    out: dict[str, dict[str, tuple[float, float, float]]] = {}
    for name in names:
        rows = [line for line in lines if line["metodo"] == name]
        out[name] = {
            k: (
                float(np.mean([r[k] for r in rows])),
                float(np.percentile([r[k] for r in rows], 2.5)),
                float(np.percentile([r[k] for r in rows], 97.5)),
            )
            for k in ("perigo_nao_vetado_%", "falso_alarme_%", "cobertura_%", "erro_abs_medio")
        }
    return out


def analyse(
    layers: dict[str, Array],
    *,
    coarse: int,
    window: int = 2000,
    folds: int = rules.FOLDS,
    draws: int = rules.DRAWS,
    limit: float = rules.LIMIT_DEG,
    seed: int = rules.SEED,
    log: Any = None,
) -> dict[str, Any]:
    """One tile, one starting grid. The result has his `resumo.json` keys, less the curves'
    full arrays (only their value at each fixed false alarm is kept)."""
    _, stats = scipy_modules()
    say = log or (lambda *_: None)
    rng = np.random.default_rng(seed)
    block = round(coarse / CEL)
    z, ldec, slp, slperr = (layers[k] for k in LAYERS)
    ny0, nx0 = z.shape
    if window and window < min(ny0, nx0):
        r = window - window % block
        y0, x0 = (ny0 - r) // 2, (nx0 - r) // 2
        z, ldec, slp, slperr = (v[y0 : y0 + r, x0 : x0 + r] for v in (z, ldec, slp, slperr))
    else:
        r = min(ny0, nx0) - min(ny0, nx0) % block
        z, ldec, slp, slperr = (v[:r, :r] for v in (z, ldec, slp, slperr))
    measured = ldec > 0
    say(f"{z.size:,} cells, {measured.mean() * 100:.2f}% with a shot")

    zg = coarse_grid(z, block)
    sg = slope_deg(zg)

    sigma_cells = 1.0 / np.sqrt(max(measured.mean(), 1e-3)) / 2  # half the mean spacing of shots
    iy, ix = np.nonzero(measured)
    edge = (iy > block) & (iy < z.shape[0] - block) & (ix > block) & (ix < z.shape[1] - block)
    iy, ix = iy[edge], ix[edge]
    fold = rng.integers(0, folds, iy.size)
    reg: dict[str, list[Array]] = {k: [] for k in ("verd", "err", "grade", "tese", "den")}
    for d in range(folds):
        sel = fold == d
        m2 = measured.copy()
        m2[iy[sel], ix[sel]] = False  # hide 1/k of the shot cells
        ze, den = multiresolution(z, zg, m2, sigma_cells)
        se = slope_deg(ze)
        p = (iy[sel], ix[sel])
        reg["verd"].append(slp[p])
        reg["err"].append(slperr[p])
        reg["grade"].append(sg[p])
        reg["tese"].append(se[p])
        reg["den"].append(den[p])
    V = {k: np.concatenate(v) for k, v in reg.items()}
    n = V["verd"].size

    # Monte Carlo
    methods = {f"Grade {coarse} m": (V["grade"], np.zeros(n))}
    for k, zz in rules.Z_LEVELS.items():
        methods[f"Tese {k} (margem nominal)"] = (V["tese"], nominal_margin(V["den"], zz))
    methods["Tese P90 + 1° em encosta"] = (
        V["tese"],
        nominal_margin(V["den"], rules.Z_LEVELS["P90"]) + 1.0 * (V["grade"] > 10),
    )
    lines: list[dict[str, Any]] = []
    for s in range(draws):
        verd = V["verd"] + V["err"] * rng.standard_normal(n)
        perigo = verd > limit
        for name, (est, mg) in methods.items():
            lines.append({"sorteio": s, "metodo": name, **metrics(verd, perigo, est, mg, limit)})

    # calibration with the real quantiles of the error (near x far from data), 20 draws
    near = V["den"] >= np.median(V["den"])
    rc = np.random.default_rng(seed + 99991)  # calibration draws, independent of the evaluation
    E = np.concatenate(
        [
            V["verd"] + V["err"] * rc.standard_normal(n) - V["tese"]
            for _ in range(rules.CALIBRATION_DRAWS)
        ]
    )
    P = np.tile(near, rules.CALIBRATION_DRAWS)
    cal: dict[str, tuple[float, float]] = {}
    for k, q in (("P50", 0.50), ("P90", 0.90), ("P99", 0.99)):
        cal[k] = (float(np.quantile(E[P], q)), float(np.quantile(E[~P], q)))
        mg = np.where(near, cal[k][0], cal[k][1])
        for s in range(draws):
            verd = V["verd"] + V["err"] * np.random.default_rng(seed + 7 + s).standard_normal(n)
            perigo = verd > limit
            lines.append(
                {
                    "sorteio": s,
                    "metodo": f"Tese {k} (margem calibrada)",
                    **metrics(verd, perigo, V["tese"], mg, limit),
                }
            )

    # the fair control: the grade with a uniform margin (calibrated P90, and the same false
    # alarm as Multiresolution P90)
    Ec = [V["verd"] + V["err"] * rc.standard_normal(n) for _ in range(rules.CALIBRATION_DRAWS)]
    m_g90 = float(np.quantile(np.concatenate([e - V["grade"] for e in Ec]), 0.90))
    mt90 = nominal_margin(V["den"], rules.Z_LEVELS["P90"])

    def false_alarm(est: Array, mg: Any) -> float:
        return float(
            np.mean(
                [((e <= limit) & (est + mg > limit)).sum() / max(1, (e <= limit).sum()) for e in Ec]
            )
        )

    target = false_alarm(V["tese"], mt90)
    lo, hi = -5.0, 30.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if false_alarm(V["grade"], mid) > target:
            hi = mid
        else:
            lo = mid
    m_gfa = (lo + hi) / 2
    for name, uniform in (
        (f"Grade {coarse} m + margem P90 calibrada", m_g90),
        (f"Grade {coarse} m + margem (mesmo falso alarme da tese P90)", m_gfa),
    ):
        for s in range(draws):
            verd = V["verd"] + V["err"] * np.random.default_rng(seed + 7 + s).standard_normal(n)
            perigo = verd > limit
            lines.append(
                {
                    "sorteio": s,
                    "metodo": name,
                    **metrics(verd, perigo, V["grade"], uniform, limit),
                }
            )
    cal["grade_P90"] = (m_g90, m_g90)
    cal["grade_mesmoFA"] = (m_gfa, m_gfa)
    res = summarise(lines)

    # paired tests on the official slope, without draws: exact McNemar (hazards detected only
    # by the grade vs only by the multiresolution) and Wilcoxon (|error|)
    perigo0 = V["verd"] > limit
    vg = V["grade"] > limit
    vt = V["tese"] + mt90 > limit
    b = int((perigo0 & vg & ~vt).sum())
    c = int((perigo0 & ~vg & vt).sum())
    p_mc = stats.binomtest(c, b + c, 0.5).pvalue if b + c else 1.0
    idx = rng.choice(n, min(n, 20000), replace=False)
    wil = stats.wilcoxon(
        np.abs(V["grade"][idx] - V["verd"][idx]), np.abs(V["tese"][idx] - V["verd"][idx])
    )
    rho = stats.spearmanr(V["den"], np.abs(V["tese"] - V["verd"]))
    tests = {
        "mcnemar_b_so_grade_detecta": b,
        "mcnemar_c_so_tese_detecta": c,
        "mcnemar_p": float(p_mc),
        "wilcoxon_p_erro_abs_grade_vs_tese": float(wil.pvalue),
        "n_wilcoxon": int(idx.size),
        "erro_abs_mediano_grade": float(np.median(np.abs(V["grade"] - V["verd"]))),
        "erro_abs_mediano_tese": float(np.median(np.abs(V["tese"] - V["verd"]))),
        "spearman_densidade_vs_erro_rho": float(rho.statistic),
        "spearman_p": float(rho.pvalue),
        "n_perigos_oficiais": int(perigo0.sum()),
        "n_celulas_conferidas": int(n),
    }

    # trade-off curves: sweep the margin size of each family, 20 draws apart from the others
    rcv = np.random.default_rng(seed + 424242)
    nper = np.zeros(n)
    nseg = np.zeros(n)
    for _ in range(rules.CALIBRATION_DRAWS):
        vv = V["verd"] + V["err"] * rcv.standard_normal(n)
        pp = vv > limit
        nper += pp
        nseg += ~pp
    dens = nominal_margin(V["den"], rules.Z_LEVELS["P90"])
    families = {
        f"Grade {coarse} m, margem uniforme": (V["grade"], np.ones(n)),
        "Tese, margem por densidade de dado": (V["tese"], dens / dens.mean()),
    }
    curves: dict[str, dict[str, float]] = {}
    for name, (est, shape) in families.items():
        t = (limit - est) / shape  # the scale from which the cell is vetoed
        o = np.argsort(t)
        cp = np.cumsum(nper[o])
        cs = np.cumsum(nseg[o])
        fa = 100 * cs / max(nseg.sum(), 1)
        pnv = 100 * (1 - cp / max(nper.sum(), 1))
        curves[name] = {str(f): float(np.interp(f, fa, pnv)) for f in rules.FALSE_ALARM_TARGETS}

    return {
        "parametros": {
            "grossa": coarse,
            "recorte": window,
            "dobras": folds,
            "sorteios": draws,
            "limite": limit,
            "semente": seed,
        },
        "resumo": res,
        "testes": tests,
        "margens_calibradas": cal,
        "curvas_no_alvo": curves,
        "medido_fracao": float(measured.mean()),
    }


def contract_shape(result: dict[str, Any]) -> dict[str, Any]:
    """What the rerun file keeps: the mean of each method, in percent, and the median error."""
    coarse = result["parametros"]["grossa"]
    res = result["resumo"]
    methods = {}
    for key, name in METHOD_KEYS.items():
        m = res[name.format(coarse=coarse)]
        methods[key] = {
            "missed_pct": m["perigo_nao_vetado_%"][0],
            "false_alarm_pct": m["falso_alarme_%"][0],
        }
    fair = res[f"Grade {coarse} m + margem (mesmo falso alarme da tese P90)"]
    return {
        "methods": methods,
        "median_error_deg": {
            "normal": result["testes"]["erro_abs_mediano_grade"],
            "multiresolution": result["testes"]["erro_abs_mediano_tese"],
        },
        "cells_checked": result["testes"]["n_celulas_conferidas"],
        "grade_margin": {
            "missed_pct": fair["perigo_nao_vetado_%"][0],
            "false_alarm_pct": fair["falso_alarme_%"][0],
        },
        "trade_off_pct": result["curvas_no_alvo"],
    }


def load_tile(folder: Path, tile: str) -> dict[str, Array]:
    base = folder / tile / f"{tile}_final_adj_5mpp_"
    missing = [f"{base}{k}.tif" for k in LAYERS if not Path(f"{base}{k}.tif").exists()]
    if missing:
        raise SystemExit(f"missing layers (run fetch_pgda78.py): {', '.join(missing)}")
    return {k: read_layer(Path(f"{base}{k}.tif")) for k in LAYERS}


def committed_tiles() -> list[str]:
    return sorted(json.loads(TILES_JSON.read_text("utf-8"))["tiles"])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument(
        "--pgda-dir", type=Path, required=True, help="folder with one directory per tile"
    )
    ap.add_argument("--out", type=Path, required=True, help="the rerun file to write (JSON)")
    ap.add_argument("--tiles", nargs="*", help="tiles to run (default: the 26 of tiles.json)")
    ap.add_argument("--sorteios", type=int, default=rules.DRAWS, help="draws (smoke runs only)")
    ap.add_argument("--limit", type=int, default=0, help="run only the first N tiles (smoke)")
    ap.add_argument("--fresh", action="store_true", help="ignore the partial file")
    a = ap.parse_args()

    tiles = a.tiles or committed_tiles()
    if a.limit:
        tiles = tiles[: a.limit]
    smoke = a.sorteios != rules.DRAWS or bool(a.limit) or set(tiles) != set(committed_tiles())
    partial = a.out.with_name(a.out.name + ".partial.jsonl")
    a.out.parent.mkdir(parents=True, exist_ok=True)
    done: dict[tuple[str, int], dict[str, Any]] = {}
    if partial.exists() and not a.fresh:
        for line in partial.read_text("utf-8").splitlines():
            row = json.loads(line)
            if row["rule"] != rules.rule() or row["draws"] != a.sorteios:
                raise SystemExit("the partial file was made under another rule: use --fresh")
            done[(row["tile"], row["coarse_m"])] = row["run"]
    elif partial.exists():
        partial.unlink()

    started = time.time()
    for tile in tiles:
        todo = [c for c in (60, 20) if (tile, c) not in done]
        if not todo:
            continue
        layers = load_tile(a.pgda_dir, tile)
        for coarse in todo:
            print(f"[{time.time() - started:7.1f} s] {tile} {coarse} m", flush=True)
            run = contract_shape(analyse(layers, coarse=coarse, draws=a.sorteios))
            done[(tile, coarse)] = run
            with partial.open("a", encoding="utf-8") as handle:
                handle.write(
                    json.dumps(
                        {
                            "rule": rules.rule(),
                            "draws": a.sorteios,
                            "tile": tile,
                            "coarse_m": coarse,
                            "run": run,
                        }
                    )
                    + "\n"
                )
    runs: dict[str, dict[str, Any]] = {}
    for (tile, coarse), run in sorted(done.items()):
        runs.setdefault(tile, {})[str(coarse)] = run
    out = {"rule": rules.rule(), "smoke": smoke, "runs": runs}
    a.out.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", "utf-8")
    print(f"wrote {a.out}" + (" (smoke run: the check refuses it)" if smoke else ""))


if __name__ == "__main__":
    main()
