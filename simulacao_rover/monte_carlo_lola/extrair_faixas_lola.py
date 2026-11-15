# Extrai as faixas de relevo real LOLA (PGDA #78) usadas pelo simulador v18 (modo "Relevo real LOLA").
# Uso (na pasta simulacao_rover/monte_carlo_lola):  python extrair_faixas_lola.py
# Saída: lola_faixas.json (metadados) e lola_faixas.b64 (dados comprimidos) — colados no HTML do simulador.
import sys, os, zlib, base64, json, numpy as np
AQUI=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,AQUI); import mc_lola as M
B=M.PASTA_PGDA+os.sep
ORD=['Site04','Site23','LM5','DM1','Site42','Site06','LM2','Site11','SL3','LM4','LM8','DM2','Site01','Site20v2','SL2','LM1','LM3','Site07','LM6','NPB','LM7','NPD','Shoemaker','NPA','NPC','Haworth']
TESTE=[ORD[i] for i in (1,4,7,10,13,16,19,22)]
GW,GH=600,110
out=[]; meta=[]
for st in ORD:
    base=B+f'{st}/{st}_final_adj_5mpp_'
    z,ldec,se=(M.ler_tif(base+k+'.tif') for k in ('surf','ldec','slperr'))
    n0=z.shape[0]; r=1992; o=(n0-r)//2; sl=(slice(o,o+r),)*2
    z,ldec,se=z[sl],ldec[sl],se[sl]
    med=ldec>0; zg=M.grade_grossa(z,12); sig=1/np.sqrt(max(med.mean(),1e-3))/2
    ze,den=M.tese(z,zg,med,sig)
    # escolhe 2 faixas transitáveis: fração de células > 15° mais perto de 5% (entre 0,5% e 15%), sem sobreposição
    s5=M.declive(z); cand=[]
    for r0 in range(0,r-GH,55):
        for c0 in range(0,r-GW,100):
            f=float((s5[r0:r0+GH,c0:c0+GW]>15).mean()); cand.append((abs(f-0.05),r0,c0,f))
    cand.sort(); FAIXAS=[]
    for _,r0,c0,f in cand:
        if all(abs(r0-a)>=GH or abs(c0-b)>=GW for a,b in FAIXAS): FAIXAS.append((r0,c0))
        if len(FAIXAS)==2: break
    for k,(r0,c0) in enumerate(FAIXAS):
        w=(slice(r0,r0+GH),slice(c0,c0+GW))
        d=z[w].astype(np.float64); zmin=d.min()
        q=np.round((d-zmin)/0.05).astype(np.int64); assert q.max()<65535, (st,q.max())
        dq=np.diff(np.concatenate([np.zeros((GH,1),np.int64),q],1),axis=1).astype(np.int16)   # delta ao longo de x
        dm=np.clip(np.round((ze[w]-z[w])/0.05),-32767,32767).astype(np.int16)
        m=np.packbits(med[w].ravel())
        blob=dq.tobytes()+m.tobytes()
        out.append(blob)
        sl_=M.declive(z[w]); 
        meta.append({'sitio':st,'faixa':k,'teste':st in TESTE,'zmin':round(float(zmin),3),'medido_pct':round(100*float(med[w].mean()),2),
                     'perigo15_pct':round(100*float((sl_>15).mean()),2),'perigo25_pct':round(100*float((sl_>25).mean()),2),'relevo_m':round(float(d.max()-zmin),1),'linha':int(r0),'coluna':int(c0),'slperr_med':round(float(np.median(se[w][med[w]])),3),'slperr_int':round(float(np.median(se[w][~med[w]])),3)})
    print(st, meta[-2]['perigo15_pct'], meta[-1]['perigo15_pct'], meta[-1]['relevo_m'], flush=True)
raw=b''.join(out); comp=zlib.compress(raw,9)
print('bruto %.1f MB  comprimido %.1f MB  base64 %.1f MB'%(len(raw)/1e6,len(comp)/1e6,len(base64.b64encode(comp))/1e6))
open(os.path.join(AQUI,'lola_faixas.json'),'w').write(json.dumps({'GW':GW,'GH':GH,'bytesFaixa':len(out[0]),'faixas':meta,'teste':TESTE}))
open(os.path.join(AQUI,'lola_faixas.b64'),'w').write(base64.b64encode(comp).decode())
