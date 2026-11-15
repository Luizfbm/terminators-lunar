// Planejamento mínimo: o usuário escolhe SÓ o horário de saída (azimute do Sol na partida). Mede o efeito sobre as perdas por energia.
const fs=require('fs');const e=process.env;
const html=fs.readFileSync(e.ARQ||'v11.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
const SEEDS=(e.SEEDS||'900001,900002,900003').split(',').map(Number), AZ=(e.AZ||'0,45,90,135,180,225,270,315').split(',').map(Number);
if(e.ESC)N.definirEscala(e.ESC);if(e.TERR)N.definirTerreno(e.TERR);
const S=N.criarSim();S.modoB=e.MODO||'regra';S.modelo=e.MODELO||'padrao';S.custoHib=(e.HIB||'1')==='1';S.dinamico=false;
const pc=(c,re)=>Object.entries(c).filter(([k])=>re.test(k)).reduce((t,[,v])=>t+v,0);
const linhas=[];
for(const seed of SEEDS)for(const az of AZ){
  S.seed=seed;S.T=N.gerarTerreno(seed);S.sunAz=az;S.sunAz0=az;S.gen=1;S.rngCam=null;S.historico=[];S.ultima=null;N.nascer(S);
  const plano=JSON.stringify(S.plano&&{A:S.plano.A,B:S.plano.B,melhorReal:S.plano.melhorReal,custoB:S.plano.custoB,custos:S.plano.custos});
  let g=0;while(S.gen<=1&&g++<5e6)N.passo(S);
  const u=S.historico[S.historico.length-1], c=S.ultima.B.causas;
  linhas.push({seed,az,b:u.bPct,psr:u.bMeta,a:u.aPct,aPsr:u.aMeta,energia:pc(c,/BLECAUTE|CONGEL/)/60*100,preso:pc(c,/PRESO|ESTAGN/)/60*100,relevo:pc(c,/TOMB|CRATERA/)/60*100,plano});
  console.log(`seed ${seed} az ${String(az).padStart(3)} | B ${u.bPct.toFixed(0).padStart(3)}% PSR ${u.bMeta.toFixed(0).padStart(3)}% | A ${u.aPct.toFixed(0)}% | perdas B: energia ${(pc(c,/BLECAUTE|CONGEL/)/60*100).toFixed(0)}% preso ${(pc(c,/PRESO|ESTAGN/)/60*100).toFixed(0)}% relevo ${(pc(c,/TOMB|CRATERA/)/60*100).toFixed(0)}%`);
}
fs.writeFileSync(e.OUT||'t15.json',JSON.stringify(linhas));
