"""Gera graficos estatisticos avancados (seaborn + scipy.stats + pandas) da bateria POP=100."""

import csv
import os
import sys
import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from scipy import stats

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS_DIR)
from analisa_dif_multi import CFGS, NOMES, load_battery, mcnemar_p, w_p

OUT_DIR = os.path.abspath(os.path.join(THIS_DIR, '..', 'monte_carlo_lola', 'figuras'))
os.makedirs(OUT_DIR, exist_ok=True)

sns.set_theme(
    style='whitegrid',
    rc={
        'figure.facecolor': '#fcfcfb',
        'axes.facecolor': '#fcfcfb',
        'axes.edgecolor': '#9a9994',
        'axes.labelcolor': '#2e2d2a',
        'xtick.color': '#2e2d2a',
        'ytick.color': '#2e2d2a',
        'grid.color': '#e6e5e1',
        'grid.linewidth': 0.7,
        'axes.spines.top': False,
        'axes.spines.right': False,
    },
)

ORDER = ['A', 'R60', 'RT_nom', 'R20', 'R20_marg', 'RT20', 'RLOLA5', 'RLOLA5_marg', 'R_oraculo']
SHORT = {
    'A': 'A (60 m orig.)',
    'R60': 'R60 (60 m)',
    'RT_nom': 'RT_nom (60->5)',
    'R20': 'R20 (20 m)',
    'R20_marg': 'R20 + P90',
    'RT20': 'RT20 (20->5)',
    'RLOLA5': 'LOLA 5 m',
    'RLOLA5_marg': 'LOLA 5 m + marg.',
    'R_oraculo': 'Oraculo 5 m',
}
NIV_COLS = ['N0\nBase', 'N1\nRelevo x1,3', 'N2\n+Erro/+Cam', 'N3\ns/ Replan.']


def rank_biserial_paired(x, y):
    """Rank-biserial correlation r for paired differences (x - y)."""
    d = np.asarray(x, dtype=float) - np.asarray(y, dtype=float)
    nz = d[d != 0]
    n = len(nz)
    if n == 0:
        return 0.0
    ranks = stats.rankdata(np.abs(nz))
    w_plus = float(np.sum(ranks[nz > 0]))
    w_minus = float(np.sum(ranks[nz < 0]))
    total = n * (n + 1) / 2.0
    return (w_plus - w_minus) / total


def bootstrap_mean_ci(d, n_boot=5000, seed=42):
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(d), size=(n_boot, len(d)))
    means = d[idx].mean(axis=1)
    lo, hi = np.percentile(means, [2.5, 97.5])
    return float(d.mean()), float(lo), float(hi)


def build_track_dataframe(teto, sem_teto):
    rows = []
    for bat_key, bat_label, data in [
        ('com_teto', 'Com teto (800 s)', teto),
        ('sem_teto', 'Sem teto (4.000 s)', sem_teto),
    ]:
        for niv in sorted(data):
            R = data[niv]
            for cfg in ORDER:
                if cfg not in R:
                    continue
                r = R[cfg]
                for faixa_idx in range(len(r['ok'])):
                    rows.append({
                        'bateria': bat_key,
                        'bateria_label': bat_label,
                        'nivel': f'N{niv}',
                        'niv_idx': niv,
                        'cfg': cfg,
                        'cfg_label': SHORT[cfg],
                        'faixa': faixa_idx,
                        'chegada': float(r['ok'][faixa_idx]),
                        'tomb': float(r['tomb'][faixa_idx]),
                        'preso': float(r['preso'][faixa_idx]),
                        'tempo': float(r['tempo'][faixa_idx]),
                        'fora': float(r['fora'][faixa_idx]),
                        'rota': float(r['rota'][faixa_idx]),
                        'perigo_atrav': float(r['per'][faixa_idx]),
                    })
    return pd.DataFrame(rows)


