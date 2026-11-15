import sys; sys.path.insert(0,'/home/claude/work')
from metrics import *
import pandas as pd, time, json
from scipy.ndimage import map_coordinates
NAZ=360; OBS=2.0
lo=lola20()
def slope_at(r,x,y,half=10.0):
    def z(dx,dy): return map_coordinates(r.a,[np.atleast_1d((r.yc0-(y+dy))/r.px),np.atleast_1d(((x+dx)-r.xc0)/r.px)],order=1,mode='nearest')[0]
    gx=(z(half,0)-z(-half,0))/(2*half); gy=(z(0,half)-z(0,-half))/(2*half)
    return np.degrees(np.arctan(np.hypot(gx,gy)))
rows=[]; demstats={}
t00=time.time()
for reg in REG:
    sfs=sfs_ras(reg); dif=sfs_ras(reg,'DIFF')
    ref=Ras(sfs.a-dif.a,sfs.px,sfs.xc0,sfs.yc0)            # LOLA de referencia a 5 m = SfS - diferenca
    polar = reg!="Leibnitz Beta"
    far = lo if polar else None
    # --- estatisticas do DEM inteiro
    d=dif.a[np.isfinite(dif.a)]
    def slp(a,k=2): 
        gx=(a[:,2*k:]-a[:,:-2*k])[1:-1*1 if False else None][k:-k,:a.shape[1]-2*k]/(2*k*sfs.px) if False else None
    def slope_full(a,k=2):
        gx=(a[k:-k,2*k:]-a[k:-k,:-2*k])/(2*k*sfs.px); gy=(a[2*k:,k:-k]-a[:-2*k,k:-k])/(2*k*sfs.px)
        return np.degrees(np.arctan(np.hypot(gx,gy)))
    ss,sr=slope_full(sfs.a),slope_full(ref.a)
    demstats[reg]=dict(diff_mean=float(d.mean()),diff_std=float(d.std()),diff_p1=float(np.percentile(d,1)),diff_p99=float(np.percentile(d,99)),
        frac_abs_gt2=float((abs(d)>2).mean()),frac_abs_gt5=float((abs(d)>5).mean()),
        slope_sfs_mean=float(ss.mean()),slope_ref_mean=float(sr.mean()),
        gt7_sfs=float((ss>7).mean()),gt7_ref=float((sr>7).mean()),gt15_sfs=float((ss>15).mean()),gt15_ref=float((sr>15).mean()),
        elev_min=float(np.nanmin(sfs.a)),elev_max=float(np.nanmax(sfs.a)))
    # --- grade de observadores (500 m, margem 1 km)
    xs=np.arange(sfs.xc0+1000,sfs.xc0+sfs.a.shape[1]*sfs.px-1000+1,500.0); ys=np.arange(sfs.yc0-sfs.a.shape[0]*sfs.px+1000,sfs.yc0-1000+1,500.0)
    X,Y=np.meshgrid(xs,ys); sites=np.c_[X.ravel(),Y.ravel()]; lat,lon=xy2latlon(sites[:,0],sites[:,1])
    cfg={'SfS':(sfs,far),'LOLA5':(ref,far)}
    if polar: cfg['LOLA20']=(lo,None)
    H={}
    for k,(f,c) in cfg.items():
        t=time.time(); H[k]=horizons(f,c,sites,naz=NAZ,obs=OBS,dmax=75000.0,curv=1); print(reg,k,'horizontes %.0fs'%(time.time()-t),flush=True)
    # angulos Sol/Terra uma vez por sitio
    ang=[(el_az(la,lo_,SUN),el_az(la,lo_,EARTH)) for la,lo_ in zip(lat,lon)]
    az=np.arange(NAZ)*360.0/NAZ
    for i in range(len(sites)):
        (se,sa),(ee,ea)=ang[i]
        r=dict(region=reg,x=sites[i,0],y=sites[i,1],lat=lat[i],lon=lon[i],
               slope_sfs=slope_at(sfs,*sites[i]),slope_ref=slope_at(ref,*sites[i]))
        if polar: r['slope_lola20']=slope_at(lo,*sites[i])
        for k,(hor,h0) in H.items():
            hh=hor[i]; hs=np.interp(sa,az,hh,period=360.0); he=np.interp(ea,az,hh,period=360.0)
            lit=se>hs; limb=(se+SUN_R)>hs; dte=ee>he
            r.update({f'h0_{k}':h0[i],f'hormean_{k}':hh.mean(),f'hormax_{k}':hh.max(),f'illum_{k}':100*lit.mean(),f'limb_{k}':100*limb.mean(),
                      f'dte_{k}':100*dte.mean(),f'dark_{k}':maxrun(~lit)*STEP_H,f'nodte_{k}':maxrun(~dte)*STEP_H})
        rows.append(r)
    np.savez_compressed(f'/home/claude/work/hor_{REG[reg][1]}.npz',**{k:v[0].astype(np.float32) for k,v in H.items()},sites=sites)
    print(reg,'pronto',len(sites),'sitios; acumulado %.0fs'%(time.time()-t00),flush=True)
pd.DataFrame(rows).to_csv('/home/claude/work/sfs_comparacao_sitios.csv',index=False)
json.dump(demstats,open('/home/claude/work/demstats.json','w'),indent=1)
print('FIM %.0fs'%(time.time()-t00))
