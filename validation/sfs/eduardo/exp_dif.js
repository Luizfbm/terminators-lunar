// Treino e teste em RELEVO REAL (faixas LOLA) com escada de dificuldade. uso: CFG=<nome> NIV=<0..3> POP=<n> node exp_dif.js
const fs=require('fs'),path=require('path'),zlib=require('zlib');const e=process.env;
const htmlPath=e.ARQ||path.join(__dirname,'..','animacao_tese_rover_neuroevolucao_v18.html');
const html=fs.readFileSync(htmlPath,'utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
const tag=(id)=>{const i=html.indexOf('id="'+id+'">')+id.length+6;return html.slice(i,html.indexOf('</script>',i));};
const meta=JSON.parse(tag('metaLOLA'));
const raw=zlib.inflateSync(Buffer.from(tag('dadosLOLA').trim(),'base64'));
N.carregarLOLA(meta,new Uint8Array(raw.buffer,raw.byteOffset,raw.length));
const NIV=+(e.NIV||0);   // 0 base | 1 relevo perigoso | 2 + metade das dificuldades | 3 + todas
const KREL=NIV>=1?1.3:1, T_=NIV===2?0.5:NIV===3?1:0;
const GW=meta.GW,GH=meta.GH;let perig=[];
for(let k=0;k<meta.faixas.length;k++){const f=meta.faixas[k],d=N.faixaLOLA(k);
  for(let i=0;i<d.dem.length;i++)d.dem[i]=f.zmin+(d.dem[i]-f.zmin)*KREL;
  if(f.teste){let n=0,t=0;for(let y=1;y<GH-1;y++)for(let x=1;x<GW-1;x++){const gx=(d.dem[y*GW+x+1]-d.dem[y*GW+x-1])/10,gy=(d.dem[(y+1)*GW+x]-d.dem[(y-1)*GW+x])/10;if(Math.atan(Math.hypot(gx,gy))*57.2958>15)n++;t++;}perig.push(100*n/t);}
  f.slperr_med*=(1+T_);f.slperr_int*=(1+T_);}
const pPerig=perig.reduce((a,b)=>a+b,0)/perig.length;
N.definirEscala('realista');N.definirTerreno('lola');
const CFG={
  RT_nom:{modoB:'regra',fontePrev:'t60',margem:'nominal'},
  RT_cal:{modoB:'regra',fontePrev:'t60',margem:'calibrada'},
  R60:   {modoB:'regra',fontePrev:'b60',margem:'nominal'},
  R20:   {modoB:'regra',fontePrev:'b20',margem:'nominal'},
  R20_marg:{modoB:'regra',fontePrev:'b20m',margem:'nominal'},
  RT20:  {modoB:'regra',fontePrev:'t20',margem:'nominal'},
  RLOLA5:{modoB:'regra',fontePrev:'lola5',margem:'nominal'},
  RLOLA5_marg:{modoB:'regra',fontePrev:'lola5m',margem:'nominal'},
  R_oraculo:{modoB:'regra',fontePrev:'real',margem:'nominal'},
  H_sint:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true},
  H_lola:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true,treino:8,mc:true},
  H_lola30:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true,treino:30,mc:true},
  H_lola30_semMC:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true,treino:30,mc:false},
  H_lola_semMC:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true,treino:8,mc:false},
  M_fixo:{modoB:'merito',fontePrev:'t60',margem:'nominal',pesos:'fixo'},
  M_MC:{modoB:'merito',fontePrev:'t60',margem:'nominal',pesos:'evolutivo',treino:15,mc:true},
  M_semMC:{modoB:'merito',fontePrev:'t60',margem:'nominal',pesos:'evolutivo',treino:15,mc:false},
};
const nome0=e.CFG,nome=nome0+(e.TAG||''),c=CFG[nome0];if(!c)throw new Error('CFG?');
N.definirMargem(c.margem);
const S=N.criarSim();
Object.assign(S,{modoB:c.modoB,fontePrev:c.fontePrev,planejadorB:'b',planejadorA:'a',conf:'P90',modelo:'padrao',custoHib:true,corredorAtivo:false,multiRota:true,camera:'ok',valCada:0});
if(c.pesos)S.pesosModo=c.pesos;
if(c.iahPre!==undefined)S.iahPre=c.iahPre;
S.pop=+(e.POP||20);if(e.SEED){S.seedBase=+e.SEED;S.seed=+e.SEED;}S.fisicaReal=true;
const t0=Date.now();
N.MC_LOLA.ativo=c.mc!==false;
N.reiniciar(S);
if(e.SEED){let a=(+e.SEED)>>>0;S.rng=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 S.genomas=Array.from({length:S.pop},()=>N.criarGenoma(S.rng,S.camadas,S.ampIni));N.nascer(S);}
let g=0;const treino=[];
if(c.treino){while(S.gen<=c.treino&&g++<6e7)N.passo(S);for(const h of S.historico)treino.push({gen:h.gen,bPct:+h.bPct.toFixed(1),bMeta:+h.bMeta.toFixed(1)});}
if(c.pesos==='evolutivo'&&S.eliteW){S.pesosUsuario={...S.eliteW};console.log('pesos',JSON.stringify(S.eliteW));}
S.pesosModo='fixo';
N.MC_LOLA.ativo=true;   // o TESTE sempre sorteia o erro (mesmas sementes para todas as configurações: pareado)
const Q=N.iniciarTeste(S);Q.corredorAtivo=false;Q.fisicaReal=true;
const semTeto=e.SEMTETO==='1';
if(e.TMAX||semTeto)Q.tMax=+(e.TMAX||4000);
if(NIV>=2){Q.camAlcance=10*(1-0.5*T_);if(NIV===3)Q.camera='degradada';Q.replanejar=(NIV===2);}
else Q.replanejar=true;
const out={cfg:nome,niv:NIV,pop:S.pop,semTeto,tMax:Q.tMax||N.T_MAX,pPerig,conf:c,treino,terrenos:[]};
for(let k=0;k<N.LOLA.teste.length;k++){
  const sd=7300+k;Q.seed=sd;Q.T=N.terrenoPorPapel(sd,'teste',k);Q.sunAz=0;Q.gen=N.TESTE.length;Q.historico=[];Q.ultima=null;N.nascer(Q);
  const A0=Q.A,B0=Q.B,lola=Q.T.lola,plano={A:Q.plano.A,B:Q.plano.B};
  let j=0;while(Q.historico.length<1&&j++<9e6)N.passo(Q);
  const rov=(L)=>L.map(r=>({x:Math.min(r.x,N.GOAL_X)/N.GOAL_X*100,ok:r.chegou?1:0,m:r.chegou?'META':(r.motivo||'?'),per:+(100*(r.nPerigo||0)/Math.max(1,r.nPassos||1)).toFixed(2),nPer:r.nPerigo||0,nPas:r.nPassos||0,maxS:+(r.maxSlope||0).toFixed(1),tFim:+(r.tFim||Q.t||0).toFixed(1)}));
  out.terrenos.push({k,lola,plano,A:rov(A0),B:rov(B0)});
  process.stdout.write('.');
}
const outDir=path.join(__dirname,e.OUT_DIR||'lola4');
fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,`${nome}.json`),JSON.stringify(out));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,L=out.terrenos.flatMap(t=>t.B),A=out.terrenos.flatMap(t=>t.A);
const tomb=(X)=>100*mean(X.map(r=>r.m.startsWith('TOMB')?1:0));
const per=(X)=>mean(X.map(r=>r.per));
console.log(`\n[N${NIV}${semTeto?' SEMTETO':''} perigo>15°=${pPerig.toFixed(1)}%] ${nome} | ${((Date.now()-t0)/60000).toFixed(1)} min | B meta ${(100*mean(L.map(r=>r.ok))).toFixed(1)}% rota ${mean(L.map(r=>r.x)).toFixed(1)}% tomb ${tomb(L).toFixed(1)}% perigo ${per(L).toFixed(2)}% | A meta ${(100*mean(A.map(r=>r.ok))).toFixed(1)}% tomb ${tomb(A).toFixed(1)}%`);
