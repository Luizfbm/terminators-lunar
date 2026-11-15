"""MCP server for thesis descriptive and non-parametric inferential statistics."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from mcp.server.fastmcp import FastMCP
from scipy import stats

mcp = FastMCP("tese-stats")


def _load_csv(csv_path: str) -> pd.DataFrame:
    path = Path(csv_path)
    if not path.is_file():
        raise FileNotFoundError(f"CSV nao encontrado: {path}")
    return pd.read_csv(path)


def _summarize_series(values: np.ndarray) -> dict[str, Any]:
    n = int(values.size)
    if n == 0:
        return {"n": 0}
    q1, med, q3 = np.percentile(values, [25.0, 50.0, 75.0])
    out: dict[str, Any] = {
        "n": n,
        "mean": float(np.mean(values)),
        "std": float(np.std(values, ddof=1)) if n > 1 else 0.0,
        "median": float(med),
        "q1": float(q1),
        "q3": float(q3),
        "iqr": float(q3 - q1),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
    }
    if 3 <= n <= 5000 and float(np.ptp(values)) > 0.0:
        sh = stats.shapiro(values)
        out["shapiro_w"] = float(sh.statistic)
        out["shapiro_p"] = float(sh.pvalue)
    return out


def _holm_bonferroni(p_values: list[float]) -> list[float]:
    m = len(p_values)
    if m == 0:
        return []
    indexed = sorted(enumerate(p_values), key=lambda item: item[1])
    adjusted = [0.0] * m
    running_max = 0.0
    for rank, (orig_idx, p_val) in enumerate(indexed):
        cand = min(1.0, (m - rank) * p_val)
        running_max = max(running_max, cand)
        adjusted[orig_idx] = float(running_max)
    return adjusted


def _wilcoxon_pair(a: np.ndarray, b: np.ndarray, alternative: str) -> dict[str, Any]:
    diff = b - a
    nonzero = diff[diff != 0.0]
    n_pairs = int(diff.size)
    n_nz = int(nonzero.size)
    if n_nz == 0:
        return {
            "n_pairs": n_pairs,
            "n_nonzero": 0,
            "statistic": 0.0,
            "p_value": 1.0,
            "rank_biserial_r": 0.0,
            "median_diff": 0.0,
            "mean_diff": 0.0,
        }
    res = stats.wilcoxon(a, b, alternative=alternative, zero_method="wilcox")
    ranks = stats.rankdata(np.abs(nonzero))
    total_rank_sum = float(np.sum(ranks))
    w_pos = float(np.sum(ranks[nonzero > 0]))
    w_neg = float(np.sum(ranks[nonzero < 0]))
    rank_biserial = (w_pos - w_neg) / total_rank_sum if total_rank_sum > 0 else 0.0
    return {
        "n_pairs": n_pairs,
        "n_nonzero": n_nz,
        "statistic": float(res.statistic),
        "p_value": float(res.pvalue),
        "rank_biserial_r": float(rank_biserial),
        "median_diff": float(np.median(diff)),
        "mean_diff": float(np.mean(diff)),
    }


def _to_binary(series: pd.Series) -> np.ndarray:
    arr = pd.to_numeric(series, errors="coerce").to_numpy(dtype=float)
    valid = arr[~np.isnan(arr)]
    if not np.all(np.isin(valid, [0.0, 1.0])):
        raise ValueError(f"Coluna '{series.name}' precisa conter apenas valores binarios 0/1.")
    return arr


def _mcnemar_pair(a: np.ndarray, b: np.ndarray, exact: bool) -> dict[str, Any]:
    n = int(a.size)
    a11 = int(np.sum((a == 1) & (b == 1)))
    b10 = int(np.sum((a == 1) & (b == 0)))
    c01 = int(np.sum((a == 0) & (b == 1)))
    d00 = int(np.sum((a == 0) & (b == 0)))
    discordant = b10 + c01
    if discordant == 0:
        p_val = 1.0
        stat = 0.0
    elif exact:
        p_val = float(stats.binomtest(min(b10, c01), n=discordant, p=0.5, alternative="two-sided").pvalue)
        stat = float(min(b10, c01))
    else:
        stat = float(((abs(b10 - c01) - 1.0) ** 2) / discordant)
        p_val = float(stats.chi2.sf(stat, df=1))
    odds_ratio = float(c01 / b10) if b10 > 0 else (math.inf if c01 > 0 else 1.0)
    return {
        "n_pairs": n,
        "rate_a": float(np.mean(a)),
        "rate_b": float(np.mean(b)),
        "diff_pp": float((np.mean(b) - np.mean(a)) * 100.0),
        "table": {"both_1": a11, "only_a_1": b10, "only_b_1": c01, "both_0": d00},
        "method": "exact_binomial" if exact else "chi2_continuity",
        "statistic": stat,
        "p_value": p_val,
        "odds_ratio_b_over_a": odds_ratio,
    }


@mcp.tool()
def descriptive_stats(
    csv_path: str,
    columns: list[str] | None = None,
    group_by: str | None = None,
) -> dict[str, Any]:
    """Calcula estatistica descritiva completa (N, media, DP, mediana, Q1, Q3, IQR, min, max e Shapiro-Wilk)."""
    df = _load_csv(csv_path)
    cols = columns or df.select_dtypes(include=[np.number]).columns.tolist()
    if group_by:
        if group_by not in df.columns:
            raise ValueError(f"Coluna de grupo '{group_by}' nao existe.")
        grouped: dict[str, Any] = {}
        for key, sub in df.groupby(group_by, dropna=False):
            grouped[str(key)] = {
                c: _summarize_series(pd.to_numeric(sub[c], errors="coerce").dropna().to_numpy(dtype=float))
                for c in cols
                if c != group_by
            }
        return {"csv_path": csv_path, "group_by": group_by, "groups": grouped}
    return {
        "csv_path": csv_path,
        "columns": {
            c: _summarize_series(pd.to_numeric(df[c], errors="coerce").dropna().to_numpy(dtype=float))
            for c in cols
        },
    }


@mcp.tool()
def paired_wilcoxon(
    csv_path: str,
    col_a: str,
    col_b: str,
    alternative: str = "two-sided",
) -> dict[str, Any]:
    """Executa teste de Wilcoxon pareado entre duas colunas numericas e retorna estatistica, p-valor e rank-biserial r."""
    df = _load_csv(csv_path)
    sub = df[[col_a, col_b]].apply(pd.to_numeric, errors="coerce").dropna()
    a = sub[col_a].to_numpy(dtype=float)
    b = sub[col_b].to_numpy(dtype=float)
    return {
        "col_a": col_a,
        "col_b": col_b,
        "alternative": alternative,
        "summary_a": _summarize_series(a),
        "summary_b": _summarize_series(b),
        "wilcoxon": _wilcoxon_pair(a, b, alternative),
    }


@mcp.tool()
def mcnemar_test(
    csv_path: str,
    col_a: str,
    col_b: str,
    exact: bool = True,
) -> dict[str, Any]:
    """Executa teste de McNemar para desfechos binarios pareados (0/1), com p-valor exato binomial ou qui-quadrado."""
    df = _load_csv(csv_path)
    a_raw = _to_binary(df[col_a])
    b_raw = _to_binary(df[col_b])
    mask = (~np.isnan(a_raw)) & (~np.isnan(b_raw))
    return {
        "col_a": col_a,
        "col_b": col_b,
        "mcnemar": _mcnemar_pair(a_raw[mask], b_raw[mask], exact),
    }


@mcp.tool()
def correlation_test(
    csv_path: str,
    col_x: str,
    col_y: str,
    method: str = "spearman",
) -> dict[str, Any]:
    """Calcula correlacao de Spearman, Kendall ou Pearson entre duas colunas."""
    df = _load_csv(csv_path)
    sub = df[[col_x, col_y]].apply(pd.to_numeric, errors="coerce").dropna()
    x = sub[col_x].to_numpy(dtype=float)
    y = sub[col_y].to_numpy(dtype=float)
    n = int(x.size)
    if n < 3:
        raise ValueError("Sao necessarios pelo menos 3 pares validos.")
    m = method.lower()
    if m == "spearman":
        res = stats.spearmanr(x, y)
        r, p = float(res.statistic), float(res.pvalue)
    elif m == "kendall":
        res = stats.kendalltau(x, y)
        r, p = float(res.statistic), float(res.pvalue)
    elif m == "pearson":
        res = stats.pearsonr(x, y)
        r, p = float(res.statistic), float(res.pvalue)
    else:
        raise ValueError("method deve ser 'spearman', 'kendall' ou 'pearson'.")
    out: dict[str, Any] = {"col_x": col_x, "col_y": col_y, "method": m, "n": n, "r": r, "p_value": p}
    if m in ("spearman", "pearson") and n >= 4 and abs(r) < 1.0:
        z = math.atanh(r)
        se = 1.0 / math.sqrt(n - 3)
        out["ci95"] = [float(math.tanh(z - 1.96 * se)), float(math.tanh(z + 1.96 * se))]
    return out


@mcp.tool()
def ablation_ladder(
    csv_path: str,
    step_cols: list[str],
    metric_type: str = "continuous",
    baseline_mode: str = "sequential",
    alternative: str = "two-sided",
) -> dict[str, Any]:
    """Compara degraus progressivos (Com vs. Sem) com descritiva, teste pareado e ajuste Holm-Bonferroni."""
    if len(step_cols) < 2:
        raise ValueError("Informe pelo menos 2 colunas em step_cols.")
    df = _load_csv(csv_path)
    sub = df[step_cols].apply(pd.to_numeric, errors="coerce").dropna()
    descriptive = {c: _summarize_series(sub[c].to_numpy(dtype=float)) for c in step_cols}

    pairs: list[tuple[str, str]] = (
        [(step_cols[i - 1], step_cols[i]) for i in range(1, len(step_cols))]
        if baseline_mode == "sequential"
        else [(step_cols[0], step_cols[i]) for i in range(1, len(step_cols))]
    )

    comparisons: list[dict[str, Any]] = []
    raw_p: list[float] = []
    for col_a, col_b in pairs:
        a = sub[col_a].to_numpy(dtype=float)
        b = sub[col_b].to_numpy(dtype=float)
        if metric_type == "binary":
            res = _mcnemar_pair(a, b, exact=True)
        elif metric_type == "continuous":
            res = _wilcoxon_pair(a, b, alternative)
        else:
            raise ValueError("metric_type deve ser 'continuous' ou 'binary'.")
        raw_p.append(res["p_value"])
        comparisons.append({"from": col_a, "to": col_b, "result": res})

    for comp, p_adj in zip(comparisons, _holm_bonferroni(raw_p)):
        comp["p_holm"] = p_adj

    return {
        "csv_path": csv_path,
        "n_complete_rows": int(len(sub)),
        "metric_type": metric_type,
        "baseline_mode": baseline_mode,
        "descriptive": descriptive,
        "comparisons": comparisons,
    }


@mcp.tool()
def prepare_jasp_csv(
    input_csv: str,
    output_csv: str,
    keep_cols: list[str] | None = None,
) -> dict[str, Any]:
    """Exporta um CSV limpo em UTF-8 pronto para abrir diretamente no JASP para conferencia cruzada."""
    df = _load_csv(input_csv)
    if keep_cols:
        df = df[keep_cols]
    out_path = Path(output_csv)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False, encoding="utf-8")
    return {"output_csv": str(out_path), "rows": int(len(df)), "columns": list(df.columns)}


if __name__ == "__main__":
    mcp.run(transport="stdio")
