// Treino em TERRENOS SINTÉTICOS ('calibrado') e aplicação/teste no RELEVO REAL LOLA (16 faixas de 8 sítios inéditos).
// Uso:
//   node exp_sint_lola.js --all          (roda todas as configurações em paralelo usando múltiplos núcleos)
//   CFG=<nome> node exp_sint_lola.js     (roda uma configuração específica e grava em lola_sint/<CFG>.json)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const { spawn } = require('child_process');

const OUT_DIR = path.join(__dirname, 'lola_sint');

// Definição completa das configurações pedidas:
// 1. Grade de 60m
// 2. Regra + Marcato + Monte Carlo (pesos fixos)
// 3. Regra + Marcato + Monte Carlo + Ajuste de pesos com IA (treinados em terrenos sintéticos -> testados no relevo real)
// 4. Regra + Tese (todas as combinações possíveis: P50/P90/P99 x Nominal/Calibrada, 60->5m, 20->5m, só plano vs só execução, oráculo)
const CFGS = {
  // === 1. GRADE DE 60 m ===
  R60:            { grupo: '1_grade60', modoB: 'regra',  fontePrev: 'b60', margem: 'nominal',   conf: 'P90', desc: 'Regra + Escudo na grade de 60 m (D1a/D1b, sem tese)', comA: true },

  // === 2. REGRA + MARCATO + MONTE CARLO (pesos fixos) ===
  M60_mc:         { grupo: '2_marcato_mc', modoB: 'merito', fontePrev: 'b60', margem: 'nominal',   conf: 'P90', desc: 'Regra + Marcato (Simplex + KKT/Barreira) + MC na grade 60 m (D1c)' },
  MT_nom_P50:     { grupo: '2_marcato_mc', modoB: 'merito', fontePrev: 't60', margem: 'nominal',   conf: 'P50', desc: 'Regra + Marcato + Tese 60→5 m + MC (Margem Nominal P50)' },
  MT_nom_P90:     { grupo: '2_marcato_mc', modoB: 'merito', fontePrev: 't60', margem: 'nominal',   conf: 'P90', desc: 'Regra + Marcato + Tese 60→5 m + MC (Margem Nominal P90, D2)' },
  MT_nom_P99:     { grupo: '2_marcato_mc', modoB: 'merito', fontePrev: 't60', margem: 'nominal',   conf: 'P99', desc: 'Regra + Marcato + Tese 60→5 m + MC (Margem Nominal P99)' },
  MT_cal_P50:     { grupo: '2_marcato_mc', modoB: 'merito', fontePrev: 't60', margem: 'calibrada', conf: 'P50', desc: 'Regra + Marcato + Tese 60→5 m + MC (Margem Calibrada LOLA P50)' },
  MT_cal_P90:     { grupo: '2_marcato_mc', modoB: 'merito', fontePrev: 't60', margem: 'calibrada', conf: 'P90', desc: 'Regra + Marcato + Tese 60→5 m + MC (Margem Calibrada LOLA P90)' },
  MT_cal_P99:     { grupo: '2_marcato_mc', modoB: 'merito', fontePrev: 't60', margem: 'calibrada', conf: 'P99', desc: 'Regra + Marcato + Tese 60→5 m + MC (Margem Calibrada LOLA P99)' },

  // === 3. REGRA + MARCATO + MONTE CARLO + AJUSTE DE PESOS COM IA (Treino Sintético -> Teste Real LOLA) ===
  M60_ia_sint:    { grupo: '3_marcato_ia_sint', modoB: 'merito', fontePrev: 'b60', margem: 'nominal',   conf: 'P90', treinoPesos: 10, desc: 'Regra + Marcato + Pesos IA (10 ger. sintéticas) na grade 60 m + MC' },
  MT_ia_nom_P50:  { grupo: '3_marcato_ia_sint', modoB: 'merito', fontePrev: 't60', margem: 'nominal',   conf: 'P50', treinoPesos: 10, desc: 'Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) Nominal P50 + MC' },
  MT_ia_nom_P90:  { grupo: '3_marcato_ia_sint', modoB: 'merito', fontePrev: 't60', margem: 'nominal',   conf: 'P90', treinoPesos: 10, desc: 'Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) Nominal P90 (D3) + MC' },
  MT_ia_nom_P99:  { grupo: '3_marcato_ia_sint', modoB: 'merito', fontePrev: 't60', margem: 'nominal',   conf: 'P99', treinoPesos: 10, desc: 'Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) Nominal P99 + MC' },
  MT_ia_cal_P50:  { grupo: '3_marcato_ia_sint', modoB: 'merito', fontePrev: 't60', margem: 'calibrada', conf: 'P50', treinoPesos: 10, desc: 'Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) Calibrada P50 + MC' },
  MT_ia_cal_P90:  { grupo: '3_marcato_ia_sint', modoB: 'merito', fontePrev: 't60', margem: 'calibrada', conf: 'P90', treinoPesos: 10, desc: 'Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) Calibrada P90 + MC' },
  MT_ia_cal_P99:  { grupo: '3_marcato_ia_sint', modoB: 'merito', fontePrev: 't60', margem: 'calibrada', conf: 'P99', treinoPesos: 10, desc: 'Regra + Marcato + Tese 60→5 m + Pesos IA (10 ger. sint.) Calibrada P99 + MC' },
  MLP_sint_nom:   { grupo: '3_marcato_ia_sint', modoB: 'ia',     fontePrev: 't60', margem: 'nominal',   conf: 'P90', treinoRede: 10,  desc: 'Escudo + Rede MLP 8→7→4 (10 ger. sintéticas, D4a) + Tese Nominal P90 + MC' },
  MLP_sint_cal:   { grupo: '3_marcato_ia_sint', modoB: 'ia',     fontePrev: 't60', margem: 'calibrada', conf: 'P90', treinoRede: 10,  desc: 'Escudo + Rede MLP 8→7→4 (10 ger. sintéticas, D4a) + Tese Calibrada P90 + MC' },
  H_sint_nom:     { grupo: '3_marcato_ia_sint', modoB: 'iaH',    fontePrev: 't60', margem: 'nominal',   conf: 'P90', iahPre: true,    desc: 'Escudo + IA Híbrida 14→8→3 (pré-treino sintético, D4b) + Tese Nominal P90 + MC' },
  H_sint_cal:     { grupo: '3_marcato_ia_sint', modoB: 'iaH',    fontePrev: 't60', margem: 'calibrada', conf: 'P90', iahPre: true,    desc: 'Escudo + IA Híbrida 14→8→3 (pré-treino sintético, D4b) + Tese Calibrada P90 + MC' },
  H_sint10_nom:   { grupo: '3_marcato_ia_sint', modoB: 'iaH',    fontePrev: 't60', margem: 'nominal',   conf: 'P90', iahPre: true, treinoRede: 10, desc: 'Escudo + IA Híbrida (pré-treino + 10 ger. sintéticas) + Tese Nominal P90 + MC' },

  // === 4. REGRA + TESE (TODAS AS COMBINAÇÕES POSSÍVEIS) ===
  RT_nom_P50:     { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't60',  margem: 'nominal',   conf: 'P50', desc: 'Regra + Tese 60→5 m · Margem Nominal · P50' },
  RT_nom_P90:     { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't60',  margem: 'nominal',   conf: 'P90', desc: 'Regra + Tese 60→5 m · Margem Nominal · P90 (padrão RT_nom)' },
  RT_nom_P99:     { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't60',  margem: 'nominal',   conf: 'P99', desc: 'Regra + Tese 60→5 m · Margem Nominal · P99' },
  RT_cal_P50:     { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't60',  margem: 'calibrada', conf: 'P50', desc: 'Regra + Tese 60→5 m · Margem Calibrada (MC LOLA) · P50' },
  RT_cal_P90:     { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't60',  margem: 'calibrada', conf: 'P90', desc: 'Regra + Tese 60→5 m · Margem Calibrada (MC LOLA) · P90 (RT_cal)' },
  RT_cal_P99:     { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't60',  margem: 'calibrada', conf: 'P99', desc: 'Regra + Tese 60→5 m · Margem Calibrada (MC LOLA) · P99' },
  RT_soExec_nom:  { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't60',  margem: 'nominal',   conf: 'P90', rotaForcada: 0, desc: 'Regra + Tese só na execução a bordo (rota planejada em 60 m)' },
  RT_soPlano_nom: { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 'b60',  margem: 'nominal',   conf: 'P90', rotaForcada: 1, desc: 'Regra + Tese só no plano de solo (execução a bordo em 60 m)' },
  R20:            { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 'b20',  margem: 'nominal',   conf: 'P90', desc: 'Regra + Grade bruta de 20 m (sem tese)' },
  RT20_nom_P90:   { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't20',  margem: 'nominal',   conf: 'P90', desc: 'Regra + Tese 20→5 m · Margem Nominal · P90' },
  RT20_cal_P90:   { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 't20',  margem: 'calibrada', conf: 'P90', desc: 'Regra + Tese 20→5 m · Margem Calibrada · P90' },
  R_oraculo:      { grupo: '4_regra_tese', modoB: 'regra', fontePrev: 'real', margem: 'nominal',   conf: 'P90', desc: 'Regra + Mapa Real de 5 m (Oráculo — referência superior)' },
};

