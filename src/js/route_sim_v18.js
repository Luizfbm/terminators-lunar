/**
 * Simulação Lado a Lado estilo v18.html (Sem Tese × Com Tese)
 * - Zoom-out diretamente sobre o terreno sob o rover
 * - Seletor de grade LOLA (60 m / 20 m / 5 m)
 * - Enxame de Neuroevolução em 5 gerações convergindo para a rota ótima do Escudo P90/P99
 */
(function (global) {
  "use strict";

  let simState = null;
  let rafId = null;

  function buildBgCanvas(grid, W, H, x0, y1, actualSpan, sunAzDeg, slopeLimitDeg, mode, coarseMode) {
    const bg = document.createElement("canvas");
    bg.width = W; bg.height = H;
    const bctx = bg.getContext("2d");
    const img = bctx.createImageData(W, H);
    const d = img.data;

    const sunRad = (sunAzDeg || 35) * Math.PI / 180;
    const sdx = Math.sin(sunRad), sdy = Math.cos(sunRad);
    const n = grid.n, cellM = grid.cellM, half = (n * cellM) / 2;
    const zSpan = Math.max(1, grid.zMax - grid.zMin);

    // Pixelização visual da grade LOLA no painel esquerdo (60m = blocos maiores, 20m = médios, 5m = fino)
    const blockPx = mode === "base"
      ? (coarseMode === "60m" ? 6 : coarseMode === "20m" ? 3 : 1)
      : 1;

    const elevAt = (wx, wy) => {
      const gx = Math.max(0, Math.min(n - 1, Math.floor((wx + half) / cellM)));
      const gy = Math.max(0, Math.min(n - 1, Math.floor((half - wy) / cellM)));
      return grid.surf[gy * n + gx];
    };

    for (let py = 0; py < H; py++) {
      const qpy = blockPx > 1 ? Math.floor(py / blockPx) * blockPx : py;
      const wy = y1 - (qpy / H) * actualSpan;
      const gy = Math.max(0, Math.min(n - 1, Math.floor((half - wy) / cellM)));
      for (let px = 0; px < W; px++) {
        const qpx = blockPx > 1 ? Math.floor(px / blockPx) * blockPx : px;
        const wx = x0 + (qpx / W) * actualSpan;
        const gx = Math.max(0, Math.min(n - 1, Math.floor((wx + half) / cellM)));
        const idx = gy * n + gx;

        const z = grid.surf[idx];
        const nx = -(elevAt(wx + cellM, wy) - elevAt(wx - cellM, wy)) / (2 * cellM);
        const ny = -(elevAt(wx, wy + cellM) - elevAt(wx, wy - cellM)) / (2 * cellM);
        const nl = Math.hypot(nx, ny, 1);
        const hill = Math.max(0.15, Math.min(1.0, 0.45 + ((nx * sdx + ny * sdy + 0.25) / nl) * 0.65));
        const alt = (z - grid.zMin) / zSpan;

        let r = (40 + alt * 50 + hill * 44);
        let g = (48 + alt * 52 + hill * 44);
        let b = (62 + alt * 56 + hill * 44);

        const slpShown = mode === "base"
          ? (coarseMode === "5m" ? grid.slp5[idx] : coarseMode === "20m" ? grid.slp20[idx] : grid.slp60[idx])
          : grid.slp5[idx];

        if (slpShown > (slopeLimitDeg || 15)) {
          r = r * 0.44 + 190 * 0.36;
          g = g * 0.30;
          b = b * 0.32;
        } else if (mode === "tese" && grid.ldecAny[idx]) {
          g = Math.min(255, g + 16);
          b = Math.min(255, b + 28);
        }

        const p = (py * W + px) * 4;
        d[p] = Math.min(255, r);
        d[p + 1] = Math.min(255, g);
        d[p + 2] = Math.min(255, b);
        d[p + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    return bg;
  }

  function prepareCanvases() {
    if (!simState) return;
    const cvB = document.getElementById("v18-canvas-base");
    const cvT = document.getElementById("v18-canvas-tese");
    if (!cvB || !cvT) return;

    const { grid, start, goal, cmp, sunAzDeg, slopeLimitDeg, coarseMode } = simState;
    const pad = 600;
    let minX = Math.min(start.x, goal.x) - pad;
    let maxX = Math.max(start.x, goal.x) + pad;
    let minY = Math.min(start.y, goal.y) - pad;
    let maxY = Math.max(start.y, goal.y) + pad;
    for (const pt of (cmp.base.path || []).concat(cmp.tese.path || [])) {
      minX = Math.min(minX, pt.x - 320); maxX = Math.max(maxX, pt.x + 320);
      minY = Math.min(minY, pt.y - 320); maxY = Math.max(maxY, pt.y + 320);
    }
    const span = Math.max(1300, maxX - minX, maxY - minY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const actualSpan = Math.min(10000, span);
    const x0 = Math.max(-5000, Math.min(5000 - actualSpan, cx - actualSpan / 2));
    const y1 = Math.min(5000, Math.max(-5000 + actualSpan, cy + actualSpan / 2));

    simState.x0 = x0;
    simState.y1 = y1;
    simState.actualSpan = actualSpan;
    simState.bgBase = buildBgCanvas(grid, cvB.width, cvB.height, x0, y1, actualSpan, sunAzDeg, slopeLimitDeg, "base", coarseMode);
    simState.bgTese = buildBgCanvas(grid, cvT.width, cvT.height, x0, y1, actualSpan, sunAzDeg, slopeLimitDeg, "tese", coarseMode);

    const lblG = document.getElementById("v18-lbl-grid");
    const lblS = document.getElementById("v18-lbl-shield");
    if (lblG) lblG.textContent = coarseMode === "60m" ? "60 m" : coarseMode === "20m" ? "20 m" : "5 m";
    if (lblS) lblS.textContent = simState.shieldLevel || "P90";
  }

  function open(grid, start, goal, cmp, sunAzDeg, slopeLimitDeg, shieldLevel, roverParams, sunFrac) {
    const modal = document.getElementById("v18-sim-modal");
    const cvB = document.getElementById("v18-canvas-base");
    const cvT = document.getElementById("v18-canvas-tese");
    if (!modal || !cvB || !cvT || !grid || !cmp) return;

    simState = {
      grid,
      start: { ...start },
      goal: { ...goal },
      cmp,
      sunAzDeg: sunAzDeg || 35,
      slopeLimitDeg: slopeLimitDeg || 15,
      shieldLevel: shieldLevel || "P90",
      roverParams: roverParams || { slopeLimitDeg: slopeLimitDeg || 15, batteryWh: 5420, powerShadowW: 95, solarW: 260 },
      sunFrac: typeof sunFrac === "number" ? sunFrac : 0.5,
      coarseMode: (cmp && cmp.coarseMode) || "60m",
      progress: 0,
      playing: true,
      speed: 1,
      lastTs: 0
    };

    document.querySelectorAll(".v18-grid-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.g === simState.coarseMode);
    });
    document.querySelectorAll(".v18-spd-btn").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.s) === 1);
    });

    prepareCanvases();
    modal.hidden = false;
    const playBtn = document.getElementById("v18-play-btn");
    if (playBtn) playBtn.textContent = "⏸";

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function drawRoverMarker(ctx, p, headingDeg, color, label, soc, shieldArc) {
    if (shieldArc) {
      const r = 20;
      const rad = ((headingDeg || 0) - 90) * Math.PI / 180;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, r, rad - 0.65, rad + 0.65);
      ctx.closePath();
      ctx.fillStyle = "rgba(16, 185, 129, 0.22)";
      ctx.fill();
      ctx.strokeStyle = "rgba(52, 211, 153, 0.85)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(((headingDeg || 0)) * Math.PI / 180);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const tag = `${label} · ${Math.round(soc)}%`;
    ctx.font = "700 10px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(tag).width + 10;
    const bx = Math.max(4, Math.min(ctx.canvas.width - tw - 4, p.x - tw / 2));
    const by = Math.max(4, p.y - 24);
    ctx.fillStyle = "rgba(8, 13, 25, 0.88)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, tw, 15);
    ctx.strokeRect(bx, by, tw, 15);
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(tag, bx + 5, by + 11);
  }

  function drawPane(ctx, bgCanvas, hist, opts) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Zoom-out suave nos primeiros 25% da animação (do rover para o mapa LOLA completo)
    const zProg = Math.min(1, opts.progress / 0.26);
    const ease = 1 - Math.pow(1 - zProg, 3);
    const zoom = 2.4 - 1.4 * ease; // 2.4x -> 1.0x

    const startPx = opts.toPx(opts.start);
    ctx.save();
    if (zoom > 1.001) {
      const focusX = startPx.x + (W / 2 - startPx.x) * ease;
      const focusY = startPx.y + (H / 2 - startPx.y) * ease;
      ctx.translate(W / 2, H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-focusX, -focusY);
    }

    ctx.drawImage(bgCanvas, 0, 0);

    // Grade tática sutil
    ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
    ctx.lineWidth = 1;
    for (let x = 55; x < W; x += 55) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 55; y < H; y += 55) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Linha direta de referência
    const sPx = opts.toPx(opts.start), gPx = opts.toPx(opts.goal);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sPx.x, sPx.y); ctx.lineTo(gPx.x, gPx.y); ctx.stroke();
    ctx.setLineDash([]);

    // Enxame de Neuroevolução estilo v18.html: 100 rovers saindo, morrendo (X vermelho) e evoluindo!
    if (opts.generations && opts.generations.length) {
      const swarmPhase = Math.min(1, opts.progress / 0.65);
      const gIdx = Math.min(opts.generations.length - 1, Math.floor(Math.min(0.999, swarmPhase) * opts.generations.length));
      const genObj = opts.generations[gIdx];
      const localT = opts.progress < 0.65
        ? Math.max(0.04, Math.min(1, (swarmPhase * opts.generations.length) - gIdx))
        : 1;

      // Rastro sutil de gerações anteriores
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.14)";
      for (let gi = 0; gi < gIdx; gi++) {
        const prevG = opts.generations[gi];
        if (!prevG || !prevG.paths) continue;
        for (let ci = 0; ci < prevG.paths.length; ci += 2) {
          const cand = prevG.paths[ci];
          ctx.beginPath();
          cand.forEach((pt, idx) => {
            const q = opts.toPx(pt);
            if (idx === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
          });
          ctx.stroke();
        }
      }

      if (genObj && genObj.agents && genObj.agents.length) {
        const maxRefLen = Math.max(4, (opts.generations[opts.generations.length - 1].paths[0] || []).length);
        const stepFloat = localT * (maxRefLen - 1);

        // 1) Trilhas de até 14 rovers vivos (como desenharEnxame do v18)
        let trailCount = 0;
        for (const ag of genObj.agents) {
          if (ag.dead || trailCount >= 14) continue;
          trailCount++;
          const mIdx = Math.min(ag.pts.length - 1, Math.floor(stepFloat));
          if (mIdx < 1) continue;
          ctx.beginPath();
          for (let j = 0; j <= mIdx; j++) {
            const q = opts.toPx(ag.pts[j]);
            if (j === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
          }
          ctx.strokeStyle = opts.lineColor;
          ctx.globalAlpha = 0.28;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // 2) Os 100 rovers: retângulos vivos, X vermelho nos mortos, ponto ciano nos que chegaram
        for (const ag of genObj.agents) {
          const pts = ag.pts;
          if (!pts || !pts.length) continue;
          const reachedEnd = stepFloat >= pts.length - 1;
          const idxNow = Math.min(pts.length - 1, Math.floor(stepFloat));
          const q = opts.toPx(pts[idxNow]);

          if (ag.dead && reachedEnd) {
            // Morreu no perigo >15° -> X vermelho estilo v18
            ctx.strokeStyle = "#ef4444";
            ctx.globalAlpha = opts.progress < 0.65 ? 0.85 : 0.42;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(q.x - 3, q.y - 3); ctx.lineTo(q.x + 3, q.y + 3);
            ctx.moveTo(q.x + 3, q.y - 3); ctx.lineTo(q.x - 3, q.y + 3);
            ctx.stroke();
            ctx.globalAlpha = 1;
          } else if (!ag.dead && reachedEnd) {
            // Chegou vivo ao destino
            ctx.fillStyle = "#38bdf8";
            ctx.beginPath();
            ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Rover vivo em movimento (retângulo orientado)
            const prev = pts[Math.max(0, idxNow - 1)];
            const next = pts[Math.min(pts.length - 1, idxNow + 1)];
            const qp = opts.toPx(prev), qn = opts.toPx(next);
            const ang = Math.atan2(qn.y - qp.y, qn.x - qp.x);
            ctx.save();
            ctx.translate(q.x, q.y);
            ctx.rotate(ang);
            ctx.fillStyle = opts.lineColor;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(-3.5, -2, 7, 4);
            ctx.restore();
          }
        }
      }
    }

    // Origem & Alvo
    ctx.fillStyle = "#e2e8f0";
    ctx.beginPath(); ctx.arc(sPx.x, sPx.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(gPx.x, gPx.y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath(); ctx.arc(gPx.x, gPx.y, 2.5, 0, Math.PI * 2); ctx.fill();

    // Rota planejada completa (ténue)
    if (hist.length > 1) {
      ctx.strokeStyle = opts.faintColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      hist.forEach((pt, i) => {
        const q = opts.toPx(pt);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.stroke();

      // Trilha percorrida até o progresso atual
      const maxI = Math.max(1, Math.min(hist.length - 1, Math.floor(opts.progress * (hist.length - 1))));
      ctx.strokeStyle = opts.lineColor;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      for (let i = 0; i <= maxI; i++) {
        const q = opts.toPx(hist[i]);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();

      // Marcações de perigo >15° ou veto do escudo
      let hazCount = 0, vetoCount = 0;
      for (let i = 1; i <= maxI; i++) {
        const pt = hist[i];
        const q = opts.toPx(pt);
        if (pt.hazard) {
          hazCount++;
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(q.x - 4, q.y - 4); ctx.lineTo(q.x + 4, q.y + 4);
          ctx.moveTo(q.x + 4, q.y - 4); ctx.lineTo(q.x - 4, q.y + 4);
          ctx.stroke();
        } else if (pt.veto) {
          vetoCount++;
          ctx.fillStyle = "rgba(56, 189, 248, 0.85)";
          ctx.beginPath(); ctx.arc(q.x, q.y, 2.3, 0, Math.PI * 2); ctx.fill();
        }
      }

      const cur = hist[maxI];
      drawRoverMarker(ctx, opts.toPx(cur), cur.heading, opts.lineColor, opts.label, cur.soc, opts.shieldArc);
      ctx.restore();
      return { cur, maxI, hazCount, vetoCount };
    }

    ctx.restore();
    return { cur: { soc: 100 }, maxI: 0, hazCount: 0, vetoCount: 0 };
  }

  function renderFrame() {
    if (!simState) return;
    const cvB = document.getElementById("v18-canvas-base");
    const cvT = document.getElementById("v18-canvas-tese");
    if (!cvB || !cvT) return;

    const W = cvB.width, H = cvB.height;
    const { x0, y1, actualSpan, cmp, progress, start, goal } = simState;
    const toPx = (pt) => ({
      x: ((pt.x - x0) / actualSpan) * W,
      y: ((y1 - pt.y) / actualSpan) * H
    });

    const bStats = drawPane(cvB.getContext("2d"), simState.bgBase, cmp.base.history || [], {
      progress, start, goal, toPx,
      lineColor: "#f59e0b",
      faintColor: "rgba(245, 158, 11, 0.25)",
      label: "Sem Tese",
      shieldArc: false
    });

    const tStats = drawPane(cvT.getContext("2d"), simState.bgTese, cmp.tese.history || [], {
      progress, start, goal, toPx,
      lineColor: "#10b981",
      faintColor: "rgba(16, 185, 129, 0.28)",
      label: `Tese ${simState.shieldLevel}`,
      shieldArc: true,
      generations: cmp.generations
    });

    // Atualiza indicador de geração IA com contagem de sobreviventes dos 100 rovers
    const genPill = document.getElementById("v18-gen-pill");
    if (genPill && cmp.generations && cmp.generations.length) {
      const gIdx = Math.min(cmp.generations.length - 1, Math.floor(Math.min(0.999, progress / 0.65) * cmp.generations.length));
      const gObj = cmp.generations[gIdx];
      genPill.textContent = progress >= 0.65
        ? `🧬 Gen ${gObj.gen}/${cmp.generations.length} · ${gObj.survivors}/${gObj.total} sobreviveram · Rota Ótima`
        : `🧬 Gen ${gObj.gen}/${cmp.generations.length} · ${gObj.total} rovers (${gObj.deadCount} 💀 · ${gObj.survivors} ✓)`;
    }

    const distBase = Math.round((bStats.maxI / Math.max(1, (cmp.base.history.length - 1))) * cmp.base.distanceM);
    const distTese = Math.round((tStats.maxI / Math.max(1, (cmp.tese.history.length - 1))) * cmp.tese.distanceM);

    const sb = document.getElementById("v18-stat-base");
    const st = document.getElementById("v18-stat-tese");
    if (sb) sb.textContent = `Perigos: ${bStats.hazCount} · ${distBase} m`;
    if (st) st.textContent = `Perigos: ${tStats.hazCount} · Vetos: ${tStats.vetoCount}`;

    const fill = document.getElementById("v18-prog-fill");
    if (fill) fill.style.width = `${Math.round(progress * 100)}%`;

    const cards = document.getElementById("v18-cards");
    if (cards) {
      cards.innerHTML = `
        <div class="v18-card"><span>Distância (Sem × Tese)</span><b>${distBase} × ${distTese} m</b></div>
        <div class="v18-card"><span>Bateria (Sem × Tese)</span><b style="color:#10b981;">${bStats.cur.soc}% × ${tStats.cur.soc}%</b></div>
        <div class="v18-card"><span>Perigos >15° (Sem × Tese)</span><b style="color:#f59e0b;">${bStats.hazCount} × <span style="color:#10b981;">${tStats.hazCount}</span></b></div>
        <div class="v18-card"><span>Vetos Escudo ${simState.shieldLevel}</span><b style="color:#38bdf8;">${tStats.vetoCount} desvios</b></div>
        <div class="v18-card" style="grid-column:1/-1;font-size:11px;color:#cbd5e1;padding:6px 10px;">
          📊 <b>Bateria Multirresolução (POP=100, 16 faixas LOLA):</b>
          Chegada Tese 60→5m vs Grade 60m: <b style="color:#34d399;">+10,8 pp (N0)</b> · <b style="color:#34d399;">+13,2 pp (N1, p=0,046, OR=11,8)</b> · <b style="color:#34d399;">+12,3 pp (N2, tomb. -2,8 pp, p=0,012)</b> · <b style="color:#34d399;">+30% rel. (N3, p=0,043)</b> · LDEC real 5m: <b>7,29%</b>
        </div>
      `;
    }
  }

  function loop(ts) {
    if (!simState) return;
    if (!simState.lastTs) simState.lastTs = ts;
    const dt = Math.min(0.05, (ts - simState.lastTs) / 1000);
    simState.lastTs = ts;

    if (simState.playing) {
      simState.progress = Math.min(1, simState.progress + dt * 0.16 * simState.speed);
      if (simState.progress >= 1) {
        simState.playing = false;
        const btn = document.getElementById("v18-play-btn");
        if (btn) btn.textContent = "▶";
      }
    }
    renderFrame();
    rafId = requestAnimationFrame(loop);
  }

  function setCoarseMode(mode) {
    if (!simState || !global.TeseEngine) return;
    simState.coarseMode = mode;
    document.querySelectorAll(".v18-grid-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.g === mode);
    });
    simState.cmp = global.TeseEngine.simulateRouteComparison(
      simState.grid,
      simState.start,
      simState.goal,
      simState.roverParams,
      simState.sunFrac,
      simState.shieldLevel,
      mode
    );
    prepareCanvases();
    replay();
  }

  function togglePlay() {
    if (!simState) return;
    if (simState.progress >= 1) simState.progress = 0;
    simState.playing = !simState.playing;
    const btn = document.getElementById("v18-play-btn");
    if (btn) btn.textContent = simState.playing ? "⏸" : "▶";
  }

  function replay() {
    if (!simState) return;
    simState.progress = 0;
    simState.playing = true;
    const btn = document.getElementById("v18-play-btn");
    if (btn) btn.textContent = "⏸";
  }

  function setSpeed(s) {
    if (!simState) return;
    simState.speed = s;
    document.querySelectorAll(".v18-spd-btn").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.s) === s);
    });
  }

  function acceptPlan(which) {
    const pBase = document.getElementById("v18-pane-base");
    const pTese = document.getElementById("v18-pane-tese");
    if (pBase) pBase.classList.toggle("selected", which === "base");
    if (pTese) pTese.classList.toggle("selected", which === "tese");
    close();
    if (global.TeseUI && global.TeseUI.acceptPlannedRoute) {
      global.TeseUI.acceptPlannedRoute(which);
    }
  }

  function close() {
    const modal = document.getElementById("v18-sim-modal");
    if (modal) modal.hidden = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (simState) simState.playing = false;
  }

  global.RouteSimV18 = { open, close, togglePlay, replay, setSpeed, setCoarseMode, acceptPlan };
})(window);
