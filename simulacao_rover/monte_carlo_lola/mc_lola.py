#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MONTE CARLO DA TESE COM DADOS REAIS DO LOLA (NASA GSFC PGDA #78, Barker et al., 2021)
====================================================================================

Pergunta: a partir de uma grade grossa (60 m, como os mapas orbitais de planejamento), quanto do perigo real de 5 m
(declive > 15°) cada método enxerga?
  - GRADE:  só a grade grossa de 60 m (média por blocos 12 × 12, interpolada de volta a 5 m);
  - TESE:   grade grossa + correção local apenas onde há disparos reais do laser LOLA (LDEC > 0), com margem de
            segurança por célula (P50 / P90 / P99). Onde não há dado, não inventa relevo ("No False Relief").

Verdade: o próprio LOLA de 5 m. Como 90%+ das células de 5 m do LOLA também são interpoladas, só as células COM disparo
(LDEC > 0) servem de verdade. Por isso a validação é CRUZADA: em cada dobra, 1/k das células medidas é escondida da
tese e depois usada para conferir a previsão.

Monte Carlo: o declive "verdadeiro" de cada célula conferida é sorteado N vezes como Normal(slp, slperr), usando o
erro oficial de cada célula publicado pela NASA (camada *_slperr.tif). Cada métrica sai com média e intervalo de 95%.

Uso (na pasta do projeto):
    python simulacao_rover/monte_carlo_lola/mc_lola.py --sitio Site20v2
    python simulacao_rover/monte_carlo_lola/mc_lola.py --sitio Site01 --recorte 0 --sorteios 200
