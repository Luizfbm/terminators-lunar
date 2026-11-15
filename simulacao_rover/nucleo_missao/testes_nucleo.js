// testes_nucleo.js — rode com:  node testes_nucleo.js
// Usa uma efeméride SINTÉTICA (não é física real): o Sol dá uma volta no
// azimute a cada 29,53 dias com elevação ±1,5°; a Terra oscila ±6,7° em
// elevação com período de 27,3 dias, fixa no azimute 0°.
// Serve para travar a LÓGICA (máquina de estados, cores, funil), não os números.
"use strict";
require("./js/nucleo_missao.js");
const N = globalThis.NucleoMissao;
const assert = require("node:assert/strict");

let falhas = 0;
function teste(nome, fn) {
  try { fn(); console.log("ok   ", nome); }
  catch (e) { falhas++; console.log("FALHA", nome, "\n     ", e.message); }
}

const SINODICO_H = 29.53 * 24, DRACONICO_H = 27.3 * 24;
const T0 = N.instante("2027-01-01T00:00Z");
const fonteSintetica = (_sitio, t) => {
  const h = N.horasEntre(T0, t);
  return {
    t,
    sol: { azimute: N.normalizarAzimute((h / SINODICO_H) * 360), elevacao: N.graus(1.5 * Math.sin((2 * Math.PI * h) / (365.25 * 24))) },
    terra: { azimute: N.graus(0), elevacao: N.graus(6.7 * Math.sin((2 * Math.PI * h) / DRACONICO_H)) },
    eclipse: false,
  };
};

const mascaraPlana = (e = 0) => ({ passoAzimute: N.graus(1), elevacoes: Array.from({ length: 360 }, () => N.graus(e)), origem: "dem_20m" });
const sitio = (over = {}) => ({
  id: "S1", nome: "Teste", latitude: N.graus(-89.5), longitude: N.graus(0), categoria: "artemis",
  mascara: mascaraPlana(-2), regiaoOficialNasa: true, inclinacao: N.graus(5), areaPSR_m2: 100000, ...over,
});
const rover = (over = {}) => ({
  nome: "VIPER-like", potenciaPicoSolar: N.watts(450), geometriaPainel: "vertical_rastreador", potenciaRTG: N.watts(0),
  consumoOperacao: N.watts(200), capacidadeBateria: N.wattHora(3000), cargaInicial: N.fracao(1), linkDireto: true, ...over,
});

// ---------------------------------------------------------------- geometria
teste("interpolação do horizonte é circular (359,5° entre bins 359 e 0)", () => {
  const el = Array.from({ length: 360 }, () => N.graus(0)); el[359] = N.graus(2); el[0] = N.graus(4);
  const m = { passoAzimute: N.graus(1), elevacoes: el, origem: "dem_20m" };
  assert.equal(N.elevacaoHorizonte(m, N.graus(359.5)), 3);
  assert.equal(N.elevacaoHorizonte(m, N.graus(-0.5)), 3);
});
teste("fração do disco: centro no horizonte = 0,5; acima do raio = 1; abaixo = 0", () => {
  const m = mascaraPlana(0);
  assert.ok(Math.abs(N.fracaoSolVisivel({ azimute: N.graus(10), elevacao: N.graus(0) }, m) - 0.5) < 1e-12);
  assert.equal(N.fracaoSolVisivel({ azimute: N.graus(10), elevacao: N.graus(0.3) }, m), 1);
  assert.equal(N.fracaoSolVisivel({ azimute: N.graus(10), elevacao: N.graus(-0.3) }, m), 0);
});
teste("painel horizontal a 1,5° rende ~2,6 % do vertical (iluminação ≠ energia)", () => {
  const a = { t: T0, sol: { azimute: N.graus(0), elevacao: N.graus(1.5) }, terra: { azimute: N.graus(0), elevacao: N.graus(0) }, eclipse: false };
  const m = mascaraPlana(-5);
  const pv = N.potenciaSolar(rover(), a, m);
  const ph = N.potenciaSolar(rover({ geometriaPainel: "horizontal" }), a, m);
  assert.ok(Math.abs(ph / pv - Math.tan((1.5 * Math.PI) / 180)) < 1e-9);
});
teste("eclipse zera a potência", () => {
  const a = { t: T0, sol: { azimute: N.graus(0), elevacao: N.graus(1) }, terra: { azimute: N.graus(0), elevacao: N.graus(0) }, eclipse: true };
  assert.equal(N.potenciaSolar(rover(), a, mascaraPlana(-5)), 0);
});
teste("construtores recusam NaN", () => { assert.throws(() => N.graus(NaN)); assert.throws(() => N.horas(Infinity)); });

