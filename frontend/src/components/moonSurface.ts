import * as THREE from 'three'
import { capAtLevel1, takesLargeImages, textureLimitFor, type MoonTier } from './moonBudget'
import { fitTexture } from './textureBudget'
import { capLatLon, capPoint, isCapProjection, type CapProjection } from '../domain/cap'
import { lunarLambert } from '../domain/regolith'
import { toVector } from '../domain/sky'
import { regolithMaterial } from './regolith'

/** Where the globe's images are served. In production they sit beside the page, at /moon/. */
const MOON_URL = (import.meta.env.VITE_MOON_URL || `${import.meta.env.BASE_URL}moon/`).replace(/\/?$/, '/')

/**
 * Goes on every image address. Bump it when the images change, or when an address has answered with
 * something else: a browser keeps an answer for hours and a reload of the page does not refetch them.
 */
const MOON_VERSION = '4'
export const versioned = (file: string) => `${MOON_URL}${file}?v=${MOON_VERSION}`

/** The relief is stretched a little, so craters read under a Sun that is almost on the horizon. */
const RELIEF = 1.6
const CAP_RELIEF = 2.2
const CAP_LIFT = 1.0006
const FINE_LIFT = 1.0009
const CAP_SEGMENTS = 160
/** The cap fades into the sphere over its outer fifth, so its square edge never shows. */
const FADE_FROM = 0.8

/**
 * How strong the Sun's light was on the globe before it had the regolith law (plain Lambert, which
 * returns the full light at the sub-solar point).
 */
const SUN_STRENGTH_LAMBERT = 3.2

/**
 * The Sun's light strength on the globe under the Lunar-Lambert law (`domain/regolith.ts`), the same
 * law the ground view uses. Seen from orbit the eye is near the normal (μ about 1), where the law
 * returns about 72% of Lambert's light, so the light is raised by that much and the sub-solar
 * point keeps the brightness it had; what changes is how the light falls off towards the limb and
 * the terminator.
 */
export const MOON_SUN_STRENGTH = SUN_STRENGTH_LAMBERT / lunarLambert(1, 1)

/** The grey sphere of the globe, as dry regolith returns the Sun (Lunar-Lambert), ready for `dressMoon` to put colour and relief on. */
export function moonMaterial(): THREE.MeshLambertMaterial {
  return regolithMaterial({ color: 0x9a9891 })
}

function capGeometry(cap: CapProjection, lift: number): THREE.BufferGeometry {
  const n = CAP_SEGMENTS
  const half = (cap.size_px * cap.metres_per_pixel) / 2
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const { x, y } = capPoint(cap, (i / n) * cap.size_px, (j / n) * cap.size_px)
      const place = capLatLon(x, y, cap.sphere_radius_m)
      const [px, py, pz] = toVector(place.latitude_deg, place.longitude_deg)
      positions.push(px * lift, py * lift, pz * lift)
      normals.push(px, py, pz)
      uvs.push(i / n, 1 - j / n)
      const edge = Math.max(Math.abs(x), Math.abs(y)) / half
      const fade = Math.min(1, Math.max(0, (edge - FADE_FROM) / (1 - FADE_FROM)))
      colors.push(1, 1, 1, 1 - fade * fade * (3 - 2 * fade))
    }
  }
  // 0° longitude is up in the image and +x on the globe, 90°E is right and -z: seen from below the
  // pole that turns clockwise, so the triangles are wound to face outwards.
  const index: number[] = []
  const at = (i: number, j: number) => j * (n + 1) + i
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      index.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1))
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  geometry.setIndex(index)
  return geometry
}

/** What `dressMoon` hands back: the way to free everything, and the switch for the polar level. */
export interface MoonDress {
  /** Frees every texture, geometry and material it made, and takes its meshes off the scene. */
  dispose(): void
  /**
   * Tells the Moon whether the view is at the polar level (level 2, "South Pole in detail"). Entering it loads
   * the fine patch of the pole (and, on the low tier, the cap); leaving it frees them. Idempotent: it is called every frame.
   */
  setPolar(on: boolean): void
}

export interface MoonOptions {
  /** Which images this device takes and how far they are fitted (`moonBudget.ts`). */
  tier: MoonTier
  /** The GPU's MAX_TEXTURE_SIZE; the tier's limit never goes above it. */
  maxTextureSize?: number
  /** Called once the first whole-Moon colour and relief have arrived, or turned out to be missing. */
  onDressed?: () => void
  /** Told which whole-Moon colour is on the sphere each time it changes: the 4096 px one, then the 8192 px one. */
  onColour?: (size: '4k' | '8k') => void
  /** Told when the fine patch of the pole is on the Moon (true) and when it has been freed (false). */
  onPolar?: (shown: boolean) => void
}

/** What one level made, to free when the level is left. A load that ends after that frees what it brings. */
interface Made {
  gone: boolean
  things: { dispose(): void }[]
  meshes: THREE.Object3D[]
}

/**
 * Dresses the grey sphere with what the orbiters measured: LROC colour and LOLA relief on the whole
 * Moon, and patches over the south pole. Every image is optional; a missing one changes nothing.
 * Which images, and how far each is fitted before its first GPU upload, is the tier's (`moonBudget.ts`).
 *
 * Level 1 (always on): the whole-Moon pair, and the 148 m cap unless the tier is low. Level 2
 * (`setPolar(true)`): the 22.5 m fine pole, and the cap for the low tier; freed by `setPolar(false)`.
 */
