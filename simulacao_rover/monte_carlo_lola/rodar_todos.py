#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Roda o mc_lola.py em TODOS os sítios do PGDA 78 que estão na pasta e monta a comparação entre sítios.
Uso:  python rodar_todos.py [--grossa 60|20] [--sorteios 100] [--recorte 2000]
Saída: simulacao_rover/monte_carlo_lola/resultados/RESUMO_SITIOS.html e resumo_sitios.csv (+ uma pasta por sítio).
Teste entre sítios: Wilcoxon pareado (cada sítio é uma unidade) da taxa de perigo não vetado, grade {a.grossa} m × tese P90.
"""
import os, sys, json, subprocess, argparse, csv, datetime
import numpy as np
from scipy import stats
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..'))
PGDA = os.path.join(RAIZ, 'dados', 'acervo_tese', '02_PGDA_78_5M')
ap = argparse.ArgumentParser(); ap.add_argument('--sorteios', default='100'); ap.add_argument('--recorte', default='2000'); ap.add_argument('--grossa', default='60', help='60 ou 20'); a = ap.parse_args()
RES = os.path.join(AQUI, 'resultados' if a.grossa == '60' else f'resultados_{a.grossa}m'); os.makedirs(RES, exist_ok=True); G = f'Grade {a.grossa} m'
sitios = sorted(d for d in os.listdir(PGDA) if os.path.isdir(os.path.join(PGDA, d)) and all(os.path.exists(os.path.join(PGDA, d, f'{d}_final_adj_5mpp_{k}.tif')) for k in ('surf', 'ldec', 'slp', 'slperr')))
if 'Site20' in sitios and 'Site20v2' in sitios: sitios.remove('Site20'); print('Site20 ignorado: o recorte central é a mesma área do Site20v2 (resultados idênticos).')
print(f'{len(sitios)} sítios com as 4 camadas, grade grossa {a.grossa} m: {", ".join(sitios)}\n', flush=True)
linhas = []
for k, st in enumerate(sitios, 1):
    print(f'================ [{k}/{len(sitios)}] {st} ================', flush=True)
    r = subprocess.run([sys.executable, os.path.join(AQUI, 'mc_lola.py'), '--sitio', st, '--sorteios', a.sorteios, '--recorte', a.recorte, '--grossa', a.grossa])
    arq = os.path.join(RES, st, 'resumo.json')
    if r.returncode or not os.path.exists(arq): print(f'   falhou: {st}'); continue
    R = json.load(open(arq, encoding='utf-8')); res = R['resumo']
    linhas.append({'sitio': st, 'celulas_conferidas': R['testes']['n_celulas_conferidas'],
                   'grade_perigo_nao_vetado': res[G]['perigo_nao_vetado_%'][0],
                   'teseP90_perigo_nao_vetado': res['Tese P90 (margem nominal)']['perigo_nao_vetado_%'][0],
                   'teseP90cal_perigo_nao_vetado': res['Tese P90 (margem calibrada)']['perigo_nao_vetado_%'][0],
                   'grade_falso_alarme': res[G]['falso_alarme_%'][0],
                   'teseP90_falso_alarme': res['Tese P90 (margem nominal)']['falso_alarme_%'][0],
                   'teseP90cal_falso_alarme': res['Tese P90 (margem calibrada)']['falso_alarme_%'][0],
                   'gradeP90_perigo_nao_vetado': res[G + ' + margem P90 calibrada']['perigo_nao_vetado_%'][0],
                   'gradeP90_falso_alarme': res[G + ' + margem P90 calibrada']['falso_alarme_%'][0],
                   'gradeFA_perigo_nao_vetado': res[G + ' + margem (mesmo falso alarme da tese P90)']['perigo_nao_vetado_%'][0],
                   'gradeFA_falso_alarme': res[G + ' + margem (mesmo falso alarme da tese P90)']['falso_alarme_%'][0],
                   'teseEnc_perigo_nao_vetado': res['Tese P90 + 1° em encosta']['perigo_nao_vetado_%'][0],
                   'teseEnc_falso_alarme': res['Tese P90 + 1° em encosta']['falso_alarme_%'][0],
                   **{f'curva_{ab}_FA{fa_}': R['curvas'][nm]['no_alvo'][str(fa_)] for ab, nm in (('grade', G + ', margem uniforme'), ('tese', 'Tese, margem por densidade de dado'), ('teseDecl', 'Tese, margem por densidade e declive')) for fa_ in (5, 10, 15, 20, 25, 30)},
                   'erro_mediano_grade': R['testes']['erro_abs_mediano_grade'], 'erro_mediano_tese': R['testes']['erro_abs_mediano_tese']})
if not linhas: sys.exit('nenhum sítio processado')
with open(os.path.join(RES, 'resumo_sitios.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=list(linhas[0])); w.writeheader(); w.writerows(linhas)
g = np.array([l['grade_perigo_nao_vetado'] for l in linhas]); t = np.array([l['teseP90_perigo_nao_vetado'] for l in linhas])
teste = stats.wilcoxon(g, t) if len(linhas) >= 6 else None
txt = (f'Wilcoxon pareado entre sítios (N = {len(linhas)}): perigo não vetado, grade {a.grossa} m × tese P90 — p = {teste.pvalue:.2g}' if teste else f'N = {len(linhas)} sítio(s): poucos para o Wilcoxon entre sítios (mínimo 6).')
gf = np.array([l['gradeFA_perigo_nao_vetado'] for l in linhas])
if len(linhas) >= 6: txt += f'. Controle justo (grade com margem e o MESMO falso alarme da tese): grade {np.median(gf):.1f}% × tese {np.median(t):.1f}% — p = {stats.wilcoxon(gf, t).pvalue:.2g}'
print('\n' + txt)
q = lambda v: f'{np.median(v):.1f} [{np.percentile(v, 25):.1f}–{np.percentile(v, 75):.1f}]'
tab = ''.join(f"<tr><td>{l['sitio']}</td><td>{l['celulas_conferidas']:,}</td><td>{l['grade_perigo_nao_vetado']:.1f}%</td><td>{l['teseP90_perigo_nao_vetado']:.1f}%</td><td>{l['teseP90cal_perigo_nao_vetado']:.1f}%</td><td>{l['grade_falso_alarme']:.1f}%</td><td>{l['teseP90_falso_alarme']:.1f}%</td><td>{l['teseP90cal_falso_alarme']:.1f}%</td><td><a href='{l['sitio']}/relatorio.html'>abrir</a></td></tr>" for l in linhas)
html = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Monte Carlo LOLA — todos os sítios</title>
<style>body{{font:16px/1.55 system-ui,sans-serif;max-width:1150px;margin:0 auto;padding:20px}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{border-bottom:1px solid #ddd;padding:6px;text-align:right}}th:first-child,td:first-child{{text-align:left}}.n{{color:#555;font-size:14px}}</style></head><body>
<h1>Monte Carlo da tese com dados LOLA reais — {len(linhas)} sítios — grade {a.grossa} m → 5 m</h1>
<p class="n">Gerado em {datetime.datetime.now():%d/%m/%Y %H:%M} por <code>rodar_todos.py</code> · {a.sorteios} sorteios por sítio · recorte {a.recorte} células · dados NASA GSFC PGDA #78 (Barker et al., 2021).</p>
<p><b>Perigo não vetado (mediana entre sítios [IQR]):</b> grade {a.grossa} m {q(g)}% · tese P90 {q(t)}%. {txt}.</p>
<table><tr><th>Sítio</th><th>células conferidas</th><th>perigo não vetado: grade</th><th>tese P90</th><th>tese P90 calibrada</th><th>falso alarme: grade</th><th>tese P90</th><th>tese P90 calibrada</th><th>relatório</th></tr>{tab}</table>
<p class="n">Cada sítio tem o seu relatório completo (mapas, tabela, testes, calibração e registro da execução).</p></body></html>"""
open(os.path.join(RES, 'RESUMO_SITIOS.html'), 'w', encoding='utf-8').write(html)
print('pronto:', os.path.join(RES, 'RESUMO_SITIOS.html'))
