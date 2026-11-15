// Treino e teste em RELEVO REAL (faixas LOLA). Na pasta simulacao_rover/testes:  CFG=<nome> node exp_lola.js → lola2/<CFG>.json
// (PowerShell: $env:CFG='RT_nom'; node exp_lola.js)
const fs=require('fs'),zlib=require('zlib');const e=process.env;
const path=require('path');const html=fs.readFileSync(e.ARQ||path.join(__dirname,'..','animacao_tese_rover_neuroevolucao_v18.html'),'utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
const tag=(id)=>{const i=html.indexOf('id="'+id+'">')+id.length+6;return html.slice(i,html.indexOf('</script>',i));};   // relevo real embutido no HTML
const meta=JSON.parse(tag('metaLOLA'));
const raw=zlib.inflateSync(Buffer.from(tag('dadosLOLA').trim(),'base64'));
N.carregarLOLA(meta,new Uint8Array(raw.buffer,raw.byteOffset,raw.length));
N.definirEscala('realista');N.definirTerreno('lola');
const CFG={
  RT_nom:{modoB:'regra',fontePrev:'t60',margem:'nominal'},
  RT_cal:{modoB:'regra',fontePrev:'t60',margem:'calibrada'},
  R60:   {modoB:'regra',fontePrev:'b60',margem:'nominal'},
  H_sint:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true},
  H_lola:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true,treino:8,mc:true},
  H_lola30:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true,treino:30,mc:true},
  H_lola30_semMC:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true,treino:30,mc:false},
  H_lola_semMC:{modoB:'iaH',fontePrev:'t60',margem:'nominal',iahPre:true,treino:8,mc:false},
};
const nome=e.CFG,c=CFG[nome];if(!c)throw new Error('CFG?');
N.definirMargem(c.margem);
const S=N.criarSim();
Object.assign(S,{modoB:c.modoB,fontePrev:c.fontePrev,planejadorB:'b',planejadorA:'a',conf:'P90',modelo:'padrao',custoHib:true,corredorAtivo:false,multiRota:true,camera:'ok',valCada:0});
if(c.iahPre!==undefined)S.iahPre=c.iahPre;
S.pop=+(e.POP||20);S.fisicaReal=true;
const t0=Date.now();
N.MC_LOLA.ativo=c.mc!==false;
N.reiniciar(S);
let g=0;const treino=[];
if(c.treino){while(S.gen<=c.treino&&g++<6e7)N.passo(S);for(const h of S.historico)treino.push({gen:h.gen,bPct:+h.bPct.toFixed(1),bMeta:+h.bMeta.toFixed(1)});}
N.MC_LOLA.ativo=true;   // o TESTE sempre sorteia o erro (mesmas sementes para todas as configurações: pareado)
const Q=N.iniciarTeste(S);Q.corredorAtivo=false;Q.fisicaReal=true;
const out={cfg:nome,conf:c,treino,terrenos:[]};
for(let k=0;k<N.LOLA.teste.length;k++){
  const sd=7300+k;Q.seed=sd;Q.T=N.terrenoPorPapel(sd,'teste',k);Q.sunAz=0;Q.gen=N.TESTE.length;Q.historico=[];Q.ultima=null;N.nascer(Q);
  const A0=Q.A,B0=Q.B,lola=Q.T.lola,plano={A:Q.plano.A,B:Q.plano.B};
  let j=0;while(Q.historico.length<1&&j++<9e6)N.passo(Q);
  const rov=(L)=>L.map(r=>({x:Math.min(r.x,N.GOAL_X)/N.GOAL_X*100,ok:r.chegou?1:0,m:r.chegou?'META':(r.motivo||'?')}));
  out.terrenos.push({k,lola,plano,A:rov(A0),B:rov(B0)});
  process.stdout.write('.');
}
fs.mkdirSync(path.join(__dirname,'lola2'),{recursive:true});fs.writeFileSync(path.join(__dirname,'lola2',`${nome}.json`),JSON.stringify(out));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length,L=out.terrenos.flatMap(t=>t.B),A=out.terrenos.flatMap(t=>t.A);
const tomb=(X)=>100*mean(X.map(r=>r.m.startsWith('TOMB')?1:0));
console.log(`\n${nome} | ${((Date.now()-t0)/60000).toFixed(1)} min | treino ${treino.map(t=>t.bMeta).join(' ')} | B meta ${(100*mean(L.map(r=>r.ok))).toFixed(1)}% rota ${mean(L.map(r=>r.x)).toFixed(1)}% tomb ${tomb(L).toFixed(1)}% | A meta ${(100*mean(A.map(r=>r.ok))).toFixed(1)}% tomb ${tomb(A).toFixed(1)}%`);
