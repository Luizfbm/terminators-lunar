"""Gera graficos 160 dpi e CSV consolidado da bateria multirresolucao POP=100."""

import csv
import os
import sys
import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS_DIR)
from analisa_dif_multi import CFGS, NOMES, load_battery, mcnemar_p, w_p

OUT_DIR = os.path.abspath(os.path.join(THIS_DIR, '..', 'monte_carlo_lola', 'figuras'))
os.makedirs(OUT_DIR, exist_ok=True)

plt.rcParams.update({
    'font.size': 10,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'axes.edgecolor': '#9a9994',
    'axes.labelcolor': '#3f3e3b',
    'xtick.color': '#3f3e3b',
    'ytick.color': '#3f3e3b',
    'figure.facecolor': '#fcfcfb',
    'axes.facecolor': '#fcfcfb',
    'axes.grid': True,
    'grid.color': '#e6e5e1',
    'grid.linewidth': 0.8,
})

NIV_LABELS = [
    'N0\nBase (4,9%)',
    'N1\nRelevo x1,3\n(20,1%)',
    'N2\nN1 + erro x1,5\n+ cam. x0,75',
    'N3\nN1 + erro x2\ns/ replan.',
]


def export_csv(teto, sem_teto):
    path = os.path.join(OUT_DIR, 'dados_multi_pop100.csv')
    rows = []
    for bat_name, data in [('com_teto_800s', teto), ('sem_teto_4000s', sem_teto)]:
        for niv in sorted(data):
            R = data[niv]
            for cfg in ['A'] + CFGS:
                if cfg not in R:
                    continue
                r = R[cfg]
                rows.append([
                    bat_name,
                    niv,
                    cfg,
                    NOMES.get(cfg, cfg),
                    round(float(r['ok'].mean()), 2),
                    round(float(r['tomb'].mean()), 2),
                    round(float(r['preso'].mean()), 2),
                    round(float(r['tempo'].mean()), 2),
                    round(float(r['fora'].mean()), 2),
                    round(float(r['rota'].mean()), 2),
                    round(float(r['per'].mean()), 3),
                ])
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow([
            'bateria', 'nivel', 'cfg', 'descricao', 'chegada_pct', 'tombamento_pct',
            'preso_pct', 'tempo_esgot_pct', 'fora_mapa_pct', 'rota_pct', 'perigo_atrav_pct',
        ])
        w.writerows(rows)
    return path


def fig_escada_2x2(teto, sem_teto):
    series = [
        ('A', 'Rover A (60 m orig.)', '#8d8c87', '--', 1.6),
        ('R60', 'Grade 60 m (R60)', '#4a4a48', ':', 2.0),
        ('R20', 'Grade 20 m bruta (R20)', '#eda100', '-.', 1.8),
        ('RT_nom', 'Tese 60->5 m (RT_nom)', '#1baf7a', '-', 2.7),
        ('RT20', 'Tese 20->5 m (RT20)', '#2a78d6', '-', 2.3),
        ('RLOLA5_marg', 'LOLA 5 m + marg.', '#e05a2b', '-', 2.0),
        ('R_oraculo', 'Oraculo 5 m real', '#8b5cf6', '--', 1.8),
    ]
    fig, axes = plt.subplots(2, 2, figsize=(13.2, 8.6), sharex=True)
    panels = [
        (axes[0, 0], teto, 'ok', 'Com Teto Temporal (T_MAX = 800 s) — Chegada (%)', (12, 88)),
        (axes[0, 1], sem_teto, 'ok', 'Sem Teto Temporal (T_MAX = 4.000 s) — Chegada (%)', (12, 88)),
        (axes[1, 0], teto, 'tomb', 'Com Teto Temporal (800 s) — Tombamento (%)', (0, 50)),
        (axes[1, 1], sem_teto, 'tomb', 'Sem Teto Temporal (4.000 s) — Tombamento (%)', (0, 50)),
    ]
    x = np.arange(4)
    for ax, data, metric, title, ylim in panels:
        for cfg, label, color, ls, lw in series:
            y = [float(data[n][cfg][metric].mean()) for n in range(4)]
            z = 4 if cfg in ('RT_nom', 'RT20') else 3
            ax.plot(x, y, linestyle=ls, marker='o', color=color, lw=lw, ms=6, mec='#fcfcfb', mew=1.2, label=label, zorder=z)
        ax.set_title(title, loc='left', fontsize=10.5, fontweight='bold', color='#1c1b19')
        ax.set_ylim(*ylim)
        ax.set_xticks(x)
        ax.set_xticklabels(NIV_LABELS, fontsize=8.8)
        if metric == 'ok':
            ax.set_ylabel('Chegada a meta (%)')
        else:
            ax.set_ylabel('Tombamento (%)')

    handles, labels = axes[0, 0].get_legend_handles_labels()
    fig.legend(handles, labels, loc='lower center', ncol=4, frameon=False, fontsize=9.2, bbox_to_anchor=(0.5, 0.01))
    fig.suptitle(
        'Bateria Multirresolucao 60 / 20 / 5 m (POP = 100 · 1.600 travessias/celula · 16 faixas LOLA)',
        fontsize=13, fontweight='bold', color='#0b0b0b', y=0.98
    )
    fig.tight_layout(rect=[0, 0.075, 1, 0.945])
    out = os.path.join(OUT_DIR, 'fig_multi_pop100_escada.png')
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out


