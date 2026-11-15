const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
const [modelo = 'viper', custo = '1', G = '10', modos = 'regra', fontes = 'b60,t60,t20,real'] = process.argv.slice(2);
console.log(`escala: 1 s = ${N.HORAS_POR_SEGUNDO.toFixed(2)} h · limite escuro = ${N.ESCURO_MAX.toFixed(1)} s`);
for (const modo of modos.split(',')) for (const f of fontes.split(',')) {
  const S = N.criarSim(); S.modelo = modelo; S.custoHib = custo === '1'; S.modoB = modo; S.fontePrev = f; N.reiniciar(S);
  let mA = 0, mB = 0, tB = 0; const cA = {}, cB = {}; let rovers = 0;
  while (S.gen <= +G) {
    const vivos = S.B.filter(r => r.vivo); const fim = N.passo(S);
    for (const r of vivos) if (r.chegou) tB += S.t;
    if (fim) { const u = S.ultima; rovers += 60; mA += u.A.metas; mB += u.B.metas; for (const [k, v] of Object.entries(u.A.causas)) cA[k] = (cA[k] || 0) + v; for (const [k, v] of Object.entries(u.B.causas)) cB[k] = (cB[k] || 0) + v; }
  }
  const pct = x => (x / rovers * 100).toFixed(0) + '%';
  const top = c => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k.slice(0, 20)} ${pct(v)}`).join(', ');
  console.log(`${modelo} custo=${custo} ${modo.padEnd(6)} ${f.padEnd(4)} | A ${pct(mA).padStart(4)} | B ${pct(mB).padStart(4)} (tempo ${mB ? (tB / mB).toFixed(0) : '-'} s = ${mB ? (tB / mB * N.HORAS_POR_SEGUNDO / 24).toFixed(0) : '-'} dias) | B: ${top(cB)} | A: ${top(cA)}`);
}