def compute_paired_stats(teto, sem_teto):
    pairs = [
        ('RT_nom', 'R60', 'Tese 60->5 vs Grade 60'),
        ('R20', 'R60', 'Grade 20 vs Grade 60'),
        ('RT20', 'R20', 'Tese 20->5 vs Grade 20 bruta'),
        ('RT20', 'R20_marg', 'Tese 20->5 vs Grade 20 + P90'),
        ('RT20', 'RT_nom', 'Tese 20->5 vs Tese 60->5'),
        ('RLOLA5_marg', 'RLOLA5', 'LOLA 5 m marg. vs bruto'),
        ('RT_nom', 'R_oraculo', 'Tese 60->5 vs Oraculo 5 m'),
        ('RT20', 'R_oraculo', 'Tese 20->5 vs Oraculo 5 m'),
    ]
    rows = []
    for bat_key, data in [('com_teto', teto), ('sem_teto', sem_teto)]:
        for niv in range(4):
            R = data[niv]
            for ca, cb, label in pairs:
                ra, rb = R[ca], R[cb]
                d = ra['ok'] - rb['ok']
                mean_d, ci_lo, ci_hi = bootstrap_mean_ci(d)
                pw = w_p(ra['ok'], rb['ok'])
                r_rb = rank_biserial_paired(ra['ok'], rb['ok'])
                only_a, only_b, pm = mcnemar_p(ra['pair'], rb['pair'])
                or_mcn = (only_a + 0.5) / (only_b + 0.5)
                dt = ra['tomb'] - rb['tomb']
                mean_dt, dt_lo, dt_hi = bootstrap_mean_ci(dt)
                pt = w_p(ra['tomb'], rb['tomb'])
                rows.append({
                    'bateria': bat_key,
                    'nivel': f'N{niv}',
                    'niv_idx': niv,
                    'comp': f'{ca} vs {cb}',
                    'label': label,
                    'cheg_a': round(float(ra['ok'].mean()), 2),
                    'cheg_b': round(float(rb['ok'].mean()), 2),
                    'delta_pp': round(mean_d, 2),
                    'ci95_lo': round(ci_lo, 2),
                    'ci95_hi': round(ci_hi, 2),
                    'wilcoxon_p': pw,
                    'rank_biserial_r': round(r_rb, 3),
                    'mcnemar_a': only_a,
                    'mcnemar_b': only_b,
                    'mcnemar_or': round(or_mcn, 2),
                    'mcnemar_p': pm,
                    'delta_tomb_pp': round(mean_dt, 2),
                    'tomb_ci95_lo': round(dt_lo, 2),
                    'tomb_ci95_hi': round(dt_hi, 2),
                    'tomb_wilcoxon_p': pt,
                    'faixas_a_gt_b': int((d > 0).sum()),
                    'faixas_a_lt_b': int((d < 0).sum()),
                })
    df_stats = pd.DataFrame(rows)
    csv_path = os.path.join(OUT_DIR, 'dados_estatisticos_pareados_pop100.csv')
    df_stats.to_csv(csv_path, index=False, encoding='utf-8')
    return df_stats, csv_path


def make_heatmap_tables(df):
    fig, axes = plt.subplots(2, 2, figsize=(13.8, 9.4), sharey=True)
    specs = [
        (axes[0, 0], 'com_teto', 'chegada', 'YlGn', (15, 85), 'Bateria 1 (T_MAX = 800 s) — Chegada a meta (%)'),
        (axes[0, 1], 'sem_teto', 'chegada', 'YlGn', (15, 85), 'Bateria 2 (T_MAX = 4.000 s) — Chegada a meta (%)'),
        (axes[1, 0], 'com_teto', 'tomb', 'YlOrRd', (0, 48), 'Bateria 1 (T_MAX = 800 s) — Tombamento (%)'),
        (axes[1, 1], 'sem_teto', 'tomb', 'YlOrRd', (0, 48), 'Bateria 2 (T_MAX = 4.000 s) — Tombamento (%)'),
    ]
    y_order = [SHORT[c] for c in ORDER]
    x_order = ['N0', 'N1', 'N2', 'N3']

    for ax, bat, col, cmap, (vmin, vmax), title in specs:
        sub = df[df['bateria'] == bat]
        piv = sub.pivot_table(index='cfg_label', columns='nivel', values=col, aggfunc='mean')
        piv = piv.reindex(index=y_order, columns=x_order)
        piv.columns = NIV_COLS
        sns.heatmap(
            piv,
            ax=ax,
            annot=True,
            fmt='.1f',
            cmap=cmap,
            vmin=vmin,
            vmax=vmax,
            linewidths=0.6,
            linecolor='#fcfcfb',
            cbar_kws={'shrink': 0.85, 'label': '%'},
            annot_kws={'size': 9.2, 'weight': 'semibold'},
        )
        ax.set_title(title, loc='left', fontsize=10.5, fontweight='bold', color='#1c1b19', pad=8)
        ax.set_xlabel('')
        ax.set_ylabel('')
        ax.tick_params(axis='x', rotation=0, labelsize=9)
        ax.tick_params(axis='y', rotation=0, labelsize=9)

    fig.suptitle(
        'Leitura Visual das Tabelas 5.6.1 e 5.6.2 (Seaborn Heatmap · Media de 1.600 rovers/celula)',
        fontsize=12.8, fontweight='bold', color='#0b0b0b', y=0.985
    )
    fig.tight_layout(rect=[0, 0.01, 1, 0.955])
    out = os.path.join(OUT_DIR, 'fig_multi_pop100_heatmap_tabelas.png')
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out


