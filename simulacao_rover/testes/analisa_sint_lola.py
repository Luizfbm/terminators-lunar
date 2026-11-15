import json, glob, os, collections
import numpy as np
from scipy.stats import wilcoxon, binomtest

os.chdir(os.path.dirname(os.path.abspath(__file__)))
DIR = os.environ.get('DIR', 'lola_sint')

R = {}
for f in sorted(glob.glob(f'{DIR}/*.json')):
    d = json.load(open(f, encoding='utf-8'))
    n = d['cfg']
    terrenos = d['terrenos']
    B_ok = np.array([np.mean([r['ok'] for r in t['B']]) for t in terrenos]) * 100
    B_x = np.array([np.mean([r['x'] for r in t['B']]) for t in terrenos])
    B_tomb = np.array([np.mean([r['m'].startswith('TOMB') or 'MICROCRATERA' in r['m'] for r in t['B']]) for t in terrenos]) * 100
    B_tempo = np.array([np.mean(['TEMPO' in r['m'] or 'PRESO' in r['m'] or 'ESTAG' in r['m'] for r in t['B']]) for t in terrenos]) * 100
    B_fora = np.array([np.mean(['FORA' in r['m'] for r in t['B']]) for t in terrenos]) * 100
    B_ener = np.array([np.mean(['BLECAUTE' in r['m'] or 'CONGELOU' in r['m'] for r in t['B']]) for t in terrenos]) * 100
    B_pair = np.array([r['ok'] for t in terrenos for r in t['B']])

    has_A = all(len(t.get('A', [])) > 0 for t in terrenos)
    if has_A:
        A_ok = np.array([np.mean([r['ok'] for r in t['A']]) for t in terrenos]) * 100
        A_x = np.array([np.mean([r['x'] for r in t['A']]) for t in terrenos])
        A_tomb = np.array([np.mean([r['m'].startswith('TOMB') or 'MICROCRATERA' in r['m'] for r in t['A']]) for t in terrenos]) * 100
        A_tempo = np.array([np.mean(['TEMPO' in r['m'] or 'PRESO' in r['m'] or 'ESTAG' in r['m'] for r in t['A']]) for t in terrenos]) * 100
        A_fora = np.array([np.mean(['FORA' in r['m'] for r in t['A']]) for t in terrenos]) * 100
        A_pair = np.array([r['ok'] for t in terrenos for r in t['A']])
        cA = collections.Counter(r['m'] for t in terrenos for r in t['A'])
    else:
        A_ok = A_x = A_tomb = A_tempo = A_fora = A_pair = None
        cA = {}

    cB = collections.Counter(r['m'] for t in terrenos for r in t['B'])
    R[n] = {
        'cfg': n,
        'grupo': d.get('grupo', ''),
        'desc': d.get('desc', ''),
        'treino': d.get('treinoSintetico', []),
        'pesos': d.get('pesosAprendidos'),
        'marcatoInfo': d.get('marcatoInfo'),
        'B': B_ok, 'xB': B_x, 'tB': B_tomb, 'tmB': B_tempo, 'fB': B_fora, 'eB': B_ener, 'pB': B_pair, 'causasB': dict(cB),
        'A': A_ok, 'xA': A_x, 'tA': A_tomb, 'tmA': A_tempo, 'fA': A_fora, 'pA': A_pair, 'causasA': dict(cA),
        'sit': [f"{t['lola']['sitio']}_f{t['lola']['faixa']+1}" for t in terrenos]
    }

# Se D0 (Time A) está disponível em R60, registra como configuração explícita D0_A
if 'R60' in R and R['R60']['A'] is not None:
    r60 = R['R60']
    R['D0_A'] = {
        'cfg': 'D0_A',
        'grupo': '1_grade60',
        'desc': 'Time A (D0): Grade de 60 m pura + câmera + reflexo IMU (sem escudo)',
        'treino': [],
        'pesos': None,
        'marcatoInfo': None,
        'B': r60['A'], 'xB': r60['xA'], 'tB': r60['tA'], 'tmB': r60['tmA'], 'fB': r60['fA'],
        'eB': np.zeros_like(r60['A']), 'pB': r60['pA'], 'causasB': r60['causasA'],
    }

print("=" * 125)
print(f"{'CFG':16s} | {'Grupo':18s} | {'Chegada (média±dp | med[IQR])':32s} | {'Rota%':6s} | {'Tomb%':5s} | {'Tempo%':6s} | {'Fora%':5s} | Descrição")
print("-" * 125)

ordem = [
    'D0_A', 'R60',
    'M60_mc', 'MT_nom_P50', 'MT_nom_P90', 'MT_nom_P99', 'MT_cal_P50', 'MT_cal_P90', 'MT_cal_P99',
    'M60_ia_sint', 'MT_ia_nom_P50', 'MT_ia_nom_P90', 'MT_ia_nom_P99', 'MT_ia_cal_P50', 'MT_ia_cal_P90', 'MT_ia_cal_P99',
    'MLP_sint_nom', 'MLP_sint_cal', 'H_sint_nom', 'H_sint_cal', 'H_sint10_nom',
    'RT_nom_P50', 'RT_nom_P90', 'RT_nom_P99', 'RT_cal_P50', 'RT_cal_P90', 'RT_cal_P99',
    'RT_soPlano_nom', 'RT_soExec_nom', 'R20', 'RT20_nom_P90', 'RT20_cal_P90', 'R_oraculo'
]

