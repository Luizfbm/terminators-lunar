import sys; sys.path.insert(0,'/home/claude/work')
exec(open('photo2.py').read().split('lo=lola20(); STRIDE')[0])
import pandas as pd, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
d=pd.read_csv('/mnt/user-data/outputs/sfs_comparacao/fotos_todas.csv'); g=d[(d.region=='Peak Near Shackleton')&(d.obs_lit.between(.4,.65))&(d.n>15000)]
acc=lambda k:(g[f'tp_{k}_c']+g[f'tn_{k}_c'])/g.n; g=g.assign(gap=acc('SfS 5 m')-acc('LOLA 240 m')).sort_values('gap',ascending=False)
iid=g.img.iloc[0]; print(iid, g.iloc[0][['sun_el','obs_lit','gap']].to_dict())
reg='Peak Near Shackleton'; d_,c_=REG[reg]; lo=lola20(); sfs=sfs_ras(reg)
p=f"{SFS}{d_}/{d_}/LROC-NAC-maps/A308_GLDIMGP_005_{iid}.tif"; im=Image.open(p); tg=im.tag_v2; a=np.array(im,dtype=np.float32); x0,y0=tg[33922][3],tg[33922][4]
S=2; rr,cc=np.meshgrid(np.arange(0,a.shape[0],S),np.arange(0,a.shape[1],S),indexing='ij'); v=a[rr,cc]; ok=v>-1e30
x=x0+(cc+0.5)*5.0; y=y0-(rr+0.5)*5.0; sun=eph.sun_moon_fixed(id2et(iid),ME)[0]*1000.0
lat,lon=xy2latlon(x[ok],y[ok]); la,lo_=np.radians(lat),np.radians(lon)
up=np.stack([np.cos(la)*np.cos(lo_),np.cos(la)*np.sin(lo_),np.sin(la)],1); east=np.stack([-np.sin(lo_),np.cos(lo_),0*lo_],1); north=np.cross(up,east)
vec=sun[None,:]-up*RM; vec/=np.linalg.norm(vec,axis=1)[:,None]; el=np.degrees(np.arcsin((vec*up).sum(1))); az=np.arctan2((vec*east).sum(1),(vec*north).sum(1)); ang=np.radians(lon)+az
obs=v[ok]>0.001; out={}
for k,(f,c) in {'SfS 5 m':(sfs,lo),'LOLA 20 m':(lo,None),'LOLA 240 m':(block(lo,12),None)}.items():
    pr=el>hdir(f,c,np.c_[x[ok],y[ok]],ang); M=np.full(v.shape,np.nan); M[ok]=np.where(pr&obs,1,np.where(~pr&~obs,0,np.where(pr&~obs,3,2))); out[k]=(M,100*(pr==obs).mean(),100*(pr&~obs).sum()/max(1,(~obs).sum()))
from matplotlib.colors import ListedColormap
cm=ListedColormap(['#2b2b2b','#e8e8e8','#7aa7e0','#d4572a'])
rows,cols=np.where(ok); r0,r1,c0,c1=rows.min(),rows.max(),cols.min(),cols.max()
fig,axs=plt.subplots(1,4,figsize=(15,4.8))
img=np.where(ok,v,np.nan)[r0:r1+1,c0:c1+1]; axs[0].imshow(img,cmap='gray',vmin=0,vmax=np.nanpercentile(img,99)); axs[0].set_title(f'Foto LROC NAC {iid}\nSol a {g.iloc[0].sun_el:.1f}° de elevação'.replace('.',','),fontsize=10,loc='left')
for a_,(k,(M,ac,lf)) in zip(axs[1:],out.items()):
    a_.imshow(M[r0:r1+1,c0:c1+1],cmap=cm,vmin=-.5,vmax=3.5,interpolation='nearest'); a_.set_title(f'{k}: acerto {ac:.1f}%\nluz falsa {lf:.1f}% dos pixels escuros'.replace('.',','),fontsize=10,loc='left')
for a_ in axs: a_.set_xticks([]); a_.set_yticks([])
import matplotlib.patches as mp
fig.legend(handles=[mp.Patch(color='#e8e8e8',ec='#999',label='luz certa'),mp.Patch(color='#2b2b2b',label='sombra certa'),mp.Patch(color='#d4572a',label='luz falsa (prevê luz, foto escura)'),mp.Patch(color='#7aa7e0',label='sombra falsa (prevê sombra, foto clara)')],ncol=4,loc='lower center',frameon=False,fontsize=9)
fig.suptitle('Exemplo: sombra prevista por cada terreno contra a foto real · Peak Near Shackleton',x=.01,ha='left',fontsize=13)
fig.tight_layout(rect=[0,.07,1,.94]); fig.savefig('/mnt/user-data/outputs/entrega/fig4_exemplo_foto_vs_previsao.png',dpi=160); print({k:(round(v[1],1),round(v[2],1)) for k,v in out.items()})
