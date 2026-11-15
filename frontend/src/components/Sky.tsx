import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { VisibilityResult } from '../api/client'
import { DIAL_LETTERS, DIAL_TICKS, facingEighth, onDial } from '../domain/compassDial'
import { earthAttitude, earthNorthAt, earthRoll, subLunarPoint } from '../domain/earthFace'
import { belowHorizonMask } from '../domain/bodyGuide'
import { maskElevationAt, sampleAt } from '../domain/sky'
import { blendRim, canTakeFinest, eyeOnMap, GRAIN_DEPTH, GRAIN_PX, grainRepeat, grainTexels } from '../domain/nearGround'
import { direction, EARTH_RADIUS_DEG, groundPositions, groundSpacing, horizonFaceShade, stretched, sunOnGround, turnBetween, wrapAzimuth, type GroundSpacing } from '../domain/skyScene'
import {
  beyondHorizon,
  covers,
  gridTriangles,
  horizonDistanceTable,
  horizonTable,
  mapBoundsOn,
  patchAround,
  patchBounds,
  type HeightMap,
  type Patch,
  type PixelBounds,
} from '../domain/terrain'
import { groundSource } from '../domain/terrainHeights'
import { useI18n } from '../i18n/I18nContext'
import type { GroundMark } from './Ground'
import { regolithMaterial, SHADOW_FLOOR } from './regolith'
import { loadGround, loadPatchGround, loadSiteGround, loadWideGround, type GroundData } from './groundData'
import { EARTH, earthMaterial as makeEarthMaterial, glowTexture, loadEarthMap, SUN } from './spaceBodies'

/** The crest of the horizon: dim all round, and warm where the Sun is behind or beside it. */
const RIDGE = 0x55565d
const RIDGE_LIT = 0xe8c070
/** How far to each side of the Sun the crest catches its light, in degrees of azimuth. */
const LIT_SPREAD_DEG = 55
const STAR = 0xcfd3dc

/** One scene unit is this many metres, so the real ground sits at its real distances. */
const UNIT_M = 100
/** The engine's horizon is a wall this far away, behind the real ground, which reaches 430 km at the corners of its map; the Sun, the Earth and the stars are beyond it. */
const WALL = 6000
const BODIES = 20000
const STARS = 28000
/** The real ground is built at its map's own detail this far to each side of the Site, and coarser from there to the map's edge. */
const GROUND_NEAR_M = 15_000
/** The same, where the Site is only on the wider, coarser map. */
const WIDE_NEAR_M = 20_000
/** The Site needs this much of the map around it for its ground to be worth building. */
const GROUND_MARGIN_M = 10_000
/** The 20 m ground around the Site, where it is published, is built this far to each side of it: the whole square. */
const SITE_NEAR_M = 4_000
/** Regolith: a warm grey. */
const REGOLITH = 0x8d8983
/** The Sun on the ground with its whole disc in view. What is left without it is `SHADOW_FLOOR`: the Moon has no sky. */
const SUNLIGHT = 3.2
/** The fine relief of the image is tilted this much more, to go with the stretched heights. */
const RELIEF = 3
/** What the two lights leave on a surface, as a share of its colour: the renderer spreads light over a hemisphere, a division by pi. */
const FACE_LIGHT = { sunlight: SUNLIGHT / Math.PI, skylight: SHADOW_FLOOR / Math.PI }
const FIELD_OF_VIEW_DEG = 55
const PITCH_MIN_DEG = -12
/**
 * Coming down from the globe (the requirement) the view starts looking at the ground under the
 * Observer and lifts to the horizon; going back up it lowers its eyes the same way.
 */
const LOOKING_DOWN_DEG = -70
const PITCH_MAX_DEG = 70
/** How far one press of an arrow button or key turns the view. */
export const TURN_STEP_DEG = 30
/** The round compass (the requirement), in the units of its viewBox, -50 to 50. */
const DIAL_LETTER_R = 25
const DIAL_TICK_OUT = 42
const DIAL_TICK_IN_MAJOR = 34
const DIAL_TICK_IN_MINOR = 38
/** Below this change of yaw, in degrees, the dial is not redrawn. */
const DIAL_STEP_DEG = 0.05
/**
 * The Sun's and the Earth's arrows, when the body is out of frame or below the horizon: how far
 * their centres stay from the left and right edges, and from the top and bottom ones, so the
 * label fits on screen (the dial and the turn buttons sit in the corners); and how far apart the
 * two sit vertically, so they do not cover each other when both point the same way.
 */
const GUIDE_INSET_X_PX = 105
const GUIDE_INSET_Y_PX = 90
const GUIDE_STACK_PX = 16
/** A body is in frame while its centre is inside this share of the half-width and the half-height. */
const GUIDE_FRAME_X = 0.92
const GUIDE_FRAME_Y = 0.88
const PATH_POINTS = 320
const vector = (azimuthDeg: number, elevationDeg: number, radius: number) =>
  new THREE.Vector3(...direction(azimuthDeg, elevationDeg)).multiplyScalar(radius)

/** A disc that always faces the Observer, `radiusDeg` wide as seen from there. */
function disc(radiusDeg: number, colour: number): THREE.Mesh {
  const radius = BODIES * Math.tan((radiusDeg * Math.PI) / 180)
  return new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color: colour }))
}