def make_outcomes_all_levels(teto, sem_teto):
    fig, axes = plt.subplots(2, 4, figsize=(16.2, 8.6), sharex=True, sharey=True)
    y = np.arange(len(ORDER))
    labels = [SHORT[c] for c in ORDER]
    bats = [('Com teto 800 s', teto), ('Sem teto 4.000 s', sem_teto)]

    for r_idx, (bat_name, data) in enumerate(bats):
        for niv in range(4):
            ax = axes[r_idx, niv]
            R = data[niv]
            cheg = np.array([R[k]['ok'].mean() for k in ORDER])
            tempo = np.array([R[k]['tempo'].mean() + R[k]['preso'].mean() for k in ORDER])
            fora = np.array([R[k]['fora'].mean() for k in ORDER])
            tomb = np.array([R[k]['tomb'].mean() for k in ORDER])

            ax.barh(y, cheg, color='#1baf7a', label='Chegada a meta (%)' if (r_idx == 0 and niv == 0) else None)
            ax.barh(y, tempo, left=cheg, color='#eab308', label='Tempo esgot. + preso (%)' if (r_idx == 0 and niv == 0) else None)
            ax.barh(y, fora, left=cheg + tempo, color='#94a3b8', label='Fora do mapa (%)' if (r_idx == 0 and niv == 0) else None)
            ax.barh(y, tomb, left=cheg + tempo + fora, color='#dc2626', label='Tombamento (%)' if (r_idx == 0 and niv == 0) else None)

            for i in range(len(ORDER)):
                if cheg[i] >= 12:
                    ax.text(cheg[i] / 2, i, f'{cheg[i]:.0f}%', va='center', ha='center', fontsize=7.6, color='white', fontweight='bold')
                if tomb[i] >= 9:
                    ax.text(100 - tomb[i] / 2, i, f'{tomb[i]:.0f}%', va='center', ha='center', fontsize=7.2, color='white', fontweight='bold')

            ax.set_xlim(0, 100)
            ax.invert_yaxis()
            ax.grid(axis='y', visible=False)
            if r_idx == 0:
                ax.set_title(NIV_COLS[niv].replace('\n', ' '), fontsize=10.2, fontweight='bold', color='#1c1b19')
            if niv == 0:
                ax.set_yticks(y)
                ax.set_yticklabels(labels, fontsize=8.8)
                ax.set_ylabel(bat_name, fontsize=10, fontweight='bold', color='#1c1b19')
            if r_idx == 1:
                ax.set_xlabel('Desfechos (%)')

    handles, leg_labels = axes[0, 0].get_legend_handles_labels()
    fig.legend(handles, leg_labels, loc='lower center', ncol=4, frameon=False, fontsize=9.8, bbox_to_anchor=(0.5, 0.01))
    fig.suptitle(
        'Decomposicao Completa dos 100% de Desfechos em Todos os Niveis (N0–N3) e Baterias (1.600 rovers/barra)',
        fontsize=12.8, fontweight='bold', color='#0b0b0b', y=0.985
    )
    fig.tight_layout(rect=[0, 0.055, 1, 0.95])
    out = os.path.join(OUT_DIR, 'fig_multi_pop100_desfechos_n0_n3.png')
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out


