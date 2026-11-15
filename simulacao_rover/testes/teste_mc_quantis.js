// MONTE CARLO DA INCERTEZA SUBPIXEL (Degrau 2): em N terrenos sorteados, compara o declive REAL de 5 m com o ESTIMADO pela
// tese + margem do escudo (1 + z·σ; σ = 0,8° em célula medida, 2,0° em interpolada) e mede a cobertura real de P50/P90/P99.
const fs=require('fs');const html=fs.readFileSync(process.env.ARQ||'v17.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
N.definirTerreno('calibrado');
const NS=+(process.env.NS||30), ZS={P50:0,P90:1.282,P99:2.326}, LIM=15;
const ac={}; for(const k in ZS) ac[k]={cob:0,n:0,cobI:0,nI:0,cobM:0,nM:0,perig:0,falsoSeg:0,falsoSegSemCrat:0};
let nCel=0,nMed=0; const porTerreno={P50:[],P90:[],P99:[]};
for(let s=0;s<NS;s++){
  const T=N.gerarTerreno(7101+s); const L=T.slope.length; const fts={};for(const k in ZS)fts[k]=[0,0];
  for(let i=0;i<L;i++){
    const e=T.slope[i]-T.slopeMapa[i], med=T.medido[i]===1, sig=med?0.8:2.0; nCel++; if(med)nMed++;
    for(const [k,z] of Object.entries(ZS)){
      const m=1+z*sig, ok=e<=m, A=ac[k]; A.n++; if(ok)A.cob++; if(med){A.nM++; if(ok)A.cobM++;} else {A.nI++; if(ok)A.cobI++;}
      if(T.slope[i]>LIM){ A.perig++; fts[k][1]++; const vetado=T.slopeMapa[i]+m>LIM||T.noGoMapa[i]===1; if(!vetado){A.falsoSeg++; fts[k][0]++;} if(!(T.slopeMapa[i]+m>LIM)) A.falsoSegSemCrat++; }
    }
  }
  for(const k in ZS) porTerreno[k].push(fts[k][1]?fts[k][0]/fts[k][1]:0);
}
const pc=(a,b)=>(100*a/b).toFixed(1)+'%', q=(a,p)=>{a=[...a].sort((x,y)=>x-y);return a[Math.floor(p*(a.length-1))]};
console.log(`N = ${NS} terrenos (7101–${7100+NS}), ${nCel.toLocaleString()} células de 5 m, ${pc(nMed,nCel)} medidas`);
console.log('quantil | cobertura total | interpoladas | medidas | perigo real (>15°) que o mapa NÃO veta | idem sem o mapa de crateras | por terreno (mediana [mín–máx])');
for(const [k] of Object.entries(ZS)){const A=ac[k];
  console.log(`${k}     | ${pc(A.cob,A.n)} | ${pc(A.cobI,A.nI)} | ${pc(A.cobM,A.nM)} | ${pc(A.falsoSeg,A.perig)} | ${pc(A.falsoSegSemCrat,A.perig)} | ${(100*q(porTerreno[k],0.5)).toFixed(1)}% [${(100*Math.min(...porTerreno[k])).toFixed(1)}–${(100*Math.max(...porTerreno[k])).toFixed(1)}%]`);}
// erro absoluto e quantis empíricos do erro nas interpoladas
const err=[];for(let s=0;s<Math.min(NS,10);s++){const T=N.gerarTerreno(7101+s);for(let i=0;i<T.slope.length;i+=3)if(!T.medido[i])err.push(T.slope[i]-T.slopeMapa[i]);}
console.log('erro (real − estimado) nas interpoladas: P50',q(err,.5).toFixed(2)+'°','P90',q(err,.9).toFixed(2)+'°','P99',q(err,.99).toFixed(2)+'°','· margens usadas: P50 1,00°, P90 3,56°, P99 5,65°');
