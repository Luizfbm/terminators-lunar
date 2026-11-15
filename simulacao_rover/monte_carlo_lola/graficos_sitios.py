#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gráficos e tabela comparando TODOS os sítios (rode depois do rodar_todos.py).
Uso:  python graficos_sitios.py [--grossa 60|20]   (com as duas rodadas feitas, também gera g4_60m_x_20m.png)
Lê resultados/resumo_sitios.csv e gera em resultados/:
  g1_perigo_por_sitio.png      — perigo > 15° não vetado: grade 60 m × tese P90, sítio a sítio (halteres)
  g2_troca_perigo_alarme.png   — troca entre perigo não vetado e falso alarme (cada ponto = um sítio)
  g3_erro_declive.png          — erro mediano do declive: grade × tese, sítio a sítio
  g5_controle_mesmo_alarme.png — grade COM margem e mesmo falso alarme da tese × tese (separa margem de multirresolução)
  g6_curvas_troca.png          — curvas de troca custo × risco (mediana dos sítios), 4 famílias de margem
  tabela_sitios.png            — a tabela pronta para slide
  GRAFICOS_SITIOS.html         — tudo junto, com a estatística entre sítios
"""
import os, csv, base64, datetime
import numpy as np
from scipy import stats
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
import argparse
ap = argparse.ArgumentParser(); ap.add_argument('--grossa', default='60'); A = ap.parse_args()
AQUI = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(AQUI, 'resultados' if A.grossa == '60' else f'resultados_{A.grossa}m'); GR = f'Grade {A.grossa} m'
L = list(csv.DictReader(open(os.path.join(R, 'resumo_sitios.csv'), encoding='utf-8')))
for l in L:
    for k in l:
        if k != 'sitio': l[k] = float(l[k])
L.sort(key=lambda l: l['grade_perigo_nao_vetado'])
S = [l['sitio'] for l in L]; n = len(L)
g = np.array([l['grade_perigo_nao_vetado'] for l in L]); t = np.array([l['teseP90_perigo_nao_vetado'] for l in L]); tc = np.array([l['teseP90cal_perigo_nao_vetado'] for l in L])
fg = np.array([l['grade_falso_alarme'] for l in L]); ft = np.array([l['teseP90_falso_alarme'] for l in L]); ftc = np.array([l['teseP90cal_falso_alarme'] for l in L])
eg = np.array([l['erro_mediano_grade'] for l in L]); et = np.array([l['erro_mediano_tese'] for l in L])
VERM, VERD, CINZA = '#dc2626', '#059669', '#64748b'
figs = []

def salvar(fig, nome):
    p = os.path.join(R, nome); fig.savefig(p, dpi=140, bbox_inches='tight'); plt.close(fig); figs.append(nome)

# 1. halteres
fig, ax = plt.subplots(figsize=(8, 0.42 * n + 1.6)); y = np.arange(n)
ax.hlines(y, t, g, color='#cbd5e1', lw=3)
ax.plot(g, y, 'o', color=VERM, ms=8, label=GR); ax.plot(t, y, 'o', color=VERD, ms=8, label='Tese P90')
for i in range(n): ax.text(g[i] + 0.6, y[i], f'{g[i]:.0f}%', va='center', fontsize=8, color=VERM); ax.text(t[i] - 0.6, y[i], f'{t[i]:.0f}%', va='center', ha='right', fontsize=8, color=VERD)
ax.set_yticks(y); ax.set_yticklabels(S); ax.set_xlabel('perigo real (> 15°) que o método deixa passar (%)'); ax.set_xlim(0, max(g.max(), 1) * 1.15)
ax.set_title(f'Em todos os {n} sítios a tese deixa passar menos perigo que a {GR.lower()}' if (t < g).all() else 'Perigo não vetado por sítio', fontsize=11, loc='left')
ax.legend(loc='lower right'); ax.spines[['top', 'right']].set_visible(False); salvar(fig, 'g1_perigo_por_sitio.png')

# 2. troca perigo × alarme
fig, ax = plt.subplots(figsize=(7, 5))
for (x, yv, c, lb) in ((fg, g, VERM, GR), (ft, t, VERD, 'Tese P90 (margem do simulador)'), (ftc, tc, '#0ea5e9', 'Tese P90 calibrada')):
    ax.scatter(x, yv, s=46, color=c, label=lb, alpha=.85, edgecolor='white')
for i in range(n): ax.annotate('', (ft[i], t[i]), (fg[i], g[i]), arrowprops=dict(arrowstyle='->', color='#cbd5e1', lw=1))
ax.set_xlabel('falso alarme: terreno seguro vetado (%)'); ax.set_ylabel('perigo real não vetado (%)'); ax.legend(fontsize=9)
ax.set_title('O preço: a tese troca perigo não visto por mais terreno vetado', fontsize=11, loc='left'); ax.spines[['top', 'right']].set_visible(False); salvar(fig, 'g2_troca_perigo_alarme.png')

# 3. erro do declive
fig, ax = plt.subplots(figsize=(8, 0.42 * n + 1.6))
ax.barh(y + .2, eg, .4, color=VERM, label=GR); ax.barh(y - .2, et, .4, color=VERD, label='Tese')
ax.set_yticks(y); ax.set_yticklabels(S); ax.set_xlabel('erro mediano do declive nas células escondidas (°)'); ax.legend(loc='lower right')
ax.set_title('Erro típico do declive estimado, por sítio', fontsize=11, loc='left'); ax.spines[['top', 'right']].set_visible(False); salvar(fig, 'g3_erro_declive.png')

# 3b. controle justo: grade com margem e o MESMO falso alarme da tese (só se a coluna existir)
tem_fa = 'gradeFA_perigo_nao_vetado' in L[0]
if tem_fa:
    gfa = np.array([l['gradeFA_perigo_nao_vetado'] for l in L]); ffa = np.array([l['gradeFA_falso_alarme'] for l in L])
    fig, ax = plt.subplots(figsize=(8, 0.42 * n + 1.6))
    ax.hlines(y, t, gfa, color='#cbd5e1', lw=3)
    ax.plot(g, y, 'o', color=VERM, ms=6, alpha=.35, label=f'{GR} sem margem')
    ax.plot(gfa, y, 's', color='#f97316', ms=8, label=f'{GR} + margem (mesmo falso alarme da tese)')
    ax.plot(t, y, 'o', color=VERD, ms=8, label='Tese P90 (multirresolução)')
    ax.set_yticks(y); ax.set_yticklabels(S); ax.set_xlabel('perigo real (> 15°) que o método deixa passar (%)')
    ax.set_title(f'Mesmo falso alarme: a multirresolução vence a grade com margem em {int((t < gfa).sum())} de {n} sítios', fontsize=10.5, loc='left')
    ax.legend(loc='lower right', fontsize=8.5); ax.spines[['top', 'right']].set_visible(False); salvar(fig, 'g5_controle_mesmo_alarme.png')

# 3c. curvas de troca entre sítios (se a rodada tiver as colunas curva_*)
tem_curva = 'curva_tese_FA10' in L[0]
if tem_curva:
    FAS = (5, 10, 15, 20, 25, 30); FAM = (('grade', f'{GR}, margem uniforme', VERM, '--'),('tese', 'Tese, margem por densidade de dado', VERD, '-'), ('teseDecl', 'Tese, margem por densidade e declive', '#0ea5e9', '-'))
    C = {ab: np.array([[l[f'curva_{ab}_FA{f}'] for f in FAS] for l in L]) for ab, *_ in FAM}
    fig, ax = plt.subplots(figsize=(7.5, 5))
    for ab, nm, cor, ls in FAM:
        ax.plot(FAS, np.median(C[ab], 0), ls, color=cor, lw=2, marker='o', label=nm)
        ax.fill_between(FAS, np.percentile(C[ab], 25, 0), np.percentile(C[ab], 75, 0), color=cor, alpha=.08)
    ax.set_xlabel('falso alarme fixado (%)  →  custo'); ax.set_ylabel('perigo real não vetado (%), mediana dos sítios  →  risco')
    ax.set_title(f'Curvas de troca, {n} sítios: para o mesmo custo, a curva mais baixa é a melhor', fontsize=10, loc='left'); ax.legend(fontsize=8.5); ax.grid(alpha=.3)
    ax.spines[['top', 'right']].set_visible(False); salvar(fig, 'g6_curvas_troca.png')

# 4. tabela para slide
fig, ax = plt.subplots(figsize=(10, 0.36 * n + 1.2)); ax.axis('off')
cab = ['Sítio', f'Perigo não vetado\n{GR}', 'Tese P90', 'Tese P90\ncalibrada', 'Falso alarme\nGrade', 'Tese P90', 'Erro mediano\nGrade / Tese']
lin = [[s, f'{a:.1f}%', f'{b:.1f}%', f'{c:.1f}%', f'{d:.1f}%', f'{e:.1f}%', f'{x:.2f}° / {z:.2f}°'] for s, a, b, c, d, e, x, z in zip(S, g, t, tc, fg, ft, eg, et)]
tb = ax.table(cellText=lin, colLabels=cab, loc='center', cellLoc='center'); tb.auto_set_font_size(False); tb.set_fontsize(9); tb.scale(1, 1.35)
for (r, c), cel in tb.get_celld().items():
    if r == 0: cel.set_facecolor('#0f172a'); cel.set_text_props(color='white', weight='bold')
    elif c in (2, 3): cel.set_facecolor('#ecfdf5')
salvar(fig, 'tabela_sitios.png')

# 5. comparação 60 m × 20 m (se as duas rodadas existirem)
c60, c20 = os.path.join(AQUI, 'resultados', 'resumo_sitios.csv'), os.path.join(AQUI, 'resultados_20m', 'resumo_sitios.csv')
comp = None
if os.path.exists(c60) and os.path.exists(c20):
    d60 = {l['sitio']: l for l in csv.DictReader(open(c60, encoding='utf-8'))}; d20 = {l['sitio']: l for l in csv.DictReader(open(c20, encoding='utf-8'))}
    ss = sorted(set(d60) & set(d20) - ({'Site20'} if 'Site20v2' in d60 else set()), key=lambda s_: float(d60[s_]['grade_perigo_nao_vetado']))
    if ss:
        v = lambda d, k: np.array([float(d[s_][k]) for s_ in ss])
        G60, T60, G20, T20 = v(d60, 'grade_perigo_nao_vetado'), v(d60, 'teseP90_perigo_nao_vetado'), v(d20, 'grade_perigo_nao_vetado'), v(d20, 'teseP90_perigo_nao_vetado')
        F60, F20 = v(d60, 'teseP90_falso_alarme'), v(d20, 'teseP90_falso_alarme')
        fig, ax = plt.subplots(figsize=(8.5, 0.42 * len(ss) + 1.8)); yy = np.arange(len(ss))
        for arr, cor, mk, lb in ((G60, VERM, 'o', 'Grade 60 m'), (G20, '#f97316', 's', 'Grade 20 m'), (T60, VERD, 'o', 'Tese 60 → 5 m'), (T20, '#0ea5e9', 's', 'Tese 20 → 5 m')):
            ax.plot(arr, yy, mk, color=cor, ms=7, label=lb, alpha=.9)
        ax.set_yticks(yy); ax.set_yticklabels(ss); ax.set_xlabel('perigo real (> 15°) não vetado (%)'); ax.legend(loc='lower right', fontsize=9)
        ax.set_title('Partir de 20 m ajuda a grade e a tese; a tese a partir de 60 m já supera a grade de 20 m' if np.median(T60) < np.median(G20) else 'Grade e tese partindo de 60 m e de 20 m', fontsize=10.5, loc='left')
        ax.spines[['top', 'right']].set_visible(False); salvar(fig, 'g4_60m_x_20m.png')
        comp = (len(ss), G60, T60, G20, T20, F60, F20)

# estatística entre sítios
txt = []
if n >= 6:
    w = stats.wilcoxon(g, t); rb = (stats.rankdata(np.abs(g - t))[(g - t) > 0].sum() - stats.rankdata(np.abs(g - t))[(g - t) < 0].sum()) / stats.rankdata(np.abs(g - t)).sum()
    txt.append(f'Wilcoxon pareado entre sítios (N = {n}), perigo não vetado grade × tese P90: p = {w.pvalue:.2g}, r rank-biserial = {rb:+.2f}.')
    if tem_fa:
        w3 = stats.wilcoxon(gfa, t); txt.append(f'Controle justo — {GR.lower()} + margem com o MESMO falso alarme da tese (mediana {np.median(ffa):.1f}% × {np.median(ft):.1f}%): perigo não vetado {np.median(gfa):.1f}% × tese {np.median(t):.1f}%; tese melhor em {int((t < gfa).sum())}/{n} sítios; Wilcoxon p = {w3.pvalue:.2g}.')
    if 'teseEnc_perigo_nao_vetado' in L[0]:
        te = np.array([l['teseEnc_perigo_nao_vetado'] for l in L]); fe = np.array([l['teseEnc_falso_alarme'] for l in L])
        txt.append(f'Ajuste de encosta (tese P90 + 1° onde a grade marca > 10°): perigo não vetado {np.median(te):.1f}% (× {np.median(t):.1f}% sem ajuste), falso alarme {np.median(fe):.1f}% (× {np.median(ft):.1f}%); Wilcoxon p = {stats.wilcoxon(te, t).pvalue:.2g}.')
    if tem_curva:
        for f in (10, 20):
            i = FAS.index(f); ttx = []
            for x, y, rot in (('tese', 'grade', 'tese × grade'), ('teseDecl', 'tese', 'tese com declive × tese'), ):
                ttx.append(f'{rot}: {np.median(C[x][:, i]):.1f}% × {np.median(C[y][:, i]):.1f}% (melhor em {int((C[x][:, i] < C[y][:, i]).sum())}/{n}, p = {stats.wilcoxon(C[x][:, i], C[y][:, i]).pvalue:.2g})')
            txt.append(f'Curvas de troca com falso alarme fixado em {f}% — perigo não vetado (mediana): ' + ' · '.join(ttx) + '.')
    w2 = stats.wilcoxon(eg, et); txt.append(f'Wilcoxon pareado do erro mediano do declive (N = {n}): p = {w2.pvalue:.2g}.')
else:
    txt.append(f'N = {n} sítio(s): são precisos ao menos 6 para o Wilcoxon entre sítios.')
q = lambda v: f'{np.median(v):.1f} [{np.percentile(v, 25):.1f}–{np.percentile(v, 75):.1f}]'
txt.insert(0, f'Perigo não vetado, mediana [IQR] entre sítios: grade {q(g)}% · tese P90 {q(t)}% · tese P90 calibrada {q(tc)}%. Falso alarme: grade {q(fg)}% · tese P90 {q(ft)}%.')
if comp:
    k_, G60, T60, G20, T20, F60, F20 = comp; md = lambda v: f'{np.median(v):.1f}%'
    txt.append(f'60 m × 20 m ({k_} sítios em comum), perigo não vetado (mediana): grade 60 m {md(G60)} · grade 20 m {md(G20)} · tese 60→5 m {md(T60)} · tese 20→5 m {md(T20)}. Falso alarme da tese: {md(F60)} (60 m) × {md(F20)} (20 m).')
    if k_ >= 6:
        txt.append(f'Wilcoxon pareado (N = {k_}): tese 60→5 m × grade 20 m p = {stats.wilcoxon(T60, G20).pvalue:.2g}; tese 20→5 m × tese 60→5 m p = {stats.wilcoxon(T20, T60).pvalue:.2g}.')
for s in txt: print(s)
b64 = lambda f: base64.b64encode(open(os.path.join(R, f), 'rb').read()).decode()
html = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gráficos entre sítios</title>
<style>body{{font:16px/1.55 system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:20px}}img{{max-width:100%;margin:12px 0;border:1px solid #eee}}.n{{color:#555;font-size:14px}}</style></head><body>
<h1>Monte Carlo da tese com dados LOLA reais — {n} sítios — {GR.lower()} → 5 m</h1><p class="n">Gerado em {datetime.datetime.now():%d/%m/%Y %H:%M} por graficos_sitios.py a partir de resumo_sitios.csv.</p>
{''.join(f'<p>{s}</p>' for s in txt)}{''.join(f'<img src="data:image/png;base64,{b64(f)}" alt="{f}">' for f in figs)}</body></html>"""
open(os.path.join(R, 'GRAFICOS_SITIOS.html'), 'w', encoding='utf-8').write(html)
print('pronto:', ', '.join(figs), '+ GRAFICOS_SITIOS.html em', R)
