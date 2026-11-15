const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
const fontes = ['b60', 't60', 'b20', 't20', 'real'];
const nomes = { b60: '60 m bruto', t60: 'Tese 60→5 m', b20: '20 m bruto', t20: 'Tese 20→5 m', real: 'Real (oráculo)' };
const modo = process.argv[2] || 'regra', G = +(process.argv[3] || 10);
for (const f of fontes) {
  const S = N.criarSim(); S.modoB = modo; S.fontePrev = f; S.conf = 'P90'; N.reiniciar(S);
  let metas = 0, metasA = 0; const c = {}; let acc = 0, fc = 0, na = 0, passos = 0;
  while (S.gen <= G) {
    if (++passos % 200 === 0) { const a = N.acertoPrevisao(S); acc += a.acerto; fc += a.falsoClaro; na++; }
    if (N.passo(S)) { const u = S.ultima; metas += u.B.metas; metasA += u.A.metas; for (const [k, v] of Object.entries(u.B.causas)) c[k] = (c[k] || 0) + v; }
  }
  const n = G * 60, pct = (x) => (x / n * 100).toFixed(0) + '%';
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k.slice(0, 16)} ${pct(v)}`).join(', ');
  console.log(`${modo.padEnd(6)} ${nomes[f].padEnd(15)} | previsão: acerto ${(acc / na * 100).toFixed(1)}%, falso claro ${(fc / na * 100).toFixed(1)}% | B chega ${pct(metas).padStart(4)} (A ${pct(metasA)}) | ${top}`);
}
