const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
function teste(S) { const Q = N.iniciarTeste(S); while (Q.gen <= N.TESTE.length) N.passo(Q); const m = k => Q.historico.reduce((t, p) => t + p[k], 0) / Q.historico.length; return `rota ${m('bPct').toFixed(0)}% · obst ${m('bObst').toFixed(1)} · PSR ${m('bMeta').toFixed(0)}%`; }
function rodar(modoB, pesosModo, G) {
  const S = N.criarSim(); S.modoB = modoB; S.pesosModo = pesosModo; N.reiniciar(S);
  const t0 = Date.now(); const antes = teste(S); const pct = [], meta = [], aP = [];
  while (S.gen <= G) if (N.passo(S)) { pct.push(S.ultima.B.pct); meta.push(S.ultima.B.metas); aP.push(S.ultima.A.pct); }
  const m = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0);
  const q = Math.floor(G / 4);
  console.log(`${(modoB + '/' + pesosModo).padEnd(17)} B % da rota por geração: ${pct.map(v => v.toFixed(0)).join(' ')}`);
  console.log(`   1º quarto ${m(pct.slice(0, q))}% → último quarto ${m(pct.slice(-q))}% · PSR 1º ${m(meta.slice(0, q))} → último ${m(meta.slice(-q))} de 60 · A médio ${m(aP)}% · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`   TESTE inédito antes: ${antes}  |  depois: ${teste(S)}`);
  if (S.eliteW) console.log('   elite:', Object.entries(S.eliteW).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' '));
}
const G = +(process.argv[2] || 24);
rodar('merito', 'evolutivo', G); rodar('ia', 'fixo', G); rodar('regra', 'fixo', 8);
