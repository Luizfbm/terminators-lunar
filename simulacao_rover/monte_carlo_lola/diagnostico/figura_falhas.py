import os, sys, numpy as np
from scipy import ndimage
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,os.path.join(AQUI,'..')); import mc_lola as M
B=os.path.join(AQUI,'..','..','..','dados','acervo_tese','02_PGDA_78_5M')
fig,axs=plt.subplots(1,2,figsize=(14,7.4))
for ax,st in zip(axs,['NPC','Haworth']):
    base=f'{B}/{st}/{st}_final_adj_5mpp_'
    z,ldec,slp=(M.ler_tif(base+k+'.tif') for k in ('surf','ldec','slp'))
    ny0,nx0=z.shape; r=1992; y0,x0=(ny0-r)//2,(nx0-r)//2
    z,ldec,slp=(v[y0:y0+r,x0:x0+r] for v in (z,ldec,slp))
    med=ldec>0; zg=M.grade_grossa(z,12); sig=1/np.sqrt(max(med.mean(),1e-3))/2
    rng=np.random.default_rng(2026); iy,ix=np.nonzero(med); bd=(iy>12)&(iy<r-12)&(ix>12)&(ix<r-12); iy,ix=iy[bd],ix[bd]; dob=rng.integers(0,5,iy.size)
    P=[];Mi=[]
    for d in range(5):
        s=dob==d; m2=med.copy(); m2[iy[s],ix[s]]=False
        ze,den=M.tese(z,zg,m2,sig); se=M.declive(ze); p=(iy[s],ix[s])
        per=slp[p]>15; miss=per&(se[p]+M.margem_nominal(den[p],1.282)<=15)
        P.append(np.c_[iy[s][per&~miss],ix[s][per&~miss]]); Mi.append(np.c_[iy[s][miss],ix[s][miss]])
    P=np.vstack(P); Mi=np.vstack(Mi)
    gy,gx=np.gradient(z,5); hs=np.clip(0.6-0.6*gx/np.hypot(1,np.hypot(gx,gy))+0.4*gy*0,0,1)
    ls=matplotlib.colors.LightSource(315,35); hs=ls.hillshade(z,dx=5,dy=5,vert_exag=2)
    ax.imshow(hs,cmap='gray',extent=(0,r*5/1000,r*5/1000,0))
    ax.imshow(np.ma.masked_where(slp<=15,slp),cmap='Oranges',alpha=.35,vmin=15,vmax=30,extent=(0,r*5/1000,r*5/1000,0))
    ax.scatter(P[:,1]*5/1000,P[:,0]*5/1000,s=2,c='#22c55e',label=f'perigo vetado pela tese ({len(P):,})')
    ax.scatter(Mi[:,1]*5/1000,Mi[:,0]*5/1000,s=9,c='#ef4444',label=f'perigo NÃO vetado ({len(Mi):,})')
    ax.set_title(f'{st}: onde a tese P90 falha (células com disparo escondidas)',fontsize=11,loc='left'); ax.set_xlabel('km'); ax.set_ylabel('km'); ax.legend(loc='lower left',fontsize=8.5,markerscale=3)
fig.text(0.01,0.01,'Fundo: relevo sombreado do LOLA 5 m (PGDA #78). Laranja: declive oficial > 15°. Pontos: células com disparo LOLA escondidas da tese na validação cruzada (verdade = declive oficial).',fontsize=8.5)
plt.tight_layout(rect=(0,0.03,1,1)); plt.savefig(os.path.join(AQUI,'onde_a_tese_falha.png'),dpi=130)
