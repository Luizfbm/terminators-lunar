// Extrai o NÚCLEO do HTML e roda gerações sem navegador.
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const src = html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/'));
const N = new Function(src + '\nreturn NUCLEO;')();
function rodar(modoB, conf, gens, dinamico = true) {
  const S = N.criarSim(); S.modoB = modoB; S.conf = conf; S.dinamico = dinamico; N.reiniciar(S);
  const t0 = Date.now(); const out = [];
  while (S.gen <= gens) { if (N.passo(S)) { const u = S.ultima; out.push(u); } }
  const ms = Date.now() - t0;
  const fmt = (r) => `${String(Math.round(r.media)).padStart(3)}m meta=${String(r.metas).padStart(2)}`;
  console.log(`\n== B=${modoB} ${conf} ${dinamico?'dinâmico':'estático'} · ${gens} ger · ${(ms/gens).toFixed(0)} ms/ger`);
  for (const u of out) console.log(`ger ${String(u.gen).padStart(2)} | A ${fmt(u.A)} | B ${fmt(u.B)} | B causas ${JSON.stringify(u.B.causas)}`);
  console.log('A causas última:', JSON.stringify(out[out.length-1].A.causas));
}
rodar('regra','P90',8);
rodar("ia","P90",15); rodar("regra","P99",4); rodar("ia","P90",8,false);
