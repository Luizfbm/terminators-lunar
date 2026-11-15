import json,glob,os,numpy as np
os.chdir(os.path.dirname(os.path.abspath(__file__)))
from scipy.stats import wilcoxon
R={}
for f in sorted(glob.glob(os.environ.get('DIR','lola')+'/*.json')):
    d=json.load(open(f)); n=d['cfg']
    R[n]={'treino':d['treino'],'B':np.array([np.mean([r['ok'] for r in t['B']]) for t in d['terrenos']])*100,
          'A':np.array([np.mean([r['ok'] for r in t['A']]) for t in d['terrenos']])*100,
          'tB':np.array([np.mean([r['m'].startswith('TOMB') for r in t['B']]) for t in d['terrenos']])*100,
          'tA':np.array([np.mean([r['m'].startswith('TOMB') for r in t['A']]) for t in d['terrenos']])*100,
          'xB':np.array([np.mean([r['x'] for r in t['B']]) for t in d['terrenos']]),
          'sit':[t['lola']['sitio'] for t in d['terrenos']],
          'causas':{}}
    import collections; c=collections.Counter(r['m'] for t in d['terrenos'] for r in t['B']); R[n]['causas']=dict(c)
for n,r in R.items():
    print(f"{n:14s} B chegada {r['B'].mean():5.1f}% tomb {r['tB'].mean():4.1f}% rota {r['xB'].mean():5.1f}% | A chegada {r['A'].mean():5.1f}% tomb {r['tA'].mean():4.1f}% | treino(meta%) {[t['bMeta'] for t in r['treino']]}")
    print('      causas B:', r['causas'])
def comp(a,b,k='B'):
    x,y=R[a][k],R[b][k]; d=x-y
    p=wilcoxon(x,y).pvalue if np.any(d!=0) else 1
    print(f'{a} × {b} ({k}): {x.mean():.1f} × {y.mean():.1f}  melhor em {(d>0).sum()}/{len(d)}, pior em {(d<0).sum()}, p={p:.3g}')
ks=list(R)
for a,b in (('RT_nom','RT_cal'),('H_sint','RT_nom'),('H_lola','H_sint'),('H_lola','RT_nom'),('H_lola','H_lola_semMC')):
    if a in R and b in R: comp(a,b)
for a in ks: 
    x,y=R[a]['B'],R[a]['A']; print(f'{a}: B × A chegada {x.mean():.1f} × {y.mean():.1f}, B melhor em {(x>y).sum()}/16, p={wilcoxon(x,y).pvalue if np.any(x!=y) else 1:.3g}')
