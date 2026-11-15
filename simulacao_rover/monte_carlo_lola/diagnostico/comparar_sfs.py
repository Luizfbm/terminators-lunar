#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Compara a tese com o mapa SfS (shape-from-shading com imagens LROC NAC; Bertone et al., NASA GSFC, PGDA #104)
nas células SEM disparo LOLA (as interpoladas), em Haworth. Os dois mapas estão na mesma grade (5 m, estereográfica polar sul).

Uso:  python comparar_sfs.py --sfs "C:\\NASA PROJETO 2026\\A3CLR22_2_Haworth" --sitio Haworth
      Pares região SfS → sítio PGDA #78: Haworth→Haworth · Connecting_Ridge→Site01 · Nobile_Rim_1→Site06 ·
      Peak_Near_Shackleton→Site07 · deGerlache_Rim→Site11 · Leibnitz_Beta_Plateau→Site20v2 · Malapert_Massif→Site23 · Nobile_Rim_2→DM2
Saída: diagnostico\\sfs_Haworth\\ (relatorio.txt, resumo.json, comparacao_sfs.png, curvas_sfs.png)
"""
import os, sys, json, argparse
import numpy as np
from scipy import ndimage
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(AQUI, '..'))
import mc_lola as M

def ler(f):
    try:
        import tifffile; return tifffile.imread(f).astype(np.float32)
    except Exception:
        from PIL import Image; Image.MAX_IMAGE_PIXELS = None
        return np.asarray(Image.open(f), dtype=np.float32)

def geo(f):
    import tifffile
    with tifffile.TiffFile(f) as t:
        p = t.pages[0].tags; tie = p['ModelTiepointTag'].value; sc = p['ModelPixelScaleTag'].value
    return tie[3], tie[4], sc[0]

def curva(est, forma, ver, lim, alvos=(5, 10, 15, 20, 25, 30)):
    per = ver > lim; t = (lim - est) / forma; o = np.argsort(t)
    fa = 100 * np.cumsum(~per[o]) / max((~per).sum(), 1); pnv = 100 * (1 - np.cumsum(per[o]) / max(per.sum(), 1))
    return {f: float(np.interp(f, fa, pnv)) for f in alvos}, fa, pnv

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sfs', required=True, help='pasta com A302_GLDELEV_005.tif'); ap.add_argument('--sitio', default='Haworth')
    ap.add_argument('--grossa', type=int, default=60); ap.add_argument('--limite', type=float, default=15.0); ap.add_argument('--recorte', type=int, default=2000)
    ap.add_argument('--sigma_max', type=float, default=0.5, help='só usa células em que a incerteza do SfS é menor que isto (m)')
    a = ap.parse_args()
    import glob
    achados = glob.glob(os.path.join(a.sfs, '**', '*_GLDELEV_005.tif'), recursive=True)
    if not achados: sys.exit('Não achei *_GLDELEV_005.tif dentro de ' + a.sfs)
    fE = achados[0]; fS = fE.replace('_GLDELEV_', '_GLDSIGM_'); print('SfS:', fE)
    base = os.path.join(M.PASTA_PGDA, a.sitio, f'{a.sitio}_final_adj_5mpp_')
    xs, ys, ds = geo(fE); xl, yl, dl = geo(base + 'surf.tif')
    if (xs, ys, ds) != (xl, yl, dl): sys.exit(f'Grades diferentes: SfS {xs, ys, ds} × LOLA {xl, yl, dl}. Este script supõe a mesma grade.')
    zs = ler(fE); sg = ler(fS) if os.path.exists(fS) else np.zeros_like(zs)
    z, ldec, slp = (ler(base + k + '.tif') for k in ('surf', 'ldec', 'slp'))
    bloco = int(round(a.grossa / M.CEL)); n0 = z.shape[0]; r = a.recorte - a.recorte % bloco; o = (n0 - r) // 2; sl = (slice(o, o + r), slice(o, o + r))
    z, ldec, slp, zs, sg = (v[sl] for v in (z, ldec, slp, zs, sg))
    ok = np.isfinite(zs) & (np.abs(zs) < 1e5); ok &= ndimage.binary_erosion(ok, iterations=2)
    medido = ldec > 0
    s_sfs = M.declive(np.where(ok, zs, 0))
    zg = M.grade_grossa(z, bloco); sgr = M.declive(zg)
    sig = 1.0 / np.sqrt(max(medido.mean(), 1e-3)) / 2
    ze, den = M.tese(z, zg, medido, sig); st = M.declive(ze); mg = M.margem_nominal(den, 1.282)
    conf = ok & (sg < a.sigma_max)
    L = [f'Sítio {a.sitio} × SfS (Bertone et al., PGDA #104) — recorte central {r * 5 / 1000:.0f} × {r * 5 / 1000:.0f} km, partida {a.grossa} m',
         f'Células com SfS confiável (incerteza de altura < {a.sigma_max} m): {100 * conf.mean():.1f}%; com disparo LOLA: {100 * medido.mean():.1f}%',
         f'Diferença de altura SfS − LOLA: mediana {np.median((zs - z)[ok]):+.2f} m, |dif.| mediano {np.median(np.abs(zs - z)[ok]):.2f} m']
    R = {}
    for rot, sel in (('COM disparo (checagem: SfS × LOLA medido)', conf & medido), ('SEM disparo (a pergunta: células interpoladas)', conf & ~medido)):
        ver = s_sfs[sel]; per = ver > a.limite
        L.append(f'\n--- {rot}: {sel.sum():,} células; perigo pelo SfS (> {a.limite:.0f}°): {100 * per.mean():.1f}%')
        R[rot] = {}
        for nome, est, mm in ((f'Grade {a.grossa} m', sgr[sel], 0), ('Mapa LOLA 5 m oficial', slp[sel], 0), ('Tese (sem margem)', st[sel], 0), ('Tese P90 (margem por densidade)', st[sel], mg[sel])):
            veta = est + mm > a.limite; e = float(np.median(np.abs(est - ver)))
            pnv = 100 * (per & ~veta).sum() / max(per.sum(), 1); fa = 100 * (~per & veta).sum() / max((~per).sum(), 1)
            L.append(f'   {nome:34s} |erro| mediano {e:5.2f}° · perigo NÃO vetado {pnv:5.1f}% · falso alarme {fa:5.1f}%')
            R[rot][nome] = {'erro_mediano': e, 'perigo_nao_vetado_%': float(pnv), 'falso_alarme_%': float(fa)}
    # curvas de troca nas células sem disparo (mesmo custo, quem deixa passar menos perigo?)
    sel = conf & ~medido; ver = s_sfs[sel]
    fams = {f'Grade {a.grossa} m, margem uniforme': (sgr[sel], np.ones(sel.sum())), 'Mapa LOLA 5 m oficial, margem uniforme': (slp[sel], np.ones(sel.sum())),
            'Tese, margem por densidade': (st[sel], mg[sel] / mg[sel].mean())}
    L.append('\n--- Curvas de troca nas células SEM disparo (perigo não vetado com o falso alarme fixado):')
    CV = {}
    for nome, (est, forma) in fams.items():
        alvo, fa, pnv = curva(est, forma, ver, a.limite); CV[nome] = (alvo, fa, pnv)
        L.append(f'   {nome:40s} ' + ' · '.join(f'FA {k}% → {v:4.1f}%' for k, v in alvo.items()))
    R['curvas_sem_disparo'] = {k: v[0] for k, v in CV.items()}
    out = os.path.join(AQUI, f'sfs_{a.sitio}'); os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'relatorio.txt'), 'w', encoding='utf-8').write('\n'.join(L)); print('\n'.join(L))
    json.dump(R, open(os.path.join(out, 'resumo.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
    w = slice(r // 2 - 250, r // 2 + 250)
    fig, ax = plt.subplots(1, 4, figsize=(19, 5))
    for k, (tt, A) in enumerate([('SfS (imagens NAC) — referência', s_sfs), ('Mapa LOLA 5 m oficial', slp), (f'Grade {a.grossa} m', sgr), ('Tese', st)]):
        im = ax[k].imshow(A[w, w], vmin=0, vmax=30, cmap='magma'); ax[k].set_title(tt, fontsize=10); ax[k].axis('off')
    fig.colorbar(im, ax=ax, shrink=.8, label='declive (°)'); fig.savefig(os.path.join(out, 'comparacao_sfs.png'), dpi=110, bbox_inches='tight'); plt.close(fig)
    fig, axc = plt.subplots(figsize=(7.5, 5))
    for (nome, (alvo, fa, pnv)), cor, ls in zip(CV.items(), ('#dc2626', '#64748b', '#059669'), ('--', ':', '-')):
        axc.plot(fa, pnv, ls, color=cor, lw=2, label=nome)
    axc.set_xlim(0, 40); axc.set_ylim(0, None); axc.set_xlabel('falso alarme (%)  →  custo'); axc.set_ylabel('perigo pelo SfS não vetado (%)  →  risco')
    axc.set_title('Células sem disparo LOLA, verdade = SfS: curva mais baixa é melhor', fontsize=10, loc='left'); axc.legend(fontsize=8.5); axc.grid(alpha=.3)
    fig.savefig(os.path.join(out, 'curvas_sfs.png'), dpi=110, bbox_inches='tight'); plt.close(fig)
    print('\npronto:', out)

if __name__ == '__main__': main()
