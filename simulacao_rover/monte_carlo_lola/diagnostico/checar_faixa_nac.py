# Checagem da localização da imagem LROC NAC de Haworth contra o relevo LOLA renderizado (requer opencv-python e tifffile).
import os, numpy as np, cv2
from scipy import ndimage
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'checar_local_nac.py'),encoding='utf-8').read().split('im=cv2.imread')[0])   # reaproveita leitura, projeção, sol e render
ov=cv2.imread(B+'lroc_nac/pgda78_26/figuras/overview_Haworth.png',0).astype(np.float32)
fy=52224/ov.shape[0]; fx=2532/ov.shape[1]; print('overview', ov.shape, 'fatores', round(fy,2), round(fx,2))
CROSS,ALONG=0.966,2.183   # m por amostra e por linha, medidos do footprint (pixels não quadrados)
ovm=cv2.resize(ov,None,fx=CROSS*fx/px,fy=ALONG*fy/px,interpolation=cv2.INTER_AREA)
L0=38531*ALONG/px                       # linha do recorte no overview reamostrado
H=int(6000/px); seg_full=ovm
pa=np.array(ll2xy(-84.02,(342.81+343.58)/2)); pb=np.array(ll2xy(-87.74,(334.22+336.21)/2))
al=pb-pa; al=np.array([al[0],-al[1]]); al/=np.linalg.norm(al)
ang0=np.degrees(np.arctan2(al[1],al[0]))-90      # gira o mapa para a faixa ficar vertical
rc=int((tie[4]-y0)/px); cc=int((x0-tie[3])/px); S=int(14500/px)
res_=[]
elev=90-inc
for dL in range(-20,21,10):
    ren=render(sun_dir_map(Lss+dL),elev)
    W=np.nan_to_num(ren[rc-S:rc+S,cc-S:cc+S]).astype(np.float32)
    for da in (-4,-2,0,2,4):
        M=cv2.getRotationMatrix2D((S,S),ang0+da,1); Wr=cv2.warpAffine(W,M,(2*S,2*S))
        for fl in range(4):
            seg=ovm.copy()
            if fl&1: seg=seg[:,::-1]
            if fl&2: seg=seg[::-1]
            l0=int(L0) if not fl&2 else int(seg.shape[0]-L0)
            tpl=np.ascontiguousarray(seg[max(0,l0-H//2):l0+H//2, 3:-3])
            r=cv2.matchTemplate(Wr,tpl,cv2.TM_CCOEFF_NORMED)
            th,tw=tpl.shape; mu=cv2.boxFilter(Wr,-1,(tw,th),anchor=(0,0)); mu2=cv2.boxFilter(Wr*Wr,-1,(tw,th),anchor=(0,0))
            sd=np.sqrt(np.maximum(mu2-mu*mu,0))[:r.shape[0],:r.shape[1]]
            vazio=cv2.boxFilter((Wr==0).astype(np.float32),-1,(tw,th),anchor=(0,0))[:r.shape[0],:r.shape[1]]
            r=np.where((sd>0.08)&(vazio<0.6)&np.isfinite(r),r,-1)
            _,mx,_,loc=cv2.minMaxLoc(r)
            # posição do centro do recorte no mapa
            cpt=np.array([loc[0]+tpl.shape[1]/2, loc[1]+(l0-max(0,l0-H//2))],float)
            Mi=cv2.invertAffineTransform(M); p=Mi@np.array([cpt[0],cpt[1],1])
            dx=(p[0]-S)*px; dy=-(p[1]-S)*px
            res_.append((mx,dL,da,fl,dx,dy))
res_.sort(key=lambda t:-t[0])
for t in res_[:6]: print('r=%.3f sol%+d rot%+d flip%d  desloc x=%+.2f km y=%+.2f km dist=%.2f km'%(t[0],t[1],t[2],t[3],t[4]/1000,t[5]/1000,np.hypot(t[4],t[5])/1000))
print('mediana', np.median([t[0] for t in res_]).round(3))
b=res_[0]
outros=[t for t in res_ if np.hypot(t[4]-b[4],t[5]-b[5])>1000]
print('melhor em outro lugar (>1 km): r=%.3f em x=%+.2f y=%+.2f km (flip%d)'%(outros[0][0],outros[0][4]/1000,outros[0][5]/1000,outros[0][3]))
print('melhor sem espelhar:', [('r=%.3f d=%.2fkm'%(t[0],np.hypot(t[4],t[5])/1000)) for t in res_ if t[3]==0][:2])
# figura
mx,dL,da,fl,dx,dy=b
ren=render(sun_dir_map(Lss+dL),elev); W=np.nan_to_num(ren[rc-S:rc+S,cc-S:cc+S]).astype(np.float32)
M=cv2.getRotationMatrix2D((S,S),ang0+da,1); Wr=cv2.warpAffine(W,M,(2*S,2*S))
seg=ovm.copy(); seg=seg[:,::-1] if fl&1 else seg; seg=seg[::-1] if fl&2 else seg
l0=int(L0) if not fl&2 else int(seg.shape[0]-L0); tpl=np.ascontiguousarray(seg[max(0,l0-H//2):l0+H//2,3:-3])
r=cv2.matchTemplate(Wr,tpl,cv2.TM_CCOEFF_NORMED); th,tw=tpl.shape
mu=cv2.boxFilter(Wr,-1,(tw,th),anchor=(0,0)); mu2=cv2.boxFilter(Wr*Wr,-1,(tw,th),anchor=(0,0)); sd=np.sqrt(np.maximum(mu2-mu*mu,0))[:r.shape[0],:r.shape[1]]
vz=cv2.boxFilter((Wr==0).astype(np.float32),-1,(tw,th),anchor=(0,0))[:r.shape[0],:r.shape[1]]
r=np.where((sd>0.08)&(vz<0.6),r,-1); _,_,_,loc=cv2.minMaxLoc(r)
cy=S; cx=S
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig,ax=plt.subplots(1,3,figsize=(13,7))
ax[0].imshow(tpl,cmap='gray'); ax[0].set_title('Faixa NAC (6 km, 10 m/px)',fontsize=10)
ax[1].imshow(Wr[loc[1]:loc[1]+th,loc[0]:loc[0]+tw],cmap='gray'); ax[1].set_title(f'LOLA renderizado no melhor encaixe\n(r = {mx:.2f}; {np.hypot(dx,dy)/1000:.1f} km do centro esperado)',fontsize=10)
ax[2].imshow(Wr[cy-th//2:cy+th//2,cx-tw//2:cx+tw//2],cmap='gray'); ax[2].set_title('LOLA renderizado no centro esperado',fontsize=10)
for a in ax: a.axis('off')
plt.tight_layout(); plt.savefig(os.path.join(os.path.dirname(os.path.abspath(__file__)),'checagem_local_nac_haworth.png'),dpi=90)
