import { ownRenderer, releaseRenderer } from '../rendererLifetime'
/*
 * Procedural 3D rovers for the vehicle picker.
 *
 * Ported from nasa-2026 `src/cockpit_missao_lunar.html` (commit 9c923e0, the
 * `Rover3D` IIFE, lines 2774-3478): environment map and lights (2793-2827),
 * helpers and textures (2829-2992), buildMAPP (2994-3032), buildLTV (3087-3133),
 * buildLRV (3136-3175), buildVIPER (3178-3221), finalize (3310-3337), drag,
 * framing and snapshot (3348-3476). The Mars rovers, the unused buildApollo and
 * the selection ring were left out.
 *
 * These are illustrative models, not CAD: shapes and colours follow photos and
 * the published overall sizes, nothing more.
 *
 * Changes for three 0.187: outputEncoding/sRGBEncoding became
 * outputColorSpace/colorSpace = SRGBColorSpace; Color(hex) now converts sRGB to
 * linear by itself, so the old convertSRGBToLinear() call is gone; lights are
 * physically based now, so the hemisphere and directional intensities of the
 * prototype (r128, legacy lights) are multiplied by Math.PI to keep the look.
 */
import * as THREE from 'three'
import { createRoverFleet } from './roverModels'

export type RoverModel = 'lrv' | 'viper' | 'ltv' | 'mapp'

export interface RoverStage {
  /** Draw this rover in the canvas, turning slowly (no auto-turn under reduced motion); a pointer drag turns it. */
  show(model: RoverModel): void
  /** A still picture of a rover (transparent background), as a PNG data URL, for the neighbours in the row. */
  snapshot(model: RoverModel, width: number, height: number): string
  /** Call when the canvas changes size. */
  resize(): void
  /** Stops the loop, removes listeners and frees GPU memory (geometries, materials, textures, renderer). */
  dispose(): void
}


interface Framed {
  root: THREE.Group
  pivot: THREE.Group
  model: THREE.Group
  height: number
  radius: number
  glow: THREE.Sprite | null
}

// The prototype's "lineup" view (attach("lineup", ...), line 5917)
const VIEW = { baseYaw: -0.75, speed: 0.3, pitch: 0.28, margin: 0.92 }
// Radians per pixel of horizontal drag, as in enableDrag
const DRAG_GAIN = 0.012
// Legacy (r128) lights were PI times brighter than physical ones
const LIGHT_SCALE = Math.PI

