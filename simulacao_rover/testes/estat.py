"""Estatística da ablação (v15): descritiva + Wilcoxon pareado (por terreno), McNemar exato (por rover pareado),
Holm, Spearman/Kendall (custo previsto × resultado). Unidade inferencial principal = TERRENO (60 rovers de um terreno não são independentes)."""
import json, glob, numpy as np, os, sys
from scipy import stats
D = {os.path.basename(f)[:-5]: json.load(open(f)) for f in glob.glob('abl/*.json')}
ORD = ['D0', 'D1a', 'D1b', 'D1c', 'D2', 'D3', 'D4a', 'D4b', 'C2r']
NOME = {'D0': 'D0 Base ingênua (rover A, 60 m)', 'D1a': 'D1a + restrições duras/escudo (60 m)', 'D1b': 'D1b + Simplex/dualidade (60 m)',
        'D1c': 'D1c + Mérito: barreira log + Newton/KKT (60 m)', 'D2': 'D2 + Multirresolução 60→5 m P90', 'D3': 'D3 + pesos do mérito aprendidos offline',
        'D4a': 'D4a + MLP 8→7→4 neuroevoluída sob escudo', 'D4b': 'D4b + IA Híbrida 14→8→3 sob escudo', 'C2r': 'C2r controle: multirresolução sem Mérito'}
if 'D1a' in D: D['D0'] = {'terrenos': [{**t, 'B': t['A']} for t in D['D1a']['terrenos']]}
cfgs = [c for c in ORD if c in D]
def met(c):
    T = D[c]['terrenos']; seeds = [t['seed'] for t in T]
    f = lambda t, fn: np.mean([fn(r) for r in t['B']])
    return seeds, {
        'rota_%': np.array([f(t, lambda r: r['x']) for t in T]),
        'PSR_%': np.array([100 * f(t, lambda r: r['ok']) for t in T]),
        'preso_%': np.array([100 * f(t, lambda r: 'PRESO' in r['m'] or 'ESTAGN' in r['m']) for t in T]),
        'perda_relevo_%': np.array([100 * f(t, lambda r: 'TOMB' in r['m'] or 'CRATERA' in r['m']) for t in T]),
        'perda_energia_%': np.array([100 * f(t, lambda r: 'BLECAUTE' in r['m'] or 'CONGEL' in r['m']) for t in T]),
        'SOC_final_%': np.array([f(t, lambda r: r['bat']) for t in T]),
        'tempo_travessia_h': np.array([t['tFim'] * 0.356 for t in T]),
    }, [np.array([r['ok'] for r in t['B']]) for t in T]
M = {c: met(c) for c in cfgs}
def desc(v): q1, md, q3 = np.percentile(v, [25, 50, 75]); return f"{np.mean(v):.1f} ± {np.std(v, ddof=1):.1f} | {md:.1f} | {q1:.1f}–{q3:.1f} | {v.min():.1f}–{v.max():.1f}"
out = []
out.append(f"N = {len(M[cfgs[0]][0])} terrenos novos (sementes {M[cfgs[0]][0][0]}–{M[cfgs[0]][0][-1]}), 60 rovers por terreno.\n")
for m in ['rota_%', 'PSR_%', 'preso_%', 'perda_relevo_%', 'perda_energia_%', 'SOC_final_%', 'tempo_travessia_h']:
    out.append(f"\n**{m}** — média ± dp | mediana | Q1–Q3 | mín–máx\n\n| Degrau | N | média ± dp | mediana | IQR | mín–máx |\n|---|---|---|---|---|---|")
    for c in cfgs:
        v = M[c][1][m]; s = desc(v).split(' | ')
        out.append(f"| {NOME[c]} | {len(v)} | {s[0]} | {s[1]} | {s[2]} | {s[3]} |")
def wilc(a, b):
    d = b - a; nz = d[d != 0]
    if len(nz) == 0: return 1.0, 0.0
    p = stats.wilcoxon(a, b, zero_method='wilcox', alternative='two-sided').pvalue
    rk = stats.rankdata(np.abs(nz)); rrb = (rk[nz > 0].sum() - rk[nz < 0].sum()) / rk.sum()   # rank-biserial pareado
    return p, rrb
def boot(a, b, n=5000, rng=np.random.default_rng(1)):
    d = b - a; idx = rng.integers(0, len(d), (n, len(d))); m = d[idx].mean(1); return np.percentile(m, [2.5, 97.5])
def mcnemar(A, B):
    b = sum(int(((x == 1) & (y == 0)).sum()) for x, y in zip(A, B)); c = sum(int(((x == 0) & (y == 1)).sum()) for x, y in zip(A, B))
    p = stats.binomtest(c, b + c, 0.5).pvalue if b + c else 1.0
    return b, c, p, (c + 0.5) / (b + 0.5)
