import sys, os, numpy as np, tifffile
from scipy import ndimage
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,os.path.join(AQUI,'..'))
import mc_lola as M
B=os.path.join(AQUI,'..','..','..','dados','acervo_tese','02_PGDA_78_5M')
R=1737400.0
def geo(f):
    t=tifffile.TiffFile(f); p=t.pages[0].tags
    tie=p['ModelTiepointTag'].value; sc=p['ModelPixelScaleTag'].value; sh=t.pages[0].shape
    return tie,sc,sh
def latlon(x,y):
    rho=np.hypot(x,y); c=2*np.arctan(rho/(2*R)); lat=-(90-np.degrees(c)); lon=np.degrees(np.arctan2(x,y))%360
    return lat,lon
for st in sys.argv[1:]:
    base=f'{B}/{st}/{st}_final_adj_5mpp_'
    tie,sc,sh=geo(base+'surf.tif')
    z,ldec,slp,slperr=(M.ler_tif(base+k+'.tif') for k in ('surf','ldec','slp','slperr'))
    ny0,nx0=z.shape; bloco=12; r=2000-2000%bloco; y0,x0=(ny0-r)//2,(nx0-r)//2
    z,ldec,slp,slperr=(v[y0:y0+r,x0:x0+r] for v in (z,ldec,slp,slperr))
    xc=tie[3]+sc[0]*(x0+r/2); yc=tie[4]-sc[1]*(y0+r/2)
    print(f'\n=== {st}: centro do recorte x={xc/1000:.2f} km y={yc/1000:.2f} km -> lat {latlon(xc,yc)[0]:.4f} lon {latlon(xc,yc)[1]:.3f}; recorte 10x10 km; medido {100*(ldec>0).mean():.1f}%')
    medido=ldec>0; zg=M.grade_grossa(z,bloco); sg=M.declive(zg)
    sig=1/np.sqrt(max(medido.mean(),1e-3))/2
    rng=np.random.default_rng(2026); iy,ix=np.nonzero(medido)
    bd=(iy>bloco)&(iy<r-bloco)&(ix>bloco)&(ix<r-bloco); iy,ix=iy[bd],ix[bd]; dob=rng.integers(0,5,iy.size)
    rel=ndimage.generic_filter(z[::4,::4],np.std,size=3)  # ~60 m relief coarse
    rel=np.kron(rel,np.ones((4,4)))[:r,:r]
    out={k:[] for k in 'verd tese den dist sg rel'.split()}
    for d in range(5):
        s=dob==d; m2=medido.copy(); m2[iy[s],ix[s]]=False
        ze,den=M.tese(z,zg,m2,sig); se=M.declive(ze)
        dist=ndimage.distance_transform_edt(~m2)*5
        p=(iy[s],ix[s])
        for k,v in (('verd',slp),('tese',se),('den',den),('dist',dist),('sg',sg),('rel',rel)): out[k].append(v[p])
    V={k:np.concatenate(v) for k,v in out.items()}
    mg=M.margem_nominal(V['den'],1.282)
    per=V['verd']>15; miss=per&(V['tese']+mg<=15); ok=per&~miss
    print(f'perigos {per.sum():,}; não vetados (tese P90) {miss.sum():,} = {100*miss.mean()/max(per.mean(),1e-9):.1f}%')
    f=lambda a: f'{np.median(a):.1f}'
    print('                     perdidos  |  vetados')
    print(f'declive real med     {f(V["verd"][miss])}°    | {f(V["verd"][ok])}°')
    print(f'declive tese med     {f(V["tese"][miss])}°    | {f(V["tese"][ok])}°')
    print(f'declive grade60 med  {f(V["sg"][miss])}°    | {f(V["sg"][ok])}°')
    print(f'dist. dado vizinho   {f(V["dist"][miss])} m    | {f(V["dist"][ok])} m')
    print(f'margem aplicada      {f(mg[miss])}°    | {f(mg[ok])}°')
    print(f'perdidos com real>20°: {100*(V["verd"][miss]>20).mean():.1f}% ; entre 15-17°: {100*(V["verd"][miss]<17).mean():.1f}%')
    print(f'perdidos em zona "perto de dado" (margem pequena): {100*(mg[miss]<2.5).mean():.1f}% ; perigos totais nessa zona: {100*(mg[per]<2.5).mean():.1f}%')
    print(f'perdidos onde a grade60 já marca >10°: {100*(V["sg"][miss]>10).mean():.1f}%')
    # sensibilidade: se margem fosse +1° só onde grade>10
    for extra in (1,2,3):
        mg2=mg+extra*(V['sg']>10); miss2=per&(V['tese']+mg2<=15); fa=(~per&(V['tese']+mg2>15)).sum()/max((~per).sum(),1); fa0=(~per&(V['tese']+mg>15)).sum()/max((~per).sum(),1)
        print(f'  margem +{extra}° onde a grade marca >10°: perdidos {100*miss2.sum()/per.sum():.1f}% ; falso alarme {100*fa0:.1f}% -> {100*fa:.1f}%')
