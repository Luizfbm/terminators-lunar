// Mede a iluminação REAL ao longo das rotas do simulador: fração iluminada e maior escuridão contínua (1 volta do Sol = 708 h).
const fs=require('fs');const html=fs.readFileSync(process.env.ARQ||'v13.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
const H_POR_PASSO=708/48;let tot=[];
for(const seed of [900001,900002,900003,800001,1337,4242]){
  const T=N.gerarTerreno?N.gerarTerreno(seed):N.criarSim().T;
  for(const rt of T.rotas){
    let lit=0,n=0,gt50=0,maxh=[];
    for(let x=60;x<N.GOAL_X-60;x+=20){
      const y=rt.y(x); const gx=Math.round(x/N.CELL), gy=Math.round(y/N.CELL), i=gy*N.GW+gx;
      const l=[];for(let k=0;k<48;k++){N.tabelaSombra&&0;l.push(N.luz(T,i,k*7.5)>=0.5?1:0);}
      const f=l.reduce((a,b)=>a+b,0)/48;lit+=f;n++;
      // maior sequência escura circular
      let best=0,run=0;for(let k=0;k<96;k++){if(!l[k%48]){run++;best=Math.max(best,Math.min(run,48));}else run=0;}
      maxh.push(best*H_POR_PASSO);if(best*H_POR_PASSO>50)gt50++;
    }
    tot.push({seed,rota:rt.nome,lit:lit/n*100,gt50:gt50/n*100,maxMed:maxh.reduce((a,b)=>a+b,0)/maxh.length});
  }
}
const m=k=>tot.reduce((a,b)=>a+b[k],0)/tot.length;
console.log('amostras',tot.length,'| fração iluminada média ao longo da rota: '+m('lit').toFixed(0)+'% | pontos da rota cuja maior escuridão > 50 h: '+m('gt50').toFixed(0)+'% | escuridão contínua máxima média: '+m('maxMed').toFixed(0)+' h');
console.log(tot.slice(0,8).map(t=>`${t.seed}/${t.rota}: lit ${t.lit.toFixed(0)}% >50h ${t.gt50.toFixed(0)}%`).join('\n'));
