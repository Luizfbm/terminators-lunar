# Checagem da localização da imagem LROC NAC de Haworth contra o relevo LOLA renderizado (requer opencv-python e tifffile).
import numpy as np, tifffile, cv2, sys, datetime as dt
from scipy import ndimage
R=1737400.0
import os; B=os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','..'))+os.sep
surf=B+'dados/acervo_tese/02_PGDA_78_5M/Haworth/Haworth_final_adj_5mpp_surf.tif'
crop=B+'lroc_nac/pgda78_26/figuras/crop_Haworth.png'
lat0,lon0,inc,res,utc=-86.76394,337.22298,84.43,1.571,'2009-10-04T16:27:30'
with tifffile.TiffFile(surf) as t:
    p=t.pages[0].tags; tie=p['ModelTiepointTag'].value; sc=p['ModelPixelScaleTag'].value; z=t.pages[0].asarray().astype(np.float32)
def ll2xy(lat,lon):
    c=np.radians(90+lat); rho=2*R*np.tan(c/2); L=np.radians(lon); return rho*np.sin(L), rho*np.cos(L)
def v3(lat,lon):
    a,b=np.radians(lat),np.radians(lon); return np.array([np.cos(a)*np.cos(b),np.cos(a)*np.sin(b),np.sin(a)])
def xy_of_v(v):
    lat=np.degrees(np.arcsin(v[2]/np.linalg.norm(v))); lon=np.degrees(np.arctan2(v[1],v[0])); return ll2xy(lat,lon)
# Sol: longitude subsolar aproximada pela elongação média D (Meeus), erro ~±7° (libração)
T=(dt.datetime.fromisoformat(utc)-dt.datetime(2000,1,1,12)).total_seconds()/86400/36525
D=(297.8501921+445267.1114034*T)%360; Lss=(180-D)%360
print(f'D={D:.1f}°, longitude subsolar aprox. {Lss:.1f}°')
x0,y0=ll2xy(lat0,lon0); s=v3(lat0,lon0)
def sun_dir_map(Lss):
    u=v3(0,Lss); h=u-np.dot(u,s)*s; h/=np.linalg.norm(h)
    xa,ya=xy_of_v(s+1e-4*h); d=np.array([xa-x0,ya-y0]); return d/np.linalg.norm(d)
# DEM em 10 m, janela grande para sombras projetadas
f=2; zz=z[::f,::f]; px=sc[0]*f
cols=(np.arange(zz.shape[1])+0.5)*px+tie[3]; rows=tie[4]-(np.arange(zz.shape[0])+0.5)*px
def render(az_vec, elev):
    # sol: direção no mapa az_vec (x,y), linhas crescem para -y
    dc,dr=az_vec[0],-az_vec[1]; ang=np.degrees(np.arctan2(dr,dc))
    zr=ndimage.rotate(zz,ang,reshape=True,order=1,cval=np.nan)  # sol agora aponta para +coluna
    m=np.isnan(zr); zf=np.where(m,-1e9,zr)
    te=np.tan(np.radians(elev)); n=zf.shape[1]
    # sombra: ponto j iluminado se z_j >= max_{k>j}(z_k - (k-j)*px*te)
    h=np.full(zf.shape[0],-1e18); lit=np.ones_like(zf,bool)
    for j in range(n-1,-1,-1):
        h=h-px*te; lit[:,j]=zf[:,j]>=h; h=np.maximum(h,zf[:,j])
    gy,gx=np.gradient(np.where(m,0,zr),px)
    nrm=np.sqrt(1+gx**2+gy**2); ce=np.cos(np.radians(elev)); se=np.sin(np.radians(elev))
    cosi=( -gx*ce + se)/nrm  # sol na direção +coluna
    img=np.clip(cosi,0,1)*lit; img[m]=np.nan
    back=ndimage.rotate(img,-ang,reshape=False,order=1,cval=np.nan)
    H,W=back.shape; h0,w0=zz.shape; r0=(H-h0)//2; c0=(W-w0)//2
    return back[r0:r0+h0,c0:c0+w0]
im=cv2.imread(crop,0).astype(np.float32)
im5=cv2.resize(im,None,fx=res/px,fy=res/px,interpolation=cv2.INTER_AREA)
rc=int((tie[4]-y0)/px); cc=int((x0-tie[3])/px); S=int(5000/px)
best=[]
elev=90-inc
for dL in (-15,-10,-5,0,5,10,15):
    ren=render(sun_dir_map(Lss+dL),elev)
    win=np.nan_to_num(ren[rc-S:rc+S,cc-S:cc+S]).astype(np.float32)
    for flip in (0,1):
        t0=im5[:,::-1] if flip else im5
        for th in range(0,360,3):
            M=cv2.getRotationMatrix2D((t0.shape[1]/2,t0.shape[0]/2),th,1); tr=cv2.warpAffine(t0,M,(t0.shape[1],t0.shape[0]))
            k=int(t0.shape[0]/2**0.5)//2; c=t0.shape[0]//2; tpl=tr[c-k:c+k,c-k:c+k]
            if tpl.std()<1e-3: continue
            r=cv2.matchTemplate(win,tpl,cv2.TM_CCOEFF_NORMED)
            mu=cv2.boxFilter(win,-1,(2*k,2*k),normalize=True,anchor=(0,0)); mu2=cv2.boxFilter(win*win,-1,(2*k,2*k),normalize=True,anchor=(0,0))
            sd=np.sqrt(np.maximum(mu2-mu*mu,0))[:r.shape[0],:r.shape[1]]
            r=np.where((sd>0.05)&np.isfinite(r),r,-1); _,mx,_,loc=cv2.minMaxLoc(r)
            best.append((mx,dL,flip,th,loc,k))
best.sort(key=lambda b:-b[0])
mx,dL,flip,th,loc,k=best[0]
dx=(loc[0]+k-S)*px; dy=-(loc[1]+k-S)*px
sc_=np.array([b[0] for b in best])
print(f'melhor correlação {mx:.3f} (mediana das tentativas {np.median(sc_):.3f}, 2ª melhor com outra orientação {[b[0] for b in best if min(abs(b[3]-th),360-abs(b[3]-th))>15 or b[2]!=flip][0]:.3f})')
print(f'sol ajuste {dL:+d}°, espelhado={flip}, rotação={th}°, deslocamento do centro esperado: {dx/1000:+.2f} km (x), {dy/1000:+.2f} km (y), distância {np.hypot(dx,dy)/1000:.2f} km')
ren=render(sun_dir_map(Lss+dL),elev); win=np.nan_to_num(ren[rc-S:rc+S,cc-S:cc+S])
t0=im5[:,::-1] if flip else im5; M=cv2.getRotationMatrix2D((t0.shape[1]/2,t0.shape[0]/2),th,1); tr=cv2.warpAffine(t0,M,(t0.shape[1],t0.shape[0]))
c=t0.shape[0]//2; tpl=tr[c-k:c+k,c-k:c+k]
np.save(os.path.join(os.path.dirname(os.path.abspath(__file__)),'res_nac.npy'),dict(win=win,tpl=tpl,loc=loc,k=k,S=S,px=px,mx=mx))