def fig_efeito_teto_e_resolucao(teto, sem_teto):
    order = ['R_oraculo', 'RLOLA5_marg', 'RLOLA5', 'RT20', 'R20_marg', 'R20', 'RT_nom', 'R60', 'A']
    short = {
        'A': 'Rover A (60 m)',
        'R60': 'Grade 60 m (R60)',
        'RT_nom': 'Tese 60->5 m (RT_nom)',
        'R20': 'Grade 20 m bruta (R20)',
        'R20_marg': 'Grade 20 m + P90',
        'RT20': 'Tese 20->5 m (RT20)',
        'RLOLA5': 'LOLA 5 m oficial',
        'RLOLA5_marg': 'LOLA 5 m + marg.',
        'R_oraculo': 'Oraculo 5 m real',
    }
    fig, axes = plt.subplots(1, 4, figsize=(15.5, 5.6), sharey=True)
    y = np.arange(len(order))
    h = 0.36
    for niv, ax in enumerate(axes):
        v_teto = [float(teto[niv][k]['ok'].mean()) for k in order]
        v_sem = [float(sem_teto[niv][k]['ok'].mean()) for k in order]
        c_teto = ['#1baf7a' if k in ('RT_nom', 'RT20') else ('#d97706' if 'LOLA5' in k else '#787772') for k in order]
        c_sem = ['#0d7c54' if k in ('RT_nom', 'RT20') else ('#b45309' if 'LOLA5' in k else '#3f3e3b') for k in order]
        ax.barh(y + h / 2, v_teto, height=h, color=c_teto, alpha=0.88, label='Com teto (800 s)' if niv == 0 else None)
        ax.barh(y - h / 2, v_sem, height=h, color=c_sem, alpha=0.95, label='Sem teto (4.000 s)' if niv == 0 else None)
        for idx, (vt, vs) in enumerate(zip(v_teto, v_sem)):
            ax.text(max(vt, vs) + 1.0, idx, f'{vt:.1f}/{vs:.1f}', va='center', fontsize=7.6, color='#3f3e3b')
        ax.set_xlim(0, 105)
        ax.set_title(NIV_LABELS[niv].replace('\n', ' '), loc='left', fontsize=9.8, fontweight='bold', color='#1c1b19')
        ax.set_xlabel('Chegada (%)')
        ax.grid(axis='y', visible=False)
    axes[0].set_yticks(y)
    axes[0].set_yticklabels([short[k] for k in order], fontsize=9.2)
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc='lower center', ncol=2, frameon=False, fontsize=9.4, bbox_to_anchor=(0.5, 0.01))
    fig.suptitle(
        'Comparacao Completa das 9 Configuracoes: Com Teto (800 s, barra sup.) vs. Sem Teto (4.000 s, barra inf.)',
        fontsize=12.5, fontweight='bold', color='#0b0b0b', y=0.98
    )
    fig.tight_layout(rect=[0, 0.065, 1, 0.93])
    out = os.path.join(OUT_DIR, 'fig_multi_pop100_com_vs_sem_teto.png')
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out


