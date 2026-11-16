import { ownRenderer, releaseRenderer } from './rendererLifetime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { earthAttitude, subLunarPoint } from '../domain/earthFace'
import { chooseLabels, PLANETS, pointLook, type Box, type LabelCandidate } from '../domain/planets'
import { levelOfView, type LevelId } from '../domain/globeLevels'
import { MAP_CLICK_DELAY_MS } from '../domain/land'
import { latitudeCircle, POLAR_CIRCLE_LATITUDE, polarCircleShown } from '../domain/latitudeCircle'
import { hitRadius, MARKERS, missionLabel, nearestMarker, nearSide } from '../domain/markers'
import { moonRadiusPx } from '../domain/moonDisc'
import { bubbleOnLeft, landPlace, latLonOfVector, type LandPlace } from '../domain/pick'
import { letterClear, POLE_LETTER_RADII, poleMark, type Disc } from '../domain/poleMark'
import type { View } from '../domain/query'
import { initialLayers, layerOf, siteShown, type Layers } from '../domain/siteLayers'
import { GLOBE_FIELD_OF_VIEW_DEG, viewDistanceFor, viewTarget, type MoonPlace, type MoonView } from '../domain/viewTarget'
import { groundDirection, toVector, type LatLon } from '../domain/sky'
import {
  BACKDROP_EARTH_DISTANCE,
  BACKDROP_FAR,
  BACKDROP_NEAR,
  BACKDROP_SUN_DISTANCE,
  discRadius,
  moonHides,
  sphereRadius,
} from '../domain/spaceScale'
import { useRegions } from '../hooks/useRegions'
import { useI18n } from '../i18n/I18nContext'
import {
  MAP_EDGE_LATITUDE,
  mapPlaces,
  mapStep,
  placeLabels,
  pointOnMap,
  regionHeight,
  type MapEvent,
  type MapRegion,
  type MapSite,
  type MapView,
} from './globeMap/map'
import { GlobeMenu } from './GlobeMenu'
import { MapLayer, type MarkerElements } from './globeMap/MapLayer'
import { positionMap, type NameSizes } from './globeMap/position'
import { readoutText } from './globeMap/readout'
import { fill } from './globeMap/strings'
import { STRINGS as LAND_STRINGS } from './stageStatus/strings'
import './globeMap/globeMap.css'
import './globeLand.css'
import { moonTier } from './moonDevice'
import { dressMoon, MOON_SUN_STRENGTH, moonMaterial } from './moonSurface'
import { planetBackdrop, planetWay } from './planetBackdrop'
import { earthMaterial as makeEarthMaterial, EARTH, glowTexture, loadEarthMap, SUN } from './spaceBodies'
import { StageLoading } from './StageLoading'
import { needsMenuBoxes } from '../domain/menuBoxes'
import { LIGHT_GRAPHICS, SHARP_GRAPHICS, lightGraphicsSearch } from '../domain/graphicsMode'

import { DIVE_MS, LANDING_MS } from '../domain/stageMove'
import { canDraw } from './webgl'

export interface GlobeSite extends LatLon {
  id: string
  name: string
  /** The Region the Site belongs to: the map shows one marker per Region seen from the pole. */
  region_id?: string | null
  /** Where the coordinate comes from: it says which switch of the menu governs the Site's dot. */
  source?: string
}

export interface GlobeProps {
  sites: readonly GlobeSite[]
  site: GlobeSite
  /** The sub-solar point at the Cursor: the light comes from straight above it. */
  sun: LatLon | null
  /** The sub-Earth point at the Cursor: the Earth is straight above it. */
  earth?: LatLon | null
  /** The Cursor's instant: which face of the Earth is turned to the Moon. */
  cursorMs?: number
  sunRadiusDeg?: number
  earthRadiusDeg?: number
  sunAzimuthDeg: number | null
  earthAzimuthDeg: number | null
  sunUp: boolean
  earthUp: boolean
  label: string
  unavailable: string
  onSelect: (siteId: string) => void
  /** 'map' looks straight down on the south pole, 0° of longitude up, with a grid; 'orbit' flies to the Site. */
  mode?: 'orbit' | 'map'
  /** The Occluder to mark, joined to the Site by a line in its body's colour. */
  occluder?: (LatLon & { body: 'sun' | 'earth' }) | null
  /** In the map, a double click south of 80° S asks about that point. */
  onPoint?: (point: LatLon) => void
  /** The four longitude labels of the map's grid: 0°, 90° E, 180°, 90° W. */
  meridianLabels?: readonly string[]
  /**
   * The dive to the ground (the requirement): true flies the camera down until the Site fills the
   * screen, and holds it there; false pulls it back to where the view puts it. Reduced motion
   * keeps the camera still.
   */
  dive?: boolean
  /** Told when the camera has reached the Site, or is back from it. */
  onDive?: (atSite: boolean) => void
  /** Nothing is drawn while the view from the ground covers the globe. */
  paused?: boolean
  /** The level pressed in the menu: the app's view, or null on the ground. Without it, the one of `mode`. */
  level?: LevelId | null
  /** A level of the menu was clicked: the view to go to. */
  onLevel?: (view: View) => void
  onPrecision?: () => void
  precisionActive?: boolean
  selectionMaxLatitudeDeg?: number

  /**
   * "Land": one click on the Moon (not a drag) gives one place, the Site whose dot it snapped to or the
   * point of the ground under it. The app asks the Query about it and goes down to the ground there.
   */
  onLand?: (place: GlobeLanding) => void
}

/** Where "Land" was clicked, and the name of the Site it snapped to, if any. */
export type GlobeLanding = LandPlace & { name: string | null }

const GRID_LATITUDES = [-88, -86, -84, -82, -80]
const LABELLED_LATITUDES = [-85, -80]

/** The poles of the Moon, in its own frame (MOON_ME): the letters belong to them and to nothing else. */
const POLES = [
  { letter: 'N', latitude: 90 },
  { letter: 'S', latitude: -90 },
] as const
/** The Equator is a ring of this many dots on the Moon: one every 2.6° of longitude. */
const EQUATOR_DOTS = 140
/** Sizes of the marks as shares of the Moon's radius on screen. */
const EQUATOR_BASE_WIDTH = 1 / (0.36 * 110)
const EQUATOR_WIDTH = 1 / (0.36 * 170)
// Quiet marks, like a map's graticule: about half the old size, a hairline halo and a hairline stem.
const POLE_LETTER_SIZE = 0.032 / 0.36
const POLE_LETTER_OUTLINE = 1 / (0.36 * 260)
const POLE_STROKE_WIDTH = 1 / (0.36 * 520)
const POLE_DOT = 1 / (0.36 * 190)
/** The circle of latitude round the south pole: a warm white line of 2 px over a faint darker one of 3 px, whatever the zoom. */
const CIRCLE_WIDTH_PX = 2
const CIRCLE_BASE_WIDTH_PX = 3
/** The dots of the Sites and the missions sit this far out, in Moon radii, just over the ground. */
const MARK_RADIUS = 1.002
/** The ring of the chosen Site, as the map's CSS draws it (`.globe__chosen`), for the mission names to keep clear of. */
const CHOSEN_RING_PX = 11
const FIELD_OF_VIEW_DEG = GLOBE_FIELD_OF_VIEW_DEG
/** The Sun's halo reaches this many times the radius of its disc. */
const HALO_REACH = 7
/** How long the stage waits for the images of the Moon before showing it without them. */
const DRESS_WAIT_MS = 6000
/** The Site name starts this far from its dot and keeps this far from the edge of the stage. */
const PIN_GAP = 12
const PIN_EDGE = 8
/** Height above the surface, in Moon radii, from which the ring on the marked Occluder is drawn at full size. */
const DOT_FULL_SIZE_HEIGHT = 2.3
/** The flight into a Region and back out, and the fade that stands in for it with reduced motion. */
const REGION_FLIGHT_MS = 800
const REGION_FADE_MS = 300
/** The dive ends this far above the Site, in Moon radii (about 21 km): the Site fills the stage. */
/** On a touch screen the readout of a tapped point stays this long. */
const TOUCH_READOUT_MS = 2500
/** In orbit the camera's up is the Moon's axis; on the map it is the 0° meridian, so the map never turns. */
const ORBIT_UP = new THREE.Vector3(0, 1, 0)
const MAP_UP = new THREE.Vector3(1, 0, 0)

/** A hard-edged round dot, drawn once into a small canvas: the marks on the Moon are made of it. */
function roundDotTexture(): THREE.Texture {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#fff'
    context.beginPath()
    context.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
    context.fill()
  }
  return new THREE.CanvasTexture(canvas)
}


/**
 * A round dot with a dark edge, white inside so the material's colour shows through: the shape of every
 * Site and mission dot. Without a 2D canvas (a test browser, say) the dots stay square.
 */
function dotTexture(): THREE.Texture | null {
  const paper = document.createElement('canvas')
  paper.width = paper.height = 64
  const pen = paper.getContext('2d')
  if (!pen) return null
  // A thin, half-dark edge: enough to lift the dot off the grey Moon without a black outline.
  pen.beginPath()
  pen.arc(32, 32, 30, 0, Math.PI * 2)
  pen.fillStyle = 'rgba(0, 0, 0, 0.55)'
  pen.fill()
  pen.beginPath()
  pen.arc(32, 32, 25, 0, Math.PI * 2)
  pen.fillStyle = '#fff'
  pen.fill()
  return new THREE.CanvasTexture(paper)
}

/** What the app is told by "Land": the place only, without where it was on screen. */
const toLanding = (place: GlobeLanding): GlobeLanding => ({
  lat: place.lat,
  lon: place.lon,
  ...(place.siteId ? { siteId: place.siteId } : {}),
  name: place.name,
})

/** A typed coordinate's key is no code of the catalogue: landing there sends the point, not the key. */
const catalogueId = (id: string) => (id.startsWith('custom:') ? undefined : id)

