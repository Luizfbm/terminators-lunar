/**
 * Animação de Simulação de Percurso estilo v18.html
 * Disparada automaticamente assim que uma rota é traçada na Tela 3.
 * Mostra lado a lado / sobrepostos no relevo real (PGDA 78):
 *   - Rover A (Degrau 0 · Sem Tese, âmbar) seguindo grade 60m
 *   - Rover B (Degrau 4 · IA + Escudo P90/P99, verde/ciano) desviando de perigos >15°
 */
(function (global) {
  "use strict";

  let simState = null;
  let rafId = null;

  function open(grid, start, goal, cmp, sunAzDeg, slopeLimitDeg, shieldLevel) {
    const modal = document.getElementById("v18-sim-modal");
    const cv = document.getElementById("v18-sim-canvas");
    if (!modal || !cv || !grid || !cmp) return;

    // Bounding box ao redor de start..goal com margem
    const pad = 650;
    let minX = Math.min(start.x, goal.x) - pad;
    let maxX = Math.max(start.x, goal.x) + pad;
    let minY = Math.min(start.y, goal.y) - pad;
    let maxY = Math.max(start.y, goal.y) + pad;
    for (const pt of (cmp.base.path || []).concat(cmp.tese.path || [])) {
      minX = Math.min(minX, pt.x - 350); maxX = Math.max(maxX, pt.x + 350);
      minY = Math.min(minY, pt.y - 350); maxY = Math.max(maxY, pt.y + 350);
    }
    const span = Math.max(1400, maxX - minX, maxY - minY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const x0 = Math.max(-5000, cx - span / 2);
    const y1 = Math.min(5000, cy + span / 2);
    const actualSpan = Math.min(10000, span);

    // Pré-renderiza o mapa hillshade estilo v18.html
    const W = cv.width, H = cv.height;
    const bg = document.createElement("canvas");
    bg.width = W; bg.height = H;
    const bctx = bg.getContext("2d");
    const img = bctx.createImageData(W, H);
    const d = img.data;

    const sunRad = (sunAzDeg || 35) * Math.PI / 180;
    const sdx = Math.sin(sunRad), sdy = Math.cos(sunRad);
    const n = grid.n, cellM = grid.cellM, half = (n * cellM) / 2;
    const zSpan = Math.max(1, grid.zMax - grid.zMin);

    const elevAt = (wx, wy) => {
      const gx = Math.max(0, Math.min(n - 1, Math.floor((wx + half) / cellM)));
      const gy = Math.max(0, Math.min(n - 1, Math.floor((half - wy) / cellM)));
      return grid.surf[gy * n + gx];
    };

    for (let py = 0; py < H; py++) {
      const wy = y1 - (py / H) * actualSpan;
      const gy = Math.max(0, Math.min(n - 1, Math.floor((half - wy) / cellM)));
      for (let px = 0; px < W; px++) {
        const wx = x0 + (px / W) * actualSpan;
        const gx = Math.max(0, Math.min(n - 1, Math.floor((wx + half) / cellM)));
        const idx = gy * n + gx;

        const z = grid.surf[idx];
        const nx = -(elevAt(wx + cellM, wy) - elevAt(wx - cellM, wy)) / (2 * cellM);
        const ny = -(elevAt(wx, wy + cellM) - elevAt(wx, wy - cellM)) / (2 * cellM);
        const nl = Math.hypot(nx, ny, 1);
        const hill = Math.max(0.15, Math.min(1.0, 0.45 + ((nx * sdx + ny * sdy + 0.25) / nl) * 0.65));
        const alt = (z - grid.zMin) / zSpan;

        let r = (38 + alt * 52 + hill * 44);
        let g = (48 + alt * 54 + hill * 44);
        let b = (66 + alt * 58 + hill * 44);

        // Sombra/perigo >15° estilo v18
        if (grid.slp5[idx] > (slopeLimitDeg || 15)) {
          r = r * 0.42 + 185 * 0.35;
          g = g * 0.32;
          b = b * 0.34;
        } else if (grid.ldecAny[idx]) {
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

    // Grade 60m / 200m
    bctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
    bctx.lineWidth = 1;
    const stepGrid = actualSpan > 3500 ? 500 : 200;
    const gStartX = Math.ceil(x0 / stepGrid) * stepGrid;
    for (let gx = gStartX; gx < x0 + actualSpan; gx += stepGrid) {
      const px = ((gx - x0) / actualSpan) * W;
      bctx.beginPath(); bctx.moveTo(px, 0); bctx.lineTo(px, H); bctx.stroke();
    }
    const gStartY = Math.ceil((y1 - actualSpan) / stepGrid) * stepGrid;
    for (let gy = gStartY; gy < y1; gy += stepGrid) {
      const py = ((y1 - gy) / actualSpan) * H;
      bctx.beginPath(); bctx.moveTo(0, py); bctx.lineTo(W, py); bctx.stroke();
    }

    simState = {
      grid, start, goal, cmp,
      x0, y1, span: actualSpan,
      bg,
      sunAzDeg: sunAzDeg || 35,
      shieldLevel: shieldLevel || "P90",
      slopeLimitDeg: slopeLimitDeg || 15,
      stepFloat: 0,
      speed: 1,
      playing: true,
      maxSteps: Math.max(cmp.base.history.length, cmp.tese.history.length) - 1,
      lastTs: null
    };

    modal.hidden = false;
    document.getElementById("v18-play-btn").textContent = "⏸";
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function close() {
    cancelAnimationFrame(rafId);
    rafId = null;
    const modal = document.getElementById("v18-sim-modal");
    if (modal) modal.hidden = true;
  }

  function togglePlay() {
    if (!simState) return;
    if (simState.stepFloat >= simState.maxSteps) simState.stepFloat = 0;
    simState.playing = !simState.playing;
    document.getElementById("v18-play-btn").textContent = simState.playing ? "⏸" : "▶";
  }

  function setSpeed(s) {
    if (!simState) return;
    simState.speed = s;
    document.querySelectorAll(".v18-spd-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.s) === s));
  }

  function replay() {
    if (!simState) return;
    simState.stepFloat = 0;
    simState.playing = true;
    document.getElementById("v18-play-btn").textContent = "⏸";
  }

  function tick(ts) {
    if (!simState) return;
    const dt = simState.lastTs == null ? 0 : Math.min(0.05, (ts - simState.lastTs) / 1000);
    simState.lastTs = ts;

    if (simState.playing) {
      simState.stepFloat = Math.min(simState.maxSteps, simState.stepFloat + dt * 11 * simState.speed);
      if (simState.stepFloat >= simState.maxSteps) {
        simState.playing = false;
        const pb = document.getElementById("v18-play-btn");
        if (pb) pb.textContent = "▶";
      }
    }

    draw();
    rafId = requestAnimationFrame(tick);
  }

  function draw() {
    const cv = document.getElementById("v18-sim-canvas");
    if (!cv || !simState) return;
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const { x0, y1, span, cmp, stepFloat } = simState;

    const toPx = (x, y) => ({
      x: ((x - x0) / span) * W,
      y: ((y1 - y) / span) * H
    });

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(simState.bg, 0, 0);

    // Rota planejada de referência (linha tracejada âmbar até o destino)
    const pStart = toPx(simState.start.x, simState.start.y);
    const pGoal = toPx(simState.goal.x, simState.goal.y);
    ctx.save();
    ctx.strokeStyle = "rgba(245, 158, 11, 0.30)";
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(pStart.x, pStart.y); ctx.lineTo(pGoal.x, pGoal.y); ctx.stroke();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(pStart.x, pStart.y); ctx.lineTo(pGoal.x, pGoal.y); ctx.stroke();
    ctx.restore();

    const idxA = Math.min(cmp.base.history.length - 1, Math.floor(stepFloat));
    const idxB = Math.min(cmp.tese.history.length - 1, Math.floor(stepFloat));

    // Trilha Rover A (âmbar, Sem Tese) + marcações de perigo atingido
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= idxA; i++) {
      const q = toPx(cmp.base.history[i].x, cmp.base.history[i].y);
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    for (let i = 1; i <= idxA; i++) {
      if (cmp.base.history[i].hazard) {
        const q = toPx(cmp.base.history[i].x, cmp.base.history[i].y);
        ctx.fillStyle = "#ef4444";
        ctx.font = "900 12px sans-serif";
        ctx.fillText("✖", q.x - 5, q.y + 4);
      }
    }
    ctx.restore();

    // Trilha Rover B (verde/ciano, Com Tese + Escudo)
    ctx.save();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= idxB; i++) {
      const q = toPx(cmp.tese.history[i].x, cmp.tese.history[i].y);
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.restore();

    // Marcadores de início e destino (PSR)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(pStart.x, pStart.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffd147"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(pGoal.x, pGoal.y, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(10,16,32,0.88)";
    ctx.fillRect(pGoal.x - 36, pGoal.y - 24, 72, 14);
    ctx.fillStyle = "#ffd147";
    ctx.font = "700 10px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🎯 DESTINO", pGoal.x, pGoal.y - 14);
    ctx.textAlign = "left";

    // Leque do Escudo Direcional no Rover B
    const stB = cmp.tese.history[idxB];
    const pB = toPx(stB.x, stB.y);
    const hRad = (stB.heading || 0) * Math.PI / 180;
    ctx.save();
    ctx.strokeStyle = stB.veto ? "rgba(239,68,68,0.85)" : "rgba(16,185,129,0.55)";
    ctx.fillStyle = stB.veto ? "rgba(239,68,68,0.18)" : "rgba(16,185,129,0.14)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pB.x, pB.y);
    const fanR = 38;
    const a0 = -Math.PI / 2 + hRad - 0.65;
    const a1 = -Math.PI / 2 + hRad + 0.65;
    ctx.arc(pB.x, pB.y, fanR, a0, a1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Ícone Rover A & Badge
    const stA = cmp.base.history[idxA];
    const pA = toPx(stA.x, stA.y);
    const drawRover = (q, col, lbl) => {
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = col;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();

      ctx.font = "700 11px 'Segoe UI', sans-serif";
      const tw = ctx.measureText(lbl).width + 10;
      const bx = Math.min(W - tw - 6, Math.max(6, q.x - tw / 2));
      const by = Math.max(22, q.y - 16);
      ctx.fillStyle = "rgba(10, 16, 32, 0.88)";
      ctx.fillRect(bx, by - 11, tw, 15);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by - 11, tw, 15);
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(lbl, bx + 5, by);
    };
    drawRover(pA, "#f59e0b", `Sem Tese · ${stA.soc}%`);
    drawRover(pB, "#10b981", `Tese ${simState.shieldLevel} · ${stB.soc}%`);

    // Bússola solar (canto superior esquerdo, estilo v18)
    const cx = 30, cy = 30, cr = 18;
    const sRad = simState.sunAzDeg * Math.PI / 180;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,16,32,0.85)"; ctx.fill();
    ctx.strokeStyle = "rgba(251,191,36,0.6)"; ctx.lineWidth = 1.2; ctx.stroke();
    const sx = cx + Math.sin(sRad) * (cr - 4), sy = cy - Math.cos(sRad) * (cr - 4);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx, sy);
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fillStyle = "#fbbf24"; ctx.fill();
    ctx.fillStyle = "#fbbf24"; ctx.font = "700 11px 'Segoe UI', sans-serif";
    ctx.fillText(`☀ ${Math.round(simState.sunAzDeg)}°`, cx + 24, cy + 4);
    ctx.restore();

    // Atualiza barra de progresso & 4 cards inferiores estilo v18
    const prog = simState.maxSteps > 0 ? Math.round((stepFloat / simState.maxSteps) * 100) : 100;
    const bar = document.getElementById("v18-prog-fill");
    if (bar) bar.style.width = prog + "%";

    const hazA = cmp.base.history.slice(0, idxA + 1).filter((h) => h.hazard).length;
    const hazB = cmp.tese.history.slice(0, idxB + 1).filter((h) => h.hazard).length;
    const vetB = cmp.tese.history.slice(0, idxB + 1).filter((h) => h.veto).length;
    const cards = document.getElementById("v18-cards");
    if (cards) {
      cards.innerHTML = `
        <div class="v18-card"><span>Avanço (Tese)</span><b>${idxB * 50} m</b></div>
        <div class="v18-card"><span>Bateria A × B</span><b>${stA.soc}% × <em style="color:#10b981;font-style:normal">${stB.soc}%</em></b></div>
        <div class="v18-card"><span>Perigos >${simState.slopeLimitDeg}° (A × B)</span><b style="color:${hazA > hazB ? '#10b981' : '#f59e0b'}">${hazA} × ${hazB}</b></div>
        <div class="v18-card"><span>Vetos Escudo ${simState.shieldLevel}</span><b style="color:#38bdf8">${vetB}</b></div>
      `;
    }
  }

  global.RouteSimV18 = {
    open,
    close,
    togglePlay,
    setSpeed,
    replay
  };
})(window);
