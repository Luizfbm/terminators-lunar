import sys,json,glob,time; sys.path.insert(0,'/home/claude/work')
from lib import *
import eph, numpy as np, pandas as pd
from PIL import Image; Image.MAX_IMAGE_PIXELS=None
SUN_R=0.267
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
ME=(eph.rx(np.array(0.2785*eph.AS))@eph.ry(np.array(78.6944*eph.AS))@eph.rz(np.array(67.8526*eph.AS))).T
def id2et(iid):
    n=int(iid[1:-2]); n = n-900000000 if n>=1000000000 else n; return n+198632808.0
lo=lola20(); STRIDE=8; rows=[]; t00=time.time()
for reg in REG:
    d,c=REG[reg]; sfs=sfs_ras(reg); ref=Ras(sfs.a-sfs_ras(reg,'DIFF').a,5.0,sfs.xc0,sfs.yc0)
    if reg=="Leibnitz Beta": cfgs={'SfS 5 m':(sfs,None),'LOLA 5 m':(ref,None),'LOLA 20 m':(block(ref,4),None),'LOLA 60 m':(block(ref,12),None),'LOLA 240 m':(block(ref,48),None)}
    else: cfgs={'SfS 5 m':(sfs,lo),'LOLA 5 m':(ref,lo),'LOLA 20 m':(lo,None),'LOLA 60 m':(block(lo,3),None),'LOLA 240 m':(block(lo,12),None)}
    for p in sorted(glob.glob(f"{SFS}{d}/{d}/LROC-NAC-maps/*.tif")):
        iid=p.split('_005_')[1][:-4]; im=Image.open(p); tg=im.tag_v2; a=np.array(im,dtype=np.float32); x0,y0=tg[33922][3],tg[33922][4]
        rr,cc=np.meshgrid(np.arange(STRIDE//2,a.shape[0],STRIDE),np.arange(STRIDE//2,a.shape[1],STRIDE),indexing='ij')
        v=a[rr,cc]; ok=v>-1e30; rr,cc,v=rr[ok],cc[ok],v[ok]
        if len(v)<500: continue
        x=x0+(cc+0.5)*5.0; y=y0-(rr+0.5)*5.0
        sun=eph.sun_moon_fixed(id2et(iid),ME)[0]*1000.0
        lat,lon=xy2latlon(x,y); la,lo_=np.radians(lat),np.radians(lon)
        up=np.stack([np.cos(la)*np.cos(lo_),np.cos(la)*np.sin(lo_),np.sin(la)],1); east=np.stack([-np.sin(lo_),np.cos(lo_),0*lo_],1); north=np.cross(up,east)
        vec=sun[None,:]-up*RM; vec/=np.linalg.norm(vec,axis=1)[:,None]
        el=np.degrees(np.arcsin((vec*up).sum(1))); az=np.arctan2((vec*east).sum(1),(vec*north).sum(1)); ang=np.radians(lon)+az
        obs=v>0.001; r=dict(region=reg,img=iid,n=len(v),sun_el=el.mean(),obs_lit=obs.mean())
        for k,(f,cz) in cfgs.items():
            h=hdir(f,cz,np.c_[x,y],ang)
            for tag,add in (('c',0.0),('l',SUN_R)):
                pr=(el+add)>h
                r[f'tp_{k}_{tag}']=int((pr&obs).sum()); r[f'tn_{k}_{tag}']=int((~pr&~obs).sum()); r[f'fp_{k}_{tag}']=int((pr&~obs).sum()); r[f'fn_{k}_{tag}']=int((~pr&obs).sum())
        rows.append(r)
        if len(rows)%10==0: print(len(rows),reg,iid,'%.0fs'%(time.time()-t00),flush=True); pd.DataFrame(rows).to_csv('fotos_todas.csv',index=False)
pd.DataFrame(rows).to_csv('fotos_todas.csv',index=False); print('FIM',len(rows),'%.0fs'%(time.time()-t00))
