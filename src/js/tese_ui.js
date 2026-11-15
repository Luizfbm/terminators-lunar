/**
 * Integração da Tese (Fases 2 e 3) no Navegador de Pouso Lunar:
 * - Carrega assets/tese_bundle/sites_master.json e pgda78/<sitio>.json sob demanda
 * - Camadas extras no Mapa Polar (LDEC > 0, Escudo P50/P90/P99, Auditado PGDA 78 / LROC NAC)
 * - Inspetor Local 10x10 km em Cortina (Antes vs. Depois + Slider Falso Alarme 5-30%)
 * - Tela 3: Modo Caminhar / Explorar PSR, 5 Degraus, Escudo Direcional 3D no solo e Comparador Sem Tese vs Com Tese
 */
(function (global) {
  "use strict";

  const _state = () => (typeof state !== "undefined" ? state : global.state);
  const _rovers = () => (typeof ROVERS !== "undefined" ? ROVERS : global.ROVERS);
  const _map3d = () => (typeof Map3D !== "undefined" ? Map3D : global.Map3D);
  const _surface = () => (typeof Surface !== "undefined" ? Surface : global.Surface);
  const _toast = (msg) => { if (typeof showToast === "function") showToast(msg); else if (global.showToast) global.showToast(msg); };
  const _land = (site) => { if (typeof completeLandingOnSurface === "function") completeLandingOnSurface(site); else if (global.completeLandingOnSurface) global.completeLandingOnSurface(site); };

  const stateTese = {
    master: null,
    pgdaByName: {},
    gridCache: {},
    activePgdaName: null,
    activeGrid: null,
    // Inspetor Cortina (Tela 2)
    inspSite: null,
    inspCurtain: 0.5,
    inspCoarse: "60m",
    inspShield: "P90",
    inspFA: 15,
    // Tela 3: Caminhar / Explorar PSR
    walkMode: false,
    controlMode: "manual", // "manual" (teclado) | "auto" (planejamento)
    degrau: 4,
    shieldLevel: "P90",
    coarseMode: "60m",
    pos: { x: 0, y: 0 }, // metros relativos ao centro do recorte 10x10 km
    target: null,
    trail: [{ x: 0, y: 0 }],
    lastScan: null,
    keys: {},
    walkDistM: 0,
    walkHazardsHit: 0,
    walkVetoes: 0,
    solarPickups: [],
    pickupsCollected: 0,
    lastStepMs: 0
  };

  async function init() {
    try {
      const res = await fetch("assets/tese_bundle/sites_master.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const master = await res.json();
      stateTese.master = master;
      master.pgda78.forEach((p) => { stateTese.pgdaByName[p.sitio] = p; });

      // Enriquece SITES mantendo a referência
      const sitesArr = typeof SITES !== "undefined" ? SITES : global.SITES;
      if (Array.isArray(sitesArr)) {
        const byCode = {};
        master.sites.forEach((s) => { byCode[s.code] = s; });
        sitesArr.forEach((s) => {
          const e = byCode[s.code];
          if (e) {
            s.pgda78_match = e.pgda78_match;
            s.pgda78_dist_km = e.pgda78_dist_km;
            s.sigma_slope_deg = e.sigma_slope_deg;
            s.pass_60m = e.pass_60m;
            s.pass_p50 = e.pass_p50;
            s.pass_p90 = e.pass_p90;
            s.pass_p99 = e.pass_p99;
            s.lroc = e.lroc || null;
            s.mc60 = e.mc60 || null;
            s.mc20 = e.mc20 || null;
            s.grids_avail = e.grids_avail;
          }
        });
      }
      if (typeof recalculateCascade === "function") {
        recalculateCascade();
      }
      if (typeof renderLayers === "function") {
        renderLayers();
      }
    } catch (err) {
      console.warn("TeseUI: não foi possível carregar sites_master.json:", err);
    }
  }

  async function loadPgdaGrid(sitioName) {
    if (!sitioName) return null;
    if (stateTese.gridCache[sitioName]) return stateTese.gridCache[sitioName];
    const res = await fetch(`assets/tese_bundle/pgda78/${encodeURIComponent(sitioName)}.json`);
    if (!res.ok) throw new Error("Falha ao carregar " + sitioName);
    const raw = await res.json();
    const grid = global.TeseEngine.decodePGDA(raw);
    stateTese.gridCache[sitioName] = grid;
    return grid;
  }

  // =========================================================================
  // TELA 2: CAMADAS NO #map-overlay (LDEC, ESCUDO P90/P99, PGDA 78 / LROC)
  // =========================================================================
  function drawMapOverlay(octx, mode, projectLL, screenHits, compact) {
    if (compact || !stateTese.master || !_map3d()) return;
    const layers = _map3d().layers;

    // 1. Camada LDEC (Medição LOLA ~7% real vs ~93% interpolado)
    if (layers.ldec) {
      for (const p of stateTese.master.pgda78) {
        const q = projectLL(p.lat, p.lon);
        if (!q || !q.front) continue;
        const pct = p.terrain_stats ? p.terrain_stats.pct_ldec_pos : 7.0;
        octx.save();
        octx.strokeStyle = "rgba(0, 229, 255, 0.75)";
        octx.lineWidth = 1.5;
        octx.setLineDash([4, 3]);
        octx.beginPath(); octx.arc(q.x, q.y, 18, 0, Math.PI * 2); octx.stroke();
        octx.setLineDash([]);
        octx.fillStyle = "rgba(0, 20, 34, 0.85)";
        octx.fillRect(q.x - 28, q.y + 20, 56, 14);
        octx.fillStyle = "#5fe6ff";
        octx.font = "800 10px 'JetBrains Mono', monospace";
        octx.textAlign = "center";
        octx.fillText(`LDEC ${pct.toFixed(1)}%`, q.x, q.y + 30);
        octx.restore();
      }
    }

    // 2. Camada Escudo Tese (Falsos Positivos: aprovados em 60m que reprovam em 5m P90/P99)
    if (layers.shield && Array.isArray(_state() && _state().evaluatedSites)) {
      for (const s of _state().evaluatedSites) {
        if (s.pass_60m && !s.pass_p90) {
          const q = projectLL(s.lat, s.lon);
          if (!q || !q.front) continue;
          octx.save();
          octx.strokeStyle = "#ff4d6d";
          octx.lineWidth = 2.2;
          octx.beginPath(); octx.arc(q.x, q.y, 12, 0, Math.PI * 2); octx.stroke();
          octx.fillStyle = "#ff4d6d";
          octx.font = "900 10px 'Segoe UI', sans-serif";
          octx.textAlign = "center";
          octx.fillText("FP 60m✖", q.x, q.y - 15);
          octx.restore();
        }
      }
    }

    // 3. Camada Auditado PGDA 78 / LROC NAC / SfS
    if (layers.pgda) {
      for (const p of stateTese.master.pgda78) {
        const q = projectLL(p.lat, p.lon);
        if (!q || !q.front) continue;
        octx.save();
        octx.translate(q.x, q.y);
        octx.rotate(Math.PI / 4);
        octx.fillStyle = "#ffd166";
        octx.fillRect(-5, -5, 10, 10);
        octx.strokeStyle = "#081220";
        octx.lineWidth = 1.5;
        octx.strokeRect(-5, -5, 10, 10);
        octx.restore();

        octx.save();
        octx.font = "800 11px 'JetBrains Mono', monospace";
        octx.lineWidth = 3;
        octx.strokeStyle = "rgba(2, 6, 16, 0.88)";
        const lbl = `◆ ${p.sitio}`;
        octx.strokeText(lbl, q.x + 10, q.y + 4);
        octx.fillStyle = "#ffd166";
        octx.fillText(lbl, q.x + 10, q.y + 4);
        octx.restore();

        screenHits.push({ kind: "pgda78", s: p, x: q.x, y: q.y });
      }
    }
  }

  // =========================================================================
  // INSPETOR LOCAL 10 x 10 km EM CORTINA (ANTES vs. DEPOIS)
  // =========================================================================
  async function openInspector(pgdaNameOrEntry) {
    const entry = typeof pgdaNameOrEntry === "string"
      ? stateTese.pgdaByName[pgdaNameOrEntry]
      : pgdaNameOrEntry;
    if (!entry) return;
    stateTese.inspSite = entry;

    const modal = document.getElementById("tese-inspector-modal");
    if (!modal) return;
    modal.hidden = false;
    document.getElementById("insp-title").textContent = `🔬 Área de Pouso 10×10 km · ${entry.sitio} (Polo Sul Lunar)`;
    const lroc = entry.lroc || {};
    const ts = entry.terrain_stats || {};
    document.getElementById("insp-meta").textContent =
      `Recorte 10×10 km ao redor de ${entry.sitio} (${Math.abs(entry.lat).toFixed(3)}°S, ${entry.lon.toFixed(3)}°E) · LROC NAC: ${lroc.melhor_res_m_px ? lroc.melhor_res_m_px + " m/px (" + lroc.n_cobrindo + " imgs)" : "sem cobertura"} · Tiros LOLA LDEC>0: ${ts.pct_ldec_pos ?? "—"}%`;

    updateInspectorStats();
    const grid = await loadPgdaGrid(entry.sitio);
    stateTese.activeGrid = grid;
    stateTese.activePgdaName = entry.sitio;
    renderInspectorCanvas();
  }

  function closeInspector() {
    const modal = document.getElementById("tese-inspector-modal");
    if (modal) modal.hidden = true;
  }

  function setInspectorCurtain(val) {
    stateTese.inspCurtain = Math.max(0, Math.min(1, parseFloat(val) / 100));
    renderInspectorCanvas();
  }
  function setInspectorCoarse(mode) {
    stateTese.inspCoarse = mode;
    document.querySelectorAll(".insp-coarse-btn").forEach((b) => b.classList.toggle("active", b.dataset.m === mode));
    updateInspectorStats();
    renderInspectorCanvas();
  }
  function setInspectorShield(lvl) {
    stateTese.inspShield = lvl;
    document.querySelectorAll(".insp-shield-btn").forEach((b) => b.classList.toggle("active", b.dataset.s === lvl));
    renderInspectorCanvas();
  }
  function setInspectorFA(val) {
    stateTese.inspFA = parseInt(val, 10);
    document.getElementById("insp-fa-val").textContent = stateTese.inspFA + "%";
    updateInspectorStats();
  }

  function updateInspectorStats() {
    const entry = stateTese.inspSite;
    if (!entry) return;
    const mc = stateTese.inspCoarse === "20m" ? entry.mc20 : entry.mc60;
    const faKey = "FA" + stateTese.inspFA;
    const gradeNV = mc ? mc["curva_grade_" + faKey] : null;
    const teseNV = mc ? mc["curva_tese_" + faKey] : null;
    const ts = entry.terrain_stats || {};
    const slopeLim = getActiveRoverSlopeLimit();

    const el = document.getElementById("insp-metrics");
    if (!el) return;
    el.innerHTML = `
      <div class="insp-kpi"><span>Perigo >${slopeLim}° (Grade ${stateTese.inspCoarse})</span><b>${stateTese.inspCoarse === "20m" ? ts.pct_over_15_20m : ts.pct_over_15_60m}%</b></div>
      <div class="insp-kpi good"><span>Perigo real 5 m (>15°)</span><b>${ts.pct_over_15_real}%</b></div>
      <div class="insp-kpi warn"><span>Não vetado c/ FA ${stateTese.inspFA}% (Grade)</span><b>${gradeNV != null ? gradeNV.toFixed(2) + "%" : "—"}</b></div>
      <div class="insp-kpi good"><span>Não vetado c/ FA ${stateTese.inspFA}% (Tese)</span><b>${teseNV != null ? teseNV.toFixed(2) + "%" : "—"}</b></div>
      <div class="insp-kpi"><span>Erro mediano Grade → Tese</span><b>${mc ? mc.erro_mediano_grade.toFixed(2) + "° → " + mc.erro_mediano_tese.toFixed(2) + "°" : "—"}</b></div>
    `;
  }

  function renderInspectorCanvas() {
    const cv = document.getElementById("insp-canvas");
    const grid = stateTese.activeGrid;
    if (!cv || !grid) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext("2d");
    const n = grid.n;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    const splitX = Math.round(W * stateTese.inspCurtain);
    const slopeLim = getActiveRoverSlopeLimit();
    const zConf = global.TeseEngine.Z_CONF[stateTese.inspShield] ?? 1.282;
    const zSpan = Math.max(1, grid.zMax - grid.zMin);

    for (let py = 0; py < H; py++) {
      const gy = Math.min(n - 1, Math.floor((py / H) * n));
      const gyU = Math.max(0, gy - 1), gyD = Math.min(n - 1, gy + 1);
      for (let px = 0; px < W; px++) {
        const gx = Math.min(n - 1, Math.floor((px / W) * n));
        const gxL = Math.max(0, gx - 1), gxR = Math.min(n - 1, gx + 1);
        const idx = gy * n + gx;

        // Relevo lunar sombreado (hillshade real de grid.surf)
        const nx = -(grid.surf[gy * n + gxR] - grid.surf[gy * n + gxL]) / (2 * grid.cellM);
        const ny = -(grid.surf[gyD * n + gx] - grid.surf[gyU * n + gx]) / (2 * grid.cellM);
        const nl = Math.hypot(nx, ny, 1);
        const hill = Math.max(0.18, Math.min(1.0, 0.45 + ((nx * 0.65 + ny * 0.55 + 0.25) / nl) * 0.72));
        const elevN = (grid.surf[idx] - grid.zMin) / zSpan;
        const base = Math.round(32 + elevN * 68 + hill * 64);
        let r = base, g = base + 3, b = base + 8;

        const coarseSlp = stateTese.inspCoarse === "20m" ? grid.slp20[idx] : grid.slp60[idx];
        const isRight = px >= splitX;

        if (!isRight) {
          // LADO ESQUERDO: Grade Grossa (60m ou 20m)
          if (coarseSlp > slopeLim) {
            r = Math.round(base * 0.45 + 150); g = Math.round(base * 0.35); b = Math.round(base * 0.35);
          }
        } else {
          // LADO DIREITO: Tese (5m + LDEC + Escudo P50/P90/P99)
          const realSlp = grid.slp5[idx];
          const ldecDen = grid.ldecDen[idx];
          const sig = ldecDen >= 0.12 ? Math.max(0.8, grid.slperr[idx] * 0.35) : Math.max(2.0, grid.slperr[idx] * 0.75);
          const shieldSlp = realSlp + 1.0 + zConf * sig;

          if (realSlp > slopeLim && coarseSlp <= slopeLim) {
            // Perigo ESCONDIDO pela grade grossa -> acende em vermelho vivo
            r = 248; g = 68; b = 58;
          } else if (realSlp > slopeLim) {
            r = Math.round(base * 0.4 + 165); g = Math.round(base * 0.28); b = Math.round(base * 0.28);
          } else if (shieldSlp > slopeLim) {
            // Vetado pela margem do Escudo P90/P99 (âmbar sutil)
            r = Math.min(255, base + 58); g = Math.min(255, base + 26); b = Math.max(18, base - 25);
          }
          if (ldecDen >= 0.10) {
            // Tiros reais LOLA (densidade real LDEC > 0) em ciano sutil sem apagar o relevo
            r = Math.round(r * 0.72);
            g = Math.min(255, Math.round(g * 0.85 + 32));
            b = Math.min(255, Math.round(b * 0.85 + 52));
          }
        }

        const p = (py * W + px) * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Alvo central (ponto de pouso no centro do recorte 10×10 km)
    ctx.save();
    ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 10, 0, Math.PI * 2);
    ctx.moveTo(W / 2 - 15, H / 2); ctx.lineTo(W / 2 + 15, H / 2);
    ctx.moveTo(W / 2, H / 2 - 15); ctx.lineTo(W / 2, H / 2 + 15);
    ctx.stroke();
    ctx.fillStyle = "rgba(4, 10, 22, 0.8)";
    ctx.fillRect(W / 2 + 14, H / 2 - 10, 86, 16);
    ctx.fillStyle = "#fde047";
    ctx.font = "700 10px 'Segoe UI', sans-serif";
    ctx.fillText(`Pouso ${grid.sitio}`, W / 2 + 18, H / 2 + 2);
    ctx.restore();

    // Linha divisória da cortina + rótulos
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(splitX, 0); ctx.lineTo(splitX, H); ctx.stroke();

    ctx.fillStyle = "rgba(4, 10, 22, 0.86)";
    ctx.fillRect(8, 8, 152, 22);
    ctx.fillRect(W - 216, 8, 208, 22);
    ctx.font = "800 11px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffb36b";
    ctx.fillText(`ANTES: Grade ${stateTese.inspCoarse}`, 14, 23);
    ctx.fillStyle = "#5dff9b";
    ctx.fillText(`DEPOIS: 5m + LDEC + ${stateTese.inspShield}`, W - 210, 23);

    // Barra de escala (2 km = 20% de 10 km) + legenda no rodapé do mapa
    ctx.fillStyle = "rgba(4, 10, 22, 0.84)";
    ctx.fillRect(8, H - 30, 148, 22);
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, H - 14); ctx.lineTo(14 + W * 0.2, H - 14);
    ctx.moveTo(14, H - 18); ctx.lineTo(14, H - 10);
    ctx.moveTo(14 + W * 0.2, H - 18); ctx.lineTo(14 + W * 0.2, H - 10);
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "700 10px 'Segoe UI', sans-serif";
    ctx.fillText("2 km (10×10 km)", 14 + W * 0.2 + 6, H - 11);

    ctx.fillStyle = "rgba(4, 10, 22, 0.84)";
    ctx.fillRect(W - 216, H - 30, 208, 22);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "700 10px 'Segoe UI', sans-serif";
    ctx.fillText("🔴 >15°  🟡 Escudo  🔵 Tiros LOLA", W - 210, H - 15);
  }

  function landOnInspectorSite() {
    const entry = stateTese.inspSite;
    if (!entry) return;
    closeInspector();
    // Encontra o sítio Wueller correspondente ou cria um site compatível com Tela 3
    let site = null;
    if (Array.isArray(_state() && _state().evaluatedSites)) {
      site = _state().evaluatedSites.find((s) => s.code === entry.nearest_wueller && entry.dist_km <= 15);
    }
    if (!site) {
      site = {
        id: null, code: entry.sitio, regiao: `${entry.sitio} (PGDA 78)`,
        lat: entry.lat, lon: entry.lon,
        slope: entry.terrain_stats ? entry.terrain_stats.slp_median_deg : 8.0,
        psr_area: 120000, eps_barker: 1.2,
        pgda78_match: entry.sitio, lroc: entry.lroc, mc60: entry.mc60, mc20: entry.mc20,
        custom: false, effectiveDays: 10
      };
    }
    stateTese.activePgdaName = entry.sitio;
    if (typeof _land === "function") {
      _land(site);
    }
  }

  // =========================================================================
  // TELA 3: CAMINHAR / EXPLORAR PSR + 5 DEGRAUS + ESCUDO 3D + COMPARADOR
  // =========================================================================
  function getActiveRoverParams() {
    const r = (_rovers() && _state()) ? _rovers()[_state().selectedRoverIdx] : null;
    return {
      mastHeightM: (_state() && _state().mastOverride) || (r && r.mastHeightM) || 2.0,
      batteryWh: (r && r.batteryWh) || 5420,
      solarW: (r && r.solarW) || 450,
      rtgW: (r && r.rtgW) || 0,
      powerShadowW: (r && r.powerShadowW) || 95,
      slopeLimitDeg: (r && r.slopeLimitDeg) || 15.0
    };
  }
  function getActiveRoverSlopeLimit() {
    return getActiveRoverParams().slopeLimitDeg;
  }

  async function onLanded(site) {
    stateTese.pos = { x: 0, y: 0 };
    stateTese.target = null;
    stateTese.trail = [{ x: 0, y: 0 }];
    stateTese.walkDistM = 0;
    stateTese.walkHazardsHit = 0;
    stateTese.walkVetoes = 0;
    stateTese.lastScan = null;

    const pgdaName = (site && site.pgda78_match) || (site && stateTese.pgdaByName[site.code] ? site.code : null);
    if (pgdaName) {
      stateTese.activePgdaName = pgdaName;
      try {
        stateTese.activeGrid = await loadPgdaGrid(pgdaName);
      } catch (e) {
        stateTese.activeGrid = global.TeseEngine.createSyntheticGrid(site);
      }
    } else {
      stateTese.activePgdaName = null;
      stateTese.activeGrid = global.TeseEngine.createSyntheticGrid(site);
    }
    refreshWalkPanel();
    renderMiniMap();
  }

  function lockLandedRoverOrientation() {
    if (typeof Rover3D !== "undefined" && Rover3D && Rover3D.views) {
      const lv = Rover3D.views.get("landed");
      if (lv) {
        lv.speed = 0;
        lv.userYaw = 0;
        lv.baseYaw = Math.PI;
      }
    }
  }

  function generateSolarPickups(grid, cmp, sim) {
    if (!grid || !cmp) return;
    const sunAz = ((sim && sim.sun ? sim.sun.az : 35) * Math.PI) / 180;
    const sdx = Math.sin(sunAz), sdy = Math.cos(sunAz);
    const slopeLim = getActiveRoverSlopeLimit();

    const isLit = (x, y) => {
      const c = global.TeseEngine.sampleGrid(grid, x, y);
      if (c.slp5 > slopeLim) return false;
      const eL = global.TeseEngine.sampleGrid(grid, x - 50, y).surf;
      const eR = global.TeseEngine.sampleGrid(grid, x + 50, y).surf;
      const eD = global.TeseEngine.sampleGrid(grid, x, y - 50).surf;
      const eU = global.TeseEngine.sampleGrid(grid, x, y + 50).surf;
      const nx = -(eR - eL) / 100;
      const ny = -(eU - eD) / 100;
      const dot = (nx * sdx + ny * sdy + 0.18) / Math.hypot(nx, ny, 1);
      return dot > 0.04;
    };

    const candidates = [];
    const mainPath = (stateTese.degrau === 0 && cmp.base ? cmp.base.path : cmp.tese ? cmp.tese.path : []) || [];
    for (let i = 2; i < mainPath.length - 1; i += 3) {
      candidates.push(mainPath[i]);
    }
    const genAux = cmp.generations && cmp.generations[2] ? cmp.generations[2].paths : null;
    if (genAux && genAux[1]) {
      for (let i = 4; i < genAux[1].length - 2; i += 6) candidates.push(genAux[1][i]);
    }

    const out = [];
    for (const pt of candidates) {
      if (out.length >= 16) break;
      if (!isLit(pt.x, pt.y)) continue;
      if (out.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < 160)) continue;
      out.push({ x: pt.x, y: pt.y, wh: 180, collected: false });
    }
    stateTese.solarPickups = out;
    stateTese.pickupsCollected = 0;
  }

  function ensureRoutePlanned(openSimModal) {
    if (!stateTese.target) {
      stateTese.target = { x: stateTese.pos.x + 1200, y: stateTese.pos.y + 1200 };
    }
    const sim = _surface() && _surface().sim;
    if (stateTese.activeGrid && sim) {
      const rParams = getActiveRoverParams();
      const sFrac = sim.sunFrac || 0.5;
      stateTese.plannedComparison = global.TeseEngine.simulateRouteComparison(
        stateTese.activeGrid, stateTese.pos, stateTese.target,
        rParams, sFrac, stateTese.shieldLevel, "60m"
      );
      stateTese.autoWpIdx = 1;
      generateSolarPickups(stateTese.activeGrid, stateTese.plannedComparison, sim);
      if (openSimModal && global.RouteSimV18) {
        global.RouteSimV18.open(
          stateTese.activeGrid, stateTese.pos, stateTese.target,
          stateTese.plannedComparison, sim.sun ? sim.sun.az : 35,
          getActiveRoverSlopeLimit(), stateTese.shieldLevel,
          rParams, sFrac
        );
      }
    }
  }

  function acceptPlannedRoute(which) {
    const deg = which === "base" ? 0 : 4;
    setDegrau(deg);
    stateTese.autoWpIdx = 1;
    const sim = _surface() && _surface().sim;
    if (stateTese.activeGrid && stateTese.plannedComparison && sim) {
      generateSolarPickups(stateTese.activeGrid, stateTese.plannedComparison, sim);
    }
    toggleTacticalZoom(true);
    updateScan();
    renderMiniMap();
    _toast(which === "base"
      ? "⚠️ Plano Sem Tese (Degrau 0) aceito! Rota e raios solares ativos."
      : `🛡️ Plano Com Tese (Degrau 4 · Escudo ${stateTese.shieldLevel}) aceito! Siga a rota ou colete ⚡ nas partes claras.`);
  }

  function toggleWalkMode() {
    stateTese.walkMode = !stateTese.walkMode;
    document.body.classList.toggle("tese-walk-active", stateTese.walkMode);
    const panel = document.getElementById("tese-walk-panel");
    const btn = document.getElementById("btn-walk-mode");
    const banner = document.getElementById("mission-banner");
    if (panel) panel.hidden = !stateTese.walkMode;
    if (btn) btn.classList.toggle("active", stateTese.walkMode);
    if (banner && stateTese.walkMode) banner.hidden = true;
    lockLandedRoverOrientation();
    if (stateTese.walkMode) {
      if (!stateTese.plannedComparison) ensureRoutePlanned(false);
      updateScan();
      renderMiniMap();
    } else {
      stateTese.keys = {};
      const holder = document.getElementById("landed-rover-holder");
      if (holder) {
        holder.style.left = "";
        holder.style.top = "";
        holder.style.bottom = "";
        holder.style.transform = "";
        holder.style.opacity = "";
      }
    }
  }

  function setControlMode(mode) {
    stateTese.controlMode = mode === "auto" ? "auto" : "manual";
    lockLandedRoverOrientation();
    const bm = document.getElementById("btn-ctrl-manual");
    const ba = document.getElementById("btn-ctrl-auto");
    if (bm) bm.classList.toggle("active", stateTese.controlMode === "manual");
    if (ba) ba.classList.toggle("active", stateTese.controlMode === "auto");

    if (stateTese.controlMode === "auto") {
      ensureRoutePlanned(true);
      toggleTacticalZoom(true);
    } else {
      if (!stateTese.plannedComparison) ensureRoutePlanned(false);
    }
    updateScan();
    renderMiniMap();
  }

  function pointToSun() {
    const sim = _surface() && _surface().sim;
    if (!sim || !sim.sun) return;
    sim.heading = ((sim.sun.az % 360) + 360) % 360;
    if (typeof Rover3D !== "undefined" && Rover3D) {
      const v = Rover3D.views.get("landed");
      if (v) { v.speed = 0; v.userYaw = 0; v.baseYaw = Math.PI; }
    }
    updateScan();
    renderMiniMap();
    _toast(`☀️ Frente e painel solar apontados para o Sol (${Math.round(sim.heading)}°)`);
  }

  function setDegrau(d) {
    stateTese.degrau = parseInt(d, 10);
    document.querySelectorAll(".degrau-btn").forEach((b) => b.classList.toggle("active", parseInt(b.dataset.d, 10) === stateTese.degrau));
    updateScan();
    renderMiniMap();
  }

  function setShieldLevel(lvl) {
    stateTese.shieldLevel = lvl;
    document.querySelectorAll(".tese-shield-btn").forEach((b) => b.classList.toggle("active", b.dataset.s === lvl));
    updateScan();
    renderMiniMap();
  }

  function updateScan() {
    const grid = stateTese.activeGrid;
    const sim = _surface() && _surface().sim;
    if (!grid || !sim) return;
    const roverParams = getActiveRoverParams();
    stateTese.lastScan = global.TeseEngine.scanDirectionalShield(
      grid, stateTese.pos, sim.heading || 0, stateTese.target, roverParams,
      {
        degrau: stateTese.degrau,
        coarseMode: stateTese.coarseMode,
        shieldLevel: stateTese.shieldLevel,
        socPct: (sim.bat / sim.capWh) * 100,
        inShadow: sim.sunFrac < 0.2
      }
    );
    refreshWalkPanel();
  }

  function refreshWalkPanel() {
    const info = document.getElementById("tese-walk-telemetry");
    const grid = stateTese.activeGrid;
    const sim = _surface() && _surface().sim;
    if (!info || !grid || !sim) return;
    const cell = global.TeseEngine.sampleGrid(grid, stateTese.pos.x, stateTese.pos.y);
    const socPct = Math.round((sim.bat / sim.capWh) * 100);
    const decTxt = stateTese.lastScan ? stateTese.lastScan.decisionText : "Pronto para caminhar (clique no mini-mapa ou use WASD/setas)";
    const totalPk = (stateTese.solarPickups || []).length;
    info.innerHTML = `
      <div><b>Terreno:</b> ${grid.sitio}${grid.synthetic ? " (sintético)" : " (PGDA78 5m)"} · <b>LDEC:</b> ${cell.ldecAny ? "DISPARO REAL" : "interpolado"}</div>
      <div><b>Declive 5m / 60m:</b> ${cell.slp5.toFixed(1)}° / ${cell.slp60.toFixed(1)}° · <b>SOC:</b> ${socPct}% · <b>Dist:</b> ${Math.round(stateTese.walkDistM)} m · <b>⚡:</b> ${stateTese.pickupsCollected}/${totalPk}</div>
      <div class="tese-dec">${decTxt}</div>
    `;
  }

  function stepRover(dtReal) {
    if (!stateTese.walkMode || !stateTese.activeGrid || !_surface() || !_surface().sim) return;
    lockLandedRoverOrientation();
    const sim = _surface().sim;
    const grid = stateTese.activeGrid;
    const roverParams = getActiveRoverParams();
    let moveSpeed = 0;
    let turnDeg = 0;

    if (stateTese.keys["ArrowLeft"] || stateTese.keys["KeyA"]) turnDeg = -55 * dtReal;
    if (stateTese.keys["ArrowRight"] || stateTese.keys["KeyD"]) turnDeg = 55 * dtReal;
    if (stateTese.keys["ArrowUp"] || stateTese.keys["KeyW"]) moveSpeed = 95 * dtReal;
    if (stateTese.keys["ArrowDown"] || stateTese.keys["KeyS"]) moveSpeed = -60 * dtReal;

    if (moveSpeed !== 0 || turnDeg !== 0) {
      if (stateTese.controlMode === "auto") setControlMode("manual");
    }

    // Piloto automático segue exatamente os waypoints da rota planejada (A* Tese / Base)
    if (stateTese.controlMode === "auto" && stateTese.target && moveSpeed === 0 && turnDeg === 0) {
      const rem = Math.hypot(stateTese.target.x - stateTese.pos.x, stateTese.target.y - stateTese.pos.y);
      if (rem < 60) {
        stateTese.target = null;
        setControlMode("manual");
        if (typeof _toast === "function") _toast("🎯 Destino alcançado na borda da PSR!");
      } else {
        updateScan();
        const cmp = stateTese.plannedComparison;
        const activePath = cmp
          ? (stateTese.degrau === 0 && cmp.base ? cmp.base.path : cmp.tese ? cmp.tese.path : null)
          : null;

        let prop = stateTese.lastScan ? stateTese.lastScan.proposedRelDeg : 0;
        if (activePath && activePath.length > 1) {
          let wpIdx = stateTese.autoWpIdx || 1;
          while (wpIdx < activePath.length - 1 &&
                 Math.hypot(activePath[wpIdx].x - stateTese.pos.x, activePath[wpIdx].y - stateTese.pos.y) < 65) {
            wpIdx++;
          }
          stateTese.autoWpIdx = wpIdx;
          const wp = activePath[Math.min(wpIdx, activePath.length - 1)];
          const wpBrg = ((Math.atan2(wp.x - stateTese.pos.x, wp.y - stateTese.pos.y) * 180 / Math.PI) % 360 + 360) % 360;
          let diff = ((wpBrg - (sim.heading || 0)) % 360 + 360) % 360;
          if (diff > 180) diff -= 360;
          prop = diff;
        }
        const sf = stateTese.lastScan ? stateTese.lastScan.speedFactor : 1.0;
        turnDeg = Math.max(-95 * dtReal, Math.min(95 * dtReal, prop * 2.6 * dtReal));
        moveSpeed = 85 * sf * dtReal;
        if (stateTese.lastScan && stateTese.lastScan.shieldVetoed) stateTese.walkVetoes++;
      }
    }

    if (turnDeg !== 0) {
      sim.heading = ((sim.heading + turnDeg) % 360 + 360) % 360;
      updateScan();
    }
    const cellNow = global.TeseEngine.sampleGrid(grid, stateTese.pos.x, stateTese.pos.y);
    if (moveSpeed !== 0) {
      const rad = sim.heading * Math.PI / 180;
      const nx = Math.max(-4800, Math.min(4800, stateTese.pos.x + Math.sin(rad) * moveSpeed));
      const ny = Math.max(-4800, Math.min(4800, stateTese.pos.y + Math.cos(rad) * moveSpeed));
      const stepD = Math.hypot(nx - stateTese.pos.x, ny - stateTese.pos.y);
      stateTese.pos.x = nx;
      stateTese.pos.y = ny;
      stateTese.walkDistM += stepD;

      const lastT = stateTese.trail[stateTese.trail.length - 1];
      if (!lastT || Math.hypot(nx - lastT.x, ny - lastT.y) > 40) {
        stateTese.trail.push({ x: nx, y: ny });
      }
      const cell = global.TeseEngine.sampleGrid(grid, nx, ny);
      if (cell.slp5 > roverParams.slopeLimitDeg) stateTese.walkHazardsHit++;

      // Consumo energético proporcional ao aclive
      const dtH = stepD / (0.35 * 3600);
      const slopePen = 1 + Math.max(0, cell.slp5 - 5) * 0.04;
      sim.bat = Math.max(0, sim.bat - roverParams.powerShadowW * slopePen * dtH * 0.25);

      // Coleta de raios solares amarelos nas partes iluminadas da rota
      if (stateTese.solarPickups && stateTese.solarPickups.length) {
        for (const pk of stateTese.solarPickups) {
          if (!pk.collected && Math.hypot(nx - pk.x, ny - pk.y) < 55) {
            pk.collected = true;
            stateTese.pickupsCollected++;
            sim.bat = Math.min(sim.capWh, sim.bat + pk.wh);
            _toast(`⚡ +${pk.wh} Wh coletado na zona iluminada! (${stateTese.pickupsCollected}/${stateTese.solarPickups.length})`);
          }
        }
      }

      updateScan();
      renderMiniMap();
    }

    // Alinha o rover 3D exatamente sobre a origem (0,0,0) da trilha e do Escudo no terreno 3D
    const holder = document.getElementById("landed-rover-holder");
    if (holder) {
      const z = global.Surface3DTerrain ? global.Surface3DTerrain.camZoom : 0;
      const orig = global.Surface3DTerrain && global.Surface3DTerrain.getOriginScreenPos
        ? global.Surface3DTerrain.getOriginScreenPos()
        : null;
      const sc = 1 - z * 0.72;
      const tilt = moveSpeed !== 0 ? Math.max(-10, Math.min(10, (cellNow.slp5 - 6) * 0.45)) * (1 - z) : 0;
      const bob = moveSpeed !== 0 ? Math.sin(stateTese.walkDistM * 0.35) * 2.5 * (1 - z) : 0;
      if (orig && orig.valid) {
        holder.style.left = `${orig.x.toFixed(1)}px`;
        holder.style.top = `${(orig.y - 210 * sc + bob).toFixed(1)}px`;
        holder.style.bottom = "auto";
      } else {
        holder.style.left = "50%";
      }
      holder.style.transform = `translateX(-50%) scale(${sc.toFixed(2)}) rotate(${tilt.toFixed(1)}deg)`;
      holder.style.opacity = String(Math.max(0.35, 1 - z * 0.55));
    }
  }

  function renderMiniMap() {
    const cv = document.getElementById("tese-minimap");
    const grid = stateTese.activeGrid;
    const sim = _surface() && _surface().sim;
    if (!cv || !grid || !sim) return;
    const W = cv.width, H = cv.height;
    const ctx = cv.getContext("2d");
    const n = grid.n;
    const img = ctx.createImageData(W, H);
    const data = img.data;
    const slopeLim = getActiveRoverSlopeLimit();
    const zSpan = Math.max(1, grid.zMax - grid.zMin);

    for (let py = 0; py < H; py++) {
      const gy = Math.min(n - 1, Math.floor((py / H) * n));
      for (let px = 0; px < W; px++) {
        const gx = Math.min(n - 1, Math.floor((px / W) * n));
        const idx = gy * n + gx;
        const elevN = (grid.surf[idx] - grid.zMin) / zSpan;
        let r = Math.round(30 + elevN * 110), g = r + 5, b = r + 14;
        if (grid.slp5[idx] > slopeLim) { r = 215; g = 55; b = 50; }
        else if (grid.ldecAny[idx]) { g = Math.min(255, g + 35); b = Math.min(255, b + 55); }
        const p = (py * W + px) * 4;
        data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const toPx = (x, y) => ({ px: ((x + 5000) / 10000) * W, py: ((5000 - y) / 10000) * H });

    // Rotas planejadas (Degrau 0 âmbar vs Degrau 4 verde) estilo v18
    const drawPath = (path, color, dash) => {
      if (!path || path.length < 2) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      path.forEach((pt, i) => {
        const q = toPx(pt.x, pt.y);
        if (i === 0) ctx.moveTo(q.px, q.py); else ctx.lineTo(q.px, q.py);
      });
      ctx.stroke();
      ctx.restore();
    };
    if (stateTese.plannedComparison) {
      const genAux = stateTese.plannedComparison.generations && stateTese.plannedComparison.generations[2]
        ? stateTese.plannedComparison.generations[2].paths : null;
      if (genAux) {
        for (let a = 0; a < 3; a++) {
          if (genAux[a * 2 + 1]) drawPath(genAux[a * 2 + 1], "rgba(56,189,248,0.45)", [2, 2]);
        }
      }
      drawPath(stateTese.plannedComparison.base.path, "#f59e0b", [3, 3]);
      drawPath(stateTese.plannedComparison.tese.path, "#10b981", null);
    }

    // Raios solares amarelos no mini-mapa
    if (stateTese.solarPickups && stateTese.solarPickups.length) {
      ctx.fillStyle = "#facc15";
      for (const pk of stateTese.solarPickups) {
        if (pk.collected) continue;
        const pq = toPx(pk.x, pk.y);
        ctx.beginPath();
        ctx.arc(pq.px, pq.py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Trilha percorrida
    if (stateTese.trail.length > 1) {
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      stateTese.trail.forEach((pt, i) => {
        const q = toPx(pt.x, pt.y);
        if (i === 0) ctx.moveTo(q.px, q.py); else ctx.lineTo(q.px, q.py);
      });
      ctx.stroke();
    }

    // Setores do Escudo no mini-mapa (azDeg: 0° = Norte = -py, 90° = Leste = +px)
    const rp = toPx(stateTese.pos.x, stateTese.pos.y);
    if (stateTese.lastScan) {
      for (const sc of stateTese.lastScan.sectors) {
        const rad = sc.azDeg * Math.PI / 180;
        const lenPx = (sc.freeM / 10000) * W * 2.2;
        ctx.strokeStyle = sc.safe ? "rgba(0,255,136,0.45)" : "rgba(255,77,109,0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rp.px, rp.py);
        ctx.lineTo(rp.px + Math.sin(rad) * lenPx, rp.py - Math.cos(rad) * lenPx);
        ctx.stroke();
      }
    }

    // Destino
    if (stateTese.target) {
      const tp = toPx(stateTese.target.x, stateTese.target.y);
      ctx.strokeStyle = "#ffd147"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tp.px, tp.py, 5, 0, Math.PI * 2); ctx.stroke();
    }

    // Rover
    ctx.fillStyle = "#00ff88";
    ctx.beginPath(); ctx.arc(rp.px, rp.py, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#04101a"; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // Desenha o Escudo Direcional 3D projetado no solo (fallback 2D só se Surface3DTerrain não estiver ativo)
  function drawSurfaceShield(ctx, w, h, sim) {
    if (global.Surface3DTerrain && stateTese.activeGrid) return;
    if (!stateTese.walkMode || !stateTese.lastScan) return;
    const cx = w / 2, baseY = h - 145;
    const sectors = stateTese.lastScan.sectors;

    ctx.save();
    for (const sc of sectors) {
      const a0 = (sc.relDeg - 7.5) * Math.PI / 180;
      const a1 = (sc.relDeg + 7.5) * Math.PI / 180;
      const rFar = Math.min(260, 75 + (sc.freeM / 500) * 185);
      const rNear = 52;

      const pt = (ang, rad) => ({
        x: cx + Math.sin(ang) * rad * 1.45,
        y: baseY - Math.cos(ang) * rad * 0.38
      });
      const p0 = pt(a0, rNear), p1 = pt(a0, rFar), p2 = pt(a1, rFar), p3 = pt(a1, rNear);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
      ctx.closePath();

      ctx.fillStyle = sc.safe ? "rgba(0, 255, 136, 0.16)" : "rgba(255, 65, 85, 0.34)";
      ctx.fill();
      ctx.strokeStyle = sc.safe ? "rgba(0, 255, 136, 0.65)" : "rgba(255, 90, 110, 0.85)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Seta da direção proposta pelo Degrau ativo
    const propRad = stateTese.lastScan.proposedRelDeg * Math.PI / 180;
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 22);
    ctx.lineTo(cx + Math.sin(propRad) * 180, baseY - Math.cos(propRad) * 72);
    ctx.stroke();
    ctx.restore();
  }

  // Comparador Sem Tese (Degrau 0) vs Com Tese (Degrau 4) no mesmo trajeto
  function openTeseCompare() {
    const grid = stateTese.activeGrid;
    const sim = _surface() && _surface().sim;
    if (!grid || !sim) return;
    const start = { x: stateTese.pos.x, y: stateTese.pos.y };
    const goal = stateTese.target || { x: start.x + 1400, y: start.y + 1100 };
    const cmp = global.TeseEngine.simulateRouteComparison(
      grid, start, goal, getActiveRoverParams(), sim.sunFrac || 0.5, stateTese.shieldLevel
    );

    const panel = document.getElementById("compare-panel");
    const cols = document.getElementById("cmp-cols");
    const title = document.getElementById("cmp-title");
    const days = document.getElementById("cmp-days");
    if (!panel || !cols) return;

    title.textContent = `⚖️ Sem Tese (Degrau 0) × Com Tese (Degrau 4 · ${stateTese.shieldLevel})`;
    days.textContent = `${grid.sitio} · trajeto ${Math.round(Math.hypot(goal.x - start.x, goal.y - start.y))} m`;

    const pgda = stateTese.activePgdaName ? stateTese.pgdaByName[stateTese.activePgdaName] : null;
    const mcHtml = pgda && pgda.mc60 ? `
      <div class="cmp-mc-box">
        <b>Dados reais PGDA 78 (${pgda.sitio}):</b>
        Perigo não vetado Grade 60m = <b>${pgda.mc60.grade_perigo_nao_vetado.toFixed(2)}%</b> →
        Tese P90 = <b style="color:#5dff9b">${pgda.mc60.teseP90_perigo_nao_vetado.toFixed(2)}%</b> ·
        Erro mediano ${pgda.mc60.erro_mediano_grade.toFixed(2)}° → ${pgda.mc60.erro_mediano_tese.toFixed(2)}°
      </div>` : "";

    const benchHtml = `
      <div class="cmp-mc-box" style="margin-top:6px;background:rgba(16,185,129,0.1);border-color:rgba(16,185,129,0.38);">
        <b>📊 Bateria Multirresolução LOLA (16 faixas reais · POP=100 · 1.600 travessias/célula):</b><br/>
        • <b>N0 (Base):</b> Chegada <b style="color:#5dff9b">78,06%</b> vs. 67,31% (Grade 60m) · <b>+10,75 pp</b> (McNemar p=3,3×10⁻³¹, OR=5,99)<br/>
        • <b>N1 (Terreno 20,1% &gt;15°):</b> <b style="color:#5dff9b">48,62%</b> vs. 35,44% · <b>+13,19 pp</b> (Wilcoxon p=0,046, OR=11,82, tomb. -2,44 pp)<br/>
        • <b>N2 (Incerteza + Câmera):</b> <b style="color:#5dff9b">47,75%</b> vs. 35,44% · <b>+12,31 pp</b> (tomb. -2,81 pp, p=0,012)<br/>
        • <b>N3 (Severo, POP=30):</b> <b style="color:#5dff9b">40,0%</b> vs. 30,8% (+30% rel., p=0,043) · Rover A sem escudo cai para 21,7% / 45,4% tomb.<br/>
        • <b>Cobertura LDEC 5m:</b> apenas <b>7,29%</b> com disparo real LOLA (87,5°S–90°S) → fundamenta <i>No False Relief</i> + Escudo P90/P99
      </div>`;

    cols.innerHTML = `
      <div class="cmp-col">
        <h3>❌ Sem Tese (Degrau 0 · ${stateTese.coarseMode})</h3>
        <div class="cmp-stat"><span>SOC mínimo:</span><b>${cmp.base.socMin}%</b></div>
        <div class="cmp-stat"><span>Perigos >${getActiveRoverSlopeLimit()}° atingidos:</span><b style="color:#ff6b81">${cmp.base.hazardsHit}</b></div>
        <div class="cmp-stat"><span>Distância percorrida:</span><b>${cmp.base.distanceM} m</b></div>
        <div class="cmp-stat"><span>Tempo de travessia:</span><b>${cmp.base.timeH} h</b></div>
      </div>
      <div class="cmp-col">
        <h3>🛡️ Com Tese (Degrau 4 · IA + Escudo ${stateTese.shieldLevel})</h3>
        <div class="cmp-stat"><span>SOC mínimo:</span><b style="color:#5dff9b">${cmp.tese.socMin}%</b></div>
        <div class="cmp-stat"><span>Perigos evitados:</span><b style="color:#5dff9b">${cmp.hazardsAvoided} (restantes: ${cmp.tese.hazardsHit})</b></div>
        <div class="cmp-stat"><span>Vetos do Escudo ${stateTese.shieldLevel}:</span><b>${cmp.tese.vetoes}</b></div>
        <div class="cmp-stat"><span>Distância / Tempo:</span><b>${cmp.tese.distanceM} m · ${cmp.tese.timeH} h</b></div>
      </div>
      ${mcHtml}
      ${benchHtml}
    `;
    panel.hidden = false;
  }

  // Eventos de teclado e clique no mini-mapa
  document.addEventListener("keydown", (e) => {
    if (!stateTese.walkMode) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
      if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
      e.preventDefault();
      stateTese.keys[e.code] = true;
    } else if (e.code === "KeyF") {
      e.preventDefault();
      pointToSun();
    }
  });
  document.addEventListener("keyup", (e) => {
    stateTese.keys[e.code] = false;
  });
  window.addEventListener("blur", () => {
    stateTese.keys = {};
  });

  function toggleTacticalZoom(force) {
    if (!global.Surface3DTerrain) return;
    const next = typeof force === "boolean" ? force : !global.Surface3DTerrain.tacticalMode;
    global.Surface3DTerrain.setTacticalZoom(next);
    const btn = document.getElementById("btn-tactical-zoom");
    if (btn) btn.textContent = next ? "🎥 Voltar p/ Rover" : "🛰️ Visão IA (v18)";
  }

  function onMiniMapClick(e) {
    const cv = document.getElementById("tese-minimap");
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    stateTese.target = { x: u * 10000 - 5000, y: 5000 - v * 10000 };
    ensureRoutePlanned(true);
    updateScan();
    renderMiniMap();
  }

  function holdKey(code, down) {
    if (!stateTese.walkMode && down) toggleWalkMode();
    stateTese.keys[code] = !!down;
  }

  function nudgeRover(dx, dy) {
    if (!stateTese.walkMode) toggleWalkMode();
    stateTese.keys[dx < 0 ? "ArrowLeft" : dx > 0 ? "ArrowRight" : dy > 0 ? "ArrowUp" : "ArrowDown"] = true;
    stepRover(0.35);
    stateTese.keys = {};
  }

  global.TeseUI = {
    state: stateTese,
    init,
    drawMapOverlay,
    openInspector,
    closeInspector,
    setInspectorCurtain,
    setInspectorCoarse,
    setInspectorShield,
    setInspectorFA,
    landOnInspectorSite,
    onLanded,
    toggleWalkMode,
    setControlMode,
    pointToSun,
    setDegrau,
    setShieldLevel,
    stepRover,
    drawSurfaceShield,
    openTeseCompare,
    onMiniMapClick,
    toggleTacticalZoom,
    acceptPlannedRoute,
    holdKey,
    nudgeRover
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
