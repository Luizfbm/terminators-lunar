const fs=require('fs');const html=fs.readFileSync('v13.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
const H=708/48;
function medir(p,seeds=[900001,900002,900003,800001],fonte='real'){
  Object.assign(N.CAL,p);let lit=0,gt=0,mx=0,n=0,cnt=0;
  for(const seed of seeds){const T=N.gerarTerreno(seed);
    for(const rt of T.rotas){for(let x=60;x<N.GOAL_X-60;x+=40){
      const i=Math.round(rt.y(x)/N.CELL)*N.GW+Math.round(x/N.CELL);const l=[];for(let k=0;k<48;k++)l.push(N.luz(T,i,k*7.5,fonte)>=0.5?1:0);
      lit+=l.reduce((a,b)=>a+b,0)/48;let best=0,run=0;for(let k=0;k<96;k++){if(!l[k%48]){run++;best=Math.max(best,Math.min(run,48));}else run=0;}
      mx+=best*H;if(best*H>50)gt++;n++;}}}
  return `lit ${(lit/n*100).toFixed(0)}% | >50h ${(gt/n*100).toFixed(0)}% | maxEscuro ${(mx/n).toFixed(0)}h`;
}
const base={a0:9,aR:6,off0:75,offR:85,w0:55,wR:25,dens:1,macro:1};
const S6=[900001,900002,900003,800001,1337,4242];
for(const [nome,p] of [['a4.5-7.5 off110-240',{a0:4.5,aR:3,off0:110,offR:130}],['a5-8 off130-260',{a0:5,aR:3,off0:130,offR:130}],['a4.5-7.5 off110-240 dens.8',{a0:4.5,aR:3,off0:110,offR:130,dens:0.8}]])
 for(const f of ['b60','real']) console.log(nome.padEnd(30),f.padEnd(5),medir({...base,...p},S6,f));