export function dressMoon(
  scene: THREE.Scene,
  material: THREE.MeshLambertMaterial,
  anisotropy: number,
  options: MoonOptions,
): MoonDress {
  const { tier, onDressed, onColour, onPolar } = options
  const large = takesLargeImages(tier)
  // Support for an 8192-pixel texture is not evidence that enough memory is available: images are bounded
  // by the tier before upload, whatever the GPU says it can hold.
  const textureLimit = textureLimitFor(tier, options.maxTextureSize ?? 16384)
  const base: Made = { gone: false, things: [], meshes: [] }
  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')

  const free = (made: Made) => {
    made.gone = true
    for (const mesh of made.meshes) scene.remove(mesh)
    for (const thing of made.things) thing.dispose()
    made.meshes = []
    made.things = []
  }

  const image = (made: Made, file: string, colour: boolean) =>
    new Promise<THREE.Texture | null>((resolve) => {
      loader.load(
        versioned(file),
        (texture) => {
          if (made.gone) {
            texture.dispose()
            resolve(null)
            return
          }
          if (!fitTexture(texture, textureLimit)) {
            texture.dispose()
            resolve(null)
            return
          }
          texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace
          texture.anisotropy = anisotropy
          made.things.push(texture)
          resolve(texture)
        },
        undefined,
        () => resolve(null),
      )
    })

  const putColour = (map: THREE.Texture, size: '4k' | '8k') => {
    if (base.gone) return
    material.map = map
    material.color.set(0xffffff)
    material.needsUpdate = true
    onColour?.(size)
  }
  const putRelief = (normal: THREE.Texture) => {
    if (base.gone) return
    material.normalMap = normal
    material.normalScale.set(RELIEF, RELIEF)
    material.needsUpdate = true
  }

  // Everyone gets the 4096 px colour and relief first, about 2.5 MB, and the Moon shows with them.
  // A strong device then swaps in the 8192 px ones, about 10.5 MB, when they arrive. During a cold
  // cache the server took 28 s to serve the 8192 px colour: the Moon waited for it, then showed grey.
  const colour = image(base, 'moon_color_4k.webp', true)
  const relief = image(base, 'moon_normal_4k.webp', false)
  void colour.then((map) => map && putColour(map, '4k'))
  void relief.then((normal) => normal && putRelief(normal))
  void Promise.all([colour, relief]).then(([smallColour, smallRelief]) => {
    if (base.gone) return
    onDressed?.()
    if (!large) return
    // The finer pair is asked for only now, so it never slows the first one down.
    void image(base, 'moon_color_8k.webp', true).then((map) => {
      if (!map || base.gone) return
      putColour(map, '8k')
      smallColour?.dispose()
    })
    void image(base, 'moon_normal_8k.webp', false).then((normal) => {
      if (!normal || base.gone) return
      putRelief(normal)
      smallRelief?.dispose()
    })
  })

  // A patch of finer relief laid over the sphere: its projection file, its normals and its grey. What it
  // makes belongs to `made`, so whoever owns the level can free it.
  const patch = (
    made: Made,
    projectionFile: string,
    files: (doc: CapProjection) => { normal: string; albedo: string },
    lift: number,
    order: number,
  ) => {
    void fetch(versioned(projectionFile))
      .then((response) => (response.ok ? response.json() : null))
      .then((doc: unknown) => (isCapProjection(doc) ? doc : null))
      .catch(() => null)
      .then(async (cap) => {
        if (made.gone || !cap) return
        const names = files(cap)
        const [normal, albedo] = await Promise.all([image(made, names.normal, false), image(made, names.albedo, true)])
        if (made.gone || !normal) return
        const geometry = capGeometry(cap, lift)
        const skin = regolithMaterial({
          map: albedo,
          normalMap: normal,
          normalScale: new THREE.Vector2(CAP_RELIEF, CAP_RELIEF),
          vertexColors: true,
          transparent: true,
          depthWrite: false,
        })
        // The patch's grey only carries height; this lifts it to the brightness LROC measured past 80°S.
        skin.color.setRGB(3.5, 3.42, 3.15)
        const mesh = new THREE.Mesh(geometry, skin)
        mesh.renderOrder = order
        scene.add(mesh)
        made.meshes.push(mesh)
        made.things.push(geometry, skin)
        if (order === 2) onPolar?.(true)
      })
  }

  // 148 m per pixel down to 80°S: level 1's, unless the tier is low (then level 2's, with the fine pole).
  const loadCap = (made: Made) =>
    patch(made, 'south_cap.json', () => ({ normal: 'south_cap_normal.webp', albedo: 'south_cap_albedo.webp' }), CAP_LIFT, 1)
  if (capAtLevel1(tier)) loadCap(base)

  // 22.5 m per pixel around the Sites, south of about 87°S: level 2's, for as long as the view is there.
  let polar: Made | null = null
  const setPolar = (on: boolean) => {
    if (base.gone) return
    if (on && !polar) {
      const made: Made = { gone: false, things: [], meshes: [] }
      polar = made
      if (!capAtLevel1(tier)) loadCap(made)
      patch(
        made,
        'south_pole_fine.json',
        (doc) => ({
          normal: (large ? doc.files?.normal : doc.files?.normal_small) ?? 'south_pole_fine_normal_4k.webp',
          albedo: doc.files?.albedo ?? 'south_pole_fine_albedo.webp',
        }),
        FINE_LIFT,
        2,
      )
    } else if (!on && polar) {
      const shown = polar.meshes.some((mesh) => mesh.renderOrder === 2)
      free(polar)
      polar = null
      if (shown) onPolar?.(false)
    }
  }

  return {
    setPolar,
    dispose: () => {
      if (polar) free(polar)
      polar = null
      free(base)
    },
  }
}