/** The same stars on every visit: a small generator with a fixed seed. */
function starPositions(count: number): Float32Array {
  let seed = 20261114
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  const positions = new Float32Array(count * 3)
  for (let index = 0; index < count; index++) {
    const [x, y, z] = direction(random() * 360, (Math.asin(random() * 1.1 - 0.1) * 180) / Math.PI)
    positions.set([x * STARS, y * STARS, z * STARS], index * 3)
  }
  return positions
}

/**
 * The view from the ground in 3D (the requirement). The camera stands at the Observer and turns in
 * place. The Horizon mask is a dark wall of ridges all around; the Sun and the Earth are bodies
 * beyond it, at the azimuth and elevation the engine gives, so the wall hides them when they go
 * behind it. Where the published height map covers the Site (the requirement), the real ground is
 * built in front of the wall and lit from the Sun's side, held under the engine's horizon.
 * Heights are stretched by `stretch`, and the Sun and the Earth with them.
 */
export function Sky({
  result,
  cursorMs,
  stretch,
  mark = null,
  onGround,
  onFailed,
  pose = 'stay',
}: {
  result: VisibilityResult
  cursorMs: number
  stretch: number
  mark?: GroundMark | null
  /** Told how the ground near the Site is known and drawn: the DEM's cell and the metres between points of the mesh, or null for the silhouette. */
  onGround?: (spacing: GroundSpacing | null) => void
  /** Told when the 3D context could not be had after all. */
  onFailed?: () => void
  /** 'arrive' starts looking down and lifts to the horizon; 'leave' lowers the eyes again. Not with reduced motion. */
  pose?: 'arrive' | 'leave' | 'stay'
}) {
  const { t } = useI18n()
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  // The arrows to the Sun and the Earth: their buttons, where each one turns the view to, and the
  // language the frame loop writes their labels in.
  const bodyGuides = useRef<Partial<Record<'sun' | 'earth', HTMLButtonElement>>>({})
  const guideAim = useRef<Partial<Record<'sun' | 'earth', { yaw: number; pitch: number }>>>({})
  const guideText = useRef(t)
  useEffect(() => {
    guideText.current = t
  })
  const ring = useRef<SVGGElement>(null)
  const letters = useRef<(SVGTextElement | null)[]>([])
  // The eighth the view faces, for the compass's accessible name: set only when it changes.
  const [facing, setFacing] = useState<number | null>(null)
  // Where no published polar map holds the Site: the engine's grid on its way, or why it is not there.
  const [groundStatus, setGroundStatus] = useState<'loading' | 'none' | 'failed' | null>(null)
  const retryGround = useRef<(() => void) | null>(null)
  // What the frame loop reads: the latest props, and where the camera is turning to.
  const latest = useRef({ result, cursorMs, stretch, mark, onGround, onFailed, pose })
  const aim = useRef<{ yaw: number; pitch: number } | null>(null)
  useEffect(() => {
    latest.current = { result, cursorMs, stretch, mark, onGround, onFailed, pose }
  })
  // Going back up to the globe, the eyes go down to the ground before the fade.
  useEffect(() => {
    if (pose === 'leave' && aim.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      aim.current.pitch = LOOKING_DOWN_DEG
    }
  }, [pose])
  const turn = (byDeg: number) => {
    if (aim.current) aim.current.yaw += byDeg
  }

  // A marked Occluder turns the view to where it is.
  const markAzimuth = mark?.azimuthDeg ?? null
  useEffect(() => {
    if (markAzimuth !== null && aim.current) aim.current.yaw += turnBetween(aim.current.yaw, markAzimuth)
  }, [markAzimuth])

  useEffect(() => {
    const host = frame.current
    const target = canvas.current
    if (!host || !target) return
    let renderer: THREE.WebGLRenderer
    try {
      // The ground starts two metres from the eye and the stars are far beyond the horizon:
      // a logarithmic depth buffer keeps both sharp.
      renderer = new THREE.WebGLRenderer({ canvas: target, antialias: true, logarithmicDepthBuffer: true })
    } catch {
      // The check for WebGL passed and the context still failed: the ground view falls back to its flat drawing.
      latest.current.onFailed?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x050506)
    const scene = new THREE.Scene()
    // Set when the view is torn down, for whatever is still on its way.
    let gone = false
    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW_DEG, 1, 0.02, 60000)

    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions(1400), 3)),
      new THREE.PointsMaterial({ color: STAR, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.75 }),
    )
    scene.add(stars)

    const sun = disc(1, SUN)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, transparent: true }))
    // The Earth is a ball lit from where the Sun is, so it shows the phase it has from here.
    const earthMaterial = makeEarthMaterial()
    // The map arrives after the first frames; until then, and without it, the Earth is its plain blue.
    let earthMap: THREE.Texture | null = null
    loadEarthMap(
      earthMaterial,
      renderer.capabilities.getMaxAnisotropy(),
      () => gone,
      (texture) => {
        earthMap = texture
        target.dataset.earth = 'mapped'
      },
    )
    // How far north leans on the sky, kept from the last instant it could be worked out.
    let earthLean: number | null = null
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), earthMaterial)
    const sunlight = new THREE.DirectionalLight(0xfff1dc, SUNLIGHT)
    // No sky light: on the Moon nothing scatters the Sun's. A small neutral floor keeps the shadow side readable.
    const floor = new THREE.AmbientLight(0xffffff, SHADOW_FLOOR)
    scene.add(glow, sun, earth, sunlight, floor)

    const path = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: SUN, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.5 }),
    )
    scene.add(path)

    const wall = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }))
    const ridge = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }))
    // The crest and the face of the horizon are recoloured when the Sun has moved along the
    // horizon, or when more or less of its disc is in view.
    let litFor: string | null = null
    const regolith = new THREE.Color(REGOLITH)
    const light = (mask: VisibilityResult['horizon']['samples'], sunAzimuthDeg: number, sunElevationDeg: number, fraction: number) => {
      const dim = new THREE.Color(RIDGE)
      const lit = new THREE.Color(RIDGE_LIT)
      const crest = new Float32Array(mask.length * 3)
      const face = new Float32Array(mask.length * 6)
      mask.forEach((point, at) => {
        const apart = fraction > 0 ? Math.abs(turnBetween(point.azimuth_deg, sunAzimuthDeg)) : 180
        const share = Math.max(0, 1 - apart / LIT_SPREAD_DEG) ** 2
        const colour = dim.clone().lerp(lit, share)
        crest.set([colour.r, colour.g, colour.b], at * 3)
        // The face of the rise that closes the horizon here, lit like the ground around it.
        const shade = horizonFaceShade(point.azimuth_deg, { azimuthDeg: sunAzimuthDeg, elevationDeg: sunElevationDeg, fraction }, FACE_LIGHT)
        face.set([regolith.r * shade, regolith.g * shade, regolith.b * shade, regolith.r * shade, regolith.g * shade, regolith.b * shade], at * 6)
      })
      ridge.geometry.setAttribute('color', new THREE.BufferAttribute(crest, 3))
      wall.geometry.setAttribute('color', new THREE.BufferAttribute(face, 3))
    }
    scene.add(wall, ridge)

    // The real ground, from two published maps of the same Moon: one of the pole, every 90 m out
    // to about 92 km from it, and one of the whole polar cap, every 148 m out to 304 km. Each has
    // its own mesh and its own image of finer relief. Both arrive after the first frames.
    const coarse = window.matchMedia('(pointer: coarse)').matches
    // A grain of regolith on every level (the requirement), texture only: a texel is a metre wide on
    // the ground, far under any DEM cell, and it tints the colour without moving a single point.
    // The ground is brightened by the grain's mean, so its colour on average stays the regolith's.
    const grainImage = new Uint8Array(GRAIN_PX * GRAIN_PX * 4)
    grainTexels().forEach((value, at) => {
      const byte = Math.round(value * 255)
      grainImage.set([byte, byte, byte, 255], at * 4)
    })
    const grain = new THREE.DataTexture(grainImage, GRAIN_PX, GRAIN_PX, THREE.RGBAFormat)
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping
    grain.magFilter = THREE.LinearFilter
    grain.minFilter = THREE.LinearMipmapLinearFilter
    grain.generateMipmaps = true
    grain.colorSpace = THREE.NoColorSpace
    grain.needsUpdate = true
    const grained = new THREE.Color(REGOLITH).multiplyScalar(1 / (1 - GRAIN_DEPTH / 2))
    const level = (relief: boolean) => {
      const material = regolithMaterial({ color: grained, normalScale: new THREE.Vector2(RELIEF, RELIEF) })
      material.map = grain.clone()
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
      mesh.visible = false
      scene.add(mesh)
      // `settled`: the map has arrived, or is known not to come, so whether it holds the Site is known.
      return { data: null as GroundData | null, mesh, material, relief: null as THREE.Texture | null, reliefAsked: !relief, settled: false }
    }
    const fine = level(true)
    const wide = level(true)
    // The 20 m ground right around the Site: its mesh is fine enough to carry its own light, so it has no image of finer relief.
    const site = level(false)
    // Anywhere no published polar map holds the Site: the engine's own DEM around it, from
    // /terrain/heights (237 m over most of the Moon). It has no image of finer relief.
    const patch = level(false)
    type Level = ReturnType<typeof level>
    // A phone, or a modest graphics card, keeps the coarser ground (the requirement).
    const finest = canTakeFinest({ memoryGb: (navigator as { deviceMemory?: number }).deviceMemory, maxTextureSize: renderer.capabilities.maxTextureSize })
    target.dataset.finest = String(finest)
    // The Site whose 20 m ground was asked for, so another Site asks again, and the one it has come for.
    let siteAsked: string | null = null
    let siteSettled: string | null = null
    const askSite = (data: VisibilityResult) => {
      const { latitude_deg, longitude_deg } = data.query.site
      const key = `${latitude_deg},${longitude_deg}`
      if (siteAsked === key) return
      siteAsked = key
      site.data = null
      if (!finest) return
      void loadSiteGround(latitude_deg, longitude_deg).then((ground) => {
        if (!gone && siteAsked === key) {
          site.data = ground
          siteSettled = key
        }
      })
    }
    // The Site whose grid was asked for, and what the grid is.
    let patchAsked: string | null = null
    let patchDem: { product: string; resolutionM: number } | null = null
    let statusNow: 'loading' | 'none' | 'failed' | null = null
    const status = (next: 'loading' | 'none' | 'failed' | null, shown: string | null = next) => {
      if (shown === null) delete target.dataset.groundStatus
      else target.dataset.groundStatus = shown
      if (next === statusNow) return
      statusNow = next
      setGroundStatus(next)
    }
    const askPatch = (data: VisibilityResult, key: string) => {
      if (patchAsked === key) return
      patchAsked = key
      patch.data = null
      patchDem = null
      status('loading')
      void loadPatchGround(data.query.site).then((answer) => {
        if (gone || patchAsked !== key) return
        if (answer.ok) {
          patch.data = answer.ground
          patchDem = { product: answer.product, resolutionM: answer.resolutionM }
          status(null, 'ready')
        } else {
          // Never a made-up ground: the view says there is none, and keeps the horizon line.
          status(answer.code === 'outside_coverage' ? 'none' : 'failed')
        }
      })
    }
    // Try again asks on the next frame.
    retryGround.current = () => {
      patchAsked = null
    }
    let groundFor: { result: VisibilityResult; stretch: number; fine: GroundData | null; wide: GroundData | null; site: GroundData | null; patch: GroundData | null } | null =
      null
    void loadGround().then((data) => {
      if (gone) return
      fine.data = data
      fine.settled = true
    })
    // The wider map is a 22 MB file: a phone goes without it.
    if (!coarse) {
      void loadWideGround().then((data) => {
        if (gone) return
        wide.data = data
        wide.settled = true
      })
    } else {
      wide.settled = true
    }
    // The finer relief only tilts the light; it comes after the shapes.
    const askRelief = (from: Level) => {
      if (from.reliefAsked || !from.data) return
      from.reliefAsked = true
      // The smaller image where there is one: it is still finer than the heights, and with two
      // levels of ground on screen the larger ones would ask a lot of a modest graphics card.
      const file = from.data.reliefSmall ?? from.data.relief
      if (!file) return
      const loader = new THREE.TextureLoader()
      loader.setCrossOrigin('anonymous')
      loader.load(file, (texture) => {
        if (gone) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.NoColorSpace
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        from.relief = texture
        from.material.normalMap = texture
        from.material.needsUpdate = true
        target.dataset.relief = 'true'
      })
    }
    /** One mesh from grids of the same map: each point placed as the eye sees it, under the engine's horizon. */
    const groundGeometry = (
      map: HeightMap,
      parts: { patch: Patch; hole?: PixelBounds }[],
      horizon: (azimuthDeg: number) => number,
      horizonDistance: (azimuthDeg: number) => number,
      by: number,
    ) => {
      const placed = parts.map(({ patch }) => groundPositions(patch, horizon, by, UNIT_M))
      const positions = new Float32Array(placed.reduce((total, part) => total + part.length, 0))
      // Each point's place on the map's square, for the image of the finer relief: across, and up from the bottom.
      const uv = new Float32Array((positions.length / 3) * 2)
      const triangles: Uint32Array[] = []
      let point = 0
      parts.forEach(({ patch, hole }, part) => {
        positions.set(placed[part], point * 3)
        // Ground beyond the terrain that closes the horizon is not drawn: a rise a hundred metres
        // away hides the mountains behind it from the lander, and so it does here.
        triangles.push(gridTriangles(patch, hole, beyondHorizon(patch, horizonDistance)).map((at) => at + point))
        for (let row = 0; row < patch.rows; row++) {
          for (let column = 0; column < patch.columns; column++) {
            uv[point * 2] = (patch.firstColumn + column * patch.stride + 0.5) / map.size
            uv[point * 2 + 1] = 1 - (patch.firstRow + row * patch.stride + 0.5) / map.size
            point++
          }
        }
      })
      const index = new Uint32Array(triangles.reduce((total, part) => total + part.length, 0))
      let filled = 0
      for (const part of triangles) {
        index.set(part, filled)
        filled += part.length
      }
      const mesh = () => {
        const made = new THREE.BufferGeometry()
          .setAttribute('position', new THREE.BufferAttribute(positions, 3))
          .setAttribute('uv', new THREE.BufferAttribute(uv, 2))
          .setIndex(new THREE.BufferAttribute(index, 1))
        made.computeVertexNormals()
        return made
      }
      let made = mesh()
      // Which way the grid is wound depends on where the Site is on the map: face it out of the ground.
      const normals = made.getAttribute('normal')
      let upward = 0
      for (let at = 0; at < normals.count; at++) upward += normals.getY(at)
      if (upward < 0) {
        for (let at = 0; at < index.length; at += 3) [index[at + 1], index[at + 2]] = [index[at + 2], index[at + 1]]
        made.dispose()
        made = mesh()
      }
      return made
    }
    const show = (on: Level, geometry: THREE.BufferGeometry | null) => {
      on.mesh.geometry.dispose()
      on.mesh.geometry = geometry ?? new THREE.BufferGeometry()
      on.mesh.visible = geometry !== null
      if (geometry) askRelief(on)
      if (geometry && on.material.map) {
        const map = (on === patch ? patch.data : on === site ? site.data : on === fine ? fine.data : wide.data)?.heights
        if (map) on.material.map.repeat.setScalar(grainRepeat(map))
      }
    }
    const buildGround = (data: VisibilityResult, by: number, patchData: GroundData | null) => {
      groundFor = { result: data, stretch: by, fine: fine.data, wide: wide.data, site: site.data, patch: patchData }
      const { latitude_deg, longitude_deg } = data.query.site
      const eye = data.query.observer_height_m
      const horizon = horizonTable(data.horizon.samples)
      const reach = horizonDistanceTable(data.horizon.samples)
      // No published polar map holds the Site: the engine's grid is all the ground there is,
      // every point of it (every other one on a phone), under the engine's horizon.
      if (patchData && patchDem) {
        show(fine, null)
        show(wide, null)
        show(site, null)
        const stride = coarse ? 2 : 1
        const grid = patchAround(patchData.heights, latitude_deg, longitude_deg, eye, Infinity, stride)
        show(patch, groundGeometry(patchData.heights, [{ patch: grid }], horizon, reach, by))
        target.dataset.ground = 'real'
        target.dataset.near = 'none'
        target.dataset.far = 'silhouette'
        latest.current.onGround?.({ ...groundSpacing(patchDem.resolutionM, stride), product: patchDem.product })
        return
      }
      show(patch, null)
      const fineMap = fine.data && covers(fine.data.heights, latitude_deg, longitude_deg, GROUND_MARGIN_M) ? fine.data.heights : null
      const wideMap = wide.data && covers(wide.data.heights, latitude_deg, longitude_deg, GROUND_MARGIN_M) ? wide.data.heights : null
      // How finely the ground nearest the Site is measured and drawn, for the caption.
      let step: GroundSpacing | null = null

      // Right around the Site, the 20 m DEM where its square is published, eased at the square's
      // rim into the map that carries the ground on from there. Its heights are the DEM's own.
      const coarser = fineMap ?? wideMap
      const siteMap = site.data && covers(site.data.heights, latitude_deg, longitude_deg, 0) ? blendRim(site.data.heights, coarser) : null
      // Every level sees from the one eye, stood on the finest ground there is, as the engine stands it.
      const around = (map: HeightMap, halfM: number, stride: number) =>
        patchAround(map, latitude_deg, longitude_deg, eyeOnMap(eye, siteMap, map, latitude_deg, longitude_deg), halfM, stride)
      if (siteMap) {
        show(site, groundGeometry(siteMap, [{ patch: around(siteMap, SITE_NEAR_M, coarse ? 2 : 1) }], horizon, reach, by))
        step = groundSpacing(siteMap.metresPerPixel, coarse ? 2 : 1)
      } else {
        show(site, null)
      }
      // The ground the 20 m square covers is left to it, on the map that meets its rim.
      const siteHole = (on: HeightMap) => (siteMap && on === coarser ? mapBoundsOn(on, siteMap) : undefined)

      // Near the Site every point of the best map that has it, where a ridge is a few points
      // wide; from there to that map's edge a coarser grid, where a mountain is many.
      if (fineMap) {
        const near = around(fineMap, GROUND_NEAR_M, coarse ? 2 : 1)
        const rest = around(fineMap, Infinity, coarse ? 10 : 5)
        show(fine, groundGeometry(fineMap, [{ patch: near, hole: siteHole(fineMap) }, { patch: rest, hole: patchBounds(near) }], horizon, reach, by))
        step ??= groundSpacing(fineMap.metresPerPixel, near.stride)
      } else {
        show(fine, null)
      }
      // The wider map carries the ground on from the edge of the finer one, out to 304 km from the
      // pole, where the mountains that close the horizon are. Where the finer map does not reach
      // the Site, the wider one is all the ground there is.
      if (wideMap && fineMap) {
        show(wide, groundGeometry(wideMap, [{ patch: around(wideMap, Infinity, 6), hole: mapBoundsOn(wideMap, fineMap) }], horizon, reach, by))
      } else if (wideMap) {
        const near = around(wideMap, WIDE_NEAR_M, 1)
        show(wide, groundGeometry(wideMap, [{ patch: near, hole: siteHole(wideMap) }, { patch: around(wideMap, Infinity, 6), hole: patchBounds(near) }], horizon, reach, by))
        step ??= groundSpacing(wideMap.metresPerPixel, 1)
      } else {
        show(wide, null)
      }
      target.dataset.ground = step === null ? 'silhouette' : 'real'
      target.dataset.near = siteMap ? String(siteMap.metresPerPixel) : 'none'
      target.dataset.far = wideMap ? 'real' : 'silhouette'
      latest.current.onGround?.(step)
    }

    // The mark of an Occluder is drawn over everything: the rise it stands on may be a hundred metres away.
    const pin = new THREE.Mesh(new THREE.SphereGeometry(WALL * 0.009, 16, 16), new THREE.MeshBasicMaterial({ color: SUN, depthTest: false }))
    pin.renderOrder = 10
    pin.visible = false
    scene.add(pin)

    // The wall, the ridge line and the Sun's path only change with the answer or the stretch.
    let builtFor: { result: VisibilityResult; stretch: number } | null = null
    const build = (data: VisibilityResult, by: number) => {
      const mask = data.horizon.samples
      const positions: number[] = []
      const index: number[] = []
      const line: number[] = []
      mask.forEach((point, at) => {
        // The face of the horizon stands behind all the ground, and shows wherever the ground
        // drawn in front of it stops short of the crest.
        const crest = vector(point.azimuth_deg, stretched(point.elevation_deg, by), WALL)
        // Straight down from the crest's direction, so the face closes into the ground under the Observer.
        const base = vector(point.azimuth_deg, -89, WALL)
        positions.push(crest.x, crest.y, crest.z, base.x, base.y, base.z)
        line.push(crest.x, crest.y, crest.z)
        const next = (at + 1) % mask.length
        index.push(at * 2, at * 2 + 1, next * 2, next * 2, at * 2 + 1, next * 2 + 1)
      })
      wall.geometry.dispose()
      wall.geometry = new THREE.BufferGeometry()
        .setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        .setIndex(index)
      ridge.geometry.dispose()
      ridge.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(line, 3))

      const samples = data.timeline.samples
      const every = Math.max(1, Math.floor(samples.length / PATH_POINTS))
      const dots: number[] = []
      samples.forEach((sample, at) => {
        if (at % every !== 0) return
        const spot = vector(sample.sun.azimuth_deg, stretched(sample.sun.elevation_deg, by), BODIES)
        dots.push(spot.x, spot.y, spot.z)
      })
      path.geometry.dispose()
      path.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(dots, 3))

      const sunRadius = (data.timeline.sun_radius_deg ?? 0.27) * by
      sun.scale.setScalar(sunRadius)
      glow.scale.setScalar(BODIES * Math.tan((sunRadius * Math.PI) / 180) * 9)
      earth.scale.setScalar(BODIES * Math.tan((EARTH_RADIUS_DEG * by * Math.PI) / 180))
      builtFor = { result: data, stretch: by }
      litFor = null
    }

    let width = 0
    let height = 0
    const resize = () => {
      width = host.clientWidth
      height = host.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const watcher = new ResizeObserver(resize)
    watcher.observe(host)
    resize()

    // Where the camera looks, in degrees, easing towards `aim`.
    let yaw = 0
    // What the compass last showed: its ring element and the yaw it was drawn for.
    let dialFor: { ring: SVGGElement; yaw: number } | null = null
    let facingNow: number | null = null
    // Arriving from the globe the first frame looks down at the ground; the camera then eases up.
    const arriving = latest.current.pose === 'arrive' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let pitch = arriving ? LOOKING_DOWN_DEG : 8
    let dragging: { x: number; y: number } | null = null
    const down = (event: PointerEvent) => {
      dragging = { x: event.clientX, y: event.clientY }
      target.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      if (!dragging || !aim.current || width === 0) return
      const perPixel = FIELD_OF_VIEW_DEG / height
      // Dragging the sky to the right brings what is on the left into view.
      aim.current.yaw -= (event.clientX - dragging.x) * perPixel
      aim.current.pitch = Math.max(PITCH_MIN_DEG, Math.min(PITCH_MAX_DEG, aim.current.pitch + (event.clientY - dragging.y) * perPixel))
      dragging = { x: event.clientX, y: event.clientY }
    }
    const up = () => {
      dragging = null
    }
    target.addEventListener('pointerdown', down)
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)

    let handle = 0
    const draw = () => {
      handle = requestAnimationFrame(draw)
      const state = latest.current
      if (width === 0 || height === 0) return
      if (builtFor?.result !== state.result || builtFor.stretch !== state.stretch) build(state.result, state.stretch)
      askSite(state.result)
      // The published polar maps first, as always; the engine's grid only where none of them
      // holds the Site, once that is known (domain/terrainHeights.ts).
      const here = state.result.query.site
      const hereKey = `${here.latitude_deg},${here.longitude_deg}`
      const holds = (on: Level, settled: boolean, marginM: number) =>
        settled ? on.data !== null && covers(on.data.heights, here.latitude_deg, here.longitude_deg, marginM) : null
      const source = groundSource(here.latitude_deg, [
        holds(fine, fine.settled, GROUND_MARGIN_M),
        holds(wide, wide.settled, GROUND_MARGIN_M),
        holds(site, !finest || siteSettled === hereKey, 0),
      ])
      target.dataset.groundSource = source
      if (source === 'patch') askPatch(state.result, hereKey)
      else if (statusNow !== null || target.dataset.groundStatus) status(null)
      const patchNow = source === 'patch' && patchAsked === hereKey ? patch.data : null
      if (
        (fine.data || wide.data || site.data || patchNow || groundFor?.patch) &&
        (groundFor?.result !== state.result ||
          groundFor.stretch !== state.stretch ||
          groundFor.fine !== fine.data ||
          groundFor.wide !== wide.data ||
          groundFor.site !== site.data ||
          groundFor.patch !== patchNow)
      ) {
        buildGround(state.result, state.stretch, patchNow)
      }
      const now = sampleAt(state.result.timeline.samples, state.cursorMs)
      if (now) {
        const sunAt = vector(now.sun.azimuth_deg, stretched(now.sun.elevation_deg, state.stretch), BODIES)
        sun.position.copy(sunAt)
        // The halo sits a little behind the disc, so the two never fight for the same depth.
        glow.position.copy(sunAt).multiplyScalar(1.02)
        earth.position.copy(vector(now.earth.azimuth_deg, stretched(now.earth.elevation_deg, state.stretch), BODIES))
        sun.lookAt(0, 0, 0)
        // The ground is lit from where the Sun is at the Cursor, by as much of its disc as the
        // terrain leaves in view: none when the answer says it is behind the relief. The Earth always.
        const onGround = sunOnGround({ azimuthDeg: now.sun.azimuth_deg, elevationDeg: now.sun.elevation_deg, fraction: now.sun.fraction }, state.stretch)
        sunlight.position.set(...onGround.direction).multiplyScalar(BODIES)
        sunlight.intensity = SUNLIGHT * onGround.share
        earthMaterial.uniforms.sunDirection.value.copy(sunAt).normalize()
        // The face of the Earth turned to the Moon at this instant, and how its axis leans in this
        // sky. Near new and full Moon the lean cannot be worked out; the last one stands, and
        // before any, north down for a Site in the south and up for one in the north.
        const earthSeen = { azimuthDeg: now.earth.azimuth_deg, elevationDeg: now.earth.elevation_deg }
        const north = earthNorthAt(state.cursorMs, { azimuthDeg: now.sun.azimuth_deg, elevationDeg: now.sun.elevation_deg }, earthSeen)
        if (north) earthLean = earthRoll(north, earthSeen)
        const lean = earthLean ?? (state.result.query.site.latitude_deg < 0 ? 180 : 0)
        const back = earth.position.clone().normalize().negate()
        const [x, y, z] = earthAttitude(subLunarPoint(state.cursorMs), lean, [back.x, back.y, back.z])
        earth.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)))
        target.dataset.earthLean = lean.toFixed(1)
        // The crest and the face of the horizon follow the Sun: half a degree at a time, and a
        // twentieth of its disc.
        const sunHeight = stretched(now.sun.elevation_deg, state.stretch)
        const lighting = `${Math.round(now.sun.azimuth_deg * 2)}:${Math.round(sunHeight * 2)}:${Math.round(now.sun.fraction * 20)}`
        if (litFor !== lighting) {
          light(state.result.horizon.samples, now.sun.azimuth_deg, sunHeight, now.sun.fraction)
          litFor = lighting
        }
        // The first frame looks at the Sun, a little above the horizon.
        if (!aim.current) {
          aim.current = { yaw: state.mark?.azimuthDeg ?? now.sun.azimuth_deg, pitch: 8 }
          yaw = aim.current.yaw
        }
      }
      if (aim.current) {
        yaw += (aim.current.yaw - yaw) * 0.18
        pitch += (aim.current.pitch - pitch) * 0.18
      }
      camera.position.set(0, 0, 0)
      camera.lookAt(vector(yaw, pitch, 10))

      pin.visible = state.mark !== null
      if (state.mark) {
        const crest = stretched(maskElevationAt(state.result.horizon.samples, state.mark.azimuthDeg), state.stretch)
        pin.position.copy(vector(state.mark.azimuthDeg, crest, WALL * 0.99))
        ;(pin.material as THREE.MeshBasicMaterial).color.set(state.mark.body === 'sun' ? SUN : EARTH)
      }

      // An arrow for each of the Sun and the Earth while it is out of frame or below the horizon:
      // it points the way and, pressed, turns the view to the body.
      camera.updateMatrixWorld()
      for (const body of ['sun', 'earth'] as const) {
        const guide = bodyGuides.current[body]
        if (!guide) continue
        if (!now) {
          guide.hidden = true
          continue
        }
        const position = body === 'sun' ? sun.position : earth.position
        const local = position.clone().applyMatrix4(camera.matrixWorldInverse)
        const projected = position.clone().project(camera)
        const inFrame = local.z < 0 && Math.abs(projected.x) < GUIDE_FRAME_X && Math.abs(projected.y) < GUIDE_FRAME_Y
        const below = belowHorizonMask(now[body], state.result.horizon.samples)
        guide.hidden = inFrame && !below
        guideAim.current[body] = { yaw: yaw + turnBetween(yaw, now[body].azimuth_deg), pitch: stretched(now[body].elevation_deg, state.stretch) }
        // The direction in the camera's own axes also works behind the Observer, where projection reverses sign.
        let dx = local.x
        const dy = -local.y
        if (Math.abs(dx) + Math.abs(dy) < 0.001) dx = 1
        const norm = Math.max(Math.abs(dx), Math.abs(dy))
        const width = target.clientWidth
        const height = target.clientHeight
        guide.style.left = `${width / 2 + (dx / norm) * Math.max(0, width / 2 - GUIDE_INSET_X_PX)}px`
        guide.style.top = `${height / 2 + (dy / norm) * Math.max(0, height / 2 - GUIDE_INSET_Y_PX) + (body === 'sun' ? -GUIDE_STACK_PX : GUIDE_STACK_PX)}px`
        const arrow = guide.firstElementChild as HTMLElement
        arrow.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
        const name = guideText.current(`strip.${body}`)
        const text = below ? guideText.current('sky.guide.below', { body: name }) : name
        const label = guide.lastElementChild as HTMLElement
        if (label.textContent !== text) label.textContent = text
      }

      renderer.render(scene, camera)
      target.dataset.ready = 'true'
      target.dataset.yaw = wrapAzimuth(yaw).toFixed(1)
      target.dataset.pitch = pitch.toFixed(1)
      target.dataset.sunHidden = String(now ? now.sun.fraction === 0 : true)

      // The compass reads the camera's own yaw, so it never eases on its own.
      if (aim.current) {
        const facingYaw = wrapAzimuth(yaw)
        const dial = ring.current
        if (dial && (dialFor?.ring !== dial || Math.abs(turnBetween(dialFor.yaw, facingYaw)) > DIAL_STEP_DEG)) {
          dial.setAttribute('transform', `rotate(${(-facingYaw).toFixed(2)})`)
          DIAL_LETTERS.forEach((azimuth, at) => {
            const letter = letters.current[at]
            if (!letter) return
            const { x, y } = onDial(azimuth, facingYaw, DIAL_LETTER_R)
            letter.setAttribute('x', x.toFixed(2))
            letter.setAttribute('y', y.toFixed(2))
          })
          dialFor = { ring: dial, yaw: facingYaw }
        }
        const eighth = facingEighth(facingYaw)
        if (eighth !== facingNow) {
          facingNow = eighth
          setFacing(eighth)
        }
      }
    }
    handle = requestAnimationFrame(draw)

    return () => {
      gone = true
      cancelAnimationFrame(handle)
      watcher.disconnect()
      target.removeEventListener('pointerdown', down)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      retryGround.current = null
      for (const object of [stars, path, wall, ridge, sun, earth, pin, fine.mesh, wide.mesh, site.mesh, patch.mesh]) {
        object.geometry.dispose()
        ;(object.material as THREE.Material).dispose()
      }
      fine.relief?.dispose()
      wide.relief?.dispose()
      for (const on of [fine, wide, site, patch]) on.material.map?.dispose()
      grain.dispose()
      earthMap?.dispose()
      glow.material.map?.dispose()
      glow.material.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="sky" ref={frame}>
      {(['sun', 'earth'] as const).map((body) => (
        <button
          key={body}
          type="button"
          className="sky__body-guide"
          hidden
          aria-label={t(`sky.guide.${body}`)}
          ref={(element) => {
            if (element) bodyGuides.current[body] = element
            else delete bodyGuides.current[body]
          }}
          onClick={() => {
            const destination = guideAim.current[body]
            if (destination && aim.current) {
              aim.current.yaw = destination.yaw
              aim.current.pitch = destination.pitch
            }
          }}
        >
          <span aria-hidden="true">→</span>
          <b aria-hidden="true">{t(`strip.${body}`)}</b>
        </button>
      ))}
      <canvas ref={canvas} role="img" aria-label={t('sky.label', { site: result.query.site.name })} />
      {groundStatus !== null && (
        <p className="sky__ground-status" data-state={groundStatus} aria-live="polite">
          {t(`sky.ground.${groundStatus}` as 'sky.ground.loading')}
          {groundStatus === 'failed' && (
            <>
              {' '}
              <button type="button" onClick={() => retryGround.current?.()}>
                {t('sky.ground.retry')}
              </button>
            </>
          )}
        </p>
      )}
      {facing !== null && (
        <div className="sky__dial" role="img" aria-label={t('sky.facing', { direction: t(`direction.${facing}` as 'direction.0') })}>
          <svg viewBox="-50 -50 100 100" aria-hidden="true">
            <circle className="sky__dial-disc" r="49" />
            <g ref={ring}>
              {DIAL_TICKS.map(({ azimuthDeg, major }) => {
                const inner = onDial(azimuthDeg, 0, major ? DIAL_TICK_IN_MAJOR : DIAL_TICK_IN_MINOR)
                const outer = onDial(azimuthDeg, 0, DIAL_TICK_OUT)
                return (
                  <line
                    key={azimuthDeg}
                    className={azimuthDeg === 0 ? 'sky__dial-tick sky__dial-tick--north' : major ? 'sky__dial-tick sky__dial-tick--major' : 'sky__dial-tick'}
                    x1={inner.x.toFixed(2)}
                    y1={inner.y.toFixed(2)}
                    x2={outer.x.toFixed(2)}
                    y2={outer.y.toFixed(2)}
                  />
                )
              })}
            </g>
            {DIAL_LETTERS.map((azimuth, at) => (
              <text
                key={azimuth}
                ref={(element) => {
                  letters.current[at] = element
                }}
                className={azimuth === 0 ? 'sky__dial-letter sky__dial-letter--north' : at % 2 === 1 ? 'sky__dial-letter sky__dial-letter--minor' : 'sky__dial-letter'}
                data-azimuth={azimuth}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {t(`compass.${at}` as 'compass.0')}
              </text>
            ))}
            <path className="sky__dial-index" d="M -6 -49 L 6 -49 L 0 -41 Z" />
          </svg>
        </div>
      )}
      <p className="sky__turn">
        <button type="button" aria-label={t('sky.left')} onClick={() => turn(-TURN_STEP_DEG)}>
          ‹
        </button>
        <button type="button" aria-label={t('sky.right')} onClick={() => turn(TURN_STEP_DEG)}>
          ›
        </button>
      </p>
    </div>
  )
}
