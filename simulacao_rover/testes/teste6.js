const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'animacao_tese_rover_neuroevolucao.html'), 'utf8');
const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
const nomes = { b60: '60 m bruto', t60: 'Tese 60→5 m', b20: '20 m bruto', t20: 'Tese 20→5 m', real: 'Real (oráculo)' };
const modo = process.argv[2] || 'regra', G = +(process.argv[3] || 30);
for (const f of ['b60', 't60', 'b20', 't20', 'real']) {
  const S = N.criarSim(); S.modoB = modo; S.fontePrev = f; S.modelo = process.argv[4] || 'padrao'; N.reiniciar(S);
  let metas = 0, tChegada = 0, hib = 0, surpresas = 0, recarga = 0, rovers = 0;
  const estado = new Map();
  while (S.gen <= G) {
    const vivos = S.B.filter(r => r.vivo);
    const fim = N.passo(S);
    for (const r of vivos) {
      if (r.hiberna) hib += N.DT;
      if (r.acao === 3 && !r.hiberna) recarga += N.DT;
      // "surpresa": entrou na sombra real sem ter previsto (não estava recarregando antes) e acabou hibernando
      const e = estado.get(r) || { hib: false };
      if (r.hiberna && !e.hib) surpresas++;
      e.hib = r.hiberna; estado.set(r, e);
      if (r.chegou) { metas++; tChegada += S.t; }
    }
    if (fim) { rovers += 60; estado.clear(); }
  }
  console.log(`${modo.padEnd(6)} ${nomes[f].padEnd(15)} | chega ${(metas / rovers * 100).toFixed(0)}% | tempo médio até a PSR ${(tChegada / metas).toFixed(0)} s | hibernação ${(hib / rovers).toFixed(1)} s/rover | entradas em hibernação ${(surpresas / rovers).toFixed(2)}/rover | recarga planejada ${(recarga / rovers).toFixed(1)} s/rover`);
}
