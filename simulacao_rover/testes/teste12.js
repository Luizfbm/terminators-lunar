// Cada rota forçada nos mesmos terrenos: o custo previsto pela verdade bate com o resultado real?
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
const G = +(process.argv[2] || 8);
const res = {};
for (let k = 0; k < 4; k++) {
  const S = N.criarSim(); S.modoB = 'regra'; S.rotaForcada = k; N.reiniciar(S);
  while (S.gen <= G) if (N.passo(S)) { const u = S.ultima, c = u.plano.real.find(r => r.k === k); (res[u.gen] = res[u.gen] || []).push({ k, pct: u.B.pct, custo: c.custo, perigo: c.perigo, escuro: c.escuro, pior: c.pior, causas: u.B.causas }); }
}
let acerta = 0;
for (const [g, l] of Object.entries(res)) {
  const bestPct = l.reduce((a, b) => (b.pct > a.pct ? b : a)), bestCusto = l.reduce((a, b) => (b.custo < a.custo ? b : a));
  acerta += bestPct.k === bestCusto.k;
  console.log(`ger ${g}: ` + l.map(r => `r${r.k} ${r.pct.toFixed(0)}% (custo ${r.custo.toFixed(0)}: perigo ${r.perigo} escuro ${r.escuro} pior ${r.pior})`).join(' | ') + `  → melhor de fato r${bestPct.k}, custo aponta r${bestCusto.k}`);
}
console.log('custo real acerta a rota de fato melhor em', acerta, 'de', Object.keys(res).length);
const tot = [0,1,2,3].map(k => Object.values(res).reduce((a, l) => a + l.find(r => r.k === k).pct, 0) / G);
console.log('média por rota:', tot.map((v, k) => `r${k} ${v.toFixed(0)}%`).join(' '));
const causas = [0,1,2,3].map(k => { const c = {}; for (const l of Object.values(res)) for (const [m, n] of Object.entries(l.find(r => r.k === k).causas)) c[m] = (c[m] || 0) + n; return `r${k}: ` + Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([m,n])=>`${m.slice(0,14)} ${n}`).join(', '); });
console.log(causas.join('\n'));