/** null when WebGL cannot start: the caller then draws its 2D fallback. */
export function createRoverStage(canvas: HTMLCanvasElement, options: { reducedMotion: boolean }): RoverStage | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
    ownRenderer(renderer)
  } catch {
    return null
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  // Textures not owned by a material map list are tracked here so dispose frees them
  const textures: THREE.Texture[] = []
  const renderTargets: THREE.WebGLRenderTarget[] = []

  // Simple reflective sky (light above, dark ground below) so the metals have something to mirror
  {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 128
    const g = c.getContext('2d')
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 128)
      grad.addColorStop(0, '#dfeeff')
      grad.addColorStop(0.45, '#7c93ad')
      grad.addColorStop(0.55, '#2a3442')
      grad.addColorStop(1, '#0b0f16')
      g.fillStyle = grad
      g.fillRect(0, 0, 256, 128)
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.ellipse(70, 40, 26, 14, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#9fe9ff'
      g.beginPath()
      g.ellipse(190, 46, 30, 10, 0, 0, Math.PI * 2)
      g.fill()
    }
    const tex = new THREE.CanvasTexture(c)
    tex.mapping = THREE.EquirectangularReflectionMapping
    tex.colorSpace = THREE.SRGBColorSpace
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromEquirectangular(tex)
    scene.environment = environment.texture
    renderTargets.push(environment)
    tex.dispose()
    pmrem.dispose()
  }

  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a1410, 0.45 * LIGHT_SCALE))
  const keyLight = new THREE.DirectionalLight(0xfff0d2, 2.4 * LIGHT_SCALE)
  keyLight.position.set(4, 4.5, 3.5)
  scene.add(keyLight)
  const rimLight = new THREE.DirectionalLight(0x56dcff, 1.4 * LIGHT_SCALE)
  rimLight.position.set(-4, 2.5, -4)
  scene.add(rimLight)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4 * LIGHT_SCALE)
  fillLight.position.set(-3, 1, 4)
  scene.add(fillLight)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)

  const { models: rawModels, textures: modelTextures, shadowTex } = createRoverFleet()
  textures.push(...modelTextures)

  // Normalise size, centre on the origin and add a soft ground shadow
  function finalize(model: THREE.Group): Framed {
    const root = new THREE.Group()
    const pivot = new THREE.Group()
    root.add(pivot)
    pivot.add(model)
    const bb = new THREE.Box3().setFromObject(model)
    const size = bb.getSize(new THREE.Vector3())
    const s = 2.4 / Math.max(size.x, size.z, size.y * 1.15)
    model.scale.setScalar(s)
    const bb2 = new THREE.Box3().setFromObject(model)
    const c = bb2.getCenter(new THREE.Vector3())
    model.position.set(-c.x, -bb2.min.y, -c.z)
    const size2 = bb2.getSize(new THREE.Vector3())
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.005
    const sr = Math.hypot(size2.x, size2.z) * 1.05
    shadow.scale.set(sr, sr, 1)
    root.add(shadow)
    root.visible = false
    scene.add(root)
    const glow = model.userData.beaconGlow
    return {
      root, pivot, model,
      height: size2.y,
      radius: Math.hypot(size2.x * 0.5, size2.y * 0.5, size2.z * 0.5),
      glow: glow instanceof THREE.Sprite ? glow : null,
    }
  }

  const models: Record<RoverModel, Framed> = {
    lrv: finalize(rawModels.lrv),
    viper: finalize(rawModels.viper),
    ltv: finalize(rawModels.ltv),
    mapp: finalize(rawModels.mapp),
  }

  // ---------- view state ----------
  const speed = options.reducedMotion ? 0 : VIEW.speed
  let current: RoverModel = 'lrv'
  let spin = 0 // auto-turn accumulated so far (rad)
  let userYaw = 0 // drag offset (rad)
  let pulseT = 0 // time for the LTV beacon pulse (s)
  let disposed = false
  let rafId = 0
  let lastMs: number | null = null

  // Renders one model with the lineup framing at the renderer's current size
  function draw(key: RoverModel, yaw: number, t: number, cw: number, ch: number) {
    const m = models[key]
    for (const k of Object.keys(models) as RoverModel[]) models[k].root.visible = k === key
    m.pivot.rotation.y = yaw
    if (m.glow) {
      const k = 0.8 + 0.25 * Math.sin(t * 3.2)
      m.glow.scale.set(k, k, k)
    }
    const aspect = cw / ch
    camera.aspect = aspect
    const vfov = THREE.MathUtils.degToRad(camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    const dist = (m.radius * VIEW.margin) / Math.sin(Math.min(vfov, hfov) / 2)
    const cy = m.height * 0.45
    camera.position.set(0, cy + Math.sin(VIEW.pitch) * dist, Math.cos(VIEW.pitch) * dist)
    camera.lookAt(0, cy, 0)
    camera.updateProjectionMatrix()
    renderer.render(scene, camera)
  }

  function fitCanvas(): boolean {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h) return false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const size = renderer.getSize(new THREE.Vector2())
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false)
    return true
  }

  function renderLive() {
    if (disposed || !fitCanvas()) return
    draw(current, VIEW.baseYaw + spin + userYaw, pulseT, canvas.clientWidth, canvas.clientHeight)
  }

  function frame(ms: number) {
    rafId = 0
    if (disposed || !canvas.isConnected) return
    const dt = lastMs === null ? 0 : Math.min(0.1, (ms - lastMs) / 1000)
    lastMs = ms
    spin += dt * speed
    if (!options.reducedMotion) pulseT += dt
    renderLive()
    // Under reduced motion nothing moves on its own, so frames are only drawn on demand
    if (!options.reducedMotion) rafId = requestAnimationFrame(frame)
  }

  function requestFrame() {
    if (disposed || rafId) return
    if (options.reducedMotion) lastMs = null
    rafId = requestAnimationFrame(frame)
  }

  // ---------- drag to turn (auto-turn carries on afterwards) ----------
  let dragging = false
  let lastX = 0
  let pointerId = -1
  const onDown = (e: PointerEvent) => {
    dragging = true
    lastX = e.clientX
    pointerId = e.pointerId
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      // capture can fail for a pointer that is already gone; dragging still works inside the canvas
    }
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointerId) return
    userYaw += (e.clientX - lastX) * DRAG_GAIN
    lastX = e.clientX
    requestFrame()
  }
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    dragging = false
    pointerId = -1
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)

  return {
    show(model) {
      current = model
      requestFrame()
    },

    snapshot(model, width, height) {
      if (disposed || width <= 0 || height <= 0) return ''
      // Borrow the drawing buffer at the requested size, read it, then put the live view back
      // in the same task, so the page never composites the borrowed frame
      const ratio = renderer.getPixelRatio()
      const size = renderer.getSize(new THREE.Vector2())
      renderer.setPixelRatio(1)
      renderer.setSize(width, height, false)
      draw(model, VIEW.baseYaw, 0, width, height)
      const url = canvas.toDataURL('image/png')
      renderer.setPixelRatio(ratio)
      renderer.setSize(size.x, size.y, false)
      renderLive()
      return url
    },

    resize() {
      renderLive()
    },

    dispose() {
      if (disposed) return
      disposed = true
      if (rafId) cancelAnimationFrame(rafId)
      rafId = 0
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      const materials = new Set<THREE.Material>()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          o.geometry.dispose()
          const mat: THREE.Material | THREE.Material[] = o.material
          for (const m of Array.isArray(mat) ? mat : [mat]) materials.add(m)
        }
      })
      for (const m of materials) m.dispose()
      for (const t of textures) t.dispose()
      for (const target of renderTargets) target.dispose()
      scene.environment = null
      scene.clear()
      releaseRenderer(renderer)
    },
  }
}
