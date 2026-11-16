import numpy as np, ctypes, sys
sys.path.insert(0,'/home/claude/work')
from load import *
L=ctypes.CDLL('/home/claude/work/libray.so')
f32p=ctypes.POINTER(ctypes.c_float); f64p=ctypes.POINTER(ctypes.c_double)
L.horizons.argtypes=[f32p,ctypes.c_int,ctypes.c_int,ctypes.c_double,ctypes.c_double,ctypes.c_double,
                     f32p,ctypes.c_int,ctypes.c_int,ctypes.c_double,ctypes.c_double,ctypes.c_double,
                     f64p,ctypes.c_int,ctypes.c_int,ctypes.c_double,ctypes.c_double,ctypes.c_double,ctypes.c_int,f64p,f64p]
RM=1737400.0
class Ras:
    def __init__(s,a,px,xc0,yc0): s.a=np.ascontiguousarray(a,dtype=np.float32); s.px=px; s.xc0=xc0; s.yc0=yc0
def lola20():
    a=np.fromfile(B+"dados/dem/LDEM_875S_20M.IMG",dtype="<i2").reshape(7584,7584).astype(np.float32)*0.5
    return Ras(a,20.0,-3791.5*20,3791.5*20)
def sfs_ras(reg,prod='ELEV'):
    a,x0,y0,px=read(reg,prod); a=a.copy(); a[a<-1e30]=np.nan
    return Ras(a,px,x0+px/2,y0-px/2)
def horizons(fine,coarse,sites,naz=360,obs=2.0,dmax=75000.0,curv=1):
    sites=np.ascontiguousarray(sites,dtype=np.float64); n=len(sites)
    out=np.empty((n,naz)); h0=np.empty(n)
    def P(r): return (r.a.ctypes.data_as(f32p),r.a.shape[1],r.a.shape[0],r.px,r.xc0,r.yc0) if r is not None else (None,0,0,1.0,0.0,0.0)
    L.horizons(*P(fine),*P(coarse),sites.ctypes.data_as(f64p),n,naz,obs,dmax,RM,curv,out.ctypes.data_as(f64p),h0.ctypes.data_as(f64p))
    return out,h0
def xy2latlon(x,y):
    rho=np.hypot(x,y); return -90+np.degrees(2*np.arctan(rho/(2*RM))), np.degrees(np.arctan2(x,y))
def latlon2xy(lat,lon):
    rho=2*RM*np.tan(np.radians(90+np.asarray(lat))/2); l=np.radians(lon); return rho*np.sin(l), rho*np.cos(l)