def make_track_distributions(df):
    sub_all = df[df['bateria'] == 'sem_teto'].copy()
    sel_cfgs = ['A', 'R60', 'RT_nom', 'R20', 'RT20', 'RLOLA5', 'RLOLA5_marg', 'R_oraculo']
    sel_labels = [SHORT[c] for c in sel_cfgs]
    palette = {
        SHORT['A']: '#8d8c87',
        SHORT['R60']: '#64748b',
        SHORT['RT_nom']: '#1baf7a',
        SHORT['R20']: '#eab308',
        SHORT['RT20']: '#2a78d6',
        SHORT['RLOLA5']: '#f97316',
        SHORT['RLOLA5_marg']: '#c2410c',
        SHORT['R_oraculo']: '#8b5cf6',
    }

    fig, axes = plt.subplots(2, 2, figsize=(15.0, 9.6), sharey=True)
    panels = [
        (axes[0, 0], 'N0', 'N0 (Base real · 4,9% >15 deg)'),
        (axes[0, 1], 'N1', 'N1 (Relevo x1,3 · 20,1% >15 deg)'),
        (axes[1, 0], 'N2', 'N2 (N1 + erro x1,5 + cam. x0,75)'),
        (axes[1, 1], 'N3', 'N3 (N1 + erro x2 + sem replan.)'),
    ]

    friedman_summary = []
    for ax, niv, title in panels:
        s = sub_all[(sub_all['nivel'] == niv) & (sub_all['cfg'].isin(sel_cfgs))]
        piv = s.pivot(index='faixa', columns='cfg', values='chegada')[sel_cfgs]
        stat_f, p_f = stats.friedmanchisquare(*[piv[c].values for c in sel_cfgs])
        kendall_w = stat_f / (len(piv) * (len(sel_cfgs) - 1))
        friedman_summary.append((niv, stat_f, p_f, kendall_w))

        sns.boxplot(
            data=s,
            x='chegada',
            y='cfg_label',
            hue='cfg_label',
            order=sel_labels,
            palette=palette,
            width=0.58,
            showfliers=False,
            legend=False,
            boxprops={'alpha': 0.42, 'linewidth': 1.1},
            medianprops={'color': '#111111', 'linewidth': 2.0},
            whiskerprops={'linewidth': 1.0},
            ax=ax,
        )
        sns.stripplot(
            data=s,
            x='chegada',
            y='cfg_label',
            hue='cfg_label',
            order=sel_labels,
            palette=palette,
            size=4.2,
            alpha=0.72,
            jitter=0.18,
            legend=False,
            ax=ax,
        )
        # Mark mean with white diamond
        means = s.groupby('cfg_label')['chegada'].mean().reindex(sel_labels)
        ax.scatter(means.values, np.arange(len(sel_labels)), marker='D', s=28, color='#ffffff', edgecolor='#111111', zorder=6, label='Media')
        ax.set_xlim(-3, 105)
        ax.set_title(
            f'{title}\nFriedman chi2={stat_f:.1f}, p={p_f:.2e}, W de Kendall={kendall_w:.2f}',
            loc='left', fontsize=10.0, fontweight='bold', color='#1c1b19'
        )
        ax.set_xlabel('Taxa de chegada por faixa LOLA (%)')
        ax.set_ylabel('')

    fig.suptitle(
        'Distribuicao Estatistica nas 16 Faixas Reais LOLA (Boxplot Mediana/IQR + Pontos + Media [losango] · Sem teto 4.000 s)',
        fontsize=12.4, fontweight='bold', color='#0b0b0b', y=0.985
    )
    fig.tight_layout(rect=[0, 0.01, 1, 0.955])
    out = os.path.join(OUT_DIR, 'fig_multi_pop100_distribuicao_faixas.png')
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out, friedman_summary


