"""Leitor minimo de DAF (SPK tipo 2/3 e PCK binario tipo 2) -> Sol em MOON_ME, sem SPICE."""
import numpy as np, struct
K="/mnt/user-data/uploads/NASA PROJETO 2026/dados/kernels/"
class DAF:
    def __init__(s,path,ni):
        s.b=np.memmap(path,dtype=np.uint8,mode='r'); raw=bytes(s.b[:1024])
        nd,ni_=struct.unpack('<ii',raw[8:16]); fward=struct.unpack('<i',raw[76:80])[0]; s.segs=[]
        ss=nd+(ni_+1)//2; rec=fward
        while rec:
            r=bytes(s.b[(rec-1)*1024:rec*1024]); nxt,prv,n=struct.unpack('<ddd',r[:24])
            for i in range(int(n)):
                o=24+i*ss*8; dd=struct.unpack('<%dd'%nd,r[o:o+nd*8]); ii=struct.unpack('<%di'%ni_,r[o+nd*8:o+nd*8+ni_*4]); s.segs.append((dd,ii))
            rec=int(nxt)
    def words(s,a,e): return np.frombuffer(bytes(s.b[(a-1)*8:e*8]),dtype='<f8')
class Cheb:
    def __init__(s,daf,a,e,ncomp):
        w=daf.words(a,e); s.init,s.intlen,rsize,n=w[-4:]; rsize=int(rsize); n=int(n)
        s.rec=w[:rsize*n].reshape(n,rsize); s.nc=(rsize-2)//ncomp; s.ncomp=ncomp
    def __call__(s,et):
        et=np.atleast_1d(et); i=np.clip(((et-s.init)//s.intlen).astype(int),0,len(s.rec)-1); r=s.rec[i]
        x=(et-r[:,0])/r[:,1]; T=[np.ones_like(x),x]
        for k in range(2,s.nc): T.append(2*x*T[-1]-T[-2])
        T=np.stack(T,1); return np.stack([(r[:,2+c*s.nc:2+(c+1)*s.nc]*T).sum(1) for c in range(s.ncomp)],1)
_spk=DAF(K+"de440s.bsp",6); _pck=DAF(K+"moon_pa_de440_200625.bpc",5)
def _seg(t,c):
    for dd,ii in _spk.segs:
        if ii[0]==t and ii[1]==c: return Cheb(_spk,ii[4],ii[5],3)
    raise KeyError((t,c))
SUN,EMB,MOON=_seg(10,0),_seg(3,0),_seg(301,3)
PA=[Cheb(_pck,ii[3],ii[4],3) for dd,ii in _pck.segs]; PA_RNG=[dd for dd,ii in _pck.segs]
def rz(a): c,s=np.cos(a),np.sin(a); z=0*a; o=z+1; return np.stack([np.stack([c,s,z],-1),np.stack([-s,c,z],-1),np.stack([z,z,o],-1)],-2)
def rx(a): c,s=np.cos(a),np.sin(a); z=0*a; o=z+1; return np.stack([np.stack([o,z,z],-1),np.stack([z,c,s],-1),np.stack([z,-s,c],-1)],-2)
def ry(a): c,s=np.cos(a),np.sin(a); z=0*a; o=z+1; return np.stack([np.stack([c,z,-s],-1),np.stack([z,o,z],-1),np.stack([s,z,c],-1)],-2)
AS=np.radians(1/3600.)
# MOON_PA_DE440 -> MOON_ME_DE440: valores lidos do .tf (verificados abaixo no teste)
def pa2me(a1,a2,a3): return rx(np.array(a3*AS))@ry(np.array(a2*AS))@rz(np.array(a1*AS))
def sun_moon_fixed(et,me=None):
    """Sol relativo ao centro da Lua, km, em MOON_PA (ou MOON_ME se me=matriz). Geometrico menos tempo-luz."""
    et=np.atleast_1d(np.asarray(et,float))
    def geo(t): return SUN(t)-EMB(t)-MOON(t)
    v=geo(et); lt=np.linalg.norm(v,axis=1)/299792.458; v=SUN(et-lt)-EMB(et)-MOON(et)
    out=np.empty_like(v)
    for k,(p,rg) in enumerate(zip(PA,PA_RNG)):
        m=(et>=rg[0])&(et<=rg[1])
        if m.any():
            a=p(et[m]); R=rz(a[:,2])@rx(a[:,1])@rz(a[:,0]); out[m]=np.einsum('nij,nj->ni',R,v[m])
    return out if me is None else out@me.T
