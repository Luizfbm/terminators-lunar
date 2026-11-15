import sys; sys.path.insert(0,'/home/claude/work')
import numpy as np, pandas as pd, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, TwoSlopeNorm
O='/mnt/user-data/outputs/entrega/'; INK,MUT='#222','#666'
d=pd.read_csv('sfs_comparacao_sitios.csv')
seq=LinearSegmentedColormap.from_list('s',['#f2f5fa','#9db9e3','#3f6fb8','#14325f'])
div=LinearSegmentedColormap.from_list('d',['#b4521f','#e9b48f','#eeeeee','#8fb2d9','#1f5a9c'])
fig,ax=plt.subplots(3,3,figsize=(12,12.5))
for i,(reg,g) in enumerate(d.groupby('region',sort=False)):
    n=int(np.sqrt(len(g))); has20=g['illum_LOLA20'].notna().any(); ref='LOLA20' if has20 else 'LOLA5'
    refl='LOLA 20 m' if has20 else 'LOLA 5 m'; ext=[g.x.min()/1e3,g.x.max()/1e3,g.y.min()/1e3,g.y.max()/1e3]
    A=g.illum_SfS.values.reshape(n,n)[::-1]; a=ax[i,0]; im=a.imshow(A,cmap=seq,vmin=0,vmax=85,extent=ext)
    a.set_title(f'{reg}\nIluminação média 2026–2045, SfS 5 m',fontsize=10,loc='left',color=INK); c=plt.colorbar(im,ax=a,fraction=.046); c.set_label('%')
    D=(g.illum_SfS-g[f'illum_{ref}']).values.reshape(n,n)[::-1]; a=ax[i,1]; im=a.imshow(D,cmap=div,norm=TwoSlopeNorm(0,-6,6),extent=ext)
    a.set_title(f'SfS − {refl}\nmediana |Δ| {np.median(abs(D)):.2f} · p95 {np.percentile(abs(D),95):.1f} pontos'.replace('.',','),fontsize=10,loc='left',color=INK)
    c=plt.colorbar(im,ax=a,fraction=.046,extend='both'); c.set_label('pontos percentuais')
    for k in (0,1): ax[i,k].set_xlabel('x polar (km)',fontsize=8,color=MUT); ax[i,k].set_ylabel('y polar (km)',fontsize=8,color=MUT); ax[i,k].tick_params(labelsize=8)
    a=ax[i,2]; a.scatter(g[f'illum_{ref}'],g.illum_SfS,s=6,color='#3f6fb8',alpha=.5,lw=0); a.plot([0,85],[0,85],color=MUT,lw=1)
    a.axvline(40,color='#bbb',lw=.8,ls='--'); a.axhline(40,color='#bbb',lw=.8,ls='--'); a.set_xlim(0,85); a.set_ylim(0,85); a.set_aspect('equal')
    a.set_xlabel(f'{refl} (%)',fontsize=8,color=MUT); a.set_ylabel('SfS 5 m (%)',fontsize=8,color=MUT); a.tick_params(labelsize=8)
    a.set_title(f'841 observadores · r = {np.corrcoef(g.illum_SfS,g[f"illum_{ref}"])[0,1]:.3f}'.replace('.',',')+'\ntracejado: limiar LEAG de 40%',fontsize=10,loc='left',color=INK)
    for s in ('top','right'): a.spines[s].set_visible(False)
fig.suptitle('Iluminação a 2 m: SfS 5 m × LOLA nas três regiões (centro do disco solar)',fontsize=13,x=.02,ha='left',color=INK)
fig.tight_layout(rect=[0,0,1,.975]); fig.savefig(O+'fig1_mapas_iluminacao_sfs_lola.png',dpi=170); plt.close(); print('fig1')
