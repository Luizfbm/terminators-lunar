// Checagem: com A configurado igual ao B, os dois times devem dar o MESMO resultado (gêmeos no mesmo terreno).
const fs=require('fs');const html=fs.readFileSync('v16.html','utf8');
const N=new Function(html.slice(html.indexOf('/*<<NUCLEO*/'),html.indexOf('/*NUCLEO>>*/'))+'\nreturn NUCLEO;')();
N.definirEscala('realista');
const casos=[['D2 × D2',{modo:'merito',prev:'t60',plb:'b'},{modoB:'merito',fontePrev:'t60',planejadorB:'b'}],
             ['D1c(A) × D2(B)',{modo:'merito',prev:'b60',plb:'b'},{modoB:'merito',fontePrev:'t60',planejadorB:'b'}],
             ['D1a × D1a',{modo:'regra',prev:'b60',plb:'a'},{modoB:'regra',fontePrev:'b60',planejadorB:'a'}]];
for(const [nome,cA,cB] of casos){
  const S=N.criarSim();Object.assign(S,cB,{custoHib:true,cfgA:cA});N.reiniciar(S);
  const Q=N.iniciarTeste(S);const out=[];
  for(const sd of [7101,7102,7103]){Q.seed=sd;Q.T=N.gerarTerreno(sd);Q.sunAz=0;Q.gen=1;Q.historico=[];N.nascer(Q);const pl=[Q.plano.A,Q.plano.B];let k=0;while(Q.historico.length<1&&k++<9e6)N.passo(Q);const u=Q.historico[0];out.push(`${sd}: rota ${pl} | A ${u.aPct.toFixed(1)}%/PSR ${u.aMeta.toFixed(1)} · B ${u.bPct.toFixed(1)}%/PSR ${u.bMeta.toFixed(1)}`);}
  console.log(nome+'\n  '+out.join('\n  '));
}