def make_forest_paired(df_stats):
    sub = df_stats[df_stats['bateria'] == 'sem_teto'].copy()
    comps = [
        'RT_nom vs R60',
        'R20 vs R60',
        'RT20 vs R20',
        'RT20 vs R20_marg',
        'RT20 vs RT_nom',
        'RLOLA5_marg vs RLOLA5',
        'RT_nom vs R_oraculo',
    ]
    labels_map = {
        'RT_nom vs R60': 'Tese 60->5 vs Grade 60',
        'R20 vs R60': 'Grade 20 vs Grade 60',
        'RT20 vs R20': 'Tese 20->5 vs Grade 20',
        'RT20 vs R20_marg': 'Tese 20->5 vs 20+P90',
        'RT20 vs RT_nom': 'Tese 20->5 vs Tese 60->5',
        'RLOLA5_marg vs RLOLA5': 'LOLA 5 m marg. vs bruto',
        'RT_nom vs R_oraculo': 'Tese 60->5 vs Oraculo 5 m',
    }
    niv_colors = {'N0': '#0ea5e9', 'N1': '#1baf7a', 'N2': '#f59e0b', 'N3': '#ef4444'}

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15.4, 7.6), sharey=True, gridspec_kw={'width_ratios': [1.28, 1.0]})
    y_base = np.arange(len(comps))
    offsets = {'N0': -0.27, 'N1': -0.09, 'N2': 0.09, 'N3': 0.27}

    for _, row in sub[sub['comp'].isin(comps)].iterrows():
        i = comps.index(row['comp'])
        niv = row['nivel']
        y = i + offsets[niv]
        c = niv_colors[niv]
        d = row['delta_pp']
        err_l = d - row['ci95_lo']
        err_r = row['ci95_hi'] - d
        sig = '**' if row['wilcoxon_p'] < 0.05 else ('*' if row['mcnemar_p'] < 0.001 else '')

        ax1.errorbar(
            d, y, xerr=[[err_l], [err_r]],
            fmt='o', color=c, ecolor=c, elinewidth=1.8, capsize=3.2, ms=6.2,
            label=niv if i == 0 else None
        )
        ax1.text(
            row['ci95_hi'] + 0.6, y, f"{d:+.1f}{sig}",
            va='center', ha='left', fontsize=8.0, color='#1c1b19',
            bbox={'boxstyle': 'round,pad=0.10', 'fc': '#fcfcfb', 'ec': 'none', 'alpha': 0.85},
        )

        ax2.barh(y, row['rank_biserial_r'], height=0.15, color=c, alpha=0.88)
        mcn_txt = f"r={row['rank_biserial_r']:+.2f} | McN p={row['mcnemar_p']:.1e}" if row['mcnemar_p'] < 0.01 else f"r={row['rank_biserial_r']:+.2f} | McN p={row['mcnemar_p']:.2f}"
        tx = row['rank_biserial_r'] + (0.03 if row['rank_biserial_r'] >= 0 else -0.03)
        ha = 'left' if row['rank_biserial_r'] >= 0 else 'right'
        ax2.text(tx, y, mcn_txt, va='center', ha=ha, fontsize=7.6, color='#1c1b19')

    ax1.axvline(0, color='#3f3e3b', lw=1.2, ls='--')
    ax2.axvline(0, color='#3f3e3b', lw=1.2, ls='--')
    ax1.set_yticks(y_base)
    ax1.set_yticklabels([labels_map[c] for c in comps], fontsize=9.6, fontweight='semibold')
    ax1.invert_yaxis()
    ax1.set_xlim(-22, 31.5)
    ax2.set_xlim(-1.95, 2.05)
    ax1.set_xlabel('Diferenca pareada media de chegada (pp) e IC 95% bootstrap (16 faixas)')
    ax2.set_xlabel('Tamanho de efeito pareado (rank-biserial r de Wilcoxon) e p-valor McNemar')
    ax1.set_title('Forest Plot de Ganhos Pareados (** Wilcoxon p<0,05 | * McNemar p<0,001)', loc='left', fontsize=10.3, fontweight='bold')
    ax2.set_title('Magnitude do Efeito Pareado (r) e Significancia Binaria (1.600 rovers)', loc='left', fontsize=10.3, fontweight='bold')

    for i in range(len(comps) - 1):
        ax1.axhline(i + 0.5, color='#e6e5e1', lw=0.8)
        ax2.axhline(i + 0.5, color='#e6e5e1', lw=0.8)

    handles, l_txt = ax1.get_legend_handles_labels()
    by_lbl = dict(zip(l_txt, handles))
    fig.legend(by_lbl.values(), by_lbl.keys(), loc='lower center', ncol=4, frameon=False, fontsize=9.8, bbox_to_anchor=(0.5, 0.01))
    fig.suptitle(
        'Sintese Estatistica Pareada (5.6.3): Intervalos de Confianca Bootstrap, Rank-Biserial r e McNemar (Sem teto 4.000 s)',
        fontsize=12.4, fontweight='bold', color='#0b0b0b', y=0.985
    )
    fig.tight_layout(rect=[0, 0.05, 1, 0.95])
    out = os.path.join(OUT_DIR, 'fig_multi_pop100_forest_pareado.png')
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out