function rodarUma(nome) {
  const c = CFGS[nome];
  if (!c) throw new Error('Configuração desconhecida: ' + nome);
  const t0 = Date.now();
  const htmlPath = process.env.ARQ || path.join(__dirname, '..', 'animacao_tese_rover_neuroevolucao_v18.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const N = new Function(html.slice(html.indexOf('/*<<NUCLEO*/'), html.indexOf('/*NUCLEO>>*/')) + '\nreturn NUCLEO;')();
  const tag = (id) => { const i = html.indexOf('id="' + id + '">') + id.length + 6; return html.slice(i, html.indexOf('</script>', i)); };
  const meta = JSON.parse(tag('metaLOLA'));
  const raw = zlib.inflateSync(Buffer.from(tag('dadosLOLA').trim(), 'base64'));
  N.carregarLOLA(meta, new Uint8Array(raw.buffer, raw.byteOffset, raw.length));

  const pop = +(process.env.POP || 20);
  N.definirEscala('realista');
  N.definirMargem(c.margem || 'nominal');

  // ---------------------------------------------------------------------------
  // FASE 1: TREINO EM TERRENOS SINTÉTICOS ('calibrado')
  // ---------------------------------------------------------------------------
  N.definirTerreno('calibrado');
  const S = N.criarSim();
  Object.assign(S, {
    modoB: c.modoB,
    fontePrev: c.fontePrev === 't20' ? 't60' : c.fontePrev,
    planejadorB: 'b',
    planejadorA: 'a',
    conf: c.conf || 'P90',
    modelo: 'padrao',
    custoHib: true,
    corredorAtivo: true,
    multiRota: true,
    camera: 'ok',
    valCada: 0,
    pop,
    fisicaReal: false
  });
  if (c.iahPre !== undefined) S.iahPre = c.iahPre;
  const G = c.treinoPesos || c.treinoRede || 0;
  if (c.treinoPesos) S.pesosModo = 'evolutivo';
  N.reiniciar(S);

  const treino = [];
  if (G > 0) {
    let g = 0;
    while (S.gen <= G && g++ < 8e7) {
      for (const r of S.A) r.vivo = false; // O treino evolui apenas o time B; evita simular o time A à toa no treino sintético
      N.passo(S);
    }
    for (const h of S.historico) {
      treino.push({ gen: h.gen, bPct: +h.bPct.toFixed(1), bMeta: +h.bMeta.toFixed(1) });
    }
    if (c.treinoPesos && S.eliteW) {
      S.pesosUsuario = { ...S.eliteW };
      S.pesosModo = 'fixo';
    }
  }

  // ---------------------------------------------------------------------------
  // FASE 2: AVALIAÇÃO NO RELEVO REAL LOLA (16 faixas de teste, 8 sítios inéditos)
  // ---------------------------------------------------------------------------
  N.definirTerreno('lola');
  N.MC_LOLA.ativo = true; // Teste no relevo real sempre aplica Monte Carlo pareado por semente
  const Q = N.iniciarTeste(S);
  if (c.modoB === 'iaH' && c.treinoRede) Q.genomasH = null; // Usa bestW do Rank-ES no teste
  Q.fontePrev = c.fontePrev;
  Q.conf = c.conf || 'P90';
  Q.corredorAtivo = false;
  Q.fisicaReal = true;
  if (c.rotaForcada !== undefined) Q.rotaForcada = c.rotaForcada;

  const out = {
    cfg: nome,
    grupo: c.grupo,
    desc: c.desc,
    conf: c,
    pesosAprendidos: c.treinoPesos ? S.pesosUsuario : null,
    marcatoInfo: c.treinoPesos && S.marcatoW ? S.marcatoW : null,
    treinoSintetico: treino,
    terrenos: []
  };

  for (let k = 0; k < N.LOLA.teste.length; k++) {
    const sd = 7300 + k;
    Q.seed = sd;
    Q.T = N.terrenoPorPapel(sd, 'teste', k);

    // Se a fonte for Tese 20->5m (t20), calcula o declive estimado a partir de demT20 (20->5m)
    if (c.fontePrev === 't20') {
      const GW = N.GW, GH = N.GH, CELL = N.CELL, d20 = Q.T.demT20;
      for (let gy = 0; gy < GH; gy++) {
        for (let gx = 0; gx < GW; gx++) {
          const i = gy * GW + gx;
          const xa = Math.max(0, gx - 1), xb = Math.min(GW - 1, gx + 1), ya = Math.max(0, gy - 1), yb = Math.min(GH - 1, gy + 1);
          const gxv = (d20[gy * GW + xb] - d20[gy * GW + xa]) / ((xb - xa) * CELL);
          const gyv = (d20[yb * GW + gx] - d20[ya * GW + gx]) / ((yb - ya) * CELL);
          Q.T.slopeMapa[i] = Math.atan(Math.hypot(gxv, gyv)) * 180 / Math.PI;
        }
      }
    }

    // Se a confiança não for P90 ou se for t20, replaneja a rota em solo da tese com o quantil z ativo
    if (Q.conf !== 'P90' || c.fontePrev === 't20') {
      const zAtivo = N.CONF[Q.conf].z;
      const rT = N.planejarCena(Q.T, 'tese', N.SLOPE_LIMIT, zAtivo);
      if (rT) Q.T.rotas[1] = { k: 1, nome: 'Planejada com a tese', y: rT.y, ang: rT.ang };
    }

    Q.sunAz = 0;
    Q.gen = N.TESTE.length;
    Q.historico = [];
    Q.ultima = null;
    N.nascer(Q);
    if (c.rotaForcada !== undefined) {
      Q.plano.B = c.rotaForcada;
      for (const r of Q.B) {
        r.rk = c.rotaForcada;
        r.ry = Q.T.rotas[c.rotaForcada].y;
        r.ra = Q.T.rotas[c.rotaForcada].ang;
      }
    }

    const A0 = Q.A, B0 = Q.B, lola = Q.T.lola, plano = { A: Q.plano.A, B: Q.plano.B };
    // Se não precisamos re-simular A (pois A é idêntico ao de R60), esvaziamos Q.A durante o loop de passo
    if (!c.comA) Q.A = [];

    let j = 0;
    while (Q.historico.length < 1 && j++ < 9e6) N.passo(Q);

    const rov = (L) => L.map((r) => ({
      x: Math.min(r.x, N.GOAL_X) / N.GOAL_X * 100,
      ok: r.chegou ? 1 : 0,
      m: r.chegou ? 'META' : (r.motivo || '?'),
      bat: +(r.bat || 0).toFixed(1),
      tFim: +(r.tFim || Q.t || 0).toFixed(1),
      refl: r.nReflexos || 0,
      replan: r.nReplan || 0
    }));
    out.terrenos.push({ k, lola, plano, A: c.comA ? rov(A0) : [], B: rov(B0) });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${nome}.json`), JSON.stringify(out));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const L = out.terrenos.flatMap((t) => t.B);
  const tomb = (X) => 100 * mean(X.map((r) => r.m.startsWith('TOMB') ? 1 : 0));
  const trStr = treino.length ? ` | treinoSint PSR: ${treino.map((t) => t.bMeta).join('->')}%` : '';
  console.log(`${nome.padEnd(16)} | ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s | B chegada ${(100 * mean(L.map((r) => r.ok))).toFixed(1).padStart(5)}% | rota ${mean(L.map((r) => r.x)).toFixed(1).padStart(5)}% | tomb ${tomb(L).toFixed(1).padStart(4)}%${trStr}`);
}

async function rodarTodasParalelo() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const nomes = Object.keys(CFGS);
  const maxWorkers = Math.min(12, os.cpus().length, nomes.length);
  console.log(`Iniciando ${nomes.length} configurações em paralelo (${maxWorkers} processos simultâneos)...`);
  const t0 = Date.now();
  let idx = 0;

  const worker = async () => {
    while (idx < nomes.length) {
      const nome = nomes[idx++];
      await new Promise((resolve, reject) => {
        const p = spawn(process.execPath, [__filename], {
          env: { ...process.env, CFG: nome },
          stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        p.stdout.on('data', (d) => { out += d.toString(); });
        p.stderr.on('data', (d) => { err += d.toString(); });
        p.on('close', (code) => {
          if (out.trim()) console.log(out.trim());
          if (code !== 0) console.error(`Erro em ${nome}:`, err);
          resolve();
        });
      });
    }
  };

  await Promise.all(Array.from({ length: maxWorkers }, () => worker()));

  // Copia o vetor A de R60 para todos os arquivos JSON para pareamento completo nas análises
  const r60Path = path.join(OUT_DIR, 'R60.json');
  if (fs.existsSync(r60Path)) {
    const r60 = JSON.parse(fs.readFileSync(r60Path, 'utf8'));
    for (const nome of nomes) {
      if (nome === 'R60') continue;
      const fp = path.join(OUT_DIR, `${nome}.json`);
      if (fs.existsSync(fp)) {
        const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
        for (let k = 0; k < d.terrenos.length; k++) {
          d.terrenos[k].A = r60.terrenos[k].A;
        }
        fs.writeFileSync(fp, JSON.stringify(d));
      }
    }
  }
  console.log(`Concluído em ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
}

if (process.argv.includes('--all')) {
  rodarTodasParalelo();
} else if (process.env.CFG) {
  rodarUma(process.env.CFG);
} else {
  console.log('Use: node exp_sint_lola.js --all   ou   CFG=<nome> node exp_sint_lola.js');
}