// ---------------------------------------------------------------- cronômetro
teste("cores do cronômetro: >24 verde, <24 âmbar, <6 vermelho, null verde", () => {
  assert.equal(N.corCronometro(N.horas(30)), "verde");
  assert.equal(N.corCronometro(N.horas(23)), "ambar");
  assert.equal(N.corCronometro(N.horas(5.9)), "vermelho");
  assert.equal(N.corCronometro(null), "verde");
});
teste("próximo pôr/nascer da Terra encontra a troca de visibilidade", () => {
  const s = sitio({ mascara: mascaraPlana(0) });
  const serie = N.construirSerie(s, fonteSintetica, T0, N.horas(40 * 24));
  const c = N.proximoEvento(serie, T0, "terra");
  // em T0 a elevação é 0 → não visível → próximo evento é nascer
  assert.equal(c.evento, "nascer_da_terra");
  assert.ok(c.horasRestantes !== null && c.horasRestantes <= 1);
});

// ---------------------------------------------------------------- bateria
teste("sem Sol nenhum: hiberna ao zerar e NÃO acorda (só consome 4 W)", () => {
  const s = sitio({ mascara: mascaraPlana(10) }); // relevo alto: Sol nunca aparece
  const serie = N.construirSerie(s, fonteSintetica, T0, N.horas(48));
  const r = N.simularBateria(rover(), serie, 0, N.horas(48));
  assert.equal(r.entradasHibernacao, 1);
  assert.equal(r.cargaMinima, 0);
  assert.equal(r.modo[r.modo.length - 1], "hibernando");
  assert.equal(r.horasHibernando, 48 - 15); // 3000 Wh / 200 W = 15 h operando
});
teste("hibernação → acorda ao atingir 15 % quando o Sol volta", () => {
  // Sol escondido nas primeiras 20 h e depois visível: controla pelo eclipse.
  const fonte = (st, t) => ({ ...fonteSintetica(st, t), sol: { azimute: N.graus(0), elevacao: N.graus(1) }, eclipse: N.horasEntre(T0, t) < 20 });
  const s = sitio({ mascara: mascaraPlana(-5) });
  const serie = N.construirSerie(s, fonte, T0, N.horas(40));
  const r = N.simularBateria(rover({ consumoOperacao: N.watts(200) }), serie, 0, N.horas(40));
  assert.equal(r.entradasHibernacao, 1);
  assert.equal(r.modo[r.modo.length - 1], "operando");
});
teste("aviso: hibernação é sempre 🔴", () => {
  const s = sitio({ mascara: mascaraPlana(10) });
  const serie = N.construirSerie(s, fonteSintetica, T0, N.horas(48));
  const p = N.preverMissao(rover(), serie, T0, N.horas(48));
  assert.equal(N.avisoMissao(p).nivel, "risco");
});

