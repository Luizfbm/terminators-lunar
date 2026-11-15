const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
function rodar(modelo, modoB, pesosModo, gens) {
  const S = N.criarSim(); S.modelo = modelo; S.modoB = modoB; S.pesosModo = pesosModo; S.conf = 'P90'; N.reiniciar(S);
  const t = { A: { m: 0, c: {} }, B: { m: 0, c: {} } }, porGer = [];
  const t0 = Date.now();
  while (S.gen <= gens) if (N.passo(S)) { const u = S.ultima; porGer.push(u.B.metas); for (const k of ['A','B']) { t[k].m += u[k].metas; for (const [c,n] of Object.entries(u[k].causas)) t[k].c[c]=(t[k].c[c]||0)+n; } }
  const n = gens * 60, pct = x => (x / n * 100).toFixed(0) + '%';
  const top = c => Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k.slice(0,18)} ${pct(v)}`).join(', ');
  console.log(`${modelo.padEnd(10)} ${(modoB + (modoB==='merito' ? '/' + pesosModo : '')).padEnd(18)} A ${pct(t.A.m).padStart(4)} | B ${pct(t.B.m).padStart(4)} | B/ger: ${porGer.join(' ')} | ${top(t.B.c)} | ${((Date.now()-t0)/gens/1000).toFixed(1)} s/ger`);
  return S;
}
const arg = process.argv[2] || 'modelos';
if (arg === 'modelos') {
  for (const modelo of Object.keys(N.MODELOS)) for (const modoB of ['regra', 'merito']) rodar(modelo, modoB, 'fixo', 8);
} else {
  const S = rodar('padrao', 'merito', 'evolutivo', 15);
  console.log('pesos médios da elite:', Object.entries(S.eliteW).map(([k,v])=>`${k}=${v.toFixed(2)}`).join(' '));
  rodar('padrao', 'ia', 'fixo', 15);
}
