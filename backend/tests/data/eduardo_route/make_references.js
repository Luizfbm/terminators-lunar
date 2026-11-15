/*
 * Runs Eduardo's own engine (eduardo_engine.js, commit 2195fcb) on the cases in cases.json and
 * writes what it returns to ref_<case>.json. backend/tests/test_route.py compares the API
 * against those files, never against the Python port.
 *
 *   for t in DM1 Haworth Site01 Site11 SL2; do
 *     git show origin/eduardo/cockpit-multirresolucao:src/assets/tese_bundle/pgda78/$t.json > /tmp/bundle/$t.json
 *   done
 *   node make_references.js /tmp/bundle
 *
 * The engine needs a browser-like `window` and `atob`; he exports only simulateRouteComparison,
 * which returns both plans (`base` = Normal navigation, `tese` = Multiresolution), the swarm
 * generations and the paths. Numbers are written exactly as the engine returns them (no
 * rounding), JSON.stringify prints doubles so they read back identical.
 *
 * generateSolarPickups below is copied from src/js/tese_ui.js (commit 2195fcb, line ~464) with
 * only the plumbing changed: the grid, the comparison, the Sun's direction in the grid plane and
 * the Rover's slope limit come in as arguments instead of from his page state, and the "wh: 180"
 * energy he gives each pickup is left out (the contract has no energy on solar points).
 */
"use strict";
const fs = require("fs");
const path = require("path");

global.window = global;
global.atob = (b) => Buffer.from(b, "base64").toString("binary");
require("./eduardo_engine.js");
const E = global.TeseEngine;

function generateSolarPickups(grid, cmp, sunAzRad, slopeLim) {
  const sdx = Math.sin(sunAzRad), sdy = Math.cos(sunAzRad);

  const isLit = (x, y) => {
    const c = E.sampleGrid(grid, x, y);
    if (c.slp5 > slopeLim) return false;
    const eL = E.sampleGrid(grid, x - 50, y).surf;
    const eR = E.sampleGrid(grid, x + 50, y).surf;
    const eD = E.sampleGrid(grid, x, y - 50).surf;
    const eU = E.sampleGrid(grid, x, y + 50).surf;
    const nx = -(eR - eL) / 100;
    const ny = -(eU - eD) / 100;
    const dot = (nx * sdx + ny * sdy + 0.18) / Math.hypot(nx, ny, 1);
    return dot > 0.04;
  };

  const candidates = [];
  // His default `degrau` is 4 (Multiresolution), so the main path is the `tese` one.
  const mainPath = cmp.tese ? cmp.tese.path : [];
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
    out.push({ x: pt.x, y: pt.y });
  }
  return out;
}

// A flat 10 x 10 km grid at 4 degrees with a steep wall across the middle (30 degrees, 10 cells
// wide at 5 m detail, 15 cells wide on the coarse grids), no laser shots, slope error 3. It is
// not terrain: it exists because uniform ground makes many steps cost exactly the same, so the
// A* heap's tie-breaking decides the path, which real tiles almost never exercise.
// test_route.py builds the same arrays and compares the raw plans.
function syntheticFlatWall() {
  const n = 200, total = n * n;
  const grid = {
    n, cellM: 50, spanKm: 10, zMin: 0, zMax: 0,
    surf: new Float32Array(total), slp5: new Float32Array(total).fill(4),
    slp60: new Float32Array(total).fill(4), slp20: new Float32Array(total).fill(4),
    ldecDen: new Float32Array(total), ldecAny: new Uint8Array(total),
    slperr: new Float32Array(total).fill(3),
  };
  for (let row = 20; row < 180; row++) {
    for (let col = 90; col < 100; col++) grid.slp5[row * n + col] = 30;
    for (let col = 88; col < 103; col++) {
      grid.slp60[row * n + col] = 30;
      grid.slp20[row * n + col] = 30;
    }
  }
  return grid;
}