Saída: simulacao_rover/monte_carlo_lola/resultados/<sitio>/ (grade 60 m) ou resultados_20m/<sitio>/ (--grossa 20)
Requisitos: numpy, scipy, matplotlib (já estão no requirements.txt do projeto). tifffile é opcional (usa Pillow se faltar).
"""
import argparse, os, sys, time, json, base64, io, datetime
import numpy as np
from scipy import ndimage, stats

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, '..', '..'))
PASTA_PGDA = os.path.join(RAIZ, 'dados', 'acervo_tese', '02_PGDA_78_5M')
CEL = 5.0            # m por célula do LOLA
Z_NIVEIS = {'P50': 0.0, 'P90': 1.282, 'P99': 2.326}

# ------------------------------------------------------------------------------------------------ registro na tela
class Log:
    def __init__(self, arq): self.f = open(arq, 'w', encoding='utf-8'); self.t0 = time.time()
    def __call__(self, msg=''):
        linha = f'[{time.time() - self.t0:7.1f} s] {msg}' if msg else ''
        print(linha, flush=True); self.f.write(linha + '\n'); self.f.flush()

def ler_tif(caminho):
    try:
        import tifffile
        return tifffile.imread(caminho).astype(np.float32)
    except ImportError:
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = None
        return np.asarray(Image.open(caminho), dtype=np.float32)

def declive(z):
    """Declive (graus) por gradiente central — é exatamente como a camada slp oficial é calculada (conferido: erro 0,001°)."""
    gy, gx = np.gradient(z, CEL)
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)

def grade_grossa(z, bloco):
    """Média por blocos (bloco × bloco células) e interpolação bilinear de volta para 5 m."""
    ny, nx = z.shape
    by, bx = ny // bloco, nx // bloco
    zc = z[:by * bloco, :bx * bloco].reshape(by, bloco, bx, bloco).mean(axis=(1, 3))
    fy = np.clip((np.arange(ny) + 0.5) / bloco - 0.5, 0, by - 1)
    fx = np.clip((np.arange(nx) + 0.5) / bloco - 0.5, 0, bx - 1)
    return ndimage.map_coordinates(zc, np.meshgrid(fy, fx, indexing='ij'), order=1, mode='nearest').astype(np.float32)

def tese(z, zg, medido, sigma_cel):
    """
    Estimativa multirresolução: grade grossa + resíduo (z − grade) observado SÓ nas células medidas, espalhado por
    convolução normalizada gaussiana. Densidade de dado baixa → resíduo tende a 0 (sem relevo falso).
    Devolve o DEM estimado e a densidade local de dado (0–1) usada para a margem.
    """
    m = medido.astype(np.float32)
    r = np.where(medido, z - zg, 0).astype(np.float32)
    num = ndimage.gaussian_filter(r, sigma_cel, mode='nearest')
    den = ndimage.gaussian_filter(m, sigma_cel, mode='nearest')
    peso = den / (den + 0.02)                                    # confiança na correção local
    resid = np.where(den > 1e-6, num / np.maximum(den, 1e-6), 0) * peso
    ze = zg + resid
    ze = np.where(medido, z, ze)                                 # onde há disparo, vale o dado
    return ze.astype(np.float32), den

def margem_nominal(den, z):
    """Margem do escudo como no simulador: 1 + z·σ, σ = 0,8° perto de dado (densidade alta) e 2,0° longe."""
    sig = np.where(den >= np.median(den), 0.8, 2.0)
    return 1.0 + z * sig

def fmt_p(p):
    return '< 10⁻³⁰⁰' if p == 0 else f'= {p:.2g}'

def fig_b64(fig):
    b = io.BytesIO(); fig.savefig(b, format='png', dpi=110, bbox_inches='tight'); b.seek(0)
    return base64.b64encode(b.read()).decode()

# ------------------------------------------------------------------------------------------------ principal
def main():
    ap = argparse.ArgumentParser(description='Monte Carlo da tese com dados LOLA reais (PGDA 78).')
    ap.add_argument('--sitio', default='Site20v2', help='pasta do sítio em dados/acervo_tese/02_PGDA_78_5M (ex.: Site20v2, Site01)')
    ap.add_argument('--grossa', type=int, default=60, help='resolução da grade grossa em metros (60 ou 20)')
    ap.add_argument('--recorte', type=int, default=2000, help='lado do recorte central em células de 5 m (0 = sítio inteiro)')
    ap.add_argument('--dobras', type=int, default=5, help='dobras da validação cruzada')
    ap.add_argument('--sorteios', type=int, default=100, help='sorteios Monte Carlo do declive verdadeiro')
    ap.add_argument('--limite', type=float, default=15.0, help='limite de declive do rover (graus)')
    ap.add_argument('--semente', type=int, default=2026)
    ap.add_argument('--saida', default=None)
    a = ap.parse_args()

    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    saida = a.saida or os.path.join(AQUI, 'resultados' if a.grossa == 60 else f'resultados_{a.grossa}m', a.sitio)   # 60 m em resultados/, 20 m em resultados_20m/
    os.makedirs(saida, exist_ok=True)
    log = Log(os.path.join(saida, 'log.txt'))
    rng = np.random.default_rng(a.semente)
    bloco = int(round(a.grossa / CEL))
    log('=' * 88)
    log(f'MONTE CARLO DA TESE COM DADOS LOLA REAIS — sítio {a.sitio} — {datetime.datetime.now():%d/%m/%Y %H:%M}')
    log(f'grade grossa {a.grossa} m (bloco {bloco}×{bloco}) · limite {a.limite}° · {a.dobras} dobras · {a.sorteios} sorteios · semente {a.semente}')
    log('=' * 88)

    # 1. dados -------------------------------------------------------------------------------------------------
    log('[1/7] Lendo as camadas oficiais do LOLA (surf, ldec, slp, slperr)…')
    base = os.path.join(PASTA_PGDA, a.sitio, f'{a.sitio}_final_adj_5mpp_')
    for k in ('surf', 'ldec', 'slp', 'slperr'):
        if not os.path.exists(base + k + '.tif'):
            log(f'      ERRO: não encontrei {base + k}.tif'); sys.exit(1)
    z, ldec, slp, slperr = (ler_tif(base + k + '.tif') for k in ('surf', 'ldec', 'slp', 'slperr'))
    ny0, nx0 = z.shape
    if a.recorte and a.recorte < min(ny0, nx0):
        r = a.recorte - a.recorte % bloco; y0, x0 = (ny0 - r) // 2, (nx0 - r) // 2
        z, ldec, slp, slperr = (v[y0:y0 + r, x0:x0 + r] for v in (z, ldec, slp, slperr))
        log(f'      recorte central de {r}×{r} células ({r * CEL / 1000:.1f} × {r * CEL / 1000:.1f} km) de um total de {ny0}×{nx0}')
    else:
        r = min(ny0, nx0) - min(ny0, nx0) % bloco; z, ldec, slp, slperr = (v[:r, :r] for v in (z, ldec, slp, slperr))
    medido = ldec > 0
    log(f'      {z.size:,} células · com disparo LOLA (LDEC > 0): {medido.mean() * 100:.2f}% · interpoladas: {100 - medido.mean() * 100:.2f}%')
    log(f'      declive oficial: mediana {np.median(slp):.1f}° · células > {a.limite}°: {(slp > a.limite).mean() * 100:.2f}% · erro de declive (slperr) mediano {np.median(slperr):.2f}°')
    chk = np.abs(declive(z) - slp)[2:-2, 2:-2]
    log(f'      conferência: declive recalculado da superfície × camada slp oficial: |diferença| média {chk.mean():.4f}°')

    # 2. grade grossa ------------------------------------------------------------------------------------------
    log(f'[2/7] Montando a grade grossa de {a.grossa} m…')
    zg = grade_grossa(z, bloco); sg = declive(zg)
    log(f'      declive da grade: mediana {np.median(sg):.1f}° · células > {a.limite}°: {(sg > a.limite).mean() * 100:.2f}%')

    # 3/4. validação cruzada -----------------------------------------------------------------------------------
    sigma_cel = 1.0 / np.sqrt(max(medido.mean(), 1e-3)) / 2      # metade do espaçamento médio entre disparos
    log(f'[3/7] Validação cruzada da tese em {a.dobras} dobras (σ da correção local = {sigma_cel:.1f} células)…')
    iy, ix = np.nonzero(medido)
    borda = (iy > bloco) & (iy < z.shape[0] - bloco) & (ix > bloco) & (ix < z.shape[1] - bloco)
    iy, ix = iy[borda], ix[borda]
    dobra = rng.integers(0, a.dobras, iy.size)
    reg = {k: [] for k in ('verd', 'err', 'grade', 'tese', 'den')}
    for d in range(a.dobras):
        sel = dobra == d
        m2 = medido.copy(); m2[iy[sel], ix[sel]] = False                 # esconde 1/k das células medidas
        ze, den = tese(z, zg, m2, sigma_cel); se = declive(ze)
        p = (iy[sel], ix[sel])
        reg['verd'].append(slp[p]); reg['err'].append(slperr[p]); reg['grade'].append(sg[p]); reg['tese'].append(se[p]); reg['den'].append(den[p])
        log(f'      dobra {d + 1}/{a.dobras}: {sel.sum():,} células escondidas e conferidas · |erro| médio tese {np.abs(se[p] - slp[p]).mean():.2f}° · grade {np.abs(sg[p] - slp[p]).mean():.2f}°')
    V = {k: np.concatenate(v) for k, v in reg.items()}
    n = V['verd'].size
    ze_full, den_full = tese(z, zg, medido, sigma_cel); se_full = declive(ze_full)

    # 5. Monte Carlo -------------------------------------------------------------------------------------------
    log(f'[4/7] Monte Carlo: {a.sorteios} sorteios do declive verdadeiro ~ Normal(slp, slperr) nas {n:,} células conferidas…')
    metodos = {f'Grade {a.grossa} m': (V['grade'], np.zeros(n))}
    for k, zz in Z_NIVEIS.items(): metodos[f'Tese {k} (margem nominal)'] = (V['tese'], margem_nominal(V['den'], zz))
    metodos['Tese P90 + 1° em encosta'] = (V['tese'], margem_nominal(V['den'], Z_NIVEIS['P90']) + 1.0 * (V['grade'] > 10))   # ajuste do diagnóstico: o erro cresce com o declive
    linhas = []
    for s in range(a.sorteios):
        verd = V['verd'] + V['err'] * rng.standard_normal(n)
        perigo = verd > a.limite
        for nome, (est, mg) in metodos.items():
            veta = est + mg > a.limite
            linhas.append({'sorteio': s, 'metodo': nome, 'perigos': int(perigo.sum()),
                           'perigo_nao_vetado_%': 100 * (perigo & ~veta).sum() / max(1, perigo.sum()),
                           'falso_alarme_%': 100 * (~perigo & veta).sum() / max(1, (~perigo).sum()),
                           'cobertura_%': 100 * (verd <= est + mg).mean(), 'erro_abs_medio': float(np.abs(est - verd).mean())})
        if (s + 1) % max(1, a.sorteios // 5) == 0: log(f'      sorteio {s + 1}/{a.sorteios}')

    # 6. calibração ---------------------------------------------------------------------------------------------
    log('[5/7] Calibrando as margens com os quantis reais do erro (perto × longe de dado), usando 20 sorteios de calibração…')
    perto = V['den'] >= np.median(V['den'])
    rc = np.random.default_rng(a.semente + 99991)                     # sorteios de calibração: independentes dos de avaliação
    E = np.concatenate([V['verd'] + V['err'] * rc.standard_normal(n) - V['tese'] for _ in range(20)]); P = np.tile(perto, 20)
    cal = {}
    for k, q in (('P50', .50), ('P90', .90), ('P99', .99)):
        cal[k] = (float(np.quantile(E[P], q)), float(np.quantile(E[~P], q)))
        mg = np.where(perto, cal[k][0], cal[k][1])
        for s in range(a.sorteios):
            verd = V['verd'] + V['err'] * np.random.default_rng(a.semente + 7 + s).standard_normal(n)
            perigo = verd > a.limite; veta = V['tese'] + mg > a.limite
            linhas.append({'sorteio': s, 'metodo': f'Tese {k} (margem calibrada)', 'perigos': int(perigo.sum()),
                           'perigo_nao_vetado_%': 100 * (perigo & ~veta).sum() / max(1, perigo.sum()),
                           'falso_alarme_%': 100 * (~perigo & veta).sum() / max(1, (~perigo).sum()),
                           'cobertura_%': 100 * (verd <= V['tese'] + mg).mean(), 'erro_abs_medio': float(np.abs(V['tese'] - verd).mean())})
        log(f'      {k}: margem calibrada {cal[k][0]:+.2f}° perto de dado · {cal[k][1]:+.2f}° longe (nominal do simulador: {1 + Z_NIVEIS[k] * 0.8:.2f}° / {1 + Z_NIVEIS[k] * 2.0:.2f}°)')

    # 6b. controle justo: a grade com margem (sem multirresolução) --------------------------------------------
    log(f'      Controle: grade {a.grossa} m com margem uniforme (P90 calibrada e mesmo falso alarme da tese P90)…')
    Ec = [V['verd'] + V['err'] * rc.standard_normal(n) for _ in range(20)]                  # novos sorteios de calibração
    m_g90 = float(np.quantile(np.concatenate([e - V['grade'] for e in Ec]), .90))
    mt90 = margem_nominal(V['den'], Z_NIVEIS['P90'])
    fa = lambda est, mg: np.mean([((e <= a.limite) & (est + mg > a.limite)).sum() / max(1, (e <= a.limite).sum()) for e in Ec])
    alvo = fa(V['tese'], mt90); lo, hi = -5.0, 30.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if fa(V['grade'], mid) > alvo: hi = mid
        else: lo = mid
    m_gfa = (lo + hi) / 2
    for nome, mg in ((f'Grade {a.grossa} m + margem P90 calibrada', m_g90), (f'Grade {a.grossa} m + margem (mesmo falso alarme da tese P90)', m_gfa)):
        for s in range(a.sorteios):
            verd = V['verd'] + V['err'] * np.random.default_rng(a.semente + 7 + s).standard_normal(n)
            perigo = verd > a.limite; veta = V['grade'] + mg > a.limite
            linhas.append({'sorteio': s, 'metodo': nome, 'perigos': int(perigo.sum()),
                           'perigo_nao_vetado_%': 100 * (perigo & ~veta).sum() / max(1, perigo.sum()),
                           'falso_alarme_%': 100 * (~perigo & veta).sum() / max(1, (~perigo).sum()),
                           'cobertura_%': 100 * (verd <= V['grade'] + mg).mean(), 'erro_abs_medio': float(np.abs(V['grade'] - verd).mean())})
    cal['grade_P90'] = (m_g90, m_g90); cal['grade_mesmoFA'] = (m_gfa, m_gfa)
    log(f'      margem da grade: P90 calibrada {m_g90:+.2f}° · mesmo falso alarme da tese ({100 * alvo:.1f}%) {m_gfa:+.2f}°')

    # resumo + testes pareados -----------------------------------------------------------------------------------
    import csv
    with open(os.path.join(saida, 'metricas_por_sorteio.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys())); w.writeheader(); w.writerows(linhas)
    nomes = list(dict.fromkeys(l['metodo'] for l in linhas))
    res = {}
    for nm in nomes:
        L = [l for l in linhas if l['metodo'] == nm]
        res[nm] = {k: (float(np.mean([l[k] for l in L])), float(np.percentile([l[k] for l in L], 2.5)), float(np.percentile([l[k] for l in L], 97.5)))
                   for k in ('perigo_nao_vetado_%', 'falso_alarme_%', 'cobertura_%', 'erro_abs_medio')}
    log('[6/7] Resumo (média dos sorteios [intervalo de 95%]):')
    log(f'      {"método":34s} {"perigo NÃO vetado":>22s} {"falso alarme":>20s} {"cobertura":>18s}')
    for nm in nomes:
        r_ = res[nm]; f_ = lambda t: f'{t[0]:5.1f}% [{t[1]:4.1f}–{t[2]:4.1f}]'
        log(f'      {nm:34s} {f_(r_["perigo_nao_vetado_%"]):>22s} {f_(r_["falso_alarme_%"]):>20s} {f_(r_["cobertura_%"]):>18s}')
    # testes no declive oficial (sem sorteio): McNemar exato (perigo detectado) e Wilcoxon (|erro|)
    perigo0 = V['verd'] > a.limite
    vg = V['grade'] > a.limite; vt = V['tese'] + margem_nominal(V['den'], Z_NIVEIS['P90']) > a.limite
    b = int((perigo0 & vg & ~vt).sum()); c = int((perigo0 & ~vg & vt).sum())
    p_mc = stats.binomtest(c, b + c, 0.5).pvalue if b + c else 1.0
    idx = rng.choice(n, min(n, 20000), replace=False)
    wil = stats.wilcoxon(np.abs(V['grade'][idx] - V['verd'][idx]), np.abs(V['tese'][idx] - V['verd'][idx]))
    rho = stats.spearmanr(V['den'], np.abs(V['tese'] - V['verd']))
    testes = {'mcnemar_b_so_grade_detecta': b, 'mcnemar_c_so_tese_detecta': c, 'mcnemar_p': float(p_mc),
              'wilcoxon_p_erro_abs_grade_vs_tese': float(wil.pvalue), 'n_wilcoxon': int(idx.size),
              'erro_abs_mediano_grade': float(np.median(np.abs(V['grade'] - V['verd']))), 'erro_abs_mediano_tese': float(np.median(np.abs(V['tese'] - V['verd']))),
              'spearman_densidade_vs_erro_rho': float(rho.statistic), 'spearman_p': float(rho.pvalue), 'n_perigos_oficiais': int(perigo0.sum()), 'n_celulas_conferidas': int(n)}
    log(f'      McNemar (perigos oficiais, P90): só a grade detecta {b} · só a tese detecta {c} · p {fmt_p(p_mc)}')
    log(f'      Wilcoxon |erro| grade × tese ({idx.size:,} células): mediana {testes["erro_abs_mediano_grade"]:.2f}° × {testes["erro_abs_mediano_tese"]:.2f}° · p {fmt_p(wil.pvalue)}')
    log(f'      Spearman densidade de dado × |erro| da tese: ρ = {rho.statistic:+.2f} (p {fmt_p(rho.pvalue)})')
    # 6c. curvas de troca (custo × benefício): varre o tamanho da margem de cada família -------------------------
    # Cada célula é vetada quando escala > (limite − declive estimado) / forma da margem. Com isso, a curva inteira
    # (perigo não vetado × falso alarme) sai de uma ordenação, sem escolher um ponto de operação de antemão.
    log('      Curvas de troca: perigo não vetado × falso alarme, varrendo o tamanho da margem de cada família…')
    rcv = np.random.default_rng(a.semente + 424242)
    nper = np.zeros(n); nseg = np.zeros(n); ND = 20
    for _ in range(ND):
        vv = V['verd'] + V['err'] * rcv.standard_normal(n); pp = vv > a.limite; nper += pp; nseg += ~pp
    dens = margem_nominal(V['den'], Z_NIVEIS['P90']); encosta = 1 + V['grade'] / 15.0
    FAMILIAS = {f'Grade {a.grossa} m, margem uniforme': (V['grade'], np.ones(n)),
                'Tese, margem por densidade de dado': (V['tese'], dens / dens.mean()),
                'Tese, margem por densidade e declive': (V['tese'], dens * encosta / (dens * encosta).mean())}
    ALVOS = (5, 10, 15, 20, 25, 30)
    # (uma margem que cresce com o declive da própria grade não muda a curva da grade: só reordena as mesmas células)
    curvas = {}
    for nome, (est, forma) in FAMILIAS.items():
        t = (a.limite - est) / forma                                   # escala a partir da qual a célula é vetada
        o = np.argsort(t); ts = t[o]; cp = np.cumsum(nper[o]); cs = np.cumsum(nseg[o])
        # escala s: vetadas = células com t < s  →  falso alarme = cs/Σseg ; perigo não vetado = 1 − cp/Σper
        fa = 100 * cs / max(nseg.sum(), 1); pnv = 100 * (1 - cp / max(nper.sum(), 1))
        k = np.searchsorted(fa, np.linspace(0, 60, 241)); k = np.clip(k, 0, n - 1)
        curvas[nome] = {'falso_alarme_%': fa[k].tolist(), 'perigo_nao_vetado_%': pnv[k].tolist(), 'escala_media_graus': ts[k].tolist(),
                        'no_alvo': {str(fa_): float(np.interp(fa_, fa, pnv)) for fa_ in ALVOS}}
        log(f'      {nome:46s} ' + ' · '.join(f'FA {fa_}% → {curvas[nome]["no_alvo"][str(fa_)]:4.1f}%' for fa_ in (10, 20, 30)))
    json.dump({'sitio': a.sitio, 'parametros': vars(a), 'resumo': res, 'testes': testes, 'margens_calibradas': cal, 'curvas': curvas}, open(os.path.join(saida, 'resumo.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)

    # 7. figuras e relatório -------------------------------------------------------------------------------------
    log('[7/7] Gerando figuras e o relatório HTML…')
    figs = {}
    jan = slice(z.shape[0] // 2 - 200, z.shape[0] // 2 + 200)
    fig, ax = plt.subplots(1, 4, figsize=(17, 4.4))
    for k_, (t_, A) in enumerate([('Declive oficial LOLA 5 m (verdade)', slp), (f'Grade {a.grossa} m', sg), ('Tese (grade + disparos LOLA)', se_full)]):
        im = ax[k_].imshow(A[jan, jan], cmap='magma', vmin=0, vmax=30); ax[k_].set_title(t_, fontsize=10); ax[k_].axis('off')
    ax[3].imshow(ldec[jan, jan] > 0, cmap='Greys'); ax[3].set_title(f'Células com disparo LOLA ({medido.mean() * 100:.1f}%)', fontsize=10); ax[3].axis('off')
    fig.colorbar(im, ax=ax[:3], fraction=0.015, label='declive (°)'); fig.suptitle(f'{a.sitio}: janela de 2 × 2 km no centro do recorte', fontsize=11)
    figs['mapas'] = fig_b64(fig); fig.savefig(os.path.join(saida, 'fig1_mapas.png'), dpi=110, bbox_inches='tight'); plt.close(fig)

    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    bins = np.linspace(-15, 15, 121)
    ax.hist(V['grade'] - V['verd'], bins, alpha=.6, label=f'Grade {a.grossa} m', color='#dc2626'); ax.hist(V['tese'] - V['verd'], bins, alpha=.6, label='Tese', color='#059669')
    ax.set_xlabel('declive estimado − declive oficial (°) nas células escondidas'); ax.set_ylabel('células'); ax.legend(); ax.set_yscale('log')
    figs['erro'] = fig_b64(fig); fig.savefig(os.path.join(saida, 'fig2_erros.png'), dpi=110, bbox_inches='tight'); plt.close(fig)

    fig, ax = plt.subplots(figsize=(9, 4.2))
    ys = np.arange(len(nomes)); mv = [res[nm]['perigo_nao_vetado_%'] for nm in nomes]; fa = [res[nm]['falso_alarme_%'] for nm in nomes]
    ax.barh(ys - .2, [m[0] for m in mv], .4, xerr=[[m[0] - m[1] for m in mv], [m[2] - m[0] for m in mv]], color='#dc2626', label='perigo real NÃO vetado (%)')
    ax.barh(ys + .2, [m[0] for m in fa], .4, xerr=[[m[0] - m[1] for m in fa], [m[2] - m[0] for m in fa]], color='#94a3b8', label='falso alarme (%)')
    ax.set_yticks(ys); ax.set_yticklabels(nomes, fontsize=9); ax.invert_yaxis(); ax.set_xlabel('% (média e intervalo de 95% dos sorteios)'); ax.legend(fontsize=9)
    figs['barras'] = fig_b64(fig); fig.savefig(os.path.join(saida, 'fig3_perigo_falso_alarme.png'), dpi=110, bbox_inches='tight'); plt.close(fig)

    fig, ax = plt.subplots(figsize=(5.5, 4.2))
    nominal = {'P50': 50, 'P90': 90, 'P99': 99}
    for tipo, cor in (('margem nominal', '#f59e0b'), ('margem calibrada', '#059669')):
        ax.plot([nominal[k] for k in nominal], [res[f'Tese {k} ({tipo})']['cobertura_%'][0] for k in nominal], 'o-', color=cor, label=tipo)
    ax.plot([45, 100], [45, 100], ':', color='k', label='ideal'); ax.set_xlabel('cobertura prometida (%)'); ax.set_ylabel('cobertura medida (%)'); ax.legend()
    figs['calib'] = fig_b64(fig); fig.savefig(os.path.join(saida, 'fig4_calibracao.png'), dpi=110, bbox_inches='tight'); plt.close(fig)
    fig, ax = plt.subplots(figsize=(7.5, 5)); cores = ['#dc2626', '#059669', '#0ea5e9']
    for (nome, c), cor in zip(curvas.items(), cores):
        ax.plot(c['falso_alarme_%'], c['perigo_nao_vetado_%'], color=cor, lw=2, label=nome, ls='--' if 'Grade' in nome else '-')
    ax.set_xlim(0, 45); ax.set_ylim(0, None); ax.set_xlabel('falso alarme: terreno seguro vetado (%)  →  custo'); ax.set_ylabel('perigo real não vetado (%)  →  risco')
    ax.set_title('Curva de troca: quanto mais baixa a curva, melhor (mesmo custo, menos risco)', fontsize=10, loc='left'); ax.legend(fontsize=8.5); ax.grid(alpha=.3)
    figs['curvas'] = fig_b64(fig); fig.savefig(os.path.join(saida, 'fig5_curvas_troca.png'), dpi=110, bbox_inches='tight'); plt.close(fig)

    linhas_tab = ''.join(f"<tr><td>{nm}</td>" + ''.join(f"<td>{res[nm][k][0]:.1f}% <small>[{res[nm][k][1]:.1f}–{res[nm][k][2]:.1f}]</small></td>" for k in ('perigo_nao_vetado_%', 'falso_alarme_%', 'cobertura_%')) + f"<td>{res[nm]['erro_abs_medio'][0]:.2f}°</td></tr>" for nm in nomes)
    html = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Monte Carlo LOLA — {a.sitio}</title>
<style>body{{font:16px/1.55 system-ui,sans-serif;max-width:1100px;margin:0 auto;padding:20px;color:#16171a}}h1{{font-size:28px;line-height:1.15}}table{{border-collapse:collapse;width:100%;font-size:14px}}th,td{{border-bottom:1px solid #ddd;padding:6px;text-align:right}}th:first-child,td:first-child{{text-align:left}}img{{max-width:100%;border:1px solid #eee}}.n{{color:#555;font-size:14px}}pre{{background:#f6f6f6;padding:10px;overflow-x:auto;font-size:12px}}</style></head><body>
<h1>Monte Carlo da tese com dados LOLA reais — {a.sitio}</h1>
<p class="n">Gerado em {datetime.datetime.now():%d/%m/%Y %H:%M} por <code>mc_lola.py</code>. Dados: NASA GSFC PGDA #78 (Barker et al., 2021, PSS 203, 105119). {z.size:,} células de 5 m; {medido.mean() * 100:.2f}% com disparo LOLA; grade grossa de {a.grossa} m; limite {a.limite}°; {a.dobras} dobras; {a.sorteios} sorteios; semente {a.semente}.</p>
<h2>1. O que foi testado</h2>
<p><b>Grade:</b> média de blocos de {a.grossa} m interpolada para 5 m. <b>Tese:</b> grade + correção local só onde há disparo LOLA (sem relevo falso onde não há dado), com margem P50/P90/P99. <b>Verdade:</b> o declive oficial do LOLA nas células com disparo, escondidas da tese por validação cruzada. <b>Monte Carlo:</b> em cada sorteio, o declive verdadeiro de cada célula vem de Normal(slp, slperr), o erro oficial publicado célula a célula.</p>
<h2>2. Mapas</h2><img src="data:image/png;base64,{figs['mapas']}" alt="mapas">
<h2>3. Resultado</h2>
<table><tr><th>Método</th><th>Perigo real (&gt;{a.limite:.0f}°) NÃO vetado</th><th>Falso alarme</th><th>Cobertura da margem</th><th>|erro| médio</th></tr>{linhas_tab}</table>
<p class="n">Média dos {a.sorteios} sorteios e intervalo de 95% entre colchetes. "Perigo não vetado" = célula acima do limite que o método deixaria o rover pisar. "Falso alarme" = célula segura que o método vetaria.</p>
<img src="data:image/png;base64,{figs['barras']}" alt="perigo e falso alarme">
<h2>4. Testes estatísticos (declive oficial, sem sorteio)</h2>
<ul><li>McNemar exato, perigos oficiais detectados (tese P90 × grade): só a grade detecta {b} · só a tese detecta {c} · p {fmt_p(p_mc)}.</li>
<li>Wilcoxon pareado do |erro| ({idx.size:,} células): mediana grade {testes['erro_abs_mediano_grade']:.2f}° × tese {testes['erro_abs_mediano_tese']:.2f}° · p {fmt_p(wil.pvalue)}.</li>
<li>Spearman entre densidade de disparos e |erro| da tese: ρ = {rho.statistic:+.2f} (p {fmt_p(rho.pvalue)}). Valor positivo: os disparos se concentram em terreno mais acidentado (cruzamentos de órbitas e encostas), onde o erro também é maior.</li></ul>
<img src="data:image/png;base64,{figs['erro']}" alt="erros">
<h2>5. Calibração das margens</h2><p>Margens calibradas pelos quantis reais do erro (perto / longe de dado): {', '.join(f'{k} {v[0]:+.2f}° / {v[1]:+.2f}°' for k, v in cal.items() if not k.startswith('grade'))}. Controle: grade + margem uniforme P90 {cal['grade_P90'][0]:+.2f}° e com o mesmo falso alarme da tese P90 {cal['grade_mesmoFA'][0]:+.2f}°. Nominais do simulador: P50 1,00° / 1,00°, P90 2,03° / 3,56°, P99 2,86° / 5,65°.</p>
<img src="data:image/png;base64,{figs['calib']}" alt="calibração">
<h2>5b. Curvas de troca (custo × benefício)</h2><p>Cada curva varre o tamanho da margem de uma família de métodos. Eixo x: custo (terreno seguro vetado). Eixo y: risco (perigo que passa). Para o mesmo custo, a curva mais baixa é a melhor. Não depende de escolher um ponto de operação.</p><img src="data:image/png;base64,{figs['curvas']}" alt="curvas">
<h2>6. Limites</h2><ul><li>Só as células com disparo LOLA servem de verdade; as demais do LOLA também são interpoladas.</li><li>O sorteio usa o erro RMS por célula como desvio-padrão de uma Normal independente; os 100 clones de erro correlacionado do PGDA (&gt;150 GB) não estão no projeto.</li><li>Nos mapas, a tese parece quase idêntica ao LOLA porque, nas células sem disparo, o próprio LOLA também é interpolado a partir dos mesmos disparos. Por isso a comparação justa é só a da tabela: células medidas escondidas da tese (validação cruzada).</li><li>A "tese" aqui é uma implementação de referência (grade + correção pelos disparos + margem), a mesma ideia do simulador aplicada a dado real.</li></ul>
<h2>7. Registro da execução</h2><pre>{open(os.path.join(saida, 'log.txt'), encoding='utf-8').read()}</pre></body></html>"""
    open(os.path.join(saida, 'relatorio.html'), 'w', encoding='utf-8').write(html)
    log(f'      pronto: {os.path.join(saida, "relatorio.html")}')
    log('=' * 88)

if __name__ == '__main__':
    main()
