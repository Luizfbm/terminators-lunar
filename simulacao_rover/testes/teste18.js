// ABLAÇÃO EM DEGRAUS (v15). Uma configuração por processo; avalia em terrenos NOVOS (nunca usados em treino nem nos 3 de teste
// da página) com os mesmos terrenos, Sol e sementes dos rovers em todas as configurações (pareamento).
// uso: CFG=D1a SEEDS=7001,...  node teste18.js     → grava abl/<CFG>.json
const fs=require('fs');const e=process.env;
const html=fs.readFileSync(e.ARQ||'v15.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
N.definirEscala('realista');N.definirTerreno('calibrado');
// D0 sai do time A de qualquer corrida (A não muda entre configurações).
const CFG={
  D1a:{modoB:'regra', fontePrev:'b60',planejadorB:'a'},                      // + restrições duras (escudo P90, portos ≤ 50 h) em 60 m
  D1b:{modoB:'regra', fontePrev:'b60',planejadorB:'b'},                      // + Simplex 2 fases/dualidade no planejamento (60 m)
  D1c:{modoB:'merito',fontePrev:'b60',planejadorB:'b'},                      // + Barreira log. + Newton/KKT (Mérito Marcato) em 60 m
  D2: {modoB:'merito',fontePrev:'t60',planejadorB:'b'},                      // + Multirresolução 60→5 m (P90, No False Relief)
  D3: {modoB:'merito',fontePrev:'t60',planejadorB:'b',treinoPesos:10},       // + pesos do mérito aprendidos offline (10 ger. em terrenos de treino) e congelados
  D4a:{modoB:'ia',    fontePrev:'t60',planejadorB:'b',treinoRede:10},        // + Neuroevolução MLP 8→7→4 sob escudo P90 (10 ger. de treino, congelada)
  D4b:{modoB:'iaH',   fontePrev:'t60',planejadorB:'b',iahPre:true},          // + IA Híbrida 14→8→3 pré-treinada (congelada) sob escudo direcional
  C2r:{modoB:'regra', fontePrev:'t60',planejadorB:'b'},                      // controle: multirresolução SEM Mérito (regra + Simplex + tese)
};
const nome=e.CFG, c=CFG[nome]; if(!c) throw new Error('CFG?');
const S=N.criarSim();
Object.assign(S,{modoB:c.modoB,fontePrev:c.fontePrev,planejadorB:c.planejadorB,planejadorA:'a',conf:'P90',modelo:'padrao',custoHib:true,corredorAtivo:true,multiRota:true,camera:'ok'});
if(c.iahPre!==undefined)S.iahPre=c.iahPre;
const G=c.treinoPesos||c.treinoRede||0;
if(c.treinoPesos)S.pesosModo='evolutivo';
N.reiniciar(S);
const t0=Date.now();let g=0;while(S.gen<=G&&g++<6e7)N.passo(S);           // treino em terrenos de treino (sementes 2026 + 101·k)
const treino=S.historico.map(h=>+h.bPct.toFixed(1));
if(c.treinoPesos){S.pesosUsuario={...S.eliteW};S.pesosModo='fixo';}       // congela UM vetor de pesos (o ótimo do Marcato)
const Q=N.iniciarTeste(S);
const seeds=(e.SEEDS).split(',').map(Number);
const out={cfg:nome,conf:c,treino,pesos:c.treinoPesos?S.pesosUsuario:null,terrenos:[]};
for(const sd of seeds){
  Q.seed=sd;Q.T=N.gerarTerreno(sd);Q.sunAz=0;Q.gen=1;Q.historico=[];Q.ultima=null;N.nascer(Q);
  const A=Q.A,B=Q.B,plano=JSON.parse(JSON.stringify({A:Q.plano.A,B:Q.plano.B,real:Q.plano.melhorReal,custoA:Q.plano.a.map(r=>r.custo),custoB:Q.plano.b.map(r=>r.custo),custoReal:Q.plano.real.map(r=>r.custo)}));
  let k=0,tFim=0;while(Q.historico.length<1&&k++<9e6){tFim=Q.t;N.passo(Q);}
  const rov=(L)=>L.map(r=>({x:Math.min(r.x,N.GOAL_X)/N.GOAL_X*100,ok:r.chegou?1:0,bat:r.bat,m:r.chegou?'META':(r.motivo||'EM ANDAMENTO')}));
  out.terrenos.push({seed:sd,tFim,plano,A:rov(A),B:rov(B)});
}
fs.mkdirSync('abl',{recursive:true});fs.writeFileSync(`abl/${nome}.json`,JSON.stringify(out));
const L=out.terrenos.flatMap(t=>t.B),mean=(a)=>a.reduce((s,v)=>s+v,0)/a.length;
console.log(`${nome} | ${((Date.now()-t0)/1000).toFixed(0)}s | treino ${treino.join(' ')} | B rota ${mean(L.map(r=>r.x)).toFixed(1)}% PSR ${(mean(L.map(r=>r.ok))*100).toFixed(1)}% | A rota ${mean(out.terrenos.flatMap(t=>t.A).map(r=>r.x)).toFixed(1)}%`);