// ---------------------------------------------------------------- comparação
teste("comparação A×B: A com Sol vence B sem Sol em bateria mínima", () => {
  const sa = sitio({ id: "A", mascara: mascaraPlana(-5) }), sb = sitio({ id: "B", mascara: mascaraPlana(10) });
  const d = N.horas(48);
  const pa = N.preverMissao(rover(), N.construirSerie(sa, fonteSintetica, T0, d), T0, d);
  const pb = N.preverMissao(rover(), N.construirSerie(sb, fonteSintetica, T0, d), T0, d);
  const linha = N.compararPlanos(pa, pb).find((l) => l.kpi === "Bateria mínima");
  assert.equal(linha.vencedor, "A");
  assert.equal(N.compararPlanos(pb, pa).find((l) => l.kpi === "Pior apagão").vencedor, "B");
});

// ---------------------------------------------------------------- funil
teste("funil: ordem das etapas é a do plano", () => {
  assert.deepEqual(N.ETAPAS_FUNIL.map((e) => e.id),
    ["polo_sul", "regiao_nasa", "bateria_antena", "eclipses", "margem_relevo", "atraso_1_ano", "gelo"]);
});
teste("funil: descarta pelo motivo certo e contagens decrescem", () => {
  const ctx = { veiculo: rover({ linkDireto: false }), duracaoMissao: N.dias(3), ano: 2027, fonte: fonteSintetica, cfg: N.CONFIG_PADRAO };
  const sitios = [
    sitio({ id: "bom" }),
    sitio({ id: "equador", latitude: N.graus(0) }),
    sitio({ id: "fora_nasa", regiaoOficialNasa: false }),
    sitio({ id: "escuro", mascara: mascaraPlana(10) }),
    sitio({ id: "ingreme", inclinacao: N.graus(20) }),
    sitio({ id: "seco", areaPSR_m2: 10 }),
    sitio({ id: "aprox", mascara: { ...mascaraPlana(-2), origem: "ilustrativo" } }),
  ];
  const r = N.rodarFunil(sitios, ctx);
  assert.equal(r.descartes.get("equador").etapaId, "polo_sul");
  assert.equal(r.descartes.get("fora_nasa").etapaId, "regiao_nasa");
  assert.equal(r.descartes.get("escuro").etapaId, "bateria_antena");
  assert.equal(r.descartes.get("ingreme").etapaId, "margem_relevo");
  assert.equal(r.descartes.get("seco").etapaId, "gelo");
  assert.deepEqual(r.viaveis.map((v) => v.sitio.id), ["bom", "aprox"]); // ≈ fica atrás
  assert.ok(r.viaveis[1].aproximado);
  assert.ok(r.viaveis[0].dataRecomendada);
  for (let i = 1; i < r.contagens.length; i++) assert.ok(r.contagens[i] <= r.contagens[i - 1]);
});

teste("CSV tem cabeçalho e uma linha por passo", () => {
  const serie = N.construirSerie(sitio(), fonteSintetica, T0, N.horas(5));
  const csv = N.serieParaCSV(serie).split("\n");
  assert.equal(csv.length, 1 + 6);
  assert.ok(csv[0].startsWith("utc_iso,"));
});

// ---------------------------------------------------------------- otimização Marcato
teste("simplexDuasFases: problema clássico do Marcato + preços sombra (Aula 05/08)", () => {
  const res = N.simplexDuasFases(
    [3, 5],
    [
      { a: [2, 1], tipo: "<=", b: 16 },
      { a: [1, 2], tipo: "<=", b: 11 },
      { a: [1, 3], tipo: "<=", b: 15 },
    ],
  );
  assert.equal(res.status, "otimo");
  assert.ok(Math.abs(res.x[0] - 7) < 1e-6);
  assert.ok(Math.abs(res.x[1] - 2) < 1e-6);
  assert.ok(Math.abs(res.valorOtimo - 31) < 1e-6);
  // Preços sombra exatos: y1 = 1/3, y2 = 7/3, y3 = 0 (folga estrita na 3ª restrição)
  assert.ok(Math.abs(res.precosSombra[0] - 1 / 3) < 1e-6);
  assert.ok(Math.abs(res.precosSombra[1] - 7 / 3) < 1e-6);
  assert.ok(Math.abs(res.precosSombra[2]) < 1e-6);
});

