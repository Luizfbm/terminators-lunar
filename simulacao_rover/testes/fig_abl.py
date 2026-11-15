import json, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
ORD=['D0','D1a','D1b','D1c','D2','D3','D4a','D4b']
ROT={'D0':'D0\nbase 60 m\n(rover A)','D1a':'D1a\n+ escudo\n(60 m)','D1b':'D1b\n+ Simplex\n(60 m)','D1c':'D1c\n+ Mérito\nKKT (60 m)','D2':'D2\n+ multirres.\n60→5 m','D3':'D3\n+ pesos\naprendidos','D4a':'D4a\n+ MLP\n8→7→4','D4b':'D4b\n+ IA Híbrida\n14→8→3'}
def psr(c):
    d=json.load(open('abl/D1a.json' if c=='D0' else f'abl/{c}.json')); k='A' if c=='D0' else 'B'
    return np.array([100*np.mean([r['ok'] for r in t[k]]) for t in d['terrenos']])
V=[psr(c) for c in ORD]
fig,ax=plt.subplots(figsize=(9,4.6),dpi=150)
cor=['#9ca3af','#93c5fd','#93c5fd','#93c5fd','#059669','#6ee7b7','#fcd34d','#fcd34d']
ax.bar(range(len(ORD)),[v.mean() for v in V],color=cor,edgecolor='#374151',lw=0.6)
for i,v in enumerate(V):
    q1,md,q3=np.percentile(v,[25,50,75]); ax.plot([i,i],[q1,q3],color='k',lw=1.5); ax.plot(i,md,'o',color='k',ms=3.5)
    ax.text(i,v.mean()+2.5,f'{v.mean():.0f}%',ha='center',fontsize=8.5,fontweight='bold')
ax.set_xticks(range(len(ORD))); ax.set_xticklabels([ROT[c] for c in ORD],fontsize=7.5)
ax.set_ylabel('Chegada à PSR (% dos 60 rovers)'); ax.set_ylim(0,108)
ax.set_title('Ablação em degraus, 30 terrenos novos pareados (barra = média; ponto = mediana; traço = IQR)',fontsize=9.5)
ax.annotate('maior salto: +39 pontos\n(Wilcoxon p = 1,6·10⁻⁵, Holm)',xy=(4,95),xytext=(2.2,82),fontsize=8,arrowprops=dict(arrowstyle='->'))
ax.spines[['top','right']].set_visible(False); fig.tight_layout(); fig.savefig('ablacao_psr.png')
