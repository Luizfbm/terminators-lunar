// Várias rotas: o planejamento com a tese escolhe rotas melhores que o plano de 60 m?
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
const G = +(process.argv[2] || 12), modelo = process.argv[3] || 'padrao', modoB = process.argv[4] || 'regra';
function rodar(planejadorB, fonte) {
  const S = N.criarSim(); S.modoB = modoB; S.modelo = modelo; S.fontePrev = fonte; S.planejadorB = planejadorB; N.reiniciar(S);
  let acertoA = 0, acertoB = 0, arrepA = 0, arrepB = 0, bPct = 0, aPct = 0, bMeta = 0; const escolhas = [];
  while (S.gen <= G) {
    const p = S.plano;
    if (N.passo(S)) {
      const u = S.ultima, pl = u.plano, custo = (k) => pl.real.find(r => r.k === k).custo, best = custo(pl.melhorReal);
      acertoA += pl.A === pl.melhorReal; acertoB += pl.B === pl.melhorReal;
      arrepA += custo(pl.A) - best; arrepB += custo(pl.B) - best;
      bPct += u.B.pct; aPct += u.A.pct; bMeta += u.B.metas;
      escolhas.push(`${pl.A}${pl.B}${pl.melhorReal}`);
    }
  }
  const f = (x) => (x / G).toFixed(0);
  console.log(`B planeja com ${(planejadorB === 'a' ? '60 m' : 'tese/' + fonte).padEnd(10)} | acerta a melhor rota real: A ${(acertoA / G * 100).toFixed(0)}% · B ${(acertoB / G * 100).toFixed(0)}% | custo real a mais (arrependimento): A ${f(arrepA)} · B ${f(arrepB)} | B percorre ${f(bPct)}% · PSR ${(bMeta / G / 60 * 100).toFixed(0)}% | A ${f(aPct)}% | escolhas A·B·melhor: ${escolhas.join(' ')}`);
}
rodar('a', 't60'); rodar('b', 't60'); rodar('b', 't20');
