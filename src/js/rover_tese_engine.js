/**
 * Motor Tático da Tese (extraído de simulacao_rover/animacao_tese_rover_neuroevolucao_v14.html)
 * 5 Degraus:
 *   0: Base 60/20 m (sem escudo, sem margem)
 *   1: + Marcato (Barreira Logarítmica + KKT)
 *   2: + Multirresolução 5 m (LDEC > 0 + No False Relief)
 *   3: + Monte Carlo Robusto (Escudo Determinístico P90 / P99)
 *   4: + IA (MLP) sob Escudo P90/P99
 */
(function (global) {
  "use strict";

  const Z_CONF = { P50: 0.0, P90: 1.282, P99: 2.326 };

  const DEGRAUS = [
    { id: 0, name: "0: Base 60/20 m", short: "60/20m", desc: "Segue grade grossa sem escudo e sem margem" },
    { id: 1, name: "1: + Marcato", short: "Marcato", desc: "Barreira logarítmica + KKT (desvio suave na grade)" },
    { id: 2, name: "2: + Multirresolução 5 m", short: "Multi 5m", desc: "LDEC > 0 preserva 5 m; LDEC = 0 sem relevo falso" },
    { id: 3, name: "3: + Monte Carlo (P90)", short: "MC P90", desc: "Escudo determinístico P90/P99 com incerteza LOLA" },
    { id: 4, name: "4: + IA (MLP) + Escudo", short: "IA + Escudo", desc: "Rede MLP propõe trajetória filtrada pelo Escudo P90/P99" }
  ];

  // Pesos pré-treinados compactos para MLP (10 entradas -> 6 ocultas tanh -> 3 saídas: delta, vel, carga)
  const MLP_W1 = [
    [ 0.92,  0.45, -0.85, -0.45, -0.92,  0.30,  0.65, -0.25,  0.15,  0.10],
    [-0.55,  0.88,  0.10, -0.88,  0.55,  0.15, -0.40,  0.60, -0.35,  0.20],
    [ 0.20,  0.45,  0.95,  0.45,  0.20, -0.60,  0.10,  0.35,  0.55, -0.45],
    [-0.70, -0.30,  0.65,  0.30,  0.70,  0.40, -0.50, -0.45,  0.25,  0.35],
    [ 0.10, -0.25,  0.50, -0.25,  0.10,  0.85,  0.15, -0.75, -0.60,  0.70],
    [ 0.40,  0.60, -0.40, -0.60, -0.40, -0.20,  0.80,  0.30, -0.40, -0.15]
  ];
  const MLP_B1 = [0.0, 0.05, -0.15, 0.0, 0.1, -0.05];
  const MLP_W2 = [
    [ 0.85,  0.45,  0.05, -0.55,  0.10,  0.60], // delta (esterçamento)
    [ 0.15,  0.30,  0.75,  0.15,  0.45,  0.20], // velocidade
    [-0.10, -0.20, -0.55,  0.10,  0.85, -0.15]  // tendência a recarregar/parar
  ];
  const MLP_B2 = [0.0, 0.35, -0.45];

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const len = bin.length;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function decodePGDA(raw) {
    const n = raw.n;
    const total = n * n;
    const surfBytes = b64ToBytes(raw.surf_i16);
    const surfI16 = new Int16Array(surfBytes.buffer, surfBytes.byteOffset, total);
    const surf = new Float32Array(total);
    for (let i = 0; i < total; i++) surf[i] = raw.z_mid_m + surfI16[i] * 0.1;

    const u8ToF32 = (b64, scale) => {
      const b = b64ToBytes(b64);
      const arr = new Float32Array(total);
      for (let i = 0; i < total; i++) arr[i] = b[i] / scale;
      return arr;
    };

    const slp5 = u8ToF32(raw.slp5_u8, 2.0);
    const slp60 = u8ToF32(raw.slp60_u8, 2.0);
    const slp20 = u8ToF32(raw.slp20_u8, 2.0);
    const slperr = u8ToF32(raw.slperr_u8, 4.0);

    const ldecRaw = b64ToBytes(raw.ldec_u8);
    const ldecDen = new Float32Array(total);
    const ldecAny = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      ldecAny[i] = (ldecRaw[i] & 128) ? 1 : 0;
      ldecDen[i] = (ldecRaw[i] & 127) / 127.0;
    }

    return {
      sitio: raw.sitio,
      n,
      cellM: raw.cell_m || 50,
      spanKm: raw.span_km || 10.0,
      zMin: raw.z_min_m,
      zMax: raw.z_max_m,
      surf, slp5, slp60, slp20, ldecDen, ldecAny, slperr
    };
  }

  function createSyntheticGrid(site) {
    const n = 200;
    const total = n * n;
    const surf = new Float32Array(total);
    const slp5 = new Float32Array(total);
    const slp60 = new Float32Array(total);
    const slp20 = new Float32Array(total);
    const ldecDen = new Float32Array(total);
    const ldecAny = new Uint8Array(total);
    const slperr = new Float32Array(total);
    const baseSlp = site && isFinite(site.slope) ? site.slope : 8.0;
    const seed = ((site && site.id) || 17) * 1337;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const nx = (x - n / 2) / 35, ny = (y - n / 2) / 35;
        const h = Math.sin(nx + seed * 0.01) * 40 + Math.cos(ny * 1.3) * 35 - 120 * Math.exp(-((nx - 0.9) ** 2 + (ny + 0.7) ** 2) * 1.8);
        surf[i] = h;
        const s60 = Math.max(1, baseSlp * 0.75 + 4.0 * Math.abs(Math.sin(nx * 0.8 + ny * 0.6)));
        const crater = 14 * Math.exp(-((nx - 0.9) ** 2 + (ny + 0.7) ** 2) * 3.0);
        slp60[i] = s60;
        slp20[i] = s60 + crater * 0.45;
        slp5[i] = s60 + crater + 3.5 * Math.abs(Math.sin(x * 0.37) * Math.cos(y * 0.41));
        const hasShot = ((x * 73 + y * 151 + seed) % 14) === 0;
        ldecAny[i] = hasShot ? 1 : 0;
        ldecDen[i] = hasShot ? 0.45 : 0.04;
        slperr[i] = hasShot ? 1.2 : 3.2;
      }
    }
    return {
      sitio: (site && site.code) || "SINTETICO",
      n, cellM: 50, spanKm: 10.0, zMin: -160, zMax: 80,
      surf, slp5, slp60, slp20, ldecDen, ldecAny, slperr, synthetic: true
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function wrapDeg(a) { return ((a % 360) + 360) % 360; }
  function angDiffDeg(a, b) {
    let d = wrapDeg(a - b);
    if (d > 180) d -= 360;
    return d;
  }

  function sampleGrid(grid, xM, yM) {
    const half = (grid.n * grid.cellM) / 2;
    const gx = clamp(Math.floor((xM + half) / grid.cellM), 0, grid.n - 1);
    const gy = clamp(Math.floor((yM + half) / grid.cellM), 0, grid.n - 1);
    const i = gy * grid.n + gx;
    return {
      idx: i, gx, gy,
      surf: grid.surf[i],
      slp5: grid.slp5[i],
      slp60: grid.slp60[i],
      slp20: grid.slp20[i],
      ldecDen: grid.ldecDen[i],
      ldecAny: grid.ldecAny[i],
      slperr: grid.slperr[i]
    };
  }

  // Avalia declive efetivo + margem do Escudo segundo o Degrau (0..4)
  function evalCell(sample, degrau, coarseMode, shieldLevel) {
    const coarse = coarseMode === "20m" ? sample.slp20 : sample.slp60;
    if (degrau === 0 || degrau === 1) {
      return { effectiveSlp: coarse, margin: 0, noFalseRelief: false };
    }
    // Degrau 2+: Multirresolução + No False Relief (onde LDEC=0, não inventa detalhe: mantém base grossa + cautela)
    const w = sample.ldecDen / (sample.ldecDen + 0.08);
    const multiSlp = coarse + w * (sample.slp5 - coarse);
    if (degrau === 2) {
      return { effectiveSlp: Math.max(multiSlp, sample.ldecAny ? sample.slp5 : coarse), margin: 0.5, noFalseRelief: !sample.ldecAny };
    }
    // Degrau 3 & 4: Escudo Determinístico P50 / P90 / P99
    const z = Z_CONF[shieldLevel || "P90"] ?? 1.282;
    const sig = sample.ldecDen >= 0.12 ? Math.max(0.8, sample.slperr * 0.35) : Math.max(2.0, sample.slperr * 0.75);
    const margin = 1.0 + z * sig;
    return {
      effectiveSlp: Math.max(multiSlp, sample.ldecAny ? sample.slp5 : coarse) + margin,
      margin,
      noFalseRelief: !sample.ldecAny && sample.ldecDen < 0.05
    };
  }

  function runMLP(inputs) {
    const h = new Array(6);
    for (let j = 0; j < 6; j++) {
      let s = MLP_B1[j];
      for (let i = 0; i < inputs.length; i++) s += MLP_W1[j][i] * inputs[i];
      h[j] = Math.tanh(s);
    }
    const out = new Array(3);
    for (let k = 0; k < 3; k++) {
      let s = MLP_B2[k];
      for (let j = 0; j < 6; j++) s += MLP_W2[k][j] * h[j];
      out[k] = Math.tanh(s);
    }
    return { hidden: h, deltaNorm: out[0], speedNorm: out[1], chargeNorm: out[2] };
  }

  /**
   * Varredura direcional do Escudo 3D ao redor do rover.
   */
  function scanDirectionalShield(grid, pos, headingDeg, targetPos, roverParams, opts) {
    const degrau = opts.degrau ?? 4;
    const coarseMode = opts.coarseMode || "60m";
    const shieldLevel = opts.shieldLevel || "P90";
    const slopeLimit = (roverParams && roverParams.slopeLimitDeg) || 15.0;
    const socPct = opts.socPct ?? 100;

    const targetAz = targetPos
      ? wrapDeg(Math.atan2(targetPos.x - pos.x, targetPos.y - pos.y) * 180 / Math.PI)
      : headingDeg;
    const targetErrDeg = angDiffDeg(targetAz, headingDeg);

    // 13 setores de -90° a +90° (passo 15°) para o cone frontal + traseiro informativo
    const relAngles = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90];
    const maxRangeM = 500;
    const stepM = 50;

    const sectors = relAngles.map((rel) => {
      const az = wrapDeg(headingDeg + rel);
      const rad = az * Math.PI / 180;
      const dx = Math.sin(rad), dy = Math.cos(rad);
      let freeM = maxRangeM;
      let maxEff = 0, maxReal = 0, minLdec = 1, vetoReason = null;

      for (let d = stepM; d <= maxRangeM; d += stepM) {
        const s = sampleGrid(grid, pos.x + dx * d, pos.y + dy * d);
        const ev = evalCell(s, degrau, coarseMode, shieldLevel);
        maxEff = Math.max(maxEff, ev.effectiveSlp);
        maxReal = Math.max(maxReal, s.slp5);
        minLdec = Math.min(minLdec, s.ldecDen);
        if (ev.effectiveSlp > slopeLimit && freeM === maxRangeM) {
          freeM = d - stepM;
          if (degrau >= 3) {
            vetoReason = ev.noFalseRelief
              ? `Vetado (${shieldLevel} + LDEC=0 / No False Relief)`
              : `Vetado (${shieldLevel}: ${ev.effectiveSlp.toFixed(1)}° > ${slopeLimit}°)`;
          } else if (degrau === 2) {
            vetoReason = `Risco 5 m (${ev.effectiveSlp.toFixed(1)}° > ${slopeLimit}°)`;
          } else {
            vetoReason = `Declive grade > ${slopeLimit}°`;
          }
        }
      }

      const safe = freeM >= 200;
      return {
        relDeg: rel, azDeg: az, safe, freeM,
        maxEff: +maxEff.toFixed(1), maxReal: +maxReal.toFixed(1),
        ldecDen: +minLdec.toFixed(2),
        reason: vetoReason || "Corredor seguro"
      };
    });

    // Proposta de direção segundo o Degrau
    let proposedRel = clamp(targetErrDeg, -60, 60);
    let speedFactor = 1.0;
    let mlpOut = null;
    let kkt = null;
    let decisionText = "";
    let shieldVetoed = false;

    if (degrau === 0) {
      // Base 60/20 m: segue direto ao alvo, reação tardia
      const center = sectors[6];
      if (center.freeM < 100) {
        proposedRel = sectors[8].freeM >= sectors[4].freeM ? 30 : -30;
        decisionText = "Degrau 0: desvio tardio na grade grossa";
      } else {
        decisionText = `Degrau 0 (${coarseMode}): seguindo rota sem escudo`;
      }
    } else if (degrau === 1) {
      // + Marcato: função mérito com barreira logarítmica sobre setores
      let bestScore = -1e9, bestRel = 0;
      sectors.forEach((sc) => {
        const align = Math.cos((sc.relDeg - targetErrDeg) * Math.PI / 180);
        const barrier = sc.freeM > 50 ? Math.log(sc.freeM / 50) : -4.0;
        const score = 1.8 * align + 0.9 * barrier - 0.04 * sc.maxEff;
        if (score > bestScore) { bestScore = score; bestRel = sc.relDeg; }
      });
      proposedRel = bestRel;
      kkt = { deltaDeg: bestRel, lambdaObst: +(Math.max(0, 1 - sectors[6].freeM / 300)).toFixed(2), lambdaBat: +(Math.max(0, (35 - socPct) / 35)).toFixed(2) };
      decisionText = `Degrau 1 (Marcato KKT): δ=${bestRel >= 0 ? "+" : ""}${bestRel}° · λ_obst=${kkt.lambdaObst}`;
    } else if (degrau === 2 || degrau === 3) {
      // + Multirresolução 5m / Escudo P90
      let bestScore = -1e9, bestRel = 0;
      sectors.forEach((sc) => {
        const align = Math.cos((sc.relDeg - targetErrDeg) * Math.PI / 180);
        const pen = sc.safe ? 0 : -5.0;
        const score = 1.6 * align + (sc.freeM / maxRangeM) * 1.4 + pen;
        if (score > bestScore) { bestScore = score; bestRel = sc.relDeg; }
      });
      proposedRel = bestRel;
      if (!sectors[6].safe && Math.abs(targetErrDeg) < 20) shieldVetoed = true;
      decisionText = degrau === 2
        ? `Degrau 2 (Multi 5m): corredor ${proposedRel >= 0 ? "+" : ""}${proposedRel}°`
        : `Degrau 3 (Escudo ${shieldLevel}): ${shieldVetoed ? "VETO frontal → desvio" : "rota validada"} (${proposedRel >= 0 ? "+" : ""}${proposedRel}°)`;
    } else {
      // Degrau 4: IA (MLP) propõe, Escudo P90/P99 valida/veta
      const f = (idx) => clamp(sectors[idx].freeM / maxRangeM * 2 - 1, -1, 1);
      const inputs = [
        f(0), f(3), f(6), f(9), f(12),
        clamp(targetErrDeg / 90, -1, 1),
        clamp(sectors[6].maxEff / slopeLimit - 0.5, -1, 1),
        clamp(sectors[6].ldecDen * 2 - 1, -1, 1),
        clamp((socPct - 30) / 50, -1, 1),
        opts.inShadow ? -1 : 1
      ];
      mlpOut = runMLP(inputs);
      proposedRel = clamp(mlpOut.deltaNorm * 75 + targetErrDeg * 0.45, -90, 90);
      speedFactor = clamp(0.75 + mlpOut.speedNorm * 0.35, 0.35, 1.1);

      // Escudo P90/P99 verifica se o setor proposto pela MLP é seguro
      const closest = sectors.reduce((a, b) => Math.abs(b.relDeg - proposedRel) < Math.abs(a.relDeg - proposedRel) ? b : a);
      if (!closest.safe) {
        shieldVetoed = true;
        const safeSectors = sectors.filter((s) => s.safe);
        if (safeSectors.length) {
          const alt = safeSectors.reduce((a, b) => Math.abs(b.relDeg - targetErrDeg) < Math.abs(a.relDeg - targetErrDeg) ? b : a);
          proposedRel = alt.relDeg;
          decisionText = `Degrau 4 (IA+Escudo ${shieldLevel}): MLP vetada (${closest.reason}) → ${alt.relDeg >= 0 ? "+" : ""}${alt.relDeg}°`;
        } else {
          speedFactor = 0.25;
          decisionText = `Degrau 4 (Escudo ${shieldLevel}): redução de velocidade (todos setores com cautela)`;
        }
      } else {
        decisionText = `Degrau 4 (IA MLP + Escudo ${shieldLevel}): trajeto ótimo ${proposedRel >= 0 ? "+" : ""}${Math.round(proposedRel)}°`;
      }
    }

    return {
      sectors,
      proposedRelDeg: proposedRel,
      speedFactor,
      kkt,
      mlpOut,
      shieldVetoed,
      decisionText
    };
  }

  /**
   * Compara Degrau 0 (Sem Tese) vs Degrau 4 (Com Tese) no mesmo trajeto sobre a grade 5m real.
   */
  function simulateRouteComparison(grid, start, goal, roverParams, sunFrac, shieldLevel) {
    const runOne = (degrau) => {
      let x = start.x, y = start.y;
      let heading = wrapDeg(Math.atan2(goal.x - x, goal.y - y) * 180 / Math.PI);
      const capWh = roverParams.batteryWh || 5420;
      let bat = capWh;
      let minSoc = 100;
      let dist = 0, timeH = 0, hazardsHit = 0, vetoes = 0;
      const path = [{ x, y }];
      const slopeLim = roverParams.slopeLimitDeg || 15.0;
      const stepM = 50;
      const vMs = 0.35; // 0.35 m/s típico rover lunar

      for (let it = 0; it < 160; it++) {
        const rem = Math.hypot(goal.x - x, goal.y - y);
        if (rem < 65) break;
        const scan = scanDirectionalShield(grid, { x, y }, heading, goal, roverParams, {
          degrau, coarseMode: "60m", shieldLevel: shieldLevel || "P90", socPct: (bat / capWh) * 100, inShadow: sunFrac < 0.2
        });
        if (scan.shieldVetoed) vetoes++;
        heading = wrapDeg(heading + clamp(scan.proposedRelDeg, -45, 45));
        const rad = heading * Math.PI / 180;
        x += Math.sin(rad) * stepM;
        y += Math.cos(rad) * stepM;
        dist += stepM;
        const dtH = (stepM / (vMs * scan.speedFactor)) / 3600;
        timeH += dtH;

        const cell = sampleGrid(grid, x, y);
        if (cell.slp5 > slopeLim) hazardsHit++;

        // Consumo extra em aclive + consumo base
        const slopePenaltyW = 1 + Math.max(0, cell.slp5 - 5) * 0.04;
        const loadW = (roverParams.powerShadowW || 95) * slopePenaltyW;
        const genW = (roverParams.solarW || 0) * sunFrac * 0.7 + (roverParams.rtgW || 0);
        bat = clamp(bat + (genW - loadW) * dtH, 0, capWh);
        minSoc = Math.min(minSoc, (bat / capWh) * 100);
        path.push({ x, y });
      }
      const reached = Math.hypot(goal.x - x, goal.y - y) < 120;
      return {
        degrau,
        reached,
        socMin: +minSoc.toFixed(1),
        hazardsHit,
        vetoes,
        distanceM: Math.round(dist),
        timeH: +timeH.toFixed(2),
        path
      };
    };

    const base = runOne(0);
    const tese = runOne(4);
    return {
      base,
      tese,
      hazardsAvoided: Math.max(0, base.hazardsHit - tese.hazardsHit)
    };
  }

  global.TeseEngine = {
    DEGRAUS,
    Z_CONF,
    decodePGDA,
    createSyntheticGrid,
    sampleGrid,
    evalCell,
    scanDirectionalShield,
    simulateRouteComparison
  };
})(window);