def fig_ganhos_e_desfechos(teto, sem_teto):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.8, 5.8), gridspec_kw={'width_ratios': [1.08, 1.12]})

    pairs = [
        ('RT_nom', 'R60', 'Tese 60->5 vs Grade 60', '#1baf7a'),
        ('RT20', 'R20_marg', 'Tese 20->5 vs Grade 20 P90', '#2a78d6'),
        ('RT20', 'R20', 'Tese 20->5 vs Grade 20 bruta', '#eda100'),
        ('RLOLA5_marg', 'RLOLA5', 'LOLA 5 m marg. vs bruto', '#e05a2b'),
    ]
    x = np.arange(4)
    bw = 0.20
    for idx, (ca, cb, label, color) in enumerate(pairs):
        deltas = []
        sigs = []
        for niv in range(4):
            ra, rb = sem_teto[niv][ca], sem_teto[niv][cb]
            d = float((ra['ok'] - rb['ok']).mean())
            pw = w_p(ra['ok'], rb['ok'])
            _, _, pm = mcnemar_p(ra['pair'], rb['pair'])
            deltas.append(d)
            sigs.append('**' if pw < 0.05 else ('*' if pm < 0.001 else ''))
        pos = x + (idx - 1.5) * bw
        bars = ax1.bar(pos, deltas, width=bw * 0.92, color=color, alpha=0.9, label=label)
        for bar, s in zip(bars, sigs):
            v = bar.get_height()
            va = 'bottom' if v >= 0 else 'top'
            off = 0.35 if v >= 0 else -0.45
            ax1.text(bar.get_x() + bar.get_width() / 2, v + off, f'{v:+.1f}{s}', ha='center', va=va, fontsize=7.2, color='#1c1b19')
    ax1.axhline(0, color='#52514e', lw=1.0)
    ax1.set_xticks(x)
    ax1.set_xticklabels(['N0', 'N1', 'N2', 'N3'], fontsize=9.5)
    ax1.set_ylim(-13, 18.5)
    ax1.set_ylabel('Diferenca pareada de chegada (pp)')
    ax1.set_title('Ganho pareado sem teto (4.000 s)\n** Wilcoxon p<0,05  |  * McNemar p<0,001', loc='left', fontsize=10.5, fontweight='bold')
    ax1.legend(frameon=False, fontsize=8.3, loc='upper right')

    cfgs_n3 = ['A', 'R60', 'RT_nom', 'R20', 'R20_marg', 'RT20', 'RLOLA5', 'RLOLA5_marg', 'R_oraculo']
    R3 = sem_teto[3]
    cheg = np.array([R3[k]['ok'].mean() for k in cfgs_n3])
    tomb = np.array([R3[k]['tomb'].mean() for k in cfgs_n3])
    tempo = np.array([R3[k]['tempo'].mean() + R3[k]['preso'].mean() for k in cfgs_n3])
    fora = np.array([R3[k]['fora'].mean() for k in cfgs_n3])
    y2 = np.arange(len(cfgs_n3))
    ax2.barh(y2, cheg, color='#1baf7a', label='Chegada a meta (%)')
    ax2.barh(y2, tempo, left=cheg, color='#eab308', label='Tempo esgot./preso (%)')
    ax2.barh(y2, fora, left=cheg + tempo, color='#94a3b8', label='Fora do mapa (%)')
    ax2.barh(y2, tomb, left=cheg + tempo + fora, color='#dc2626', label='Tombamento (%)')
    ax2.set_yticks(y2)
    ax2.set_yticklabels(cfgs_n3, fontsize=9)
    ax2.set_xlim(0, 100)
    ax2.set_xlabel('Distribuicao dos 1.600 rovers (%)')
    ax2.set_title('Decomposicao de desfechos em N3 sem teto\nMargens P90 sem replan. ampliam Tempo% e reduzem Tomb%', loc='left', fontsize=10.5, fontweight='bold')
    ax2.legend(frameon=False, fontsize=8.4, loc='upper center', bbox_to_anchor=(0.5, -0.14), ncol=2)
    ax2.grid(axis='y', visible=False)

    fig.tight_layout(rect=[0, 0.04, 1, 1])
    out = os.path.join(OUT_DIR, 'fig_multi_pop100_ganhos_e_desfechos_n3.png')
    fig.savefig(out, dpi=160)
    plt.close(fig)
    return out


if __name__ == '__main__':
    os.chdir(THIS_DIR)
    teto = load_battery('lola_dif_teto')
    sem_teto = load_battery('lola_dif_semteto')
    csv_path = export_csv(teto, sem_teto)
    f1 = fig_escada_2x2(teto, sem_teto)
    f2 = fig_efeito_teto_e_resolucao(teto, sem_teto)
    f3 = fig_ganhos_e_desfechos(teto, sem_teto)
    print('Gerados:', csv_path, f1, f2, f3, sep='\n')