def make_tradeoff_pareto(df):
    sub = df[df['bateria'] == 'sem_teto']
    nivs = [('N1', 'N1 (Relevo x1,3)'), ('N2', 'N2 (+Erro x1,5 / Cam.)'), ('N3', 'N3 (Sem replanejamento)')]
    colors = {
        'A': '#6b7280', 'R60': '#475569', 'RT_nom': '#10b981', 'R20': '#eab308',
        'R20_marg': '#d97706', 'RT20': '#2563eb', 'RLOLA5': '#f97316', 'RLOLA5_marg': '#9a3412', 'R_oraculo': '#7c3aed',
    }
    offsets = {
        'N1': {
            'RT_nom': (-0.25, 1.8, 'right'),
            'RLOLA5': (0.35, 2.0, 'left'),
            'RLOLA5_marg': (-0.45, -2.5, 'right'),
            'RT20': (0.85, 2.0, 'left'),
            'R_oraculo': (0.95, -2.6, 'left'),
            'R20': (0.85, 0.3, 'left'),
            'R20_marg': (-0.35, -1.6, 'right'),
            'R60': (0.35, 0.2, 'left'),
            'A': (-0.35, -1.5, 'right'),
        },
        'N2': {
            'RLOLA5_marg': (0.45, 0.5, 'left'),
            'RLOLA5': (0.45, 0.9, 'left'),
            'RT_nom': (-0.35, -1.6, 'right'),
            'R_oraculo': (0.45, 0.9, 'left'),
            'RT20': (0.45, -0.5, 'left'),
            'R20': (0.45, 0.8, 'left'),
            'R20_marg': (-0.35, 1.3, 'right'),
            'R60': (0.45, -1.2, 'left'),
            'A': (0.45, -0.9, 'left'),
        },
        'N3': {
            'RLOLA5': (-1.1, 1.5, 'right'),
            'R20': (1.0, 1.7, 'left'),
            'R_oraculo': (1.3, -0.6, 'left'),
            'R20_marg': (-1.1, -1.5, 'right'),
            'RT_nom': (1.2, 0.7, 'left'),
            'R60': (-1.2, -1.7, 'right'),
            'RT20': (1.2, -1.2, 'left'),
            'RLOLA5_marg': (-1.2, -1.8, 'right'),
            'A': (-1.3, 1.2, 'right'),
        },
    }

    fig, axes = plt.subplots(1, 3, figsize=(15.8, 5.7), sharey=True)
    for idx, (niv, title) in enumerate(nivs):
        ax = axes[idx]
        s = sub[sub['nivel'] == niv]
        agg = s.groupby('cfg').agg(
            cheg_m=('chegada', 'mean'),
            tomb_m=('tomb', 'mean'),
            per_m=('perigo_atrav', 'mean'),
        ).reindex(ORDER)

        # Spearman across all 144 track-config observations (track arrival vs track tumbling)
        rho_trk, p_trk = stats.spearmanr(s['tomb'], s['chegada'])

        # Non-dominated Pareto front: maximize chegada, minimize tomb
        pts = agg.sort_values(['tomb_m', 'cheg_m'], ascending=[True, False])
        pareto_x, pareto_y, pareto_cfgs = [], [], set()
        best_y = -1.0
        for cfg_p, row in pts.iterrows():
            if row['cheg_m'] > best_y:
                pareto_x.append(row['tomb_m'])
                pareto_y.append(row['cheg_m'])
                pareto_cfgs.add(cfg_p)
                best_y = row['cheg_m']
        ax.plot(pareto_x, pareto_y, ls='--', lw=1.8, color='#059669', alpha=0.8, zorder=2, label='Fronteira de Pareto' if idx == 0 else None)

        for cfg, r in agg.iterrows():
            is_hero = cfg in ('RT_nom', 'RT20', 'RLOLA5', 'RLOLA5_marg', 'R_oraculo')
            ax.scatter(
                r['tomb_m'], r['cheg_m'],
                s=115 if is_hero else 72,
                color=colors[cfg], edgecolor='#111111' if cfg in pareto_cfgs else '#ffffff',
                linewidth=1.3 if cfg in pareto_cfgs else 0.9, zorder=5
            )
            dx, dy, ha = offsets[niv][cfg]
            ax.annotate(
                cfg,
                xy=(r['tomb_m'], r['cheg_m']),
                xytext=(r['tomb_m'] + dx, r['cheg_m'] + dy),
                fontsize=8.5,
                fontweight='bold' if cfg in ('RT_nom', 'RT20', 'RLOLA5_marg') else 'normal',
                ha=ha, va='center', color='#1c1b19',
                arrowprops={'arrowstyle': '-', 'color': '#a8a29e', 'lw': 0.7, 'shrinkA': 0, 'shrinkB': 4} if (niv == 'N1' and cfg in ('RLOLA5_marg', 'RT20', 'R_oraculo', 'R20')) else None,
                bbox={'boxstyle': 'round,pad=0.12', 'fc': '#fcfcfb', 'ec': 'none', 'alpha': 0.84},
                zorder=6,
            )

        ax.set_title(
            f"{title}\nSpearman (144 pares faixa x cfg) rho={rho_trk:+.2f} (p={p_trk:.1e})",
            loc='left', fontsize=9.8, fontweight='bold'
        )
        ax.set_xlabel('Tombamento medio (%)')
        ax.set_ylabel('Chegada media (%)' if idx == 0 else '')
        if idx == 0:
            ax.set_xlim(5.2, 13.6)
            ax.set_ylim(17, 62.5)
            ax.legend(loc='lower left', frameon=True, facecolor='#fcfcfb', framealpha=0.9, fontsize=8.6)
        elif idx == 1:
            ax.set_xlim(5.2, 20.5)
        else:
            ax.set_xlim(6.0, 51.0)
        ax.annotate('Melhor quadrante\n(chegada alta, tomb. baixo)', xy=(0.03, 0.905), xycoords='axes fraction', fontsize=8.0, color='#0d7c54', fontweight='bold')

    fig.suptitle(
        'Fronteira de Pareto Seguranca x Eficiencia (Chegada vs. Tombamento · Sem Teto 4.000 s)',
        fontsize=12.4, fontweight='bold', color='#0b0b0b', y=0.985
    )
    fig.tight_layout(rect=[0, 0.01, 1, 0.94])
    out = os.path.join(OUT_DIR, 'fig_multi_pop100_tradeoff_pareto.png')
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out


if __name__ == '__main__':
    os.chdir(THIS_DIR)
    teto = load_battery('lola_dif_teto')
    sem_teto = load_battery('lola_dif_semteto')
    df = build_track_dataframe(teto, sem_teto)
    df_stats, csv_stats = compute_paired_stats(teto, sem_teto)
    f_heat = make_heatmap_tables(df)
    f_all = make_outcomes_all_levels(teto, sem_teto)
    f_dist, fried = make_track_distributions(df)
    f_forest = make_forest_paired(df_stats)
    f_pareto = make_tradeoff_pareto(df)

    print('CSV:', csv_stats)
    print('Figs:', f_heat, f_all, f_dist, f_forest, f_pareto, sep='\n')
    print('Friedman (sem_teto):')
    for niv, chi2, pf, w in fried:
        print(f'  {niv}: chi2={chi2:.3f}, p={pf:.3e}, W={w:.3f}')