teste("simplexDuasFases: restrições >=, = e detecção de inviabilidade (Aula 07)", () => {
  const ok = N.simplexDuasFases(
    [-2, -3], // min 2x1 + 3x2
    [
      { a: [1, 1], tipo: ">=", b: 4 },
      { a: [1, 0], tipo: "=", b: 1 },
    ],
  );
  assert.equal(ok.status, "otimo");
  assert.ok(Math.abs(ok.x[0] - 1) < 1e-6 && Math.abs(ok.x[1] - 3) < 1e-6);
  assert.ok(Math.abs(ok.valorOtimo - (-11)) < 1e-6);

  const inv = N.simplexDuasFases(
    [1, 1],
    [
      { a: [1, 1], tipo: "<=", b: 2 },
      { a: [1, 1], tipo: ">=", b: 5 },
    ],
  );
  assert.equal(inv.status, "inviavel");
});

teste("otimizarPlanoOperacao: respeita reserva, DTE e preço sombra da bateria (Aula 08)", () => {
  // 20 h: primeiras 10 h com Sol e Terra visível; últimas 10 h em eclipse/sem Terra
  const fonte = (st, t) => {
    const h = N.horasEntre(T0, t);
    return {
      ...fonteSintetica(st, t),
      sol: { azimute: N.graus(0), elevacao: N.graus(1) },
      terra: { azimute: N.graus(0), elevacao: N.graus(h < 10 ? 5 : -5) },
      eclipse: h >= 10,
    };
  };
  const s = sitio({ mascara: mascaraPlana(0) });
  const serie = N.construirSerie(s, fonte, T0, N.horas(20));
  const vBase = rover({ capacidadeBateria: N.wattHora(3000), cargaInicial: N.fracao(0.5), consumoOperacao: N.watts(100), potenciaPicoSolar: N.watts(300) });
  const cfg = N.CONFIG_PADRAO;
  const op = { potenciaCiencia: N.watts(120), potenciaTransmissao: N.watts(100), blocoHoras: N.horas(2) };

  const plano1 = N.otimizarPlanoOperacao(vBase, serie, 0, N.horas(20), op, cfg);
  assert.equal(plano1.viavel, true);
  assert.ok(plano1.energiaCienciaWh > 0 && plano1.energiaTxWh > 0);
  // Nenhuma transmissão nos últimos 5 blocos (h >= 10, Terra abaixo do horizonte)
  for (let k = 5; k < plano1.perfilTxW.length; k++) assert.equal(plano1.perfilTxW[k], 0);
  // Bateria sempre >= reserva (20 % de 3000 = 600 Wh)
  for (const e of plano1.bateriaWh) assert.ok(e >= 600 - 1e-4);

  // Verifica preço sombra da bateria por diferença finita (+10 Wh de capacidade)
  const vMais = rover({ ...vBase, capacidadeBateria: N.wattHora(3010), cargaInicial: N.fracao((0.5 * 3000) / 3010) });
  const plano2 = N.otimizarPlanoOperacao(vMais, serie, 0, N.horas(20), op, cfg);
  const dZ = plano2.valorObjetivo - plano1.valorObjetivo;
  assert.ok(plano1.precoSombraBateria >= 0);
  assert.ok(Math.abs(dZ / 10 - plano1.precoSombraBateria) < 0.25);
});

teste("newtonRaiz1D: converge para raiz de f'(x) = 4x^3 - 9x^2 = 0 (Aula 10)", () => {
  const r = N.newtonRaiz1D((x) => 4 * x * x * x - 9 * x * x, 3.0, 0.5, 5.0);
  assert.equal(r.convergiu, true);
  assert.ok(Math.abs(r.x - 2.25) < 1e-3);
});

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