for k in ordem:
    if k not in R:
        continue
    r = R[k]
    b = r['B']
    q25, med, q75 = np.percentile(b, [25, 50, 75])
    ch_str = f"{b.mean():5.1f}±{b.std(ddof=1):4.1f}% | {med:5.1f}[{q25:4.1f}-{q75:4.1f}]"
    print(f"{k:16s} | {r['grupo']:18s} | {ch_str:32s} | {r['xB'].mean():5.1f}% | {r['tB'].mean():4.1f}% | {r['tmB'].mean():5.1f}% | {r['fB'].mean():4.1f}% | {r['desc']}")

print("\n=== TREINOS EM TERRENOS SINTÉTICOS (EVOLUÇÃO E PESOS APRENDIDOS) ===")
for k in ordem:
    if k in R and (R[k]['treino'] or R[k]['pesos']):
        r = R[k]
        tr = [t['bMeta'] for t in r['treino']]
        print(f"- {k:16s}: Treino Sintético PSR(%) = {tr}")
        if r['pesos']:
            w_str = ", ".join(f"{wk}={wv:.3f}" for wk, wv in r['pesos'].items())
            print(f"  Pesos ótimos aprendidos (Marcato): {w_str}")

print("\n=== COMPARAÇÕES PAREADAS PRINCIPAIS (16 faixas LOLA, 320 rovers pareados) ===")
def comp(a, b, label=""):
    if a not in R or b not in R:
        return
    xa, xb = R[a]['B'], R[b]['B']
    d = xa - xb
    p_w = wilcoxon(xa, xb).pvalue if np.any(d != 0) else 1.0
    pa, pb = R[a]['pB'], R[b]['pB']
    b_mc = int(np.sum((pa == 0) & (pb == 1))) # só b chegou
    c_mc = int(np.sum((pa == 1) & (pb == 0))) # só a chegou
    p_mc = binomtest(min(b_mc, c_mc), b_mc + c_mc, 0.5).pvalue if (b_mc + c_mc) > 0 else 1.0
    ta, tb = R[a]['tB'], R[b]['tB']
    dt = ta - tb
    p_wt = wilcoxon(ta, tb).pvalue if np.any(dt != 0) else 1.0
    print(f"{a:15s} vs {b:15s} | Chegada: {xa.mean():5.1f}% vs {xb.mean():5.1f}% (Δ={d.mean():+5.1f} pp, melhor {(d>0).sum()}/16, pior {(d<0).sum()}/16, Wilc p={p_w:.4f}, McNemar c/b={c_mc}/{b_mc} p={p_mc:.4g}) | Tomb: {ta.mean():4.1f}% vs {tb.mean():4.1f}% (p={p_wt:.4f}) {label}")

pares = [
    ('R60', 'D0_A', '[Escudo em 60m vs Base D0]'),
    ('M60_mc', 'R60', '[Marcato em 60m vs Regra em 60m]'),
    ('M60_ia_sint', 'M60_mc', '[Pesos IA sintético vs Pesos fixos em 60m]'),
    ('RT_nom_P90', 'R60', '[Tese 60->5m vs Grade 60m (Regra)]'),
    ('MT_nom_P90', 'M60_mc', '[Tese 60->5m vs Grade 60m (Marcato)]'),
    ('MT_nom_P90', 'RT_nom_P90', '[Marcato+Tese vs Regra+Tese (Nominal P90)]'),
    ('MT_cal_P90', 'RT_cal_P90', '[Marcato+Tese vs Regra+Tese (Calibrada P90)]'),
    ('MT_ia_nom_P90', 'MT_nom_P90', '[Marcato+Pesos IA sint. vs Marcato fixo (Nominal P90)]'),
    ('MT_ia_cal_P90', 'MT_cal_P90', '[Marcato+Pesos IA sint. vs Marcato fixo (Calibrada P90)]'),
    ('MT_ia_nom_P90', 'RT_nom_P90', '[Marcato+Pesos IA sint. vs Regra+Tese (Nominal P90)]'),
    ('MT_ia_ nom_P90', 'R60', ''),
    ('MT_ia_nom_P90', 'R60', '[Marcato+Pesos IA+Tese vs Grade 60m]'),
    ('MLP_sint_nom', 'RT_nom_P90', '[MLP 8->7->4 sintética vs Regra+Tese]'),
    ('H_sint_nom', 'RT_nom_P90', '[IA Híbrida pré-treino sint. vs Regra+Tese]'),
    ('H_sint10_nom', 'H_sint_nom', '[IA Híbrida +10 ger. sint. vs pré-treino]'),
    ('RT_cal_P90', 'RT_nom_P90', '[Margem Calibrada vs Nominal em P90 (Regra)]'),
    ('RT_nom_P50', 'RT_nom_P90', '[P50 vs P90 (Nominal)]'),
    ('RT_nom_P99', 'RT_nom_P90', '[P99 vs P90 (Nominal)]'),
    ('RT_cal_P50', 'RT_cal_P90', '[P50 vs P90 (Calibrada)]'),
    ('RT_cal_P99', 'RT_cal_P90', '[P99 vs P90 (Calibrada)]'),
    ('RT_soExec_nom', 'R60', '[Tese só a bordo vs Grade 60m]'),
    ('RT_soPlano_nom', 'R60', '[Tese só no plano vs Grade 60m]'),
    ('RT_nom_P90', 'RT_soExec_nom', '[Tese completa vs Tese só a bordo]'),
    ('RT20_nom_P90', 'R20', '[Tese 20->5m vs Grade 20m]'),
    ('RT20_nom_P90', 'RT_nom_P90', '[Tese 20->5m vs Tese 60->5m]'),
    ('R_oraculo', 'RT_nom_P90', '[Oráculo 5m real vs Tese 60->5m]'),
]
for a, b, lbl in pares:
    comp(a, b, lbl)
