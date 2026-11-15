const fs=require('fs');const e=process.env;
const html=fs.readFileSync(e.ARQ||'v15.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
N.definirEscala('realista');
const S=N.criarSim();S.modoB=e.MODO||'regra';S.custoHib=true;if(e.FUGAB==='0')S.fugaB=false;N.reiniciar(S);
const Q=N.iniciarTeste(S);Q.dbgPreso=[];
for(const sd of [7001,7003,7005,7006]){Q.seed=sd;Q.T=N.gerarTerreno(sd);Q.sunAz=0;Q.gen=1;Q.historico=[];N.nascer(Q);let k=0;while(Q.historico.length<1&&k++<8e6)N.passo(Q);}
const D=Q.dbgPreso,B=D.filter(d=>d.time==='B'),A=D.filter(d=>d.time==='A');
const cnt=(L,f)=>{const m={};for(const d of L){const k=f(d);m[k]=(m[k]||0)+1;}return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8);};
console.log('presos B',B.length,'A',A.length);
console.log('B razão:',cnt(B,d=>String(d.razao).slice(0,60)));
console.log('B ação:',cnt(B,d=>d.acao),' |vel| média',(B.reduce((t,d)=>t+Math.abs(d.vel),0)/B.length).toFixed(2),' bat média',(B.reduce((t,d)=>t+d.bat,0)/B.length).toFixed(0));
console.log('B |erro| à rota:',cnt(B,d=>Math.min(6,Math.floor(Math.abs(d.err)/10))*10+'m'));
console.log('B x (m):',cnt(B,d=>Math.floor(d.x/300)*300));
console.log('B fugas média',(B.reduce((t,d)=>t+d.fugas,0)/B.length).toFixed(1),' memo cel média',(B.reduce((t,d)=>t+d.memo,0)/B.length).toFixed(0));
console.log('A razão:',cnt(A,d=>String(d.razao).slice(0,60)));