const dir = __dirname;
const bundleDir = process.argv[2];
if (!bundleDir) {
  console.error("usage: node make_references.js <dir with the PGDA 78 bundle JSON files>");
  process.exit(2);
}
const cases = JSON.parse(fs.readFileSync(path.join(dir, "cases.json"), "utf8")).cases;
const rovers = JSON.parse(fs.readFileSync(path.join(dir, "rovers_eduardo.json"), "utf8"));
const grids = {};

function planOut(plan) {
  return {
    reached: plan.reached,
    socMin: plan.socMin,
    hazardsHit: plan.hazardsHit,
    vetoes: plan.vetoes,
    distanceM: plan.distanceM,
    timeH: plan.timeH,
    path: plan.path.map((p) => [p.x, p.y]),
    soc: plan.history.map((h) => h.soc),
    slp5: plan.history.map((h) => h.slp5),
    hazard: plan.history.map((h) => h.hazard),
    veto: plan.history.map((h) => h.veto),
  };
}

for (const c of cases) {
  if (c.tile === "synthetic-flat-wall") {
    grids[c.tile] = syntheticFlatWall();
  } else if (!grids[c.tile]) {
    grids[c.tile] = E.decodePGDA(JSON.parse(fs.readFileSync(path.join(bundleDir, c.tile + ".json"), "utf8")));
  }
  const grid = grids[c.tile];
  const r = rovers.find((x) => x.model === c.rover);
  const params = {
    slopeLimitDeg: r.slopeLimitDeg,
    batteryWh: r.batteryWh,
    solarW: r.solarW,
    rtgW: r.rtgW,
    powerShadowW: r.powerShadowW,
  };
  const ov = c.overrides || {};
  if (ov.slope_limit_deg !== undefined) params.slopeLimitDeg = ov.slope_limit_deg;
  if (ov.battery_wh !== undefined) params.batteryWh = ov.battery_wh;
  if (ov.solar_w !== undefined) params.solarW = ov.solar_w;
  if (ov.rtg_w !== undefined) params.rtgW = ov.rtg_w;
  if (ov.power_shadow_w !== undefined) params.powerShadowW = ov.power_shadow_w;

  const start = { x: c.start[0], y: c.start[1] };
  const goal = { x: c.goal[0], y: c.goal[1] };
  const cmp = E.simulateRouteComparison(
    grid, start, goal, params, c.sun_fraction, c.confidence_level, c.coarse_m + "m");

  const detail = c.swarm_detail || "first10";
  const swarm = cmp.generations.map((g) => ({
    gen: g.gen,
    survivors: g.survivors,
    dead: g.agents.map((a) => a.dead),
    lengths: g.agents.map((a) => a.pts.length),
    pts: g.agents.map((a, k) => (detail === "all" || k < 10 || (g.gen === 3 && k === 1)
      ? a.pts.map((p) => [p.x, p.y]) : null)),
  }));

  const out = {
    id: c.id,
    params,
    start: [start.x, start.y],
    goal: [goal.x, goal.y],
    base: planOut(cmp.base),
    tese: planOut(cmp.tese),
    hazardsAvoided: cmp.hazardsAvoided,
    swarm,
  };
  if (c.plane_azimuth_deg !== undefined && c.plane_azimuth_deg !== null) {
    out.solar = generateSolarPickups(grid, cmp, (c.plane_azimuth_deg * Math.PI) / 180, params.slopeLimitDeg)
      .map((p) => [p.x, p.y]);
  }
  fs.writeFileSync(path.join(dir, "ref_" + c.id + ".json"), JSON.stringify(out) + "\n");
  console.log(c.id, "normal", cmp.base.hazardsHit, cmp.base.vetoes, cmp.base.distanceM, cmp.base.timeH,
    "multi", cmp.tese.hazardsHit, cmp.tese.vetoes, cmp.tese.distanceM, cmp.tese.timeH,
    "swarm", cmp.generations.map((g) => g.survivors).join("/"),
    out.solar ? "solar " + out.solar.length : "");
}
