import sys; sys.path.insert(0,'/home/claude/work')
import numpy as np, pandas as pd, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
O='/mnt/user-data/outputs/entrega/'
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
INK,MUT,BLUE,GREY='#222','#666','#2a6fc9','#9a9a96'
# Fig 2: luz falsa
d=pd.read_csv('/mnt/user-data/outputs/sfs_comparacao/fotos_todas.csv')
ks=['SfS 5 m','LOLA 5 m','LOLA 20 m','LOLA 60 m','LOLA 240 m']
def rates(g,k): tp,tn,fp,fn=[g[f'{m}_{k}_c'].sum() for m in ('tp','tn','fp','fn')]; return 100*(tp+tn)/(tp+tn+fp+fn),100*fp/(fp+tn),100*fn/(fn+tp)
fig,ax=plt.subplots(figsize=(8,4.4))
sty={'Leibnitz Beta':(GREY,.6),'de Gerlache Rim':(GREY,1),'Peak Near Shackleton':(BLUE,1)}
rows=[]
for reg,g in d.groupby('region'):
    v=[rates(g,k)[1] for k in ks]; c,a=sty[reg]; ax.plot(range(5),v,'-o',color=c,alpha=a,lw=2.2)
    ax.annotate(f'{reg}: {v[0]:.1f}% → {v[-1]:.1f}%'.replace('.',','),(4,v[-1]),xytext=(8,0),textcoords='offset points',va='center',color=INK)
    for k in ks: a_,f_,s_=rates(g,k); rows.append(dict(regiao=reg,terreno=k,fotos=len(g),acerto_pct=round(a_,2),luz_falsa_pct=round(f_,2),sombra_falsa_pct=round(s_,2)))
p=d[d.region!='Leibnitz Beta']
for k in ks: a_,f_,s_=rates(p,k); rows.append(dict(regiao='Polares juntas',terreno=k,fotos=len(p),acerto_pct=round(a_,2),luz_falsa_pct=round(f_,2),sombra_falsa_pct=round(s_,2)))
pd.DataFrame(rows).to_csv(O+'tabela_validacao_fotos.csv',index=False)
ax.set_xticks(range(5)); ax.set_xticklabels(ks); ax.set_ylim(0,15); ax.set_xlim(-.2,4.2)
ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v,_:f'{v:.0f}%')); ax.grid(axis='y',color='#e6e6e6'); ax.set_axisbelow(True)
ax.set_title('Luz falsa cresce com a grade do terreno nas três regiões',loc='left',fontsize=13,color=INK,pad=22)
ax.text(0,1.04,'% dos pixels escuros na foto em que o modelo previu luz · 486 fotos LROC NAC, 8,87 M pixels',transform=ax.transAxes,color=MUT,fontsize=9)
fig.subplots_adjust(right=.66,top=.83); fig.savefig(O+'fig2_luz_falsa_por_grade.png',dpi=200); plt.close()
# Fig 3: margens
M=['Grade 60 m','LOLA 5 m + P50','LOLA 5 m + P90','LOLA 5 m + P99']; R=['Leibnitz Beta','de Gerlache Rim','Peak Near Shackleton']
V=np.array([[12.2,4.5,0.7,0.2],[15.5,7.7,1.2,0.3],[41.0,14.9,2.2,0.5]])
fig,ax=plt.subplots(figsize=(8,4.4)); bw=.2
for k,m in enumerate(M):
    xs=np.arange(3)+(k-1.5)*bw; b=ax.bar(xs,V[:,k],bw*.9,color=BLUE,alpha=[1,.7,.45,.25][k],label=m)
    for x,v in zip(xs,V[:,k]): ax.text(x,v+.6,f'{v:g}'.replace('.',','),ha='center',fontsize=9,color=INK)
ax.set_xticks(range(3)); ax.set_xticklabels(R); ax.set_yticks([]); ax.spines['left'].set_visible(False)
ax.legend(ncol=4,frameon=False,loc='upper left',bbox_to_anchor=(0,1.12),fontsize=9)
fig.text(.02,.95,'A grade de 60 m deixa passar até 41% das encostas acima de 15°; com P99, menos de 0,5%',fontsize=12,color=INK)
fig.text(.02,.905,'% das células perigosas (declive > 15° no SfS 5 m) que o método não marca como perigo',color=MUT,fontsize=9)
ax.set_ylim(0,46); fig.subplots_adjust(top=.76,left=.04,right=.98); fig.savefig(O+'fig3_margens_perigos_nao_vistos.png',dpi=200); plt.close()
pd.DataFrame(V,index=R,columns=M).to_csv(O+'tabela_margens.csv')
print('ok')
