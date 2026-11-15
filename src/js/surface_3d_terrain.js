/**
 * Terreno 3D em tempo real (Three.js) para a Tela 3 (Superfície Lunar).
 * Usa a grade real `grid.surf` (10x10 km, PGDA 78) + micro-relevo procedural (crateras/rochas)
 * para dar sensação real de movimento 3D, inclinação, sombras polares e Escudo 3D no solo.
 * Não requer nenhum mapa externo adicional.
 */
(function (global) {
  "use strict";

  const PATCH_M = 1200; // 1200m x 1200m ao redor do rover
  const SEGS = 84;      // 84x84 = 7.056 quads

  let renderer = null;
  let scene = null;
  let camera = null;
  let terrainMesh = null;
  let terrainGeo = null;
  let sunLight = null;
  let ambLight = null;
  let shieldGroup = null;
  let targetBeacon = null;
  let trailLine = null;
  let routeBaseLine = null;
  let routeTeseLine = null;
  let rocksGroup = null;
  let rockMeshes = [];
  let initialized = false;
  let camZoom = 0;       // 0 = 3ª pessoa na superfície, 1 = visão tática afastada estilo v18
  let targetCamZoom = 0;

  function init(canvas) {
    if (initialized || !canvas || typeof THREE === "undefined") return;
    initialized = true;

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x090e18, 0.0011);

    camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.5, 1800);

    ambLight = new THREE.AmbientLight(0x3a4860, 0.55);
    scene.add(ambLight);

    sunLight = new THREE.DirectionalLight(0xfff4dd, 2.1);
    scene.add(sunLight);

    // Malha de terreno 3D com vertexColors
    terrainGeo = new THREE.PlaneGeometry(PATCH_M, PATCH_M, SEGS, SEGS);
    terrainGeo.rotateX(-Math.PI / 2);
    const vCount = terrainGeo.attributes.position.count;
    terrainGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(vCount * 3), 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.04,
      flatShading: true
    });
    terrainMesh = new THREE.Mesh(terrainGeo, mat);
    scene.add(terrainMesh);

    // Rochas lunares espalhadas em coordenadas de mundo (wrap modular ao redor do rover)
    rocksGroup = new THREE.Group();
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x727a88, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(rockGeo, rockMat);
      const h1 = Math.sin(i * 12.9898) * 43758.5453;
      const h2 = Math.sin(i * 78.233) * 19341.123;
      const rx = ((h1 - Math.floor(h1)) - 0.5) * 420;
      const rz = ((h2 - Math.floor(h2)) - 0.5) * 420;
      const sc = 0.45 + ((i * 7) % 11) * 0.16;
      m.scale.set(sc * 1.2, sc * 0.72, sc);
      m.rotation.set(i * 0.7, i * 1.3, 0);
      m.userData = { wx: rx, wz: rz };
      rocksGroup.add(m);
      rockMeshes.push(m);
    }
    scene.add(rocksGroup);

    // Grupo do Escudo Direcional 3D no solo
    shieldGroup = new THREE.Group();
    scene.add(shieldGroup);

    // Baliza 3D do destino (borda de PSR)
    const bGeo = new THREE.CylinderGeometry(1.2, 1.2, 42, 12);
    const bMat = new THREE.MeshBasicMaterial({ color: 0xffd147, transparent: true, opacity: 0.65 });
    targetBeacon = new THREE.Mesh(bGeo, bMat);
    targetBeacon.visible = false;
    scene.add(targetBeacon);

    // Trilha 3D do rover
    const tGeo = new THREE.BufferGeometry();
    const tMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9 });
    trailLine = new THREE.Line(tGeo, tMat);
    scene.add(trailLine);

    // Rota planejada: Degrau 0 (âmbar) vs Degrau 4 Tese (verde/ciano) estilo v18
    routeBaseLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.75 })
    );
    scene.add(routeBaseLine);
    routeTeseLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.95 })
    );
    scene.add(routeTeseLine);

    resize();
  }

  function resize() {
    if (!renderer || !renderer.domElement) return;
    const w = global.innerWidth;
    const h = global.innerHeight - 64;
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Amostragem bilinear de grid.surf em coordenadas de mundo (xM: Oeste->Leste, yM: Sul->Norte)
  function sampleElev(grid, xM, yM) {
    if (!grid) return 0;
    const half = (grid.n * grid.cellM) / 2;
    const fx = Math.max(0, Math.min(grid.n - 1.001, (xM + half) / grid.cellM));
    const fy = Math.max(0, Math.min(grid.n - 1.001, (half - yM) / grid.cellM));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const n = grid.n;
    const z00 = grid.surf[y0 * n + x0];
    const z10 = grid.surf[y0 * n + x0 + 1];
    const z01 = grid.surf[(y0 + 1) * n + x0];
    const z11 = grid.surf[(y0 + 1) * n + x0 + 1];
    const base = (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty;

    // Micro-relevo procedural determinístico (crateras locais 15-40m + rugosidade 5m)
    const micro = Math.sin(xM * 0.085) * Math.cos(yM * 0.085) * 1.15
                + Math.sin(xM * 0.21 + yM * 0.17) * 0.45
                + Math.cos(xM * 0.032 - yM * 0.041) * 2.1;
    return base + micro;
  }

  function sampleSlope5(grid, xM, yM) {
    if (!grid) return 0;
    const half = (grid.n * grid.cellM) / 2;
    const gx = Math.max(0, Math.min(grid.n - 1, Math.floor((xM + half) / grid.cellM)));
    const gy = Math.max(0, Math.min(grid.n - 1, Math.floor((half - yM) / grid.cellM)));
    return grid.slp5[gy * grid.n + gx];
  }

  function sampleLdec(grid, xM, yM) {
    if (!grid) return 0;
    const half = (grid.n * grid.cellM) / 2;
    const gx = Math.max(0, Math.min(grid.n - 1, Math.floor((xM + half) / grid.cellM)));
    const gy = Math.max(0, Math.min(grid.n - 1, Math.floor((half - yM) / grid.cellM)));
    return grid.ldecAny[gy * grid.n + gx];
  }

  function wrapMod(val, span) {
    const h = span * 0.5;
    return ((((val + h) % span) + span) % span) - h;
  }

  function updateShield3D(grid, pos, headingDeg, scan, baseElev) {
    while (shieldGroup.children.length) {
      const c = shieldGroup.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    if (!scan || !scan.sectors) return;

    for (const sc of scan.sectors) {
      const a0 = (sc.azDeg - 7.0) * Math.PI / 180;
      const a1 = (sc.azDeg + 7.0) * Math.PI / 180;
      const rIn = 8;
      const rOut = Math.min(140, 18 + (sc.freeM / 500) * 115);

      const pts = [];
      const steps = 4;
      for (let k = 0; k <= steps; k++) {
        const r = rIn + (rOut - rIn) * (k / steps);
        const x0 = pos.x + Math.sin(a0) * r, y0 = pos.y + Math.cos(a0) * r;
        const x1 = pos.x + Math.sin(a1) * r, y1 = pos.y + Math.cos(a1) * r;
        const h0 = sampleElev(grid, x0, y0) - baseElev + 0.8;
        const h1 = sampleElev(grid, x1, y1) - baseElev + 0.8;
        pts.push(x0 - pos.x, h0, -(y0 - pos.y));
        pts.push(x1 - pos.x, h1, -(y1 - pos.y));
      }
      const idx = [];
      for (let k = 0; k < steps; k++) {
        const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      g.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({
        color: sc.safe ? 0x00ff88 : 0xff3b5c,
        transparent: true,
        opacity: sc.safe ? 0.22 : 0.42,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      shieldGroup.add(new THREE.Mesh(g, mat));
    }
  }

  function render(sim, teseState) {
    if (!initialized || !sim || !teseState || !teseState.activeGrid) return;
    const grid = teseState.activeGrid;
    const pos = teseState.pos || { x: 0, y: 0 };
    const headingDeg = sim.heading || 0;
    const hRad = headingDeg * Math.PI / 180;

    // Elevação sob o rover
    const baseElev = sampleElev(grid, pos.x, pos.y);

    // Atualiza vértices do terreno ao redor do rover (em coordenadas locais relativas a pos)
    const pAttr = terrainGeo.attributes.position;
    const cAttr = terrainGeo.attributes.color;
    const showHazards = teseState.walkMode;
    const slopeLim = 15.0;

    // Alinha o patch a uma grade discreta de 14 m para evitar "nadar" dos vértices ao andar
    const snap = PATCH_M / SEGS;
    const ox = Math.floor(pos.x / snap) * snap;
    const oz = Math.floor(pos.y / snap) * snap;
    terrainMesh.position.set(ox - pos.x, 0, -(oz - pos.y));

    for (let i = 0; i < pAttr.count; i++) {
      const lx = pAttr.getX(i);
      const lz = pAttr.getZ(i); // Three.js +Z é Sul (-yM), -Z é Norte (+yM)
      const wx = ox + lx;
      const wy = oz - lz;
      const h = sampleElev(grid, wx, wy) - baseElev;
      pAttr.setY(i, h);

      // Cor lunar realista + destaque sutil de perigos >15° / tiros LDEC no modo caminhar
      const slp = sampleSlope5(grid, wx, wy);
      const ldec = sampleLdec(grid, wx, wy);
      let r = 0.46, g = 0.48, b = 0.52;
      if (showHazards && slp > slopeLim) {
        r = 0.72; g = 0.24; b = 0.22;
      } else if (showHazards && ldec) {
        r = 0.34; g = 0.54; b = 0.62;
      }
      cAttr.setXYZ(i, r, g, b);
    }
    pAttr.needsUpdate = true;
    cAttr.needsUpdate = true;
    terrainGeo.computeVertexNormals();

    // Atualiza rochas ao redor do rover (wrapping modular 420m)
    for (const m of rockMeshes) {
      const rx = wrapMod(m.userData.wx - pos.x, 420);
      const rz = wrapMod(m.userData.wz - pos.y, 420);
      const wy = sampleElev(grid, pos.x + rx, pos.y + rz) - baseElev;
      m.position.set(rx, wy + m.scale.y * 0.4, -rz);
    }

    // Iluminação solar real (SPICE)
    const sunAzRad = (sim.sun ? sim.sun.az : 0) * Math.PI / 180;
    const sunElRad = Math.max(0.05, (sim.sun ? sim.sun.el : 5) * Math.PI / 180);
    sunLight.position.set(
      Math.sin(sunAzRad) * Math.cos(sunElRad) * 400,
      Math.sin(sunElRad) * 400,
      -Math.cos(sunAzRad) * Math.cos(sunElRad) * 400
    );
    sunLight.intensity = 0.35 + 1.9 * (sim.sunFrac ?? 1);
    ambLight.intensity = 0.22 + 0.35 * (sim.sunFrac ?? 1);

    // Escudo Direcional 3D no solo
    if (teseState.walkMode) {
      updateShield3D(grid, pos, headingDeg, teseState.lastScan, baseElev);
    } else if (shieldGroup.children.length) {
      updateShield3D(grid, pos, headingDeg, null, baseElev);
    }

    // Baliza de destino
    if (teseState.walkMode && teseState.target) {
      const dx = teseState.target.x - pos.x;
      const dy = teseState.target.y - pos.y;
      const th = sampleElev(grid, teseState.target.x, teseState.target.y) - baseElev;
      targetBeacon.position.set(dx, th + 21, -dy);
      targetBeacon.visible = true;
    } else {
      targetBeacon.visible = false;
    }

    // Animação suave de afastamento (0 = 3ª pessoa na superfície, 1 = visão tática aérea estilo v18)
    camZoom += (targetCamZoom - camZoom) * 0.08;
    scene.fog.density = 0.0011 * (1 - camZoom * 0.78);

    // Trilha 3D
    if (teseState.walkMode && teseState.trail.length > 1) {
      const tPts = [];
      for (const pt of teseState.trail) {
        const th = sampleElev(grid, pt.x, pt.y) - baseElev + 0.8;
        tPts.push(pt.x - pos.x, th, -(pt.y - pos.y));
      }
      trailLine.geometry.setAttribute("position", new THREE.Float32BufferAttribute(tPts, 3));
      trailLine.visible = true;
    } else {
      trailLine.visible = false;
    }

    // Rotas planejadas (Degrau 0 vs Degrau 4) estilo v18
    const setRouteGeom = (line, path) => {
      if (!teseState.walkMode || !path || path.length < 2) { line.visible = false; return; }
      const pts = [];
      for (const pt of path) {
        const th = sampleElev(grid, pt.x, pt.y) - baseElev + 1.4;
        pts.push(pt.x - pos.x, th, -(pt.y - pos.y));
      }
      line.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      line.visible = true;
    };
    const cmp = teseState.plannedComparison;
    setRouteGeom(routeBaseLine, cmp && cmp.base ? cmp.base.path : null);
    setRouteGeom(routeTeseLine, cmp && cmp.tese ? cmp.tese.path : null);

    // Câmera 3D interpolada entre 3ª pessoa (camZoom=0) e visão tática aérea estilo v18 (camZoom=1)
    const camDist = 26 + camZoom * 340;
    const camHeight = 11.5 + camZoom * 370;
    const fwdX = Math.sin(hRad), fwdZ = -Math.cos(hRad);
    const lookAhead = 95 * (1 - camZoom * 0.75);
    const lookY = -2.5 * (1 - camZoom);
    camera.position.set(-fwdX * camDist, camHeight, -fwdZ * camDist);
    camera.lookAt(fwdX * lookAhead, lookY, fwdZ * lookAhead);

    renderer.render(scene, camera);
  }

  function setTacticalZoom(on) {
    targetCamZoom = on ? 1 : 0;
  }

  global.Surface3DTerrain = {
    init,
    resize,
    render,
    sampleElev,
    setTacticalZoom,
    get camZoom() { return camZoom; },
    get tacticalMode() { return targetCamZoom > 0.5; }
  };
})(window);
