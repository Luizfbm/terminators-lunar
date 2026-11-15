import collections
import glob
import json
import os
import sys
import numpy as np
from scipy.stats import binomtest, wilcoxon

sys.stdout.reconfigure(encoding='utf-8')
os.chdir(os.path.dirname(os.path.abspath(__file__)))

CFGS = ['R60', 'RT_nom', 'R20', 'R20_marg', 'RT20', 'RLOLA5', 'RLOLA5_marg', 'R_oraculo']
NOMES = {
    'A': 'Rover A (original 60 m)',
    'R60': 'Grade 60 m (sem margem)',
    'RT_nom': 'Tese 60→5 m (nominal P90)',
    'R20': 'Grade 20 m (sem margem)',
    'R20_marg': 'Grade 20 m (com margem P90)',
    'RT20': 'Tese 20→5 m (nominal P90)',
    'RLOLA5': 'LOLA 5 m oficial (sem margem)',
    'RLOLA5_marg': 'LOLA 5 m + margem (tiro/interp)',
    'R_oraculo': 'Oráculo 5 m real (sem erro)',
}

COMPS = [
    ('R20', 'R60', 'Resolução bruta 20 m vs 60 m'),
    ('R20_marg', 'R20', 'Efeito da margem em 20 m'),
    ('RT_nom', 'R60', 'Tese 60→5 m vs Grade 60 m'),
    ('RT20', 'R20', 'Tese 20→5 m vs Grade 20 m (sem margem)'),
    ('RT20', 'R20_marg', 'Tese 20→5 m vs Grade 20 m (com margem)'),
    ('RT20', 'RT_nom', 'Tese 20→5 m vs Tese 60→5 m'),
    ('RLOLA5_marg', 'RLOLA5', 'LOLA 5 m com margem vs LOLA 5 m bruto'),
    ('RT20', 'RLOLA5', 'Tese 20→5 m vs LOLA 5 m bruto'),
    ('RT20', 'RLOLA5_marg', 'Tese 20→5 m vs LOLA 5 m + margem'),
    ('RT20', 'R_oraculo', 'Tese 20→5 m vs Oráculo 5 m'),
    ('RT_nom', 'R_oraculo', 'Tese 60→5 m vs Oráculo 5 m'),
]


def load_battery(out_dir):
    by_niv = collections.defaultdict(dict)
    for f in sorted(glob.glob(f'{out_dir}/*.json')):
        d = json.load(open(f, encoding='utf-8'))
        niv = d['niv']
        cfg = d['cfg'].rsplit(f'_N{niv}', 1)[0]
        terrenos = d['terrenos']

        def stats_team(key):
            ok = np.array([np.mean([r['ok'] for r in t[key]]) for t in terrenos]) * 100
            tomb = np.array([np.mean([r['m'].startswith('TOMB') or 'MICRO' in r['m'] for r in t[key]]) for t in terrenos]) * 100
            preso = np.array([np.mean(['PRESO' in r['m'] or 'ESTAG' in r['m'] for r in t[key]]) for t in terrenos]) * 100
            tempo = np.array([np.mean(['TEMPO' in r['m'] for r in t[key]]) for t in terrenos]) * 100
            fora = np.array([np.mean(['FORA' in r['m'] for r in t[key]]) for t in terrenos]) * 100
            rota = np.array([np.mean([r['x'] for r in t[key]]) for t in terrenos])
            per = np.array([np.mean([r.get('per', 0.0) for r in t[key]]) for t in terrenos])
            pair = np.array([r['ok'] for t in terrenos for r in t[key]])
            pair_t = np.array([1 if (r['m'].startswith('TOMB') or 'MICRO' in r['m']) else 0 for t in terrenos for r in t[key]])
            causas = collections.Counter(r['m'] for t in terrenos for r in t[key])
            return dict(ok=ok, tomb=tomb, preso=preso, tempo=tempo, fora=fora, rota=rota, per=per, pair=pair, pair_t=pair_t, causas=dict(causas))

        by_niv[niv][cfg] = stats_team('B')
        by_niv[niv][cfg]['pPerig'] = d['pPerig']
        by_niv[niv][cfg]['pop'] = d.get('pop', len(terrenos[0]['B']))
        by_niv[niv][cfg]['tMax'] = d.get('tMax', 800)
        if cfg == 'R60':
            by_niv[niv]['A'] = stats_team('A')
    return by_niv


def w_p(x, y):
    d = x - y
    if not np.any(d != 0):
        return 1.0
    return float(wilcoxon(x, y).pvalue)


def mcnemar_p(pa, pb):
    only_a = int(np.sum((pa == 1) & (pb == 0)))
    only_b = int(np.sum((pa == 0) & (pb == 1)))
    n = only_a + only_b
    p = float(binomtest(only_a, n, 0.5).pvalue) if n > 0 else 1.0
    return only_a, only_b, p


def print_battery(title, out_dir):
    by_niv = load_battery(out_dir)
    if not by_niv:
        print(f'[{title}] sem dados em {out_dir}')
        return
    print('=' * 116)
    print(f'BATERIA: {title} ({out_dir})')
    print('=' * 116)
    for niv in sorted(by_niv):
        R = by_niv[niv]
        ref = next(iter(R.values()))
        print(f"\n--- NIVEL {niv} (perigo>15°={ref.get('pPerig', 0):.1f}%, POP={ref.get('pop', '?')}, tMax={ref.get('tMax', '?')}s) ---")
        print(f"{'CFG':13s} | {'Cheg%':6s} | {'Tomb%':6s} | {'Preso%':6s} | {'Tempo%':6s} | {'Fora%':6s} | {'Rota%':6s} | {'PerigAtrav%':11s} | Descrição")
        print('-' * 116)
        for k in ['A'] + CFGS:
            if k not in R:
                continue
            r = R[k]
            print(f"{k:13s} | {r['ok'].mean():5.1f}% | {r['tomb'].mean():5.1f}% | {r['preso'].mean():5.1f}% | {r['tempo'].mean():5.1f}% | {r['fora'].mean():5.1f}% | {r['rota'].mean():5.1f}% | {r['per'].mean():10.2f}% | {NOMES.get(k, k)}")
        print('\n  Comparações pareadas (16 faixas · Wilcoxon / 1600 rovers · McNemar):')
        for a, b, label in COMPS:
            if a not in R or b not in R:
                continue
            ra, rb = R[a], R[b]
            da = ra['ok'] - rb['ok']
            pw = w_p(ra['ok'], rb['ok'])
            ca, cb, pm = mcnemar_p(ra['pair'], rb['pair'])
            pt = w_p(ra['tomb'], rb['tomb'])
            pp = w_p(ra['per'], rb['per'])
            print(
                f"  - {label:38s}: cheg {ra['ok'].mean():5.1f}×{rb['ok'].mean():5.1f}% ({da.mean():+5.1f} pp, {int((da>0).sum())}/16>{int((da<0).sum())}, W p={pw:.3g}, McN {ca}/{cb} p={pm:.3g})"
                f" | tomb {ra['tomb'].mean():4.1f}×{rb['tomb'].mean():4.1f}% (p={pt:.3g})"
                f" | perTrav {ra['per'].mean():4.2f}×{rb['per'].mean():4.2f}% (p={pp:.3g})"
            )


if __name__ == '__main__':
    print_battery('COM TETO (T_MAX = 800 s)', 'lola_dif_teto')
    print()
    print_battery('SEM TETO (T_MAX = 4000 s)', 'lola_dif_semteto')
