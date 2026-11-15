const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
function rodar(modoB, cam, gens) {
  const S = N.criarSim(); S.modoB = modoB; S.camera = cam; N.reiniciar(S);
  const tot = { A: { m: 0, d: 0, c: {}, rf: 0 }, B: { m: 0, d: 0, c: {}, rf: 0 } };
  const linhas = [];
  while (S.gen <= gens) if (N.passo(S)) {
    const u = S.ultima;
    for (const k of ['A', 'B']) { tot[k].m += u[k].metas; tot[k].d += u[k].media; tot[k].rf += u[k].reflexos; for (const [c, n] of Object.entries(u[k].causas)) tot[k].c[c] = (tot[k].c[c] || 0) + n; }
    linhas.push(`${u.A.metas}/${u.B.metas}`);
  }
  const n = gens * 60, pct = (x) => (x / n * 100).toFixed(0) + '%';
  console.log(`\n== câmera ${cam} · B=${modoB} · ${gens} ger  (metas A/B por geração: ${linhas.join(' ')})`);
  for (const k of ['A', 'B']) {
    const c = Object.entries(tot[k].c).sort((a, b) => b[1] - a[1]).map(([x, v]) => `${x} ${pct(v)}`).join(', ');
    console.log(`  ${k}: chegou ${pct(tot[k].m)} · avanço médio ${(tot[k].d / gens).toFixed(0)} m · reflexos/rover ${(tot[k].rf / n).toFixed(1)} · falhas: ${c}`);
  }
}
const modo = process.argv[2] || 'ia';
for (const cam of ['ok', 'degradada', 'danificada']) rodar(modo, cam, 15);
