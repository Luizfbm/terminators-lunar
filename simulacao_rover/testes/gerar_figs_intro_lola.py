"""Gera figura estatistica (seaborn + scipy) da densidade real de tiros LOLA (LDEC > 0) nos 104 sitios PGDA 78."""

import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CSV_PATH = os.path.join(ROOT, 'docs', 'tabelas_tese', 'sitios_numerados.csv')
OUT_PNG = os.path.join(ROOT, 'docs', 'figuras_tese', 'fig_intro_estatistica_tiros_lola_regioes.png')


def main():
    sns.set_theme(style='whitegrid', context='paper', font_scale=1.05)
    df = pd.read_csv(CSV_PATH)
    sub = df.dropna(subset=['ldec5']).copy()
    sub['abs_lat'] = -sub['lat']

    # Ordena regioes pela mediana de ldec5 (decrescente no eixo Y)
    order = (
        sub.groupby('regiao')['ldec5']
        .median()
        .sort_values(ascending=False)
        .index.tolist()
    )

    groups = [g['ldec5'].values for _, g in sub.groupby('regiao')]
    kw_h, kw_p = stats.kruskal(*groups)
    rho, sp_p = stats.spearmanr(sub['abs_lat'], sub['ldec5'])
    slope, intercept, r_lin, lin_p, _ = stats.linregress(sub['abs_lat'], sub['ldec5'])

    med_global = float(sub['ldec5'].median())
    q25, q75 = sub['ldec5'].quantile([0.25, 0.75]).tolist()

    fig, (ax1, ax2) = plt.subplots(
        1, 2, figsize=(13.5, 6.2), gridspec_kw={'width_ratios': [1.15, 1.0]}
    )

    # Painel A: Boxplot + stripplot por regiao Artemis
    palette_reg = sns.color_palette('viridis', n_colors=len(order))
    sns.boxplot(
        data=sub,
        y='regiao',
        x='ldec5',
        order=order,
        palette=palette_reg,
        hue='regiao',
        legend=False,
        width=0.62,
        fliersize=0,
        linewidth=1.1,
        boxprops={'alpha': 0.75},
        ax=ax1,
    )
    sns.stripplot(
        data=sub,
        y='regiao',
        x='ldec5',
        order=order,
        color='#1e293b',
        size=4.2,
        alpha=0.82,
        jitter=0.18,
        ax=ax1,
    )
    ax1.axvline(med_global, color='#dc2626', linestyle='--', linewidth=1.4)
    ax1.axvspan(q25, q75, color='#fca5a5', alpha=0.18, zorder=0)
    ax1.text(
        med_global + 0.35,
        len(order) - 0.65,
        f'Mediana global: {med_global:.2f}%\n(IIQ: {q25:.2f}%–{q75:.2f}%)',
        color='#991b1b',
        fontsize=8.5,
        fontweight='bold',
        va='bottom',
        bbox=dict(boxstyle='round,pad=0.25', facecolor='white', edgecolor='#fca5a5', alpha=0.92),
    )

    # Anotacao Kruskal-Wallis
    kw_txt = (
        f'Kruskal-Wallis ({len(order)} regiões, n = {len(sub)} sítios):\n'
        f'H = {kw_h:.2f}, p = {kw_p:.2e}'
    )
    ax1.text(
        0.97,
        0.04,
        kw_txt,
        transform=ax1.transAxes,
        ha='right',
        va='bottom',
        fontsize=8.5,
        bbox=dict(boxstyle='round,pad=0.3', facecolor='#f8fafc', edgecolor='#94a3b8'),
    )
    ax1.set_title('A) Tiros diretos LOLA (5 m) por região Artemis (PGDA 78)', fontsize=11, fontweight='bold', pad=8)
    ax1.set_xlabel('% de pixels 5 m com tiro direto LOLA (LDEC > 0)', fontsize=9.5)
    ax1.set_ylabel('Região candidata Artemis (ordenada pela mediana)', fontsize=9.5)
    ax1.set_xlim(-0.5, 24.0)

    # Painel B: Regressao + correlacao de Spearman com latitude austral
    sns.regplot(
        data=sub,
        x='abs_lat',
        y='ldec5',
        scatter_kws={'s': 36, 'alpha': 0.80, 'color': '#0f4761', 'edgecolors': 'white'},
        line_kws={'color': '#dc2626', 'linewidth': 1.8},
        ci=95,
        ax=ax2,
    )
    ax2.axvline(87.5, color='#64748b', linestyle=':', linewidth=1.3)
    ax2.text(87.55, 25.5, 'Limite calota\n87,5°S', fontsize=8.0, color='#475569', va='top')

    # Destaca extremos reais (min e max)
    idx_max = sub['ldec5'].idxmax()
    idx_min = sub['ldec5'].idxmin()
    for idx, label, tx, ty in [
        (idx_max, f"{sub.loc[idx_max, 'sitio']} ({sub.loc[idx_max, 'ldec5']:.2f}%)", 86.85, 22.6),
        (idx_min, f"{sub.loc[idx_min, 'sitio']} ({sub.loc[idx_min, 'ldec5']:.2f}%)", 84.45, 0.35),
    ]:
        row = sub.loc[idx]
        ax2.annotate(
            label,
            xy=(row['abs_lat'], row['ldec5']),
            xytext=(tx, ty),
            fontsize=8.0,
            fontweight='bold',
            color='#0f172a',
            arrowprops=dict(arrowstyle='->', color='#475569', lw=0.9),
        )

    sp_txt = (
        f'Convergência orbital LRO (n = {len(sub)}):\n'
        f'Spearman ρ = +{rho:.3f} (p = {sp_p:.2e})\n'
        f'Inclinação OLS: +{slope:.2f} p.p. por grau\n'
        f'Máximo observado: {sub["ldec5"].max():.2f}% (≥ 78,8% interpolado)'
    )
    ax2.text(
        0.03,
        0.97,
        sp_txt,
        transform=ax2.transAxes,
        ha='left',
        va='top',
        fontsize=8.3,
        bbox=dict(boxstyle='round,pad=0.32', facecolor='#f8fafc', edgecolor='#94a3b8'),
    )
    ax2.set_title('B) Gradiente latitudinal da cobertura real LOLA a 5 m', fontsize=11, fontweight='bold', pad=8)
    ax2.set_xlabel('Latitude austral absoluta (°S)', fontsize=9.5)
    ax2.set_ylabel('% de pixels 5 m com tiro direto LOLA (LDEC > 0)', fontsize=9.5)
    ax2.set_xlim(83.3, 90.0)
    ax2.set_ylim(-1.0, 26.8)

    fig.suptitle(
        'Auditoria Estatística dos Disparos LOLA (LDEC > 0 a 5 m) nos 104 Sítios PGDA 78',
        fontsize=12.5,
        fontweight='bold',
        y=0.98,
    )
    fig.tight_layout(rect=[0, 0, 1, 0.94])
    fig.savefig(OUT_PNG, dpi=300)
    plt.close(fig)
    print(f'Salvo: {OUT_PNG}')
    print(f'Kruskal-Wallis H={kw_h:.4f} p={kw_p:.4e} | Spearman rho={rho:.4f} p={sp_p:.4e}')
    print(f'Global med={med_global:.4f} IQR=({q25:.4f}, {q75:.4f}) min={sub["ldec5"].min():.4f} max={sub["ldec5"].max():.4f}')


if __name__ == '__main__':
    main()
