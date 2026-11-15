import * as THREE from 'three'
import type { RoverModel } from './rover3d'
type Vec3 = [number, number, number]
type WheelStyle = 'mapp' | 'apollo' | 'ltv' | 'viper'

/** The cockpit's illustrative models, shared by the picker and surface; no renderer. Front = +Z. */
export function createRoverFleet() {
  const textures: THREE.Texture[] = []
  // ---------- helpers ----------
  const col = (hex: number) => new THREE.Color(hex)
  const M = (hex: number, o: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color: col(hex), metalness: 0.25, roughness: 0.55, ...o })
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }
  const box = (w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) =>
    add(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z)
  const UP = new THREE.Vector3(0, 1, 0)
  // A rod from a to b, used for frames, masts and suspension arms
  const tube = (a: Vec3, b: Vec3, r: number, mat: THREE.Material, parent: THREE.Object3D) => {
    const A = new THREE.Vector3(...a)
    const B = new THREE.Vector3(...b)
    const dir = B.clone().sub(A)
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 10), mat)
    m.position.copy(A).add(B).multiplyScalar(0.5)
    m.quaternion.setFromUnitVectors(UP, dir.normalize())
    parent.add(m)
    return m
  }
  const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    if (g) draw(g, w, h)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    textures.push(t)
    return t
  }

  const solarTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#0b0d14'
    g.fillRect(0, 0, w, h)
    const cols = 10
    const rows = 3
    const pad = 6
    const cw = (w - pad * (cols + 1)) / cols
    const ch = (h - pad * (rows + 1)) / rows
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = pad + c * (cw + pad)
        const y = pad + r * (ch + pad)
        const gr = g.createLinearGradient(x, y, x + cw, y + ch)
        gr.addColorStop(0, '#1e2a4a')
        gr.addColorStop(1, '#0d1222')
        g.fillStyle = gr
        g.fillRect(x, y, cw, ch)
        g.strokeStyle = '#c9932f'
        g.lineWidth = 2
        g.strokeRect(x, y, cw, ch)
      }
    }
  })

  const flagTex = canvasTex(96, 64, (g, w, h) => {
    for (let i = 0; i < 7; i++) {
      g.fillStyle = i % 2 ? '#ffffff' : '#c8102e'
      g.fillRect(0, (i * h) / 7, w, h / 7 + 1)
    }
    g.fillStyle = '#1f3a7a'
    g.fillRect(0, 0, w * 0.42, h * 0.55)
  })

  const shadowTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62)
    gr.addColorStop(0, 'rgba(0,0,0,0.75)')
    gr.addColorStop(0.6, 'rgba(0,0,0,0.35)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  })

  const glowTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62)
    gr.addColorStop(0, 'rgba(255,255,255,1)')
    gr.addColorStop(0.25, 'rgba(120,235,255,0.85)')
    gr.addColorStop(1, 'rgba(0,180,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
  })

  // Wheel with its axle on X
  function wheel(style: WheelStyle, r: number, w: number) {
    const g = new THREE.Group()
    if (style === 'viper') {
      const gold = M(0xc4923f, { metalness: 0.7, roughness: 0.38, side: THREE.DoubleSide })
      const drum = add(new THREE.CylinderGeometry(r, r, w, 32, 1, true), gold, g)
      drum.rotation.z = Math.PI / 2
      for (const s of [-1, 1]) {
        const rim = add(new THREE.TorusGeometry(r, r * 0.04, 8, 36), gold, g, (s * w) / 2, 0, 0)
        rim.rotation.y = Math.PI / 2
      }
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2
        const p = box(w * 0.96, r * 0.12, r * 0.03, gold, g, 0, Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93)
        p.rotation.x = a
      }
      const spoke = M(0xd9dde2, { metalness: 0.8, roughness: 0.3 })
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        tube([0, 0, 0], [0, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95], r * 0.012, spoke, g)
      }
      const hub = add(new THREE.CylinderGeometry(r * 0.2, r * 0.2, w * 0.5, 16), M(0x8c949d, { metalness: 0.7, roughness: 0.35 }), g)
      hub.rotation.z = Math.PI / 2
    } else if (style === 'mapp') {
      const white = M(0xeef2f6, { roughness: 0.5, metalness: 0.15 })
      const drum = add(new THREE.CylinderGeometry(r * 0.78, r * 0.78, w, 28), white, g)
      drum.rotation.z = Math.PI / 2
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        const fin = box(w * 1.0, r * 0.26, r * 0.07, white, g, 0, Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86)
        fin.rotation.x = a
      }
      const hub = add(new THREE.CylinderGeometry(r * 0.32, r * 0.32, w * 1.08, 18), M(0x8a96a3, { metalness: 0.7, roughness: 0.35 }), g)
      hub.rotation.z = Math.PI / 2
    } else if (style === 'apollo') {
      const tire = add(new THREE.CylinderGeometry(r, r, w, 32), M(0x3a4048, { metalness: 0.6, roughness: 0.6 }), g)
      tire.rotation.z = Math.PI / 2
      const tread = M(0xb8c2cc, { metalness: 0.75, roughness: 0.4 })
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2
        const t = box(w * 0.9, r * 0.06, r * 0.16, tread, g, 0, Math.cos(a) * r, Math.sin(a) * r)
        t.rotation.x = a
        t.rotation.y = i % 2 ? 0.35 : -0.35
      }
      const hubMat = M(0xdfe6ee, { metalness: 0.55, roughness: 0.35 })
      for (const s of [-1, 1]) {
        const hub = add(new THREE.CylinderGeometry(r * 0.58, r * 0.58, 0.02, 24), hubMat, g, s * w * 0.51, 0, 0)
        hub.rotation.z = Math.PI / 2
      }
      const cap = add(new THREE.CylinderGeometry(r * 0.18, r * 0.18, w * 1.15, 14), M(0x7f8994, { metalness: 0.8, roughness: 0.3 }), g)
      cap.rotation.z = Math.PI / 2
    } else {
      // LTV: open mesh wheel with white rims and spokes
      const mesh = add(
        new THREE.CylinderGeometry(r * 0.96, r * 0.96, w, 36, 1, true),
        M(0x2b3138, { metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }),
        g,
      )
      mesh.rotation.z = Math.PI / 2
      const rimMat = M(0xf4f7fb, { metalness: 0.2, roughness: 0.4 })
      for (const s of [-1, 1]) {
        const rim = add(new THREE.TorusGeometry(r * 0.97, r * 0.07, 10, 40), rimMat, g, s * w * 0.5, 0, 0)
        rim.rotation.y = Math.PI / 2
      }
      const spokeMat = M(0xcfd8e2, { metalness: 0.6, roughness: 0.35 })
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2
        tube([0, 0, 0], [0, Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92], r * 0.035, spokeMat, g)
      }
      const hub = add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, w * 0.8, 18), M(0xe9eef3, { metalness: 0.4, roughness: 0.4 }), g)
      hub.rotation.z = Math.PI / 2
    }
    return g
  }

  // Half-shell fender over a wheel (axle on X)
  function fender(r: number, w: number, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) {
    const f = add(new THREE.CylinderGeometry(r, r, w, 24, 1, true, 0.25, Math.PI - 0.5), mat, parent, x, y, z)
    f.rotation.z = Math.PI / 2
    return f
  }

  function astronaut(parent: THREE.Object3D, x: number, y: number, z: number) {
    const g = new THREE.Group()
    g.position.set(x, y, z)
    const suit = M(0xf2f5f8, { roughness: 0.75, metalness: 0.05 })
    add(new THREE.CylinderGeometry(0.17, 0.19, 0.42, 16), suit, g, 0, 0.22, 0)
    box(0.3, 0.36, 0.14, M(0xdfe5ec, { roughness: 0.7 }), g, 0, 0.26, -0.17)
    add(new THREE.SphereGeometry(0.15, 24, 16), suit, g, 0, 0.56, 0)
    const visor = add(
      new THREE.SphereGeometry(0.135, 24, 16, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.25, Math.PI * 0.42),
      M(0xd4a23a, { metalness: 1.0, roughness: 0.12 }),
      g, 0, 0.56, 0.035,
    )
    visor.scale.set(1, 1, 1.05)
    tube([0.17, 0.36, 0.02], [0.2, 0.18, 0.24], 0.055, suit, g)
    tube([-0.17, 0.36, 0.02], [-0.2, 0.18, 0.24], 0.055, suit, g)
    tube([0.09, 0.02, 0.05], [0.1, 0.02, 0.38], 0.07, suit, g)
    tube([-0.09, 0.02, 0.05], [-0.1, 0.02, 0.38], 0.07, suit, g)
    parent.add(g)
    return g
  }

  const corners: Array<[number, number]> = [[-1, 1], [1, 1], [-1, -1], [1, -1]]

  // ---------- Lunar Outpost MAPP ----------
  function buildMAPP() {
    const g = new THREE.Group()
    const metalBlue = M(0x9fb9d2, { metalness: 0.65, roughness: 0.35 })
    const silver = M(0xc9d3dc, { metalness: 0.8, roughness: 0.28 })
    const black = M(0x14171d, { metalness: 0.3, roughness: 0.5 })
    // body
    box(0.9, 0.52, 1.25, metalBlue, g, 0, 0.78, 0)
    box(0.78, 0.12, 1.12, silver, g, 0, 0.47, 0)
    // solar side walls (black cells, gold contacts)
    const solar = new THREE.MeshStandardMaterial({ map: solarTex, metalness: 0.5, roughness: 0.25 })
    for (const s of [-1, 1]) {
      const p = box(0.035, 0.56, 1.3, solar, g, s * 0.48, 0.8, 0)
      p.rotation.z = s * 0.06
    }
    // front panel with green display and lens
    box(0.8, 0.46, 0.04, M(0x5aa7e0, { metalness: 0.5, roughness: 0.35 }), g, 0, 0.78, 0.645)
    box(0.22, 0.18, 0.02, M(0x0d5c46, { emissive: col(0x1aff9c), emissiveIntensity: 0.35 }), g, 0.12, 0.82, 0.67)
    add(new THREE.SphereGeometry(0.045, 16, 12), M(0xff3b6b, { emissive: col(0xff3b6b), emissiveIntensity: 0.6 }), g, -0.18, 0.86, 0.67)
    add(new THREE.SphereGeometry(0.035, 16, 12), M(0x1a2230, { metalness: 0.9, roughness: 0.1 }), g, -0.06, 0.86, 0.67)
    // black optics tower
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.62, 24), black, g, 0, 1.33, -0.12)
    add(new THREE.CylinderGeometry(0.135, 0.135, 0.03, 24), silver, g, 0, 1.65, -0.12)
    box(0.12, 0.16, 0.1, silver, g, 0.17, 1.42, -0.12)
    box(0.1, 0.13, 0.12, silver, g, -0.16, 1.24, -0.06)
    box(0.12, 0.1, 0.1, silver, g, 0.02, 1.52, 0.05)
    add(new THREE.SphereGeometry(0.03, 12, 8), M(0x00e5ff, { emissive: col(0x00e5ff), emissiveIntensity: 1.2 }), g, 0.02, 1.52, 0.105)
    // small antenna
    tube([0.32, 1.04, -0.5], [0.32, 1.3, -0.5], 0.01, silver, g)
    // wheels and arms
    const r = 0.27
    const w = 0.22
    for (const [sx, sz] of corners) {
      const wh = wheel('mapp', r, w)
      wh.position.set(sx * 0.66, r, sz * 0.46)
      g.add(wh)
      tube([sx * 0.38, 0.52, sz * 0.18], [sx * 0.55, r, sz * 0.46], 0.035, silver, g)
    }
    return g
  }

  // ---------- Artemis LTV ----------
  function buildLTV() {
    const g = new THREE.Group()
    const white = M(0xf3f6fa, { metalness: 0.15, roughness: 0.45 })
    const frame = M(0xe7edf4, { metalness: 0.35, roughness: 0.35 })
    const grey = M(0x8d99a6, { metalness: 0.6, roughness: 0.4 })
    // heavy chassis and battery bank
    box(1.45, 0.24, 2.5, white, g, 0, 0.66, 0)
    box(1.2, 0.12, 2.2, grey, g, 0, 0.5, 0)
    box(0.9, 0.12, 0.02, M(0x00a8ff, { emissive: col(0x0090ff), emissiveIntensity: 0.6 }), g, 0, 0.68, 1.26)
    box(0.18, 0.08, 0.02, M(0xff4757, { emissive: col(0xff4757), emissiveIntensity: 0.5 }), g, 0.55, 0.68, 1.26)
    box(1.1, 0.3, 0.45, white, g, 0, 0.92, -1.0)
    // roll cage
    const y0 = 0.78
    const yT = 2.0
    const fl: Vec3 = [-0.62, y0, 0.75]
    const fr: Vec3 = [0.62, y0, 0.75]
    const rl: Vec3 = [-0.62, y0, -0.7]
    const rr: Vec3 = [0.62, y0, -0.7]
    const tfl: Vec3 = [-0.55, yT, 0.35]
    const tfr: Vec3 = [0.55, yT, 0.35]
    const trl: Vec3 = [-0.55, yT, -0.55]
    const trr: Vec3 = [0.55, yT, -0.55]
    const bars: Array<[Vec3, Vec3]> = [[fl, tfl], [fr, tfr], [rl, trl], [rr, trr], [tfl, tfr], [trl, trr], [tfl, trl], [tfr, trr]]
    for (const [a, b] of bars) tube(a, b, 0.045, frame, g)
    box(1.2, 0.05, 1.0, white, g, 0, yT + 0.04, -0.1)
    // blue beacon on top
    const beacon = add(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd8fbff }), g, 0.3, yT + 0.13, 0.32)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    glow.scale.set(0.9, 0.9, 0.9)
    beacon.add(glow)
    // seats and two astronauts
    for (const x of [-0.33, 0.33]) {
      box(0.42, 0.06, 0.45, M(0x3d4651, { roughness: 0.7 }), g, x, 0.82, -0.12)
      box(0.42, 0.5, 0.06, M(0x3d4651, { roughness: 0.7 }), g, x, 1.08, -0.37)
      astronaut(g, x, 0.86, -0.12)
    }
    // yellow console
    const con = box(0.5, 0.06, 0.26, M(0xffd147, { metalness: 0.3, roughness: 0.4 }), g, 0, 1.12, 0.48)
    con.rotation.x = -0.5
    tube([0, 0.78, 0.55], [0, 1.1, 0.5], 0.03, frame, g)
    // open wheels and white fenders
    const r = 0.42
    const w = 0.26
    for (const [sx, sz] of corners) {
      const wh = wheel('ltv', r, w)
      wh.position.set(sx * 0.86, r, sz * 1.02)
      g.add(wh)
      fender(r * 1.15, w * 1.2, M(0xf6f8fb, { side: THREE.DoubleSide, roughness: 0.45 }), g, sx * 0.86, r, sz * 1.02)
      tube([sx * 0.6, 0.6, sz * 1.02], [sx * 0.76, r, sz * 1.02], 0.04, grey, g)
    }
    const flag = add(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }), g, 0.73, 0.66, 0.6)
    flag.rotation.y = Math.PI / 2
    g.userData.beaconGlow = glow
    return g
  }

  // ---------- LRV (Apollo 15-17), NSSDC sizes ----------
  // chassis 3.10 m, wheelbase 2.30 m, wheels 81.8 cm x 23 cm, height 1.14 m
  function buildLRV() {
    const g = new THREE.Group()
    const alu = M(0xd3dbe3, { metalness: 0.6, roughness: 0.35 })
    const dark = M(0x2a2e33, { metalness: 0.4, roughness: 0.6 })
    const orange = M(0xa8683a, { metalness: 0.15, roughness: 0.55, side: THREE.DoubleSide })
    const white = M(0xeef2f6, { roughness: 0.5 })
    const strap = M(0x3a3f45, { roughness: 0.8 })
    box(1.14, 0.06, 3.1, alu, g, 0, 0.62, 0) // chassis
    box(1.05, 0.28, 1.2, dark, g, 0, 0.45, -0.1) // dark sides (batteries, electronics)
    for (const x of [-0.3, 0.3]) {
      // folding seats
      box(0.5, 0.05, 0.5, white, g, x, 0.72, -0.25)
      tube([x - 0.24, 0.7, -0.5], [x - 0.24, 1.14, -0.55], 0.018, alu, g)
      tube([x + 0.24, 0.7, -0.5], [x + 0.24, 1.14, -0.55], 0.018, alu, g)
      tube([x - 0.24, 1.14, -0.55], [x + 0.24, 1.14, -0.55], 0.018, alu, g)
      for (let i = 0; i < 3; i++) box(0.46, 0.06, 0.012, strap, g, x, 0.84 + i * 0.1, -0.53 - i * 0.013)
    }
    box(0.42, 0.26, 0.3, white, g, 0, 0.82, 0.55) // control console
    tube([0, 0.7, 0.42], [0, 0.95, 0.38], 0.02, alu, g) // T-handle
    box(0.9, 0.2, 0.55, white, g, 0, 0.75, 1.2) // front electronics
    box(0.9, 0.22, 0.6, M(0xc8ccd2, { metalness: 0.5, roughness: 0.4 }), g, 0, 0.75, -1.25) // rear pallet
    // mast and umbrella high-gain antenna
    const top: Vec3 = [-0.4, 1.75, 1.05]
    tube([-0.4, 0.75, 1.05], top, 0.025, alu, g)
    const dish = add(
      new THREE.ConeGeometry(0.46, 0.2, 14, 1, true),
      M(0xe8e4dc, { metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide, flatShading: true }),
      g, top[0], top[1] + 0.08, top[2],
    )
    dish.rotation.x = Math.PI
    dish.rotation.z = 0.35
    tube([0.42, 0.75, 1.35], [0.42, 1.15, 1.35], 0.025, alu, g) // TV camera (GCTA)
    box(0.16, 0.14, 0.24, white, g, 0.42, 1.22, 1.38)
    const r = 0.409
    const w = 0.23
    for (const [sx, sz] of corners) {
      const wh = wheel('apollo', r, w)
      wh.position.set(sx * 0.92, r, sz * 1.15)
      g.add(wh)
      fender(r * 1.16, w * 1.35, orange, g, sx * 0.92, r, sz * 1.15)
      tube([sx * 0.55, 0.6, sz * 1.15], [sx * 0.8, r, sz * 1.15], 0.03, alu, g)
    }
    const flag = add(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.6 }), g, 1.09, 0.8, 1.15)
    flag.rotation.y = Math.PI / 2
    return g
  }

  // ---------- VIPER (flight configuration), 1.53 x 1.53 x 2.45 m ----------
  function buildVIPER() {
    const g = new THREE.Group()
    const mli = M(0xdfe3e8, { metalness: 0.35, roughness: 0.45 })
    const gold = M(0xc4923f, { metalness: 0.75, roughness: 0.35 })
    const dark = M(0x2b3036, { metalness: 0.5, roughness: 0.5 })
    const solar = new THREE.MeshStandardMaterial({ map: solarTex, metalness: 0.5, roughness: 0.25 })
    box(1.2, 0.18, 1.25, gold, g, 0, 0.5, 0) // chassis
    box(1.1, 1.05, 1.15, mli, g, 0, 1.12, 0) // body (warm box)
    box(0.03, 1.0, 1.15, solar, g, -0.57, 1.12, 0) // left solar panel
    box(0.03, 1.0, 1.15, solar, g, 0.57, 1.12, 0) // right solar panel
    box(1.1, 1.0, 0.03, solar, g, 0, 1.12, -0.59) // rear solar panel
    box(1.0, 0.04, 1.05, M(0xf3f5f8, { roughness: 0.3 }), g, 0, 1.66, 0) // top radiator
    for (let i = -2; i <= 2; i++) box(0.95, 0.012, 0.02, mli, g, 0, 1.69, i * 0.2)
    // mast with cameras and lights
    const mx = -0.38
    const mz = 0.48
    tube([mx, 1.66, mz], [mx, 2.3, mz], 0.035, mli, g)
    box(0.42, 0.13, 0.16, mli, g, mx + 0.08, 2.36, mz + 0.02)
    for (const dx of [-0.08, 0.2]) {
      const lens = add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 14), M(0x0d1218, { metalness: 0.9, roughness: 0.1 }), g, mx + dx, 2.36, mz + 0.11)
      lens.rotation.x = Math.PI / 2
    }
    box(0.08, 0.06, 0.04, dark, g, mx + 0.33, 2.36, mz + 0.06) // antenna / sensor
    // LED headlights (driving in permanent shadow)
    for (const x of [-0.35, 0.35]) {
      box(0.18, 0.06, 0.03, M(0x9fd9ff, { emissive: col(0x7cc8ff), emissiveIntensity: 1.1 }), g, x, 0.75, 0.63)
    }
    box(0.5, 0.25, 0.04, M(0xd0d5db, { metalness: 0.4, roughness: 0.35 }), g, 0.15, 1.0, 0.585) // front radiator
    // high-gain antenna
    tube([0.35, 1.66, -0.35], [0.35, 1.95, -0.35], 0.02, mli, g)
    const hga = add(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20), mli, g, 0.35, 1.98, -0.35)
    hga.rotation.x = 0.5
    // TRIDENT drill (1 m) under the belly
    box(0.14, 0.75, 0.14, dark, g, 0, 0.65, 0.35)
    // wheels and active suspension
    const r = 0.25
    const w = 0.25
    for (const [sx, sz] of corners) {
      const wh = wheel('viper', r, w)
      wh.position.set(sx * 0.82, r, sz * 0.62)
      g.add(wh)
      tube([sx * 0.55, 0.52, sz * 0.4], [sx * 0.75, r + 0.05, sz * 0.62], 0.04, gold, g)
      box(0.12, 0.12, 0.18, gold, g, sx * 0.62, 0.5, sz * 0.45)
    }
    return g
  }

  const models: Record<RoverModel, THREE.Group> = {
    lrv: buildLRV(), viper: buildVIPER(), ltv: buildLTV(), mapp: buildMAPP(),
  }
  return { models, textures, shadowTex, dispose() {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    for (const model of Object.values(models)) model.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        if (object instanceof THREE.Mesh) geometries.add(object.geometry)
        for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m)
      }
    })
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose())
  } }
}
