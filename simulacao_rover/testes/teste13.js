// Ablação: sem tese (A) · só P90 (regra fixa) · só IA (sem escudo) · P90 + IA · mérito + P90.
// Cada cérebro treina G gerações nos mesmos terrenos e é medido em 3 terrenos inéditos.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', process.env.ARQ || 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
const G = +(process.argv[2] || 16), modos = (process.argv[3] || 'regra,iaPura,ia,merito').split(',');
function teste(S) {
  const Q = N.iniciarTeste(S); while (Q.gen <= N.TESTE.length) N.passo(Q);
  const m = k => Q.historico.reduce((t, p) => t + p[k], 0) / Q.historico.length;
  return { a: m('aPct'), b: m('bPct'), bMeta: m('bMeta'), bObst: m('bObst') };
}
for (const modo of modos) {
  const S = N.criarSim(); S.modoB = modo; if (process.env.UMAROTA) S.multiRota = false; if (process.env.HIB) S.custoHib = true; if (process.env.MODELO) S.modelo = process.env.MODELO; if (process.env.SORELEVO) S.escudoSoRelevo = true; if (modo === 'merito') S.pesosModo = 'evolutivo'; N.reiniciar(S);
  const t0 = Date.now(), antes = teste(S);
  const causas = {};
  if (modo !== 'regra') while (S.gen <= G) if (N.passo(S)) for (const [k, v] of Object.entries(S.ultima.B.causas)) causas[k] = (causas[k] || 0) + v;
  const depois = modo === 'regra' ? antes : teste(S);
  const top = Object.entries(causas).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k.slice(0, 16)} ${v}`).join(', ');
  console.log(`${modo.padEnd(7)} | teste inédito: B ${antes.b.toFixed(0)}% → ${depois.b.toFixed(0)}% da rota · PSR ${antes.bMeta.toFixed(0)}% → ${depois.bMeta.toFixed(0)}% · obst ${depois.bObst.toFixed(1)} | A (sem tese) ${depois.a.toFixed(0)}% | ${((Date.now() - t0) / 1000).toFixed(0)} s | falhas no treino: ${top}`);
}
