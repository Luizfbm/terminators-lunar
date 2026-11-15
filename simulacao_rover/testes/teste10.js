// O sistema da tese ALERTARIA o rover que segue o plano inicial (A) antes de cada perda?
// O A continua dirigindo do jeito dele; só observamos o que o alerta diria na posição dele.
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
let src = html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/'));
if (!src.includes('VIEW_W, TESTE, iniciarTeste')) throw new Error('ponto de exportação não encontrado');
src = src.replace('VIEW_W, TESTE, iniciarTeste', 'sentir, sombraAdiante, energiaNecessaria, VIEW_W, TESTE, iniciarTeste');
const N = new Function(src + '\nreturn NUCLEO;')();
const JANELA = 5, G = +(process.argv[2] || 10), modelo = process.argv[3] || 'padrao';
const S = N.criarSim(); S.modoB = 'regra'; S.modelo = modelo; N.reiniciar(S);
const base = { n: 0, com: 0 }; const hist = new Map(); const porCausa = {}; let passosVivos = 0, passosAlerta = 0, alertasFalsos = 0, alertasTot = 0;
function alerta(r) {
  const s = N.sentir(S, r, false);                                  // mapa estimado de 5 m (o da tese)
  const relevo = s.rM.livre <= 30;
  const sa = N.sombraAdiante(S, r.x, r.mod.vCruz);
  const energia = !s.sombraAqui && sa.ate >= 0 && sa.ate <= 40 && r.bat < N.energiaNecessaria(sa.comp, r.mod);
  return relevo ? 'relevo' : energia ? 'energia' : '';
}
while (S.gen <= G) {
  const vivos = S.A.filter(r => r.vivo);
  for (const r of vivos) { const h = hist.get(r) || []; h.push({ t: S.t, a: alerta(r) }); hist.set(r, h); }
  const fim = N.passo(S);
  if (fim) { hist.clear(); continue; }
  for (const r of vivos) if (!r.vivo && !r.chegou) {
    const h = hist.get(r), tM = h[h.length - 1].t;
    const jan = h.filter(p => p.t >= tM - JANELA);
    const primeiro = jan.find(p => p.a);
    const c = porCausa[r.motivo] = porCausa[r.motivo] || { n: 0, avisados: 0, antecedencia: 0 };
    c.n++; if (primeiro) { c.avisados++; c.antecedencia += tM - primeiro.t; }
    // alertas fora da janela final = não foram seguidos de perda em 5 s
    // base de comparação: janelas de 5 s que NÃO terminam em perda (terminam 5 s ou mais antes dela)
    for (let k = 0; k < h.length; k += 20) { const fimJ = h[k].t; if (fimJ < h[0].t + JANELA || fimJ > tM - JANELA) continue; base.n++; if (h.some(p => p.t >= fimJ - JANELA && p.t <= fimJ && p.a)) base.com++; }
    for (const p of h) { passosVivos++; if (p.a) { passosAlerta++; alertasTot++; if (p.t < tM - JANELA) alertasFalsos++; } }
  }
}
console.log(`modelo ${modelo} · ${G} gerações · janela de ${JANELA} s antes da perda`);
let n = 0, av = 0;
for (const [k, c] of Object.entries(porCausa).sort((a, b) => b[1].n - a[1].n)) {
  n += c.n; av += c.avisados;
  console.log(`${k.padEnd(30)} ${String(c.n).padStart(4)} perdas · avisadas ${(c.avisados / c.n * 100).toFixed(0)}% · antecedência média ${(c.avisados ? c.antecedencia / c.avisados : 0).toFixed(1)} s (${(c.avisados ? c.antecedencia / c.avisados * 12.8 : 0).toFixed(0)} m)`);
}
console.log(`TOTAL ${n} perdas · avisadas ${(av / n * 100).toFixed(0)}%`);
console.log(`tempo de vida sob alerta: ${(passosAlerta / passosVivos * 100).toFixed(0)}% · alertas NÃO seguidos de perda em ${JANELA} s: ${(alertasFalsos / alertasTot * 100).toFixed(0)}%`);

console.log(`base: janelas de ${JANELA} s SEM perda que tinham alerta: ${(base.com / base.n * 100).toFixed(0)}% (${base.n} janelas)`);
