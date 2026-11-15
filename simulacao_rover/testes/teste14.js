// Curva de aprendizado em terreno de validação fixo.
// uso: ARQ=v11.html MODO=iaPura CAM=7 EL=8 FM=1.45 CX=0 CICLO=0 VAL=2 MUT=0.25 GENS=30 node teste14.js
const fs=require('fs');const e=process.env;
const html=fs.readFileSync(e.ARQ||"../animacao_tese_rover_neuroevolucao_v11.html",'utf8');
const src=html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'));
const N=new Function(src+'\nreturn NUCLEO;')();
const S=N.criarSim();
S.modoB=e.MODO||'iaPura';
if(e.CAM)S.camadas=e.CAM.split(',').map(Number);
if(e.EL){S.nElite=+e.EL;S.nPais=Math.max(18,S.nElite+10);}
if(e.FM)S.forcaMut=+e.FM; if(e.CX)S.cruzamento=+e.CX; if(e.CICLO)S.ciclo=+e.CICLO; if(e.MUT)S.mut=+e.MUT;
if(e.HIB)S.custoHib=e.HIB==='1'; if(e.MODELO)S.modelo=e.MODELO;
S.valCada=e.VAL!==undefined?+e.VAL:2;
N.reiniciar(S);
const GENS=+(e.GENS||20);const t0=Date.now();
const tag=`${S.modoB} rede ${[8,...S.camadas,4].join('→')} el${S.nElite} fm${S.forcaMut} cx${S.cruzamento} ciclo${S.ciclo} mut${S.mut}`;
let guard=0;
while(S.gen<=GENS && guard++<4e7) N.passo(S);
const V=S.curva, H=S.historico;
const f=(a)=>a.map(v=>v.toFixed(0).padStart(3)).join(' ');
console.log(tag+` | ${((Date.now()-t0)/1000).toFixed(0)} s`);
console.log('  treino  B%  :',f(H.map(p=>p.bPct)));
if(V.length){
 console.log('  valid elite :',f(V.map(p=>p.elite)));
 console.log('  valid pop   :',f(V.map(p=>p.b)));
 console.log('  valid PSR % :',f(V.map(p=>p.meta)));
 const n=V.length,mx=V.reduce((t,q)=>t+q.gen,0)/n,my=V.reduce((t,q)=>t+q.elite,0)/n;let sxy=0,sxx=0;for(const q of V){sxy+=(q.gen-mx)*(q.elite-my);sxx+=(q.gen-mx)**2;}
 const k=Math.max(1,Math.floor(n/3));const ini=V.slice(0,k).reduce((t,q)=>t+q.elite,0)/k, fim=V.slice(-k).reduce((t,q)=>t+q.elite,0)/k;
 console.log(`  A ref ${V[0].a.toFixed(0)}% · elite 1º terço ${ini.toFixed(0)}% → último terço ${fim.toFixed(0)}% · inclinação ${(sxy/sxx*10).toFixed(1)} pts/10 ger`);
}