TRANS = [('D0', 'D1a'), ('D1a', 'D1b'), ('D1b', 'D1c'), ('D1c', 'D2'), ('D2', 'D3'), ('D3', 'D4a'), ('D3', 'D4b'), ('D1b', 'C2r'), ('C2r', 'D2')]
TRANS = [t for t in TRANS if t[0] in M and t[1] in M]
linhas = []
for a, b in TRANS:
    ra, rb = M[a][1], M[b][1]
    pP, rP = wilc(ra['PSR_%'], rb['PSR_%']); pR, rR = wilc(ra['rota_%'], rb['rota_%'])
    ciP = boot(ra['PSR_%'], rb['PSR_%'])
    bb, cc, pM, OR = mcnemar(M[a][2], M[b][2])
    linhas.append([a, b, rb['PSR_%'].mean() - ra['PSR_%'].mean(), ciP, pP, rP, rb['rota_%'].mean() - ra['rota_%'].mean(), pR, rR, bb, cc, pM, OR])
# Holm nos degraus principais (p de Wilcoxon da PSR e de McNemar), separadamente
def holm(ps):
    o = np.argsort(ps); adj = np.empty(len(ps)); mx = 0
    for k, i in enumerate(o): mx = max(mx, (len(ps) - k) * ps[i]); adj[i] = min(1, mx)
    return adj
hW = holm(np.array([l[4] for l in linhas])); hM = holm(np.array([l[11] for l in linhas]))
out.append("\n\n### Transições Com × Sem (pareadas)\n\nWilcoxon pareado por terreno (N = 30) na taxa de chegada à PSR e na % da rota; McNemar exato por rover pareado (30 × 60 = 1.800 pares; b = só o degrau anterior chega, c = só o novo chega). p ajustado por Holm sobre as transições listadas. r_rb = correlação rank-biserial pareada (−1 a +1).\n")
out.append("| Transição | Δ PSR (pontos) [IC 95% bootstrap] | Wilcoxon p (Holm) | r_rb | Δ rota (pontos) | Wilcoxon p | McNemar b / c | McNemar p (Holm) | razão de chances c/b |\n|---|---|---|---|---|---|---|---|---|")
for l, h1, h2 in zip(linhas, hW, hM):
    a, b, dP, ci, pP, rP, dR, pR, rR, bb, cc, pM, OR = l
    out.append(f"| {a} → {b} | {dP:+.1f} [{ci[0]:+.1f}; {ci[1]:+.1f}] | {pP:.2g} ({h1:.2g}) | {rP:+.2f} | {dR:+.1f} | {pR:.2g} | {bb} / {cc} | {pM:.2g} ({h2:.2g}) | {OR:.2f} |")
# Custo previsto × resultado
out.append("\n\n### O custo dos planejadores prevê o resultado?\n")
out.append("Spearman ρ e Kendall τ entre terrenos: custo previsto da rota escolhida × taxa de chegada à PSR do time B. E, dentro de cada terreno, Kendall τ entre o custo previsto (grade ou tese) e o custo calculado com o relevo real nas 4 rotas (média entre terrenos): mede se o planejador ORDENA as rotas como a verdade.\n")
out.append("| Degrau | planejador | ρ Spearman (p) | τ Kendall (p) | τ médio custo previsto × custo real nas 4 rotas |\n|---|---|---|---|---|")
for c in [x for x in ['D1a', 'D1b', 'D2', 'D4b'] if x in D]:
    T = D[c]['terrenos']; key = 'custoA' if D[c]['conf'].get('planejadorB') == 'a' else 'custoB'
    cust = np.array([t['plano'][key][t['plano']['B']] for t in T]); psr = M[c][1]['PSR_%']
    rs = stats.spearmanr(cust, psr); kt = stats.kendalltau(cust, psr)
    taus = [stats.kendalltau(t['plano'][key], t['plano']['custoReal']).statistic for t in T]; taus = [x for x in taus if not np.isnan(x)]
    out.append(f"| {c} | {'grade 60 m' if key == 'custoA' else 'tese/Simplex (' + D[c]['conf']['fontePrev'] + ')'} | {rs.statistic:+.2f} ({rs.pvalue:.2g}) | {kt.statistic:+.2f} ({kt.pvalue:.2g}) | {np.mean(taus):+.2f} (n = {len(taus)}) |")
# rotas escolhidas iguais à melhor real
out.append("\n| Degrau | escolheu a rota de menor custo real |\n|---|---|")
for c in [x for x in ['D1a', 'D1b', 'D2'] if x in D]:
    T = D[c]['terrenos']; out.append(f"| {c} | {sum(t['plano']['B'] == t['plano']['real'] for t in T)}/{len(T)} |")
open('ESTATISTICA-ABLACAO.md', 'w').write('\n'.join(out)); print('\n'.join(out))
