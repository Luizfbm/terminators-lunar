import * as THREE from 'three'
import { fitTexture } from './textureBudget'
import { capLatLon, capPoint, isCapProjection, type CapProjection } from '../domain/cap'
import { toVector } from '../domain/sky'

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

/**
 * Dresses the grey sphere with what the orbiters measured: LROC colour and LOLA relief on the whole
 * Moon, and a finer patch over the south pole. Every image is optional; a missing one changes nothing.
 * Returns the function that frees it all.
 */
export function dressMoon(
  scene: THREE.Scene,
  material: THREE.MeshStandardMaterial,
  anisotropy: number,
  /** Whether this device can take the 8192 px image of the fine level; a phone gets the 4096 px one. */
  large: boolean,
  /** Called once the first whole-Moon colour and relief have arrived, or turned out to be missing. */
  onDressed?: () => void,
  /** Told which whole-Moon colour is on the sphere each time it changes: the 4096 px one, then the 8192 px one. */
  onColour?: (size: '4k' | '8k') => void,
  polarOverlays = true,
  textureLimit = 2048,
  onPolar?: () => void,
): (() => void) & { loadPolar: () => void } {
  let gone = false
  const made: { dispose(): void }[] = []
  const overlays: THREE.Mesh[] = []
  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')

  const image = (file: string, colour: boolean) =>
    new Promise<THREE.Texture | null>((resolve) => {
      loader.load(
        versioned(file),
        (texture) => {
          if (gone) {
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
          made.push(texture)
          resolve(texture)
        },
        undefined,
        () => resolve(null),
      )
    })

  const putColour = (map: THREE.Texture, size: '4k' | '8k') => {
    if (gone) return
    material.map = map
    material.color.set(0xffffff)
    material.needsUpdate = true
    onColour?.(size)
  }
  const putRelief = (normal: THREE.Texture) => {
    if (gone) return
    material.normalMap = normal
    material.normalScale.set(RELIEF, RELIEF)
    material.needsUpdate = true
  }

  // Download size is not GPU memory: images are bounded before upload. In particular,
  // support for an 8192-pixel texture is not evidence that enough memory is available.
  const colour = image('moon_color_4k.webp', true)
  const relief = image('moon_normal_4k.webp', false)
  void colour.then((map) => map && putColour(map, '4k'))
  void relief.then((normal) => normal && putRelief(normal))
  void Promise.all([colour, relief]).then(([smallColour, smallRelief]) => {
    if (gone) return
    onDressed?.()
    if (!large) return
    // The finer pair is asked for only now, so it never slows the first one down.
    void image('moon_color_8k.webp', true).then((map) => {
      if (!map || gone) return
      putColour(map, '8k')
      smallColour?.dispose()
    })
    void image('moon_normal_8k.webp', false).then((normal) => {
      if (!normal || gone) return
      putRelief(normal)
      smallRelief?.dispose()
    })
  })

  // A patch of finer relief laid over the sphere: its projection file, its normals and its grey.
  const patch = (
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
        if (gone || !cap) return
        const names = files(cap)
        const [normal, albedo] = await Promise.all([image(names.normal, false), image(names.albedo, true)])
        if (gone || !normal) return
        const geometry = capGeometry(cap, lift)
        const skin = new THREE.MeshStandardMaterial({
          map: albedo,
          normalMap: normal,
          normalScale: new THREE.Vector2(CAP_RELIEF, CAP_RELIEF),
          roughness: 1,
          metalness: 0,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
        })
        // The patch's grey only carries height; this lifts it to the brightness LROC measured past 80°S.
        skin.color.setRGB(3.5, 3.42, 3.15)
        const mesh = new THREE.Mesh(geometry, skin)
        mesh.renderOrder = order
        scene.add(mesh)
        overlays.push(mesh)
        made.push(geometry, skin)
        if (order === 2) onPolar?.()
      })
  }

  // 148 m per pixel down to 80°S, then 22.5 m per pixel around the Sites, south of about 87°S.
  let polarStarted = false
  const loadPolar = () => {
    if (gone || polarStarted) return
    polarStarted = true
    patch('south_cap.json', () => ({ normal: 'south_cap_normal.webp', albedo: 'south_cap_albedo.webp' }), CAP_LIFT, 1)
    patch(
      'south_pole_fine.json',
      (doc) => ({
        normal: (large ? doc.files?.normal : doc.files?.normal_small) ?? 'south_pole_fine_normal_4k.webp',
        albedo: doc.files?.albedo ?? 'south_pole_fine_albedo.webp',
      }),
      FINE_LIFT,
      2,
    )

  }
  if (polarOverlays) loadPolar()
  const dispose = () => {
    gone = true
    material.map = null
    material.normalMap = null
    for (const mesh of overlays) scene.remove(mesh)
    for (const thing of made) thing.dispose()
    overlays.length = 0
    made.length = 0
  }
  return Object.assign(dispose, { loadPolar })
}
