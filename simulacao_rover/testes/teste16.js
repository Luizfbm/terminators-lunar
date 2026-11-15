// 2×2: PLANO (grade 60 m × tese) × EXECUÇÃO (A: sem tese × B: com a tese). O horário de saída e a rota vêm de cada planejador.
const fs=require('fs');const e=process.env;
const html=fs.readFileSync(e.ARQ||'v13.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
if(e.ESC)N.definirEscala(e.ESC);if(e.TERR)N.definirTerreno(e.TERR);
const SEEDS=(e.SEEDS||'900001,900002,900003').split(',').map(Number);
const S=N.criarSim();S.modoB=e.MODO||'regra';S.modelo=e.MODELO||'padrao';S.custoHib=(e.HIB||'1')==='1';S.dinamico=false;
const pc=(c,re)=>Object.entries(c).filter(([k])=>re.test(k)).reduce((t,[,v])=>t+v,0);
const rodar=(seed,az,pA,pB)=>{
  S.planejadorA=pA;S.planejadorB=pB;S.seed=seed;S.T=N.gerarTerreno(seed);S.sunAz=az;S.sunAz0=az;S.gen=1;S.rngCam=null;S.historico=[];S.ultima=null;N.nascer(S);
  const plano={A:S.plano.A,B:S.plano.B};let g=0;while(S.gen<=1&&g++<8e6)N.passo(S);
  const u=S.historico[S.historico.length-1];const cA=S.ultima.A.causas,cB=S.ultima.B.causas;
  return {plano,A:{pct:u.aPct,psr:u.aMeta,en:pc(cA,/BLECAUTE|CONGEL/)/60*100,pr:pc(cA,/PRESO|ESTAGN/)/60*100,rl:pc(cA,/TOMB|CRATERA/)/60*100},B:{pct:u.bPct,psr:u.bMeta,en:pc(cB,/BLECAUTE|CONGEL/)/60*100,pr:pc(cB,/PRESO|ESTAGN/)/60*100,rl:pc(cB,/TOMB|CRATERA/)/60*100}};
};
const out=[];
for(const seed of SEEDS){
  S.seed=seed;S.T=N.gerarTerreno(seed);S.sunAz=0;
  const t0=Date.now();const sg=N.sugerirSaida(S,'a'),st=N.sugerirSaida(S,'b');
  const fixo=rodar(seed,0,'a','b');                       // referência: saída em 0°, planos originais (A grade / B tese)
  const G=rodar(seed,sg.melhor.az,'a','a');               // plano da GRADE (saída + rota); A e B executam
  const T=rodar(seed,st.melhor.az,'b','b');               // plano da TESE (saída + rota); A e B executam
  const r={seed,azG:sg.melhor.az,azT:st.melhor.az,rotaG:G.plano.A,rotaT:T.plano.B,fixo,G,T};out.push(r);
  const f=(x)=>`${x.pct.toFixed(0).padStart(3)}%/PSR ${x.psr.toFixed(0).padStart(2)}%`;
  console.log(`seed ${seed} | saída grade ${sg.melhor.az}° rota ${G.plano.A} · saída tese ${st.melhor.az}° rota ${T.plano.B} | fixo0°: A ${f(fixo.A)} B ${f(fixo.B)} | plano GRADE: A ${f(G.A)} B ${f(G.B)} | plano TESE: A ${f(T.A)} B ${f(T.B)} | ${((Date.now()-t0)/1000).toFixed(0)}s`);
}
fs.writeFileSync(e.OUT||'t16.json',JSON.stringify(out));
