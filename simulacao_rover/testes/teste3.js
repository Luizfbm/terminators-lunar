const fs = require('fs');
const html0 = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const core0 = html0.slice(html0.indexOf('/*<<NUCLEO*/'), html0.indexOf('/*NUCLEO>>*/'));
function rodar(rotulo, core, modoB, conf, gens = 12) {
  const N = new Function(core + '\nreturn NUCLEO;')();
  const S = N.criarSim(); S.modoB = modoB; S.conf = conf; N.reiniciar(S);
  const t = { A: { m: 0, c: {}, tempo: 0 }, B: { m: 0, c: {}, tempo: 0 } };
  const tChegada = { A: [], B: [] };
  while (S.gen <= gens) {
    const antes = { A: new Set(S.A.filter(r => r.chegou)), B: new Set(S.B.filter(r => r.chegou)) };
    const fim = N.passo(S);
    if (!fim) for (const k of ['A','B']) for (const r of S[k]) if (r.chegou && !antes[k].has(r)) tChegada[k].push(S.t);
    if (fim) { const u = S.ultima; for (const k of ['A','B']) { t[k].m += u[k].metas; for (const [c,n] of Object.entries(u[k].causas)) t[k].c[c]=(t[k].c[c]||0)+n; } }
  }
  const n = gens*60, pct = x => (x/n*100).toFixed(0)+'%';
  const med = a => a.length ? (a.reduce((x,y)=>x+y,0)/a.length).toFixed(0)+' s' : '—';
  const top = c => Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ${pct(v)}`).join(', ');
  console.log(`${rotulo.padEnd(30)} A ${pct(t.A.m).padStart(4)} | B ${pct(t.B.m).padStart(4)} (tempo médio ${med(tChegada.B)}) | B falhas: ${top(t.B.c)}`);
}
const longo = core0.replace('const DT = 0.05, T_MAX = 150;', 'const DT = 0.05, T_MAX = 300;');
for (const modo of ['regra','ia']) {
  console.log(`\n--- B = ${modo}`);
  for (const conf of ['P50','P90','P99']) rodar(conf, core0, modo, conf);

}
