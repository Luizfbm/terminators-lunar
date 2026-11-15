// Taxa de sucesso por estratégia na cena do Pragyan (sem interface).
const fs=require('fs');const html=fs.readFileSync(process.env.ARQ||'v17.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
N.definirEscala('realista');
const S=N.criarSim();N.reiniciar(S);
const EST={D1a:{modo:'regra',prev:'b60',plb:'a'},D1c:{modo:'merito',prev:'b60',plb:'b'},D2:{modo:'merito',prev:'t60',plb:'b'},D4b:{modo:'iaH',prev:'t60',plb:'b'}};
const res={D0:[0,0,{},[]]};
for(const [k,e] of Object.entries(EST)){res[k]=[0,0,{},[]];
  for(let sd=1;sd<=+(process.env.NS||4);sd++){const t0=Date.now();const Q=N.prepararCena(S,e,sd,30);let n=0;while(!N.passoCena(Q)&&n++<2e5);
    const add=(L,R)=>{for(const r of L){R[1]++;R[3].push(r);if(r.chegou)R[0]++;else R[2][r.motivo]=(R[2][r.motivo]||0)+1;}};add(Q.Bref,res[k]);if(k==='D1a')add(Q.Aref,res.D0);
    if(sd===1)console.log(k,'seed',sd,'passos',n,'t',(Date.now()-t0)+'ms','goalX',Q.T.goalX,'chegou',Q.Bref.filter(r=>r.chegou).length+'/'+Q.Bref.length);}}
const md=a=>{a=[...a].sort((p,q)=>p-q);return a.length?a[a.length>>1]:NaN};
for(const [k,[c,n,m,L]] of Object.entries(res)){const ok=L.filter(r=>r.chegou);
 console.log(k.padEnd(4),(100*c/n).toFixed(0)+'%',`(${c}/${n})`,'| chegaram: rodado (m reais) med',(md(ok.map(r=>r.odo))/20).toFixed(1),'· ré med',(md(ok.map(r=>r.re||0))/20).toFixed(2),'· recuos/rover',(ok.reduce((t,r)=>t+r.nReflexos+r.nFugas,0)/Math.max(1,ok.length)).toFixed(2),'· tempo med (h reais)',(md(ok.map(r=>r.tFim))*0.356).toFixed(1),'|',JSON.stringify(m));}
