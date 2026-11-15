import numpy as np
from lib import *
P=B+"precalc/"
ET=np.load(P+"ephem_et.npy"); SUN=np.load(P+"ephem_sun.npy"); EARTH=np.load(P+"ephem_earth.npy")
SUN_R=0.267  # deg, semi-diametro solar medio
def el_az(lat,lon,vec):
    la,lo=np.radians(lat),np.radians(lon)
    up=np.array([np.cos(la)*np.cos(lo),np.cos(la)*np.sin(lo),np.sin(la)]); east=np.array([-np.sin(lo),np.cos(lo),0.0]); north=np.cross(up,east)
    v=vec-up*(RM/1000.0); v=v/np.linalg.norm(v,axis=1)[:,None]
    return np.degrees(np.arcsin(v@up)), np.degrees(np.arctan2(v@east,v@north))%360.0
def maxrun(b):
    if not b.any(): return 0
    d=np.diff(np.concatenate([[0],b.astype(np.int8),[0]])); s=np.where(d==1)[0]; e=np.where(d==-1)[0]; return int((e-s).max())
STEP_H=float(np.median(np.diff(ET))/3600.0)
def site_metrics(lat,lon,hor):
    naz=len(hor); az=np.arange(naz)*360.0/naz
    se,sa=el_az(lat,lon,SUN); ee,ea=el_az(lat,lon,EARTH)
    hs=np.interp(sa,az,hor,period=360.0); he=np.interp(ea,az,hor,period=360.0)
    lit=se>hs; limb=(se+SUN_R)>hs; dte=ee>he
    return dict(hor_mean=hor.mean(),hor_max=hor.max(),illum=100*lit.mean(),illum_limb=100*limb.mean(),dte=100*dte.mean(),
                dark_h=maxrun(~lit)*STEP_H, nodte_h=maxrun(~dte)*STEP_H, sun_max=se.max(),
                sun_cos=100*np.where(lit,np.cos(np.radians(90-np.clip(se,0,90))) ,0).mean()*0+0)
