import sys,json,glob,time; sys.path.insert(0,'/home/claude/work')
from lib import *
from metrics import SUN_R
import numpy as np
f64=ctypes.POINTER(ctypes.c_double)
L.horizon_dir.argtypes=[f32p,ctypes.c_int,ctypes.c_int,ctypes.c_double,ctypes.c_double,ctypes.c_double,
                        f32p,ctypes.c_int,ctypes.c_int,ctypes.c_double,ctypes.c_double,ctypes.c_double,
                        f64,f64,ctypes.c_int,ctypes.c_double,ctypes.c_double,ctypes.c_double,f64]
def hdir(fine,coarse,sites,ang,obs=0.0,dmax=75000.0):
    sites=np.ascontiguousarray(sites,dtype=np.float64); ang=np.ascontiguousarray(ang,dtype=np.float64); out=np.empty(len(sites))
    def P(r): return (r.a.ctypes.data_as(f32p),r.a.shape[1],r.a.shape[0],r.px,r.xc0,r.yc0) if r is not None else (None,0,0,1.0,0.0,0.0)
    L.horizon_dir(*P(fine),*P(coarse),sites.ctypes.data_as(f64),ang.ctypes.data_as(f64),len(sites),obs,dmax,RM,out.ctypes.data_as(f64)); return out
def block(r,k):
    a=r.a; n=a.shape[0]//k*k; b=a[:n,:n].reshape(n//k,k,n//k,k).mean((1,3)).astype(np.float32)
    off=(k-1)/2*r.px; return Ras(b,r.px*k,r.xc0+off,r.yc0-off)
B2=B+"Enhanced Topography Models for selected Lunar South Pole regions with Shape-from-Shading/A3CLR22_9_deGerlache_Rim/A3CLR22_9_deGerlache_Rim/"
reg="de Gerlache Rim"; sfs=sfs_ras(reg); ref=Ras(sfs.a-sfs_ras(reg,'DIFF').a,5.0,sfs.xc0,sfs.yc0); lo=lola20()
cfgs={'SfS 5 m':(sfs,lo),'LOLA 5 m (ref.)':(ref,lo),'LOLA 20 m':(lo,None),'LOLA 60 m':(block(lo,3),None),'LOLA 240 m':(block(lo,12),None)}
STRIDE=10; rows=[]
ids=sorted(set(p.split('GLDIMGP_005_')[1][:-4] for p in glob.glob(B2+'LROC-NAC-maps/*.tif')))
t00=time.time()
for iid in ids:
    jp=B2+f'LROC-NAC-adjust/A309_GLDACAM_005_{iid}.json'
    try: t=open(jp).read(); j=json.loads(t[t.index('{'):])
    except Exception as e: continue
    from PIL import Image; Image.MAX_IMAGE_PIXELS=None
    im=Image.open(B2+f'LROC-NAC-maps/A309_GLDIMGP_005_{iid}.tif'); tg=im.tag_v2; a=np.array(im,dtype=np.float32); x0,y0=tg[33922][3],tg[33922][4]
    rr,cc=np.meshgrid(np.arange(STRIDE//2,a.shape[0],STRIDE),np.arange(STRIDE//2,a.shape[1],STRIDE),indexing='ij')
    v=a[rr,cc]; ok=v>-1e30; rr,cc,v=rr[ok],cc[ok],v[ok]
    if len(v)<500: continue
    x=x0+(cc+0.5)*5.0; y=y0-(rr+0.5)*5.0
    sp=np.array(j['m_sunPosition']).reshape(-1,3); sun=sp[len(sp)//2]            # m, corpo-fixo, ao centro da imagem
    lat,lon=xy2latlon(x,y); la,lo_=np.radians(lat),np.radians(lon)
    up=np.stack([np.cos(la)*np.cos(lo_),np.cos(la)*np.sin(lo_),np.sin(la)],1); east=np.stack([-np.sin(lo_),np.cos(lo_),0*lo_],1); north=np.cross(up,east)
    vec=sun[None,:]-up*RM; vec/=np.linalg.norm(vec,axis=1)[:,None]
    el=np.degrees(np.arcsin((vec*up).sum(1))); az=np.arctan2((vec*east).sum(1),(vec*north).sum(1))
    ang=np.radians(lon)+az
    lit_obs=v>0.001
    r=dict(img=iid,n=len(v),sun_el=el.mean(),obs_lit=lit_obs.mean(),et=j['m_centerEphemerisTime'])
    sites=np.c_[x,y]
    for k,(f,c) in cfgs.items():
        h=hdir(f,c,sites,ang)
        for tag,add in (('c',0.0),('l',SUN_R)):
            p=(el+add)>h; tp=(p&lit_obs).sum(); tn=(~p&~lit_obs).sum(); fp=(p&~lit_obs).sum(); fn=(~p&lit_obs).sum(); n=len(v)
            po=(tp+tn)/n; pe=((tp+fp)*(tp+fn)+(tn+fn)*(tn+fp))/n**2
            r[f'acc_{k}_{tag}']=po; r[f'kappa_{k}_{tag}']=(po-pe)/(1-pe) if pe<1 else np.nan
            r[f'fpr_{k}_{tag}']=fp/max(1,fp+tn); r[f'fnr_{k}_{tag}']=fn/max(1,fn+tp); r[f'pred_lit_{k}_{tag}']=p.mean()
    rows.append(r); print(iid,len(v),'el %.2f obs_lit %.2f'%(r['sun_el'],r['obs_lit']),'acc c:',{k:round(r[f'acc_{k}_c'],3) for k in cfgs},'%.0fs'%(time.time()-t00),flush=True)
import pandas as pd; pd.DataFrame(rows).to_csv('/home/claude/work/fotos_dgr.csv',index=False); print('FIM')
