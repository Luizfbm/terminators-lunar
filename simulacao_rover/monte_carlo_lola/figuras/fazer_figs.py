import json,numpy as np,matplotlib
matplotlib.use('Agg');import matplotlib.pyplot as plt,csv
C=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4']
plt.rcParams.update({'font.size':11,'axes.spines.top':False,'axes.spines.right':False,'axes.edgecolor':'#9a9994','axes.labelcolor':'#52514e','xtick.color':'#52514e','ytick.color':'#52514e','figure.facecolor':'#fcfcfb','axes.facecolor':'#fcfcfb','axes.grid':True,'grid.color':'#e6e5e1','grid.linewidth':0.8})
D='/home/claude/v14/lola4/'
cf=[('R60','Grade 60 m'),('A','Rover A (original)'),('RT_nom','Tese 60→5 m (regra)'),('M_fixo','Mérito (pesos fixos)'),('H_sint','IA Híbrida')]
def met(c,n,key):
    src='RT_nom' if c=='A' else c; side='A' if c=='A' else 'B'
    d=json.load(open(f'{D}{src}_N{n}.json'))
    f=(lambda r:r['ok']) if key=='ok' else (lambda r:r['m'].startswith('TOMB'))
    return 100*np.mean([f(r) for t in d['terrenos'] for r in t[side]])
niv=['0\nbase','1\nterreno perigoso','2\n+ metade das\ndificuldades','3\n+ todas as\ndificuldades']
rows=[]
for key,tit,fn,yl in (('ok','Chegada à meta por nível de dificuldade','fig_escada_chegada.png','Chegada à meta (%)'),('t','Tombamento por nível de dificuldade','fig_escada_tombamento.png','Tombamento (%)')):
    fig,ax=plt.subplots(figsize=(9,5.2))
    for i,(c,nm) in enumerate(cf):
        y=[met(c,n,key) for n in range(4)]; rows.append([key,nm]+[round(v,1) for v in y])
        ax.plot(range(4),y,'-o',color=C[i],lw=2,ms=8,mec='#fcfcfb',mew=2,label=nm,zorder=3 if c=='RT_nom' else 2)
        ax.annotate(nm,(3,y[3]),xytext=(8,0),textcoords='offset points',va='center',fontsize=9,color='#52514e')
    ax.set_xticks(range(4));ax.set_xticklabels(niv,fontsize=9);ax.set_ylabel(yl);ax.set_xlim(-0.2,3.9)
    ax.set_title(tit+'\n16 faixas LOLA de teste, 480 travessias por ponto',loc='left',fontsize=12,color='#0b0b0b')
    ax.legend(frameon=False,fontsize=9,loc='upper right' if key=='ok' else 'upper left');fig.tight_layout();fig.savefig(fn,dpi=160);plt.close()
with open('dados_escada.csv','w',newline='') as f:
    w=csv.writer(f);w.writerow(['metrica','metodo','nivel0','nivel1','nivel2','nivel3']);w.writerows([['chegada' if r[0]=='ok' else 'tombamento']+r[1:] for r in rows])
# relevo real 2a rodada + merito
R=[('Grade 60 m (R60)',70.3,2.8),('Rover A (original)',73.4,2.8),('Tese, margem calibrada',75.9,0.9),('Mérito, pesos sem MC',77.5,1.2),('Mérito, pesos fixos',78.1,1.6),('Tese, regra (RT_nom)',78.4,0.9),('IA Híbrida 30 ger. com MC',78.4,0.9),('IA Híbrida pré-treinada',78.8,0.0),('Mérito, pesos com MC',78.8,0.6)]
fig,ax=plt.subplots(figsize=(9,5.2));y=np.arange(len(R))
col=['#9a9994' if 'Grade' in r[0] or 'Rover A' in r[0] else C[0] for r in R]
ax.barh(y,[r[1] for r in R],height=0.6,color=col)
for i,r in enumerate(R): ax.text(r[1]+0.6,i,f'{r[1]:.1f}%  (tomb. {r[2]:.1f}%)'.replace('.',',').replace('tomb,','tomb.'),va='center',fontsize=9,color='#52514e')
ax.set_yticks(y);ax.set_yticklabels([r[0] for r in R],fontsize=9);ax.set_xlim(0,100);ax.set_xlabel('Chegada à meta (%)');ax.grid(axis='y',visible=False)
ax.set_title('Relevo real LOLA, após as correções (16 faixas, 8 sítios nunca vistos)\nCinza: sem a tese. Azul: com o mapa 60→5 m. Diferenças entre os azuis: p > 0,1',loc='left',fontsize=12,color='#0b0b0b')
fig.tight_layout();fig.savefig('fig_relevo_real_configuracoes.png',dpi=160);plt.close()
with open('dados_relevo_real.csv','w',newline='') as f:
    w=csv.writer(f);w.writerow(['configuracao','chegada_pct','tombamento_pct']);w.writerows(R)
# ablacao sintetica
A=[('D0 rover ingênuo (60 m)',17.5),('D1a + escudo',74.2),('D1b + Simplex',74.2),('D1c + Mérito (Newton/KKT)',76.4),('D2 + multirresolução 60→5 m',96.6),('D3 + pesos aprendidos',97.3),('D4a + MLP neuroevoluída',93.6),('D4b + IA Híbrida',92.6),('C2r multirresolução sem Mérito',96.2)]
fig,ax=plt.subplots(figsize=(9,5));y=np.arange(len(A))
ax.barh(y,[a[1] for a in A],height=0.6,color=[C[0] if 'multirres' in a[0] else '#9a9994' for a in A])
for i,a in enumerate(A): ax.text(a[1]+0.8,i,f'{a[1]:.1f}%'.replace('.',','),va='center',fontsize=9,color='#52514e')
ax.set_yticks(y);ax.set_yticklabels([a[0] for a in A],fontsize=9);ax.invert_yaxis();ax.set_xlim(0,105);ax.set_xlabel('Rota percorrida (média, %)');ax.grid(axis='y',visible=False)
ax.set_title('Ablação degrau a degrau em terreno sintético (30 terrenos, 60 rovers)\nAzul: degraus em que a multirresolução entra',loc='left',fontsize=12,color='#0b0b0b')
fig.tight_layout();fig.savefig('fig_ablacao_sintetica.png',dpi=160);plt.close()
with open('dados_ablacao.csv','w',newline='') as f:
    w=csv.writer(f);w.writerow(['degrau','rota_media_pct']);w.writerows(A)