const vector = (lat: number, lon: number, radius = 1) => new THREE.Vector3(...toVector(lat, lon)).multiplyScalar(radius)

/** Far enough to see the limb, and the line between day and night crossing the pole. */
/**
 * Straight down on the pole, with the 80° S circle inside the shorter side of the stage. A hair off
 * the pole towards 0° of longitude, so that meridian points up and the view has no singular point.
 */
const mapPoint = (aspect: number, edge = MAP_EDGE_LATITUDE) => vector(edge === MAP_EDGE_LATITUDE ? -89.9 : -89.999, 0, 0.99 + (edge === MAP_EDGE_LATITUDE ? 0.2 : Math.sin((90 + edge) * Math.PI / 180) * 1.25) / (Math.tan((16 * Math.PI) / 180) * Math.min(1, aspect)))

/** Straight down on the Site, close enough that it fills the stage. */
/** Where the camera ends on the way down: above the Site and to the side it came from, to see the relief. */
function landingCamera(site: LatLon, from: THREE.Vector3): THREE.Vector3 {
  const up = vector(site.latitude_deg, site.longitude_deg)
  const aside = from.clone().addScaledVector(up, -from.dot(up))
  if (aside.lengthSq() < 1e-6) aside.crossVectors(up, Math.abs(up.y) < 0.9 ? ORBIT_UP : MAP_UP)
  return up.multiplyScalar(1 + LANDING_CAMERA_UP).addScaledVector(aside.normalize(), LANDING_CAMERA_ASIDE)
}

// The landing: on the way down the camera stops beside the Site, low enough to see the relief, and a
// lander comes down on it with its engine lit. A drawing of a landing, not a simulation: the lander is
// far larger than life so it can be seen, and its path is a straight line.
const LANDING_CAMERA_UP = 0.035
const LANDING_CAMERA_ASIDE = 0.06
const LANDER_SIZE = 0.011
const LANDER_START_HEIGHT = 0.03

function makeLander(): { group: THREE.Group; flame: THREE.Mesh; dispose: () => void } {
  const group = new THREE.Group()
  const made: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
  const part = (geometry: THREE.BufferGeometry, color: number, opacity = 1) => {
    const material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 })
    made.push({ geometry, material })
    const mesh = new THREE.Mesh(geometry, material)
    group.add(mesh)
    return mesh
  }
  part(new THREE.CylinderGeometry(0.34, 0.42, 0.3, 8), 0xd9a441).position.y = 0.47
  part(new THREE.CylinderGeometry(0.2, 0.34, 0.24, 8), 0xc8ccd6).position.y = 0.74
  part(new THREE.CylinderGeometry(0.43, 0.43, 0.05, 8), 0x8a6a2a).position.y = 0.31
  part(new THREE.CylinderGeometry(0.08, 0.16, 0.14, 12), 0x555a66).position.y = 0.23
  for (let leg = 0; leg < 4; leg++) {
    const angle = (leg * Math.PI) / 2 + Math.PI / 4
    const strut = part(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 6), 0xb8bcc6)
    strut.position.set(Math.cos(angle) * 0.46, 0.24, Math.sin(angle) * 0.46)
    strut.rotation.set(Math.sin(angle) * 0.6, 0, -Math.cos(angle) * 0.6)
    part(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 10), 0xd9a441).position.set(Math.cos(angle) * 0.62, 0.012, Math.sin(angle) * 0.62)
  }
  const flame = part(new THREE.ConeGeometry(0.13, 0.7, 14), 0xfff0b0, 0.85)
  flame.rotation.x = Math.PI
  flame.position.y = -0.18
  group.scale.setScalar(LANDER_SIZE)
  group.visible = false
  return { group, flame, dispose: () => made.forEach(({ geometry, material }) => { geometry.dispose(); material.dispose() }) }
}

const viewpoint = (site: LatLon) => vector(site.latitude_deg, site.longitude_deg, 3.1).add(new THREE.Vector3(1.1, 0, 0.9))

/** Straight down on a Region, low enough for its Sites to come apart. */
const regionPoint = (region: MapRegion, aspect: number) =>
  vector(region.centre.latitude_deg, region.centre.longitude_deg, 1 + regionHeight(region.spreadDeg, aspect, FIELD_OF_VIEW_DEG / 2))

/**
 * The Moon as the stage. All it knows comes from the answer: where the Sites are, where the Sun is
 * overhead, and which way the Sun and the Earth lie from the chosen Site. It computes no ephemeris.
 */
