// Há aprendizado? Mesma semente de evolução, mapa estático (mesmo terreno) vs dinâmico.
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
function rodar(modoB, pesosModo, dinamico, G) {
  const S = N.criarSim(); S.modoB = modoB; S.pesosModo = pesosModo; S.dinamico = dinamico; N.reiniciar(S);
  const metas = [], vetos = []; let v0 = 0;
  while (S.gen <= G) if (N.passo(S)) { metas.push(S.ultima.B.metas); vetos.push(S.vetos - v0); v0 = S.vetos; }
  const m = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
  console.log(`${(modoB + '/' + pesosModo).padEnd(18)} ${dinamico ? 'dinâmico' : 'estático'} | B na PSR por geração: ${metas.join(' ')} | 1ª metade ${m(metas.slice(0, G / 2))} → 2ª metade ${m(metas.slice(G / 2))} | vetos/ger 1ª→2ª: ${m(vetos.slice(0, G / 2))} → ${m(vetos.slice(G / 2))}`);
}
rodar('ia', 'fixo', true, 20);
rodar('ia', 'fixo', false, 20);
rodar('merito', 'evolutivo', false, 20);
rodar('regra', 'fixo', false, 6);