export function Globe(props: GlobeProps) {
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pin = useRef<HTMLSpanElement>(null)
  const [dressed, setDressed] = useState(false)
  /** The name on the pin and its size on one line, measured once per name. */
  const pinText = useRef({ text: '', width: 0, height: 0 })
  const gridLabels = useRef<HTMLDivElement>(null)
  const poleMarks = useRef<SVGSVGElement>(null)
  /** A turn of the Moon asked for by the menu; the draw loop takes it up on its next frame. */
  const turnAsked = useRef<MoonView | null>(null)

  const live = useRef(props)
  const { locale, t } = useI18n()
  const words = LAND_STRINGS[locale]
  // "Land": the point under the cursor and its bubble. A click gives one place to the app, which asks
  // about it and goes down to the ground there.
  const landLayer = useRef<HTMLDivElement>(null)
  const landTarget = useRef<(GlobeLanding & { x: number; y: number }) | null>(null)
  const landHere = useCallback(() => {
    const place = landTarget.current
    if (place) live.current.onLand?.(toLanding(place))
  }, [])
  // The names of the missions in orbit: a button each, moved by the drawing loop.
  const marksLayer = useRef<HTMLDivElement>(null)
  const [markElements] = useState(() => new Map<string, HTMLButtonElement>())
  const missions = useMemo(() => props.sites.filter((site) => layerOf(site.source) === 'missions'), [props.sites])
  // The switches of the menu: the dots of the Sites, the dots of the missions, and the planets of the sky.
  const [layers, setLayers] = useState<Layers>(initialLayers)
  const layersLive = useRef(layers)
  // As on main: a browser with no WebGL at all says so at once, before any scene is built.
  const [supported, setSupported] = useState(canDraw)
  const [blocked, setBlocked] = useState(false)


  // The map: one marker per Region from the pole, the Sites of one Region once flown into it.
  const names = useRegions()
  const places = useMemo(() => mapPlaces(props.sites, names), [props.sites, names])
  const mode = props.mode ?? 'orbit'
  const [view, setView] = useState<MapView>({ region: null })
  const [viewMode, setViewMode] = useState(mode)
  // Leaving the map and coming back starts again from the pole.
  if (viewMode !== mode) {
    setViewMode(mode)
    setView({ region: null })
  }
  const region = mode === 'map' && places.regions.some((entry) => entry.id === view.region) ? view.region : null
  const [elements] = useState<MarkerElements>(() => new Map())
  const layer = useRef<HTMLDivElement>(null)
  const chosenRing = useRef<HTMLSpanElement>(null)
  const planetNames = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLSpanElement>(null)
  const mapLive = useRef({ places, region, locale })
  const siteId = props.site.id
  const onSelect = props.onSelect
  const onMapEvent = useCallback(
    (event: MapEvent) => {
      const next = mapStep({ region }, event, siteId)
      if (next.view.region !== region) setView(next.view)
      if (next.ask) onSelect(next.ask)
    },
    [region, siteId, onSelect],
  )

  useEffect(() => {
    live.current = props
    layersLive.current = layers
    mapLive.current = { places, region, locale }
  })

  useEffect(() => {
    const host = frame.current
    const target = canvas.current
    if (!host || !target) return

    let failureReason = ''
    const creationError = (event: Event) => { failureReason = (event as WebGLContextEvent).statusMessage }
    target.addEventListener('webglcontextcreationerror', creationError)
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas: target, antialias: !LIGHT_GRAPHICS })
      ownRenderer(renderer)
    } catch {
      // A transient graphics failure must remain retryable. Ignore an obsolete StrictMode setup.
      let active = true
      queueMicrotask(() => { if (active) { setBlocked(/blocked/i.test(failureReason)); setSupported(false) } })
      return () => { active = false }
    } finally {
      target.removeEventListener('webglcontextcreationerror', creationError)
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      setSupported(false)
    }
    target.addEventListener('webglcontextlost', onContextLost)
    renderer.setPixelRatio(LIGHT_GRAPHICS ? 1 : Math.min(window.devicePixelRatio, 2))
    renderer.autoClear = false


    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW_DEG, 1, 0.01, 50)
    // Stars behind the Moon, the same on every visit.
    let seed = 20261114
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }
    const starAt = new Float32Array(1600 * 3)
    for (let at = 0; at < starAt.length; at += 3) {
      const height = random() * 2 - 1
      const round = random() * Math.PI * 2
      const flat = Math.sqrt(1 - height * height)
      starAt.set([flat * Math.cos(round) * 40, height * 40, flat * Math.sin(round) * 40], at)
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starAt, 3)),
      new THREE.PointsMaterial({ color: 0xcfd3dc, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.7 }),
    )
    scene.add(stars)
    const material = moonMaterial()
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), material)
    scene.add(moon)
    // The tier decides which images the Moon takes and how far they are fitted (`moonBudget.ts`): the 8192 px
    // ones only when the link asks (`?graphics=high`) on a strong device (`moonDevice.ts`); everyone else gets
    // the 2048 px ones, and `graphics=low` the 1024 px ones.
    const tier = moonTier(renderer.getContext(), LIGHT_GRAPHICS, SHARP_GRAPHICS)
    // The Moon is shown once it has its colour and relief, never as a plain grey ball. A slow
    // network does not hold it back for ever: after DRESS_WAIT_MS it shows as it is.
    const show = () => setDressed(true)
    const dress = dressMoon(scene, material, renderer.capabilities.getMaxAnisotropy(), {
      tier,
      maxTextureSize: renderer.capabilities.maxTextureSize,
      onDressed: show,
      onColour: (size) => { target.dataset.moon = size },
      onPolar: (shown) => { if (shown) target.dataset.polar = 'true'; else delete target.dataset.polar },
    })
    // Earthshine and a little more: the night side stays dark, and its relief can still be read.
    scene.add(new THREE.AmbientLight(0xffffff, 0.085))
    const sunlight = new THREE.DirectionalLight(0xfff4e0, MOON_SUN_STRENGTH)
    scene.add(sunlight)

    // The Sun and the Earth are in the sky behind the Moon: a backdrop scene of their own, drawn before
    // the Moon and seen by a camera that turns as the main camera turns and never moves (the Sun and
    // the Earth are too far for the camera's position to matter). So they pass behind the Moon as the
    // orbit is dragged, the Moon covers them where it is in front of them, and the Moon itself is
    // drawn as it always was. Each is only a direction and the angle it spans in the Moon's sky (see
    // `spaceScale`, mean values for display): the Sun a disc with a soft halo, the Earth a ball with
    // the Blue Marble, lit from the Sun's side so it shows its phase.
    let gone = false
    const sky = new THREE.Scene()
    const skyCamera = new THREE.PerspectiveCamera(FIELD_OF_VIEW_DEG, 1, BACKDROP_NEAR, BACKDROP_FAR)
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: SUN }))
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, transparent: true }))
    const earthShade = makeEarthMaterial()
    let earthMap: THREE.Texture | null = null
    loadEarthMap(
      earthShade,
      renderer.capabilities.getMaxAnisotropy(),
      () => gone,
      (texture) => {
        earthMap = texture
        target.dataset.earth = 'mapped'
      },
    )
    const earthBall = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), earthShade)
    for (const body of [sunHalo, sunDisc, earthBall]) {
      body.visible = false
      sky.add(body)
    }
    // The planets are points of light in the same sky, for the look of it (ADR 0007).
    const planetSky = planetBackdrop(sky, renderer.getPixelRatio())
    // Where each is on the stage, for whoever needs to know: pixels from its top left, and its radius.
    // Empty when it is off the stage or the Moon is in front of it.
    const publish = (name: 'sun' | 'earth', body: { x: number; y: number; r: number } | null) => {
      const values = { X: body ? String(Math.round(body.x)) : '', Y: body ? String(Math.round(body.y)) : '', R: body ? body.r.toFixed(2) : '' }
      for (const [axis, value] of Object.entries(values)) {
        const key = `${name}${axis}`
        if (host.dataset[key] !== value) host.dataset[key] = value
      }
    }

    // The dots of the two layers: a fixed size on screen whatever the zoom, and hidden behind the Moon by
    // its depth, so the far side's dots never show through it. Each layer has a colour of its own
    // (`MARKERS`). The chosen Site's dot is drawn with its layer's, or with the layer released: its ring
    // is the mark that says it is the chosen one.
    const dotLook = dotTexture()
    const markLayer = (look: (typeof MARKERS)[keyof typeof MARKERS]) => {
      const points = new THREE.Points(
        new THREE.BufferGeometry(),
        new THREE.PointsMaterial({ color: look.color, size: look.sizePx, sizeAttenuation: false, map: dotLook, alphaTest: 0.5 }),
      )
      points.frustumCulled = false
      scene.add(points)
      return points
    }
    const siteDots = markLayer(MARKERS.sites)
    const missionDots = markLayer(MARKERS.missions)
    let dotsFor: { sites: readonly GlobeSite[]; sitesOn: boolean; missionsOn: boolean; chosen: string } | null = null
    let dotsDrawn = 0
    const rebuildDots = (sites: readonly GlobeSite[], layers: Layers, chosen: string) => {
      dotsDrawn = 0
      for (const [points, layer] of [[siteDots, 'sites'], [missionDots, 'missions']] as const) {
        const shown = sites.filter((site) => layerOf(site.source) === layer && siteShown(site, layers))
        const at = new Float32Array(shown.length * 3)
        shown.forEach((site, index) => at.set(toVector(site.latitude_deg, site.longitude_deg).map((value) => value * MARK_RADIUS), index * 3))
        points.geometry.dispose()
        points.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(at, 3))
        dotsDrawn += shown.length
      }
      dotsFor = { sites, sitesOn: layers.sites, missionsOn: layers.missions, chosen }
    }

    // Two short strokes on the ground at the Site: the way to the Sun and the way to the Earth.
    const stroke = (color: number) => {
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color, transparent: true }))
      scene.add(line)
      return line
    }
    const toSun = stroke(SUN)
    const toEarth = stroke(EARTH)
    const aim = (line: THREE.Line, site: LatLon, azimuthDeg: number | null, visible: boolean) => {
      line.visible = azimuthDeg !== null
      if (azimuthDeg === null) return
      const from = vector(site.latitude_deg, site.longitude_deg, 1.003)
      const way = new THREE.Vector3(...groundDirection(site, azimuthDeg))
      line.geometry.setFromPoints([from, from.clone().addScaledVector(way, 0.05)])
      ;(line.material as THREE.LineBasicMaterial).opacity = visible ? 1 : 0.3
    }

    // The map's grid: circles of latitude and a meridian every 30°, from the pole to 80° S.
    const gridLine = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 })
    const grid = new THREE.Group()
    const gridShapes: THREE.BufferGeometry[] = []
    const addLine = (points: THREE.Vector3[]) => {
      const shape = new THREE.BufferGeometry().setFromPoints(points)
      gridShapes.push(shape)
      grid.add(new THREE.Line(shape, gridLine))
    }
    for (const latitude of GRID_LATITUDES) {
      addLine(Array.from({ length: 181 }, (_, step) => vector(latitude, step * 2, 1.0015)))
    }
    for (let longitude = 0; longitude < 360; longitude += 30) {
      addLine(Array.from({ length: 21 }, (_, step) => vector(-90 + (step / 20) * (90 + MAP_EDGE_LATITUDE), longitude, 1.0015)))
    }
    grid.visible = false
    scene.add(grid)
    const selectionBoundaryGeometry = new THREE.BufferGeometry().setFromPoints(
      latitudeCircle(-87.5).map(p => vector(p.latitude_deg, p.longitude_deg, 1.0017)))
    const selectionBoundaryMaterial = new THREE.LineBasicMaterial({ color: '#83d9ff', depthTest: false, transparent: true })
    const selectionBoundary = new THREE.LineLoop(selectionBoundaryGeometry, selectionBoundaryMaterial)
    selectionBoundary.renderOrder = 3
    scene.add(selectionBoundary)
    let shownEdge: number | undefined

    // The Equator, the circle at 84° S and a dot on each pole are drawn on the Moon itself, in this scene, as
    // dots lying on its surface: the Moon hides the far half of them, and the sky behind it (the Sun, the
    // Earth, the planets) is never in front of them. Their sizes follow the Moon's disc on screen.
    const pixelRatio = renderer.getPixelRatio()
    const markTexture = roundDotTexture()
    const markGroup = new THREE.Group()
    markGroup.visible = false
    scene.add(markGroup)
    const markShapes: THREE.BufferGeometry[] = []
    const markDots = (points: THREE.Vector3[], colour: number, opacity: number, order: number) => {
      const shape = new THREE.BufferGeometry().setFromPoints(points)
      markShapes.push(shape)
      const material = new THREE.PointsMaterial({ color: colour, map: markTexture, size: 1, sizeAttenuation: false, transparent: true, opacity, depthWrite: false })
      const cloud = new THREE.Points(shape, material)
      cloud.renderOrder = order
      cloud.frustumCulled = false
      markGroup.add(cloud)
      return cloud
    }
    const equatorRing = Array.from({ length: EQUATOR_DOTS }, (_, step) => vector(0, (step * 360) / EQUATOR_DOTS, 1.002))
    // The circle of latitude round the south pole, every degree of longitude, on the same sphere as the Equator.
    const polarRing = latitudeCircle(POLAR_CIRCLE_LATITUDE).map((point) => vector(point.latitude_deg, point.longitude_deg, 1.002))
    const poleSpots = POLES.map((pole) => vector(pole.latitude, 0, 1.002))
    // The Equator stays as Larissa drew it. The circle and the poles are softened: warm white over a faint
    // dark base rather than pure white over a black one (docs/design/ui-direction.md).
    const equatorBase = markDots(equatorRing, 0x000000, 0.55, 1)
    const equatorDots = markDots(equatorRing, 0xffd400, 1, 2)
    const circleBase = markDots(polarRing, 0x000000, 0.25, 1)
    const circleDots = markDots(polarRing, 0xece6da, 0.6, 2)
    const poleDots = markDots(poleSpots, 0xece6da, 0.8, 2)

    // The marked Occluder: a ring on it and a line from the Site.
    const toOccluder = stroke(SUN)
    const ringShape = new THREE.RingGeometry(0.0055, 0.0072, 40)
    const ring = new THREE.Mesh(ringShape, new THREE.MeshBasicMaterial({ color: SUN, side: THREE.DoubleSide }))
    ring.visible = false
    scene.add(ring)

    const controls = new OrbitControls(camera, target)
    controls.enableDamping = true
    controls.enablePan = false
    // Close enough to read the 22.5 m level around the Sites.
    controls.minDistance = 1.04
    controls.maxDistance = Math.max(6, viewDistanceFor(1))
    controls.enabled = false

    // The one orchestrated moment: from the whole Moon down to the south pole and the Site.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let flight: {
      from: THREE.Vector3
      to: THREE.Vector3
      fromUp: THREE.Vector3
      toUp: THREE.Vector3
      start: number
      ms: number
      /** A change of view hides the map's markers until it lands; a flight into a Region keeps them. */
      kind: 'view' | 'region'
      toMap: boolean
      /** The camera goes round the Moon along an arc, not in a straight line, which would cut through it. */
      arc?: boolean
    } | null = null
    // With reduced motion a Region is reached by a short fade instead: out, a jump, back in.
    let fade: { to: THREE.Vector3; up: THREE.Vector3; start: number; jumped: boolean } | null = null
    // The dive to the ground and back: a flight of its own, which the view's flights wait for.
    let dive: { from: THREE.Vector3; to: THREE.Vector3; fromUp: THREE.Vector3; toUp: THREE.Vector3; start: number; down: boolean } | null = null
    let shownDive = false
    const lander = makeLander()
    scene.add(lander.group)
    // Where the camera looks at the end of the way down: the Site's own ground, not the Moon's centre.
    const landingLook = new THREE.Vector3()
    let shownSite: string | null = null
    let shownMode: 'orbit' | 'map' | null = null
    let shownRegion: string | null = null
    const sizes: NameSizes = new Map()
    const markSizes = new Map<string, { width: number; height: number }>()
    camera.position.set(5.2, 0.6, 4.4)
    camera.lookAt(0, 0, 0)

    // How far the camera stands to frame the whole Moon on this stage (a phone upright needs more than a desktop),
    // and the distance the camera was last put at for it, so a resize can tell a camera nobody has zoomed.
    const framing = () => viewDistanceFor(camera.aspect)
    let framedAt: number | null = null
    const resize = () => {
      const { clientWidth: width, clientHeight: height } = host
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      // A rotated phone or a resized window refits the Moon, in the orbit view and where the camera has not been zoomed or is not flying.
      const fit = framing()
      controls.maxDistance = Math.max(6, fit)
      if (framedAt !== null && shownMode === 'orbit' && !dive && !fade) {
        if (flight) {
          // On its way to the framing: it lands at the new one.
          if (flight.kind === 'view' && !flight.toMap && Math.abs(flight.to.length() - framedAt) < 0.01) {
            flight.to.setLength(fit)
            framedAt = fit
          }
        } else if (Math.abs(camera.position.length() - framedAt) < 0.01) {
          camera.position.setLength(fit)
          framedAt = fit
        }
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    // A point faces the camera when the camera is above its tangent plane (`nearSide`): what is behind
    // the limb is neither drawn, named nor landed on.
    const eye = () => [camera.position.x, camera.position.y, camera.position.z] as const
    const onScreen = (site: LatLon) => {
      const point = vector(site.latitude_deg, site.longitude_deg, MARK_RADIUS)
      const facing = nearSide(toVector(site.latitude_deg, site.longitude_deg), eye())
      const projected = point.project(camera)
      return { facing, x: ((projected.x + 1) / 2) * host.clientWidth, y: ((1 - projected.y) / 2) * host.clientHeight }
    }

    // The dots a click can snap to, where they are on screen: those drawn and facing the camera. In orbit
    // the dots of the pressed layers; on the map the Site buttons on screen (of the Region flown into and
    // those with no Region). The chosen Curated Site's ring counts too.
    const snapTargets = () => {
      const state = live.current
      const mode = state.mode ?? 'orbit'
      const map = mapLive.current
      let list: readonly MapSite[]
      if (mode === 'map') {
        const open = map.places.regions.find((entry) => entry.id === map.region)
        list = [...(open?.sites ?? []), ...map.places.loose]
      } else list = state.sites.filter((site) => siteShown(site, layersLive.current))
      const targets: { id: string; x: number; y: number; site: MapSite }[] = []
      for (const site of list) {
        const spot = onScreen(site)
        if (spot.facing) targets.push({ id: site.id, x: spot.x, y: spot.y, site })
      }
      const chosen = state.site
      if (catalogueId(chosen.id) && !targets.some((target) => target.id === chosen.id)) {
        const spot = onScreen(chosen)
        if (spot.facing) targets.push({ id: chosen.id, x: spot.x, y: spot.y, site: chosen })
      }
      return targets
    }
    // In the map, a double click on the ground south of 80° S asks about that point.
    const pointer = new THREE.Vector2()
    const caster = new THREE.Raycaster()
    const unit = new THREE.Sphere(new THREE.Vector3(), 1)
    const groundAt = (event: MouseEvent) => {
      const box = host.getBoundingClientRect()
      pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, 1 - ((event.clientY - box.top) / box.height) * 2)
      caster.setFromCamera(pointer, camera)
      const hit = caster.ray.intersectSphere(unit, new THREE.Vector3())
      return pointOnMap(hit ? [hit.x, hit.y, hit.z] : null)
    }
    // A click on the map lands after a short wait; the second click of a double click cancels it, so a
    // double click is one request (the ask, staying on the map) and a click is one (the landing).
    let mapClick = 0
    let lastLanding = -Infinity
    const cancelMapClick = () => {
      const pending = mapClick !== 0
      window.clearTimeout(mapClick)
      mapClick = 0
      return pending
    }
    const onDouble = (event: MouseEvent) => {
      cancelMapClick()
      if ((live.current.mode ?? 'orbit') !== 'map' || !live.current.onPoint) return
      const place = groundAt(event)
      if (!place || place.latitude_deg > (live.current.selectionMaxLatitudeDeg ?? MAP_EDGE_LATITUDE)) return
      const precision = live.current.precisionActive ? 1e6 : 100
      const round = (value: number) => Math.round(value * precision) / precision
      live.current.onPoint({ latitude_deg: round(place.latitude_deg), longitude_deg: round(place.longitude_deg) })
    }
    // The point under the pointer, so people find out a double click asks about it. A finger has
    // no hover: a tap shows the point it touched for a moment.
    let readoutTimer = 0
    const hideReadout = () => {
      if (readout.current) readout.current.hidden = true
    }
    const showReadout = (event: PointerEvent) => {
      const mark = readout.current
      if (!mark) return
      const place = (live.current.mode ?? 'orbit') === 'map' && !flight && !fade ? groundAt(event) : null
      mark.hidden = place === null
      if (!place) return
      const touch = event.pointerType === 'touch'
      mark.textContent = readoutText(place, mapLive.current.locale, touch)
      const box = host.getBoundingClientRect()
      const x = event.clientX - box.left
      const y = event.clientY - box.top
      const width = mark.offsetWidth
      const height = mark.offsetHeight
      // Below and to the right of the pointer, or wherever it stays inside the stage.
      const left = x + 14 + width <= box.width - 4 ? x + 14 : Math.max(4, x - 14 - width)
      const top = y + 18 + height <= box.height - 4 ? y + 18 : Math.max(4, y - 18 - height)
      mark.style.left = `${left}px`
      mark.style.top = `${top}px`
      window.clearTimeout(readoutTimer)
      if (touch) readoutTimer = window.setTimeout(hideReadout, TOUCH_READOUT_MS)
    }
    // "Land" follows the mouse over the Moon. It hides while the Moon is dragged and for a point in space;
    // on the map it only shows over the polar cap, the map's ground.
    const land = {
      at: null as { x: number; y: number } | null,
      pointerType: 'mouse',
      dirty: false,
      down: null as { x: number; y: number; dragged: boolean } | null,
    }
    // The place under a point of the stage: the dot it snaps to, or the ground. Null over space, and on
    // the map north of its edge.
    const targetAt = (x: number, y: number, pointerType: string): (GlobeLanding & { x: number; y: number }) | null => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return null
      pointer.set((x / host.clientWidth) * 2 - 1, 1 - (y / host.clientHeight) * 2)
      caster.setFromCamera(pointer, camera)
      const hit = caster.intersectObject(moon, false)[0]
      if (!hit) return null
      const ground = latLonOfVector(hit.point.x, hit.point.y, hit.point.z)
      if ((live.current.mode ?? 'orbit') === 'map' && ground.latitude_deg > (live.current.selectionMaxLatitudeDeg ?? MAP_EDGE_LATITUDE)) return null
      const snapped = nearestMarker(snapTargets(), { x, y }, hitRadius(pointerType))
      if (snapped) return { ...landPlace(snapped.site, catalogueId(snapped.site.id)), x: snapped.x, y: snapped.y, name: snapped.site.name }
      return { ...(live.current.precisionActive ? { lat: ground.latitude_deg, lon: ground.longitude_deg } : landPlace(ground)), x, y, name: null }
    }
    const landAt = (place: GlobeLanding) => live.current.onLand?.(toLanding(place))
    const onLandDown = (event: PointerEvent) => {
      land.down = { x: event.clientX, y: event.clientY, dragged: false }
    }
    const onLandMove = (event: PointerEvent) => {
      const box = host.getBoundingClientRect()
      if (land.down && Math.hypot(event.clientX - land.down.x, event.clientY - land.down.y) > 5) land.down.dragged = true
      if (event.pointerType === 'touch') return
      land.at = { x: event.clientX - box.left, y: event.clientY - box.top }
      land.pointerType = event.pointerType
      land.dirty = true
    }
    // One click that is not a drag gives one place: the place itself says which Site, when it snapped to one.
    const onLandUp = (event: PointerEvent) => {
      const down = land.down
      land.down = null
      const clicked = down !== null && !down.dragged && Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 5
      const state = live.current
      if (!clicked || state.dive) {
        land.dirty = true
        return
      }
      const box = host.getBoundingClientRect()
      const x = event.clientX - box.left
      const y = event.clientY - box.top
      if (event.pointerType === 'touch') {
        // A finger has no hover: the first tap shows the dot and the bubble, and the bubble is tapped to land.
        land.at = { x, y }
        land.pointerType = 'touch'
        land.dirty = true
        return
      }
      if ((state.mode ?? 'orbit') === 'map') {
        // The second click of a double click: the double click asks, the landing is off.
        if (cancelMapClick()) return
        const place = targetAt(x, y, event.pointerType)
        if (!place) return
        mapClick = window.setTimeout(() => {
          mapClick = 0
          landAt(place)
        }, MAP_CLICK_DELAY_MS)
        return
      }
      // In orbit a click lands at once; the second click of a double click is not a second landing.
      if (event.timeStamp - lastLanding < MAP_CLICK_DELAY_MS) return
      const place = targetAt(x, y, event.pointerType)
      if (!place) return
      lastLanding = event.timeStamp
      landAt(place)
    }
    const onLandLeave = (event: PointerEvent) => {
      // Onto the bubble itself it stays, so it can be clicked.
      if (event.relatedTarget instanceof Node && landLayer.current?.contains(event.relatedTarget)) return
      land.at = null
      land.down = null
    }
    target.addEventListener('pointerdown', onLandDown)
    target.addEventListener('pointermove', onLandMove)
    target.addEventListener('pointerup', onLandUp)
    target.addEventListener('pointerleave', onLandLeave)
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') showReadout(event)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') showReadout(event)
    }
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') hideReadout()
    }
    target.addEventListener('dblclick', onDouble)
    target.addEventListener('pointerdown', onDown)
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerleave', onLeave)

    let handle = 0
    const draw = (now: number) => {
      const state = live.current
      // Under the view from the ground the globe waits as it was, drawing nothing.
      if (state.paused) {
        handle = requestAnimationFrame(draw)
        return
      }
      const layersNow = layersLive.current
      const drawn = dotsFor
      if (!drawn || drawn.sites !== state.sites || drawn.sitesOn !== layersNow.sites || drawn.missionsOn !== layersNow.missions || drawn.chosen !== state.site.id) {
        rebuildDots(state.sites, layersNow, state.site.id)
      }

      const mode = state.mode ?? 'orbit'
      const map = mapLive.current
      const region = mode === 'map' ? (map.places.regions.find((entry) => entry.id === map.region) ?? null) : null
      const regionChanged = mode === 'map' && shownMode === 'map' && (region?.id ?? null) !== shownRegion
      // The dive to the ground comes first: while the camera is down there, or on its way, the
      // view's own flights wait. Coming back up lands where the view puts it.
      const wantDive = Boolean(state.dive) && !still
      if (wantDive !== shownDive) {
        const back = mode === 'map' ? (region ? regionPoint(region, camera.aspect) : mapPoint(camera.aspect, state.selectionMaxLatitudeDeg)) : viewpoint(state.site)
        dive = {
          from: camera.position.clone(),
          to: wantDive ? landingCamera(state.site, camera.position) : back,
          fromUp: camera.up.clone(),
          // Straight down near the pole the Moon's axis is the line of sight, so the map's up is used.
          // Beside the Site the ground's own up keeps the horizon level.
          toUp: wantDive ? vector(state.site.latitude_deg, state.site.longitude_deg) : mode === 'map' ? MAP_UP.clone() : ORBIT_UP.clone(),
          start: now,
          down: wantDive,
        }
        flight = null
        fade = null
        shownDive = wantDive
        // A globe never shown yet (a link opened on the ground) starts where the dive ends.
        if (wantDive && shownMode === null) {
          camera.position.copy(dive.to)
          camera.up.copy(dive.toUp)
          landingLook.copy(vector(state.site.latitude_deg, state.site.longitude_deg))
          camera.lookAt(landingLook)
          dive = null
        }
        if (wantDive) landingLook.copy(vector(state.site.latitude_deg, state.site.longitude_deg))
        if (!wantDive) {
          shownSite = state.site.id
          shownMode = mode
        shownEdge = state.selectionMaxLatitudeDeg
          shownRegion = region?.id ?? null
        }
        target.dataset.dive = dive ? (wantDive ? 'down' : 'up') : 'at-site'
      }
      // A button of the menu turns the Moon: the camera goes round it to the side asked for.
      const asked = turnAsked.current
      if (asked) {
        turnAsked.current = null
        // Initial position is the opening framing, on the side of the chosen Site; the others are places on the Moon.
        const place = asked === 'initial' ? viewpoint(state.site).setLength(framing()).toArray() : viewTarget(asked as MoonPlace, state.sun, framing())
        if (place && mode === 'orbit' && !state.dive) {
          const to = new THREE.Vector3(...place)
          framedAt = to.length()
          fade = null
          if (still) {
            flight = null
            camera.up.copy(ORBIT_UP)
            camera.position.copy(to)
            camera.lookAt(0, 0, 0)
          } else {
            flight = { from: camera.position.clone(), to, fromUp: camera.up.clone(), toUp: ORBIT_UP.clone(), start: now, ms: 1800, kind: 'view', toMap: false, arc: true }
          }
        }
      }
      // The camera flies when the view changes, in orbit when the Site does, and on the map when a
      // Region is flown into or out of. Choosing a Site on the map leaves the camera where it is.
      if (wantDive || dive) {
        // The view's own flights wait for the dive.
      } else if ((shownMode !== mode || shownEdge !== state.selectionMaxLatitudeDeg || (mode === 'orbit' && shownSite !== state.site.id) || regionChanged)) {
        // The opening framing is the Site's own side, as before, at the menu's 5 radii. It is not the point under the
        // Sun: from there the Sun is behind the camera and the backdrop would not show it.
        const to = mode === 'map' ? (region ? regionPoint(region, camera.aspect) : mapPoint(camera.aspect, state.selectionMaxLatitudeDeg)) : viewpoint(state.site).setLength(framing())

        const up = mode === 'map' ? MAP_UP : ORBIT_UP
        framedAt = mode === 'orbit' ? to.length() : null
        if (still && regionChanged) {
          flight = null
          fade = { to, up, start: now, jumped: false }
        } else if (still) {
          camera.up.copy(up)
          camera.position.copy(to)
          camera.lookAt(0, 0, 0)
        } else {
          fade = null
          flight = {
            from: camera.position.clone(),
            to,
            fromUp: camera.up.clone(),
            toUp: up.clone(),
            start: now,
            ms: regionChanged ? REGION_FLIGHT_MS : shownSite === null ? 3600 : 2200,
            kind: regionChanged ? 'region' : 'view',
            toMap: mode === 'map',
          }
        }
      }
      if (!wantDive && !dive) {
        shownSite = state.site.id
        shownMode = mode
        shownEdge = state.selectionMaxLatitudeDeg
        shownRegion = region?.id ?? null
      }
      // No free zoom on the map: it is flown by its Regions, not by the wheel.
      controls.enabled = mode === 'orbit' && flight === null && fade === null && dive === null && !wantDive
      // The fine patch of the pole belongs to the polar level: loaded when the view reaches it, freed when it leaves.
      dress.setPolar(mode === 'map')
      grid.visible = mode === 'map'
      selectionBoundary.visible = mode === 'map' && !!state.precisionActive
      target.dataset.selectionReady = String(selectionBoundary.visible && flight === null && fade === null)
      // On the map the Sites are buttons of their own (`MapLayer`), so the dots are for the orbit.
      siteDots.visible = missionDots.visible = mode !== 'map'
      if (dive) {
        const progress = Math.min(1, (now - dive.start) / (dive.down ? LANDING_MS : DIVE_MS))
        // Down the camera is beside the Site in the first half and the lander comes down in all of it;
        // back up it slows into place.
        const eased = dive.down ? 1 - Math.pow(1 - Math.min(1, progress * 2), 3) : 1 - Math.pow(1 - progress, 2)
        camera.position.lerpVectors(dive.from, dive.to, eased)
        camera.up.lerpVectors(dive.fromUp, dive.toUp, eased).normalize()
        // The look goes from the Moon's centre to the Site's ground on the way down, and back on the way up.
        camera.lookAt(landingLook.clone().multiplyScalar(dive.down ? eased : 1 - eased))
        lander.group.visible = dive.down
        if (dive.down) {
          const fall = 1 - Math.pow(1 - progress, 2)
          lander.group.position.copy(landingLook).multiplyScalar(1 + LANDER_START_HEIGHT * (1 - fall))
          lander.group.quaternion.setFromUnitVectors(ORBIT_UP, landingLook)
          // The engine flickers and goes out at touchdown.
          lander.flame.visible = progress < 0.94
          lander.flame.scale.y = 0.7 + 0.5 * Math.abs(Math.sin(now / 37)) * (1 - 0.6 * progress)
          target.dataset.lander = progress < 1 ? 'descending' : 'landed'
        }
        if (progress === 1) {
          target.dataset.dive = dive.down ? 'at-site' : ''
          state.onDive?.(dive.down)
          dive = null
        }
      } else if (flight) {
        const progress = Math.min(1, (now - flight.start) / flight.ms)
        const eased = 1 - Math.pow(1 - progress, 3)
        if (flight.arc) {
          const round = new THREE.Quaternion().setFromUnitVectors(flight.from.clone().normalize(), flight.to.clone().normalize())
          camera.position.copy(flight.from).applyQuaternion(new THREE.Quaternion().slerp(round, eased))
          camera.position.setLength(THREE.MathUtils.lerp(flight.from.length(), flight.to.length(), eased))
        } else {
          camera.position.lerpVectors(flight.from, flight.to, eased)
        }
        // Over the pole the two ups give the same picture, so the turn happens there.
        const turn = flight.toMap ? Math.pow(eased, 4) : 1 - Math.pow(1 - eased, 4)
        camera.up.lerpVectors(flight.fromUp, flight.toUp, turn).normalize()
        camera.lookAt(0, 0, 0)
        if (progress === 1) flight = null
      } else if (fade) {
        const progress = Math.min(1, (now - fade.start) / REGION_FADE_MS)
        if (progress >= 0.5 && !fade.jumped) {
          camera.up.copy(fade.up)
          camera.position.copy(fade.to)
          camera.lookAt(0, 0, 0)
          fade.jumped = true
        }
        const opacity = progress === 1 ? '' : String(Math.abs(1 - 2 * progress))
        for (const faded of [target, layer.current]) {
          if (!faded) continue
          faded.style.transition = opacity ? 'none' : ''
          faded.style.opacity = opacity
        }
        if (progress === 1) fade = null
      } else if (mode === 'orbit') {
        // Near the ground a drag moves the view as far as it moves far away, so it is slowed down.
        controls.rotateSpeed = Math.min(1, Math.max(0.03, (camera.position.length() - 1) / 2))
        controls.update()
      }

      if (state.sun) sunlight.position.copy(vector(state.sun.latitude_deg, state.sun.longitude_deg, 10))
      aim(toSun, state.site, state.sunAzimuthDeg, state.sunUp)
      aim(toEarth, state.site, state.earthAzimuthDeg, state.earthUp)
      const occluder = state.occluder ?? null
      toOccluder.visible = ring.visible = occluder !== null
      if (occluder) {
        const colour = occluder.body === 'sun' ? SUN : EARTH
        const there = vector(occluder.latitude_deg, occluder.longitude_deg, 1.003)
        toOccluder.geometry.setFromPoints([vector(state.site.latitude_deg, state.site.longitude_deg, 1.003), there])
        ;(toOccluder.material as THREE.LineBasicMaterial).color.set(colour)
        ;(ring.material as THREE.MeshBasicMaterial).color.set(colour)
        ring.position.copy(there)
        ring.lookAt(there.clone().multiplyScalar(2))
      }
      // The ring on the marked Occluder keeps its size on screen: up close it shrinks, so it never covers the craters.
      const onMap = mode === 'map'
      const dotSize = Math.min(1, Math.max(onMap ? 0.22 : 0.06, ((camera.position.length() - 1) / DOT_FULL_SIZE_HEIGHT) * (onMap ? 1.7 : 1)))
      ring.scale.setScalar(Math.max(0.12, dotSize))

      // How many dots are drawn (those on the far side count too: the Moon hides them), for the tests.
      const dotCount = String(siteDots.visible ? dotsDrawn : 0)
      if (target.dataset.dots !== dotCount) target.dataset.dots = dotCount

      // The Moon's disc on screen: its centre and its radius, from the camera's distance and field of view.
      const moonAt = new THREE.Vector3(0, 0, 0).project(camera)
      const moonCentre = { x: ((moonAt.x + 1) / 2) * host.clientWidth, y: ((1 - moonAt.y) / 2) * host.clientHeight }
      const moonDiscPx = moonRadiusPx(camera.position.length(), FIELD_OF_VIEW_DEG, host.clientHeight)
      // The marks of the Moon: only for the whole Moon from orbit, not the map or the dive, and once it is dressed.
      markGroup.visible = mode === 'orbit' && !state.dive && host.dataset.dressed === 'true' && Number.isFinite(moonDiscPx)
      const marksState = markGroup.visible ? 'on' : 'off'
      if (host.dataset.marks !== marksState) host.dataset.marks = marksState
      if (markGroup.visible) {
        const sizeOf = (share: number) => share * moonDiscPx * pixelRatio
        equatorBase.material.size = sizeOf(EQUATOR_BASE_WIDTH)
        equatorDots.material.size = sizeOf(EQUATOR_WIDTH)
        circleBase.material.size = CIRCLE_BASE_WIDTH_PX * pixelRatio
        circleDots.material.size = CIRCLE_WIDTH_PX * pixelRatio
        circleBase.visible = circleDots.visible = polarCircleShown(camera.position.length())
        poleDots.material.size = sizeOf(2 * POLE_DOT)
      }
      // What the menu takes of the stage (its panel, or the button it folds into on a phone): the names, the
      // letters and the planets' names keep out of it.
      // Measured at most once a frame, and only when something uses it (`needsMenuBoxes`): reading the layout
      // at every frame of the dive slowed it down on a loaded machine.
      let measuredMenu: Box[] | null = null
      const menuBoxes = (): Box[] => {
        if (measuredMenu) return measuredMenu
        const hostBox = host.getBoundingClientRect()
        const boxes: Box[] = []
        for (const element of host.querySelectorAll<HTMLElement>('.globe-menu, .globe-menu__toggle')) {
          const rect = element.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) boxes.push({ left: rect.left - hostBox.left, top: rect.top - hostBox.top, right: rect.right - hostBox.left, bottom: rect.bottom - hostBox.top })
        }
        measuredMenu = boxes
        return boxes
      }
      // The sky behind the Moon: the Sun and the Earth where the answer says they are at the Cursor.
      skyCamera.quaternion.copy(camera.quaternion)
      skyCamera.aspect = camera.aspect
      skyCamera.fov = camera.fov
      skyCamera.updateProjectionMatrix()
      skyCamera.updateMatrixWorld()
      const sunWay = state.sun ? vector(state.sun.latitude_deg, state.sun.longitude_deg).normalize() : null
      const earthWay = state.earth ? vector(state.earth.latitude_deg, state.earth.longitude_deg).normalize() : null
      const orbitalSky = mode === 'orbit' && !state.dive && !dive && !shownDive
      const sunRadius = state.sunRadiusDeg ?? 0, earthRadius = state.earthRadiusDeg ?? 0
      sunDisc.visible = sunHalo.visible = orbitalSky && sunWay !== null && sunRadius > 0
      if (sunWay) {
        const radius = discRadius(BACKDROP_SUN_DISTANCE, sunRadius)
        sunDisc.position.copy(sunWay).multiplyScalar(BACKDROP_SUN_DISTANCE)
        // The halo sits a little behind the disc, so the two never fight for the same depth.
        sunHalo.position.copy(sunDisc.position).multiplyScalar(1.02)
        sunDisc.scale.setScalar(radius)
        sunHalo.scale.setScalar(radius * 2 * HALO_REACH)
        sunDisc.lookAt(0, 0, 0)
      }
      earthBall.visible = orbitalSky && earthWay !== null && earthRadius > 0
      if (earthWay && state.earth) {
        earthBall.position.copy(earthWay).multiplyScalar(BACKDROP_EARTH_DISTANCE)
        earthBall.scale.setScalar(sphereRadius(BACKDROP_EARTH_DISTANCE, earthRadius))
        // Lit from where the Sun is, so it shows the phase it has from the Moon.
        if (sunWay) earthShade.uniforms.sunDirection.value.copy(sunWay)
        // The face turned to the Moon at the Cursor faces the Moon. Which way north leans is only
        // known from the Site's own sky, which the view from the ground has; here the Earth's north
        // is taken along the Moon's, which the Earth's axis is within about 30° of.
        if (state.cursorMs !== undefined) {
          const toMoon = earthWay.clone().negate()
          const [x, y, z] = earthAttitude(subLunarPoint(state.cursorMs), 0, [toMoon.x, toMoon.y, toMoon.z])
          if ([...x, ...y, ...z].every(Number.isFinite)) {
            earthBall.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)))
          }
        }
      }
      // Where the eye sees each, and how wide, from its centre and its edge as the backdrop camera
      // projects them: null when it is off the stage, behind the camera or behind the Moon.
      const across = new THREE.Vector3().setFromMatrixColumn(skyCamera.matrixWorld, 0)
      const ahead = skyCamera.getWorldDirection(new THREE.Vector3())
      const placed = (body: THREE.Object3D, way: THREE.Vector3 | null, radius: number) => {
        if (!body.visible || !way || way.dot(ahead) <= 0) return null
        // The Moon is in front of it when the line from the camera along its direction goes through the Moon.
        const far = way.clone().multiplyScalar(1e6).add(camera.position)
        if (moonHides(camera.position.toArray(), far.toArray())) return null
        const centre = body.position.clone().project(skyCamera)
        const edge = body.position.clone().addScaledVector(across, radius).project(skyCamera)
        const x = ((centre.x + 1) / 2) * host.clientWidth
        const y = ((1 - centre.y) / 2) * host.clientHeight
        if (x < 0 || x > host.clientWidth || y < 0 || y > host.clientHeight) return null
        return { x, y, r: (Math.abs(edge.x - centre.x) / 2) * host.clientWidth }
      }
      const sunSpot = placed(sunDisc, sunWay, discRadius(BACKDROP_SUN_DISTANCE, sunRadius))
      const earthSpot = placed(earthBall, earthWay, sphereRadius(BACKDROP_EARTH_DISTANCE, earthRadius))
      publish('sun', sunSpot)
      publish('earth', earthSpot)
      // The planets, where they are at the Cursor in the same frame as the Sun and the Earth, and which of
      // them are on the stage and not behind the Moon.
      planetSky.place(state.cursorMs, state.earth, state.sun)
      // The "Planets" switch of the menu: released, the points and their names are not drawn.
      const planetsOn = orbitalSky && layersLive.current.planets
      for (const [id, point] of planetSky.points) point.visible = planetsOn && planetSky.planets.some((planet) => planet.id === id)
      const planetSpots: { id: (typeof PLANETS)[number]['id']; x: number; y: number; magnitude: number }[] = []
      for (const planet of planetsOn ? planetSky.planets : []) {
        const point = planetSky.points.get(planet.id)
        const spot = point ? placed(point, planetWay(planet), 0) : null
        if (spot) planetSpots.push({ id: planet.id, x: spot.x, y: spot.y, magnitude: planet.magnitude })
      }
      const onStage = planetSpots.map((spot) => spot.id).join(',')
      if (host.dataset.planets !== onStage) host.dataset.planets = onStage
      // Where the camera is round the Moon: its distance in Moon radii, and its angles from the north pole and from 0°.
      const away = camera.position.length()
      const facts = {
        cameraDistance: away.toFixed(2),
        cameraPolar: ((Math.acos(Math.max(-1, Math.min(1, camera.position.y / away))) * 180) / Math.PI).toFixed(1),
        cameraAzimuth: ((Math.atan2(camera.position.x, camera.position.z) * 180) / Math.PI).toFixed(1),
      }
      for (const [key, value] of Object.entries(facts)) {
        if (host.dataset[key] !== value) host.dataset[key] = value
      }

      // First the sky, then the Moon over it with a clean depth buffer.
      renderer.clear()
      renderer.render(sky, skyCamera)
      renderer.clearDepth()
      renderer.render(scene, camera)
      target.dataset.ready = 'true'

      const label = pin.current
      // Where the Site's name is on the stage, for the names of the planets to keep clear of it.
      let pinBox: Box | null = null
      if (label) {
        const spot = onScreen(state.site)
        label.hidden = !spot.facing
        // The name goes on the side of the dot where it fits. Where it fits on neither, as on a
        // phone with the Site in the middle of the map, it takes the wider side and wraps.
        // The web font arrives after the first frame and changes the width, so it is part of the key.
        const text = `${document.fonts.status}:${label.textContent ?? ''}`
        if (spot.facing && text !== pinText.current.text) {
          label.classList.remove('globe__pin--wrap')
          label.style.maxWidth = ''
          pinText.current = { text, width: label.offsetWidth, height: label.offsetHeight }
        }
        const toRight = host.clientWidth - spot.x - PIN_GAP - PIN_EDGE
        // On the left of the dot the name stops at the menu, when the menu is level with it.
        // Only a name that does not fit on the right looks at the menu, which is on its left.
        const looksAtMenu = needsMenuBoxes({ mode, dive: dive !== null, shownDive, pinFacing: spot.facing, pinWidth: pinText.current.width, roomOnRight: toRight })
        const menuRight = !looksAtMenu ? 0 : Math.max(0, ...menuBoxes().filter((box) => spot.y + 12 > box.top && spot.y - 12 < box.bottom && box.right <= spot.x).map((box) => box.right))
        const toLeft = spot.x - PIN_GAP - Math.max(PIN_EDGE, menuRight)
        const left = pinText.current.width > toRight && toLeft > toRight
        const room = Math.max(left ? toLeft : toRight, 0)
        const wraps = pinText.current.width > room
        // On the map the layout below places it, clear of the Region markers.
        label.classList.remove('globe__pin--placed')
        label.classList.toggle('globe__pin--left', left)
        label.classList.toggle('globe__pin--wrap', wraps)
        label.style.maxWidth = wraps ? `${room}px` : ''
        label.style.left = `${spot.x}px`
        label.style.top = `${spot.y}px`
        if (spot.facing) {
          const width = wraps ? room : pinText.current.width
          const height = wraps ? Math.max(label.offsetHeight, pinText.current.height) : pinText.current.height
          const start = left ? spot.x - PIN_GAP - width : spot.x + PIN_GAP
          pinBox = { left: start, top: spot.y - height / 2, right: start + width, bottom: spot.y + height / 2 }
        }
      }
      // The chosen Site keeps a ring at every height, on the map and in orbit.
      const chosen = onScreen(state.site)
      const ringMark = chosenRing.current
      if (ringMark) {
        ringMark.hidden = !chosen.facing
        ringMark.style.left = `${chosen.x}px`
        ringMark.style.top = `${chosen.y}px`
        ringMark.dataset.lit = String(state.sunUp)
      }
      // "Land": the point of the Moon under the cursor, snapped to a dot close to it, and the bubble. On
      // the map too, over the polar cap, once the camera has settled.
      const landed = landLayer.current
      if (landed) {
        const settling = mode === 'map' && (flight !== null || fade !== null)
        const showing = !state.dive && !settling && land.at !== null && !land.down?.dragged
        if (showing && (land.dirty || flight || fade)) {
          land.dirty = false
          landTarget.current = targetAt(land.at!.x, land.at!.y, land.pointerType)
        }
        const spot = showing ? landTarget.current : null
        landed.hidden = !spot
        if (spot) {
          const [dot, bubble] = [landed.children[0] as HTMLElement, landed.children[1] as HTMLElement]
          const site = bubble.children[1] as HTMLElement
          if (site.textContent !== (spot.name ?? '')) site.textContent = spot.name ?? ''
          site.hidden = !spot.name
          dot.style.transform = `translate(${spot.x}px, ${spot.y}px) translate(-50%, -50%)`
          const gap = Math.max(12, host.clientWidth * 0.012)
          const left = bubbleOnLeft(spot.x, gap, bubble.offsetWidth, host.clientWidth)
          bubble.dataset.side = left ? 'left' : 'right'
          bubble.style.left = `${left ? spot.x - gap - bubble.offsetWidth : spot.x + gap}px`
          bubble.style.top = `${Math.max(8, Math.min(host.clientHeight - bubble.offsetHeight - 8, spot.y - bubble.offsetHeight * 1.05))}px`
        }
      }

      // The names of the missions in orbit, beside their dots. A name goes where it covers no other name,
      // dot, the chosen Site's ring or its name; one with no room waits, and shows on the dot's hover (in
      // the bubble of "Land") and on the keyboard's focus. Every mission keeps its button either way.
      const marksHost = marksLayer.current
      if (marksHost) {
        const showMarks = mode === 'orbit' && !state.dive
        marksHost.hidden = !showMarks
        const named: { button: HTMLButtonElement; name: HTMLElement; x: number; y: number; width: number; height: number }[] = []
        for (const site of state.sites) {
          const button = markElements.get(site.id)
          if (!button) continue
          const spot = showMarks && siteShown(site, layersNow) ? onScreen(site) : null
          const inside = spot !== null && spot.facing && spot.x >= 0 && spot.x <= host.clientWidth && spot.y >= 0 && spot.y <= host.clientHeight
          button.hidden = !inside
          if (!inside) continue
          button.style.left = `${spot.x}px`
          button.style.top = `${spot.y}px`
          const name = button.firstElementChild as HTMLElement | null
          if (!name) continue
          const key = `${document.fonts.status}:${name.textContent ?? ''}`
          let size = markSizes.get(key)
          if (!size) {
            size = { width: name.offsetWidth, height: name.offsetHeight }
            if (size.width > 0) markSizes.set(key, size)
          }
          named.push({ button, name, x: spot.x, y: spot.y, width: size.width, height: size.height })
        }
        if (named.length > 0) {
          const keepClear: Box[] = []
          if (chosen.facing) keepClear.push({ left: chosen.x - CHOSEN_RING_PX, top: chosen.y - CHOSEN_RING_PX, right: chosen.x + CHOSEN_RING_PX, bottom: chosen.y + CHOSEN_RING_PX })
          if (pinBox) keepClear.push(pinBox)
          // The menu's boxes are left out on purpose: measuring them every frame slowed the dive down.
          const radius = MARKERS.missions.sizePx / 2 + 1
          const places = placeLabels(named, radius, { left: 4, top: 4, right: host.clientWidth - 4, bottom: host.clientHeight - 4 }, keepClear)
          named.forEach(({ button, name, height }, index) => {
            const place = places[index] ?? null
            button.dataset.quiet = String(place === null)
            // A waiting name shows on the right of its dot when it has the focus.
            name.style.left = `${place ? place.x : radius + 4}px`
            name.style.top = `${place ? place.y : -height / 2}px`
          })
        }
      }
      // The letters N and S of the poles, over the stage: they stand outside the Moon, on its poles' own lines,
      // and turn with it. The dot on each pole, the Equator and the circle are in the scene above. A letter
      // never covers the Sun or the Earth, nor the menu: where it would, it is not drawn.
      const marks = poleMarks.current
      const poleBoxes: Box[] = []
      if (marks) {
        const toScreen = (point: THREE.Vector3) => {
          const projected = point.clone().project(camera)
          return { x: ((projected.x + 1) / 2) * host.clientWidth, y: ((1 - projected.y) / 2) * host.clientHeight }
        }
        const eye = camera.position
        const eyeAt = eye.clone().normalize()
        // A point of the unit sphere is on the near side when the camera is above its tangent plane.
        const near = (point: THREE.Vector3) => point.dot(eye) > 1
        const shown = markGroup.visible
        marks.style.display = shown ? '' : 'none'
        if (shown) {
          const bodies: Disc[] = [sunSpot, earthSpot].filter((spot): spot is { x: number; y: number; r: number } => spot !== null)
          POLES.forEach((pole, index) => {
            const group = marks.children[index] as SVGGElement | undefined
            if (!group) return
            const at = vector(pole.latitude, 0)
            const found = poleMark(toScreen(at), toScreen(at.clone().multiplyScalar(POLE_LETTER_RADII)), near(at), at.dot(eyeAt), moonCentre, moonDiscPx)
            const fontSize = POLE_LETTER_SIZE * moonDiscPx
            const clear = found !== null && letterClear(found.letter, fontSize * 0.5, bodies, menuBoxes())
            group.style.display = found && clear ? '' : 'none'
            if (!found || !clear) return
            poleBoxes.push({ left: found.letter.x - fontSize / 2, top: found.letter.y - fontSize / 2, right: found.letter.x + fontSize / 2, bottom: found.letter.y + fontSize / 2 })
            const [stroke, text] = [group.children[0], group.children[1]]
            group.setAttribute('opacity', String(found.opacity))
            // The stroke joins the letter to the pole's dot, which is on the Moon; only for a pole that faces the eye.
            stroke.setAttribute('display', found.dot ? '' : 'none')
            if (found.dot) {
              stroke.setAttribute('x1', String(found.dot.x))
              stroke.setAttribute('y1', String(found.dot.y))
              stroke.setAttribute('x2', String(found.letter.x))
              stroke.setAttribute('y2', String(found.letter.y))
              stroke.setAttribute('stroke-width', String(POLE_STROKE_WIDTH * moonDiscPx))
            }
            text.setAttribute('x', String(found.letter.x))
            text.setAttribute('y', String(found.letter.y))
            text.setAttribute('font-size', String(fontSize))
            text.setAttribute('stroke-width', String(POLE_LETTER_OUTLINE * moonDiscPx))
          })
        }
      }
      // The names of the planets: only in orbit and at rest, where the stage is the sky and not a chart
      // or the ground. A name never covers the Site and its name, the Sun, the Earth, the menu, the letters
      // of the poles, the caption's strip at the top or the view buttons' at the bottom, nor another planet.
      const planetLabels = planetNames.current
      if (planetLabels) {
        const named = new Map<string, 'right' | 'left'>()
        if (mode === 'orbit' && !flight && !fade && !dive && !shownDive) {
          const around = (spot: { x: number; y: number }, reach: number): Box => ({ left: spot.x - reach, top: spot.y - reach, right: spot.x + reach, bottom: spot.y + reach })
          const keepClear: Box[] = []
          if (pinBox) keepClear.push(pinBox)
          keepClear.push(...menuBoxes(), ...poleBoxes)
          if (chosen.facing) keepClear.push(around(chosen, 18))
          if (sunSpot) keepClear.push(around(sunSpot, sunSpot.r + 14))
          if (earthSpot) keepClear.push(around(earthSpot, earthSpot.r + 10))
          const candidates: LabelCandidate[] = planetSpots.map((spot) => ({
            ...spot,
            gap: pointLook(spot.magnitude).sizePx / 2 + 4,
            // A name is about six pixels a letter at this size, and one line tall.
            width: (planetLabels.children[PLANETS.findIndex((planet) => planet.id === spot.id)]?.textContent ?? '').length * 6.4 + 2,
            height: 14,
          }))
          const bounds: Box = { left: PIN_EDGE, top: 48, right: host.clientWidth - PIN_EDGE, bottom: host.clientHeight - 60 }
          for (const [id, side] of chooseLabels(candidates, bounds, keepClear)) named.set(id, side)
        }
        PLANETS.forEach((planet, index) => {
          const element = planetLabels.children[index] as HTMLElement | undefined
          if (!element) return
          const side = named.get(planet.id)
          const spot = planetSpots.find((entry) => entry.id === planet.id)
          element.hidden = !side || !spot
          if (!side || !spot) return
          const look = pointLook(spot.magnitude)
          const gap = look.sizePx / 2 + 4
          element.dataset.side = side
          element.style.left = `${side === 'right' ? spot.x + gap : spot.x - gap}px`
          element.style.top = `${spot.y}px`
          element.style.opacity = String(0.55 + 0.45 * look.brightness)
        })
        const shown = [...named.keys()].join(',')
        if (host.dataset.planetNames !== shown) host.dataset.planetNames = shown
      }
      const markers = layer.current
      // What the grid's labels keep clear of on the map: the chosen Site's name, the markers, the dots.
      let keepClear: { left: number; top: number; right: number; bottom: number }[] = []
      if (markers) {
        markers.hidden = mode !== 'map' || flight?.kind === 'view'
        if (!markers.hidden) {
          keepClear = positionMap(
            {
              width: host.clientWidth,
              height: host.clientHeight,
              project: onScreen,
              regions: map.places.regions,
              loose: map.places.loose,
              region: region?.id ?? null,
              chosen: { id: state.site.id, spot: chosen },
              pin: label && !label.hidden ? { element: label, width: pinText.current.width, height: pinText.current.height } : null,
            },
            elements,
            sizes,
          )
        }
      }
      const labels = gridLabels.current
      if (labels) {
        // Down in a Region the grid's labels are far off the picture, so they wait for the pole.
        labels.hidden = mode !== 'map' || flight !== null || region !== null
        if (!labels.hidden) {
          const spots = [
            ...[0, 90, 180, 270].map((longitude) => ({ latitude_deg: MAP_EDGE_LATITUDE - 0.6, longitude_deg: longitude })),
            ...LABELLED_LATITUDES.map((latitude) => ({ latitude_deg: latitude, longitude_deg: 135 })),
          ]
          spots.forEach((spot, index) => {
            const label = labels.children[index] as HTMLElement | undefined
            if (!label) return
            const at = onScreen(spot)
            // A label under the caption or over the view buttons would be read as part of them, and
            // one under the chosen Site's name or a marker would be read as part of that.
            // A hidden label has no size of its own, so its text stands in for it.
            const half = { x: (label.offsetWidth || (label.textContent ?? '').length * 7.5) / 2, y: (label.offsetHeight || 18) / 2 }
            const covered = keepClear.some(
              (box) => at.x - half.x < box.right && box.left < at.x + half.x && at.y - half.y < box.bottom && box.top < at.y + half.y,
            )
            label.hidden = at.y < 48 || at.y > host.clientHeight - 60 || covered
            label.style.left = `${at.x}px`
            label.style.top = `${at.y}px`
          })
        }
      }
      handle = requestAnimationFrame(draw)
    }
    handle = requestAnimationFrame(draw)

    return () => {
      gone = true
      cancelAnimationFrame(handle)
      observer.disconnect()
      target.removeEventListener('webglcontextlost', onContextLost)
      target.removeEventListener('dblclick', onDouble)
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerleave', onLeave)
      target.removeEventListener('pointerdown', onLandDown)
      target.removeEventListener('pointermove', onLandMove)
      target.removeEventListener('pointerup', onLandUp)
      target.removeEventListener('pointerleave', onLandLeave)
      cancelMapClick()
      window.clearTimeout(readoutTimer)
      controls.dispose()
      for (const points of [siteDots, missionDots]) {
        points.geometry.dispose()
        points.material.dispose()
      }
      dotLook?.dispose()
      moon.geometry.dispose()
      lander.dispose()
      dress.dispose()
      material.dispose()
      for (const shape of gridShapes) shape.dispose()
      for (const shape of markShapes) shape.dispose()
      for (const cloud of markGroup.children as THREE.Points[]) (cloud.material as THREE.Material).dispose()
      markTexture.dispose()
      gridLine.dispose()
      selectionBoundaryGeometry.dispose(); selectionBoundaryMaterial.dispose()
      ringShape.dispose()
      ;(ring.material as THREE.Material).dispose()
      stars.geometry.dispose()
      stars.material.dispose()
      for (const body of [sunDisc, earthBall]) {
        body.geometry.dispose()
        ;(body.material as THREE.Material).dispose()
      }
      earthMap?.dispose()
      planetSky.dispose()
      sunHalo.material.map?.dispose()
      sunHalo.material.dispose()
      for (const line of [toSun, toEarth, toOccluder]) {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
      releaseRenderer(renderer)
    }
    // Marker maps are stable; retrying graphics support rebuilds the scene after cleanup.
  }, [elements, markElements, supported])

  // The wait that ends the loading is on its own, so nothing that goes wrong while the scene is
  // set up can leave the stage loading for ever.
  useEffect(() => {
    const waited = window.setTimeout(() => setDressed(true), DRESS_WAIT_MS)
    return () => window.clearTimeout(waited)
  }, [])

  if (!supported) return <div className="stage__note" role="status">
    <p>{blocked ? t('globe.blocked') : props.unavailable}</p>
    {!blocked && <button type="button" onClick={() => setSupported(true)}>{t('error.retry')}</button>}
    <p><a href={`${window.location.pathname}${lightGraphicsSearch(window.location.search)}`}>{t('globe.light')}</a></p>
  </div>

  return (
    <div className="globe" ref={frame} data-dressed={dressed} data-mode={mode}>
      {LIGHT_GRAPHICS && <span style={{ position: 'absolute', top: 8, left: 12, zIndex: 2 }}>{t('globe.light.active')}</span>}
      {!dressed && <StageLoading />}
      <canvas ref={canvas} role="img" aria-label={props.label} data-lit={props.sunUp} />
      <span className="globe__chosen" ref={chosenRing} aria-hidden="true" hidden />
      <span className="globe__pin" ref={pin} aria-hidden="true">
        {props.site.name}
      </span>
      {mode === 'map' && (
        <MapLayer
          regions={places.regions}
          loose={places.loose}
          region={region}
          chosenId={props.site.id}
          elements={elements}
          layer={layer}
          onEvent={onMapEvent}
        />
      )}
      <div className="globe__planets" ref={planetNames} aria-hidden="true">
        {PLANETS.map((planet) => (
          <span key={planet.id} hidden>
            {t(`planet.${planet.id}`)}
          </span>
        ))}
      </div>
      <span className="globe__readout" ref={readout} aria-hidden="true" hidden />
      <svg className="globe__poles" ref={poleMarks} aria-hidden="true" style={{ display: 'none' }}>
        {POLES.map((pole) => (
          <g key={pole.letter} style={{ display: 'none' }}>
            <line />
            <text>{pole.letter}</text>
          </g>
        ))}
      </svg>
      <div className="globe__grid" ref={gridLabels} aria-hidden="true" hidden>
        {(props.meridianLabels ?? []).slice(0, 4).map((text) => (
          <span key={text}>{text}</span>
        ))}
        {LABELLED_LATITUDES.map((latitude) => (
          <span key={latitude}>{`${-latitude}°\u00a0S`}</span>
        ))}
      </div>
      {/* The missions' names in orbit: a button each, which lands there; the drawing loop moves them. */}
      <div className="globe-marks" ref={marksLayer} role="group" aria-label={words.missions} hidden>
        {missions.map((site) => (
          <button
            key={site.id}
            ref={(element) => {
              if (element) markElements.set(site.id, element)
              else markElements.delete(site.id)
            }}
            type="button"
            className="globe-mark"
            aria-label={fill(words.landAt, { place: site.name })}
            title={site.name}
            onClick={() => live.current.onLand?.({ ...landPlace(site, site.id), name: site.name })}
            hidden
          >
            <span className="globe-mark__name">{missionLabel(site.name)}</span>
          </button>
        ))}
      </div>
      <div className="globe-land" ref={landLayer} hidden>
        <span className="globe-land__dot" aria-hidden="true" />
        <button type="button" className="globe-land__bubble" aria-label={words.landHere} onClick={landHere}>
          <span>{words.land}</span>
          <span className="globe-land__site" hidden />
        </button>
      </div>
      <GlobeMenu
        mode={mode}
        level={props.level === undefined ? levelOfView(mode) : props.level}
        onLevel={props.onLevel}
        onPrecision={props.onPrecision}
        precisionActive={props.precisionActive}
        onView={(view) => {
          turnAsked.current = view
        }}
        onLayers={setLayers}
      />
    </div>
  )
}
