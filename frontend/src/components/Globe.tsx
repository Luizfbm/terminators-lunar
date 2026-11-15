import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { earthAttitude, subLunarPoint } from '../domain/earthFace'
import { groundDirection, toVector, type LatLon } from '../domain/sky'
import { bodyPlace, bodySizes, moonRadiusPx, type Rect } from '../domain/stageBodies'
import { useRegions } from '../hooks/useRegions'
import { useI18n } from '../i18n/I18nContext'
import { MAP_EDGE_LATITUDE, mapPlaces, mapStep, pointOnMap, regionHeight, type MapEvent, type MapRegion, type MapView } from './globeMap/map'
import { MapLayer, type MarkerElements } from './globeMap/MapLayer'
import { positionMap, type NameSizes } from './globeMap/position'
import { readoutText } from './globeMap/readout'
import './globeMap/globeMap.css'
import { dressMoon } from './moonSurface'
import { earthMaterial as makeEarthMaterial, EARTH, glowTexture, loadEarthMap, SUN } from './spaceBodies'
import { StageLoading } from './StageLoading'
import { DIVE_MS } from '../domain/stageMove'
import { canDraw } from './webgl'

export interface GlobeSite extends LatLon {
  id: string
  name: string
  /** The Region the Site belongs to: the map shows one marker per Region seen from the pole. */
  region_id?: string | null
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
}

const GRID_LATITUDES = [-88, -86, -84, -82, -80]
const LABELLED_LATITUDES = [-85, -80]

const DOT = 0xe9e7e2
const DOT_OTHER = 0x77787f
const DOT_ON_MAP = 0xcfd3dc
const PICK_RADIUS_PX = 16
const FIELD_OF_VIEW_DEG = 32
/** The Sun and the Earth are drawn this far outside the Moon's disc, and keep clear of the caption and the view buttons. */
const BODY_GAP_PX = 14
const BODY_INSET = { top: 56, right: 24, bottom: 72, left: 24 }
/** The Sun's halo reaches this many times the radius of its disc. */
const HALO_REACH = 7
/** What the Sun and the Earth keep clear of around the chosen Site's dot, and from each other, in pixels. */
const DOT_CLEAR_PX = 16
/** How long the stage waits for the images of the Moon before showing it without them. */
const DRESS_WAIT_MS = 6000
/** The Site name starts this far from its dot and keeps this far from the edge of the stage. */
const PIN_GAP = 12
const PIN_EDGE = 8
/** Height above the surface, in Moon radii, from which the Site dots are drawn at full size. */
const DOT_FULL_SIZE_HEIGHT = 2.3
/** The flight into a Region and back out, and the fade that stands in for it with reduced motion. */
const REGION_FLIGHT_MS = 800
const REGION_FADE_MS = 300
/** The dive ends this far above the Site, in Moon radii (about 21 km): the Site fills the stage. */
const DIVE_HEIGHT = 0.012
/** On a touch screen the readout of a tapped point stays this long. */
const TOUCH_READOUT_MS = 2500
/** In orbit the camera's up is the Moon's axis; on the map it is the 0° meridian, so the map never turns. */
const ORBIT_UP = new THREE.Vector3(0, 1, 0)
const MAP_UP = new THREE.Vector3(1, 0, 0)

const vector = (lat: number, lon: number, radius = 1) => new THREE.Vector3(...toVector(lat, lon)).multiplyScalar(radius)

/** Far enough to see the limb, and the line between day and night crossing the pole. */
/**
 * Straight down on the pole, with the 80° S circle inside the shorter side of the stage. A hair off
 * the pole towards 0° of longitude, so that meridian points up and the view has no singular point.
 */
const mapPoint = (aspect: number) => vector(-89.9, 0, 0.99 + 0.2 / (Math.tan((16 * Math.PI) / 180) * Math.min(1, aspect)))

/** Straight down on the Site, close enough that it fills the stage. */
const divePoint = (site: LatLon) => vector(site.latitude_deg, site.longitude_deg, 1 + DIVE_HEIGHT)

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
  const live = useRef(props)
  const [supported, setSupported] = useState(canDraw)

  // The map: one marker per Region from the pole, the Sites of one Region once flown into it.
  const { locale } = useI18n()
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
    mapLive.current = { places, region, locale }
  })

  useEffect(() => {
    const host = frame.current
    const target = canvas.current
    if (!host || !target) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas: target, antialias: true })
    } catch {
      // `canDraw` said yes and the context still failed, as it does when the graphics process
      // is out of room: say so, like a browser that cannot draw at all, instead of loading for ever.
      // After this effect, not inside it: the effect only reports what it found.
      queueMicrotask(() => setSupported(false))
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

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
    const material = new THREE.MeshStandardMaterial({ color: 0x9a9891, roughness: 1, metalness: 0 })
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), material)
    scene.add(moon)
    const large = renderer.capabilities.maxTextureSize >= 8192 && !window.matchMedia('(pointer: coarse)').matches
    // The Moon is shown once it has its colour and relief, never as a plain grey ball. A slow
    // network does not hold it back for ever: after DRESS_WAIT_MS it shows as it is.
    const show = () => setDressed(true)
    const undress = dressMoon(scene, material, renderer.capabilities.getMaxAnisotropy(), large, show, (size) => {
      target.dataset.moon = size
    })
    // Earthshine and a little more: the night side stays dark, and its relief can still be read.
    scene.add(new THREE.AmbientLight(0xffffff, 0.085))
    const sunlight = new THREE.DirectionalLight(0xfff4e0, 3.2)
    scene.add(sunlight)

    // The Sun and the Earth as bodies in the scene, the way the view from the ground draws them
    // (the requirement): the Sun a disc with a soft halo, the Earth a ball with the Blue Marble,
    // lit from the Sun's side so it shows its phase. Seen from orbit the Moon fills the picture and
    // the real distances put both far outside it, so each is placed on the side of the Moon where it
    // lies, with its distance and size compressed to fit. They are drawn over everything else, and
    // `bodyPlace` keeps them off the Moon's disc, the Site and the buttons.
    let gone = false
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: SUN, depthTest: false, depthWrite: false }))
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthTest: false, depthWrite: false, transparent: true }))
    const earthShade = makeEarthMaterial()
    earthShade.depthTest = false
    earthShade.depthWrite = false
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
    const earthBall = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), earthShade)
    sunHalo.renderOrder = 20
    sunDisc.renderOrder = 21
    earthBall.renderOrder = 22
    for (const body of [sunHalo, sunDisc, earthBall]) {
      body.visible = false
      body.frustumCulled = false
      scene.add(body)
    }
    // Where each is on the stage, for whoever needs to know: pixels from its top left, empty when it is not drawn.
    const publish = (name: 'sun' | 'earth', spot: { x: number; y: number } | null, radius: number) => {
      const values = { X: spot ? String(Math.round(spot.x)) : '', Y: spot ? String(Math.round(spot.y)) : '', R: spot ? String(Math.round(radius)) : '' }
      for (const [axis, value] of Object.entries(values)) {
        const key = `${name}${axis}`
        if (host.dataset[key] !== value) host.dataset[key] = value
      }
    }

    const dotShape = new THREE.SphereGeometry(0.004, 12, 12)
    const dots = new THREE.Group()
    scene.add(dots)
    let dotsFor: readonly GlobeSite[] | null = null
    const rebuildDots = (sites: readonly GlobeSite[]) => {
      for (const dot of [...dots.children] as THREE.Mesh[]) {
        dots.remove(dot)
        ;(dot.material as THREE.Material).dispose()
      }
      for (const site of sites) {
        const dot = new THREE.Mesh(dotShape, new THREE.MeshBasicMaterial({ color: DOT_OTHER }))
        dot.position.copy(vector(site.latitude_deg, site.longitude_deg, 1.002))
        dot.userData.id = site.id
        dots.add(dot)
      }
      dotsFor = sites
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
    controls.maxDistance = 6
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
    } | null = null
    // With reduced motion a Region is reached by a short fade instead: out, a jump, back in.
    let fade: { to: THREE.Vector3; up: THREE.Vector3; start: number; jumped: boolean } | null = null
    // The dive to the ground and back: a flight of its own, which the view's flights wait for.
    let dive: { from: THREE.Vector3; to: THREE.Vector3; fromUp: THREE.Vector3; toUp: THREE.Vector3; start: number; down: boolean } | null = null
    let shownDive = false
    let shownSite: string | null = null
    let shownMode: 'orbit' | 'map' | null = null
    let shownRegion: string | null = null
    const sizes: NameSizes = new Map()
    camera.position.set(5.2, 0.6, 4.4)
    camera.lookAt(0, 0, 0)

    const resize = () => {
      const { clientWidth: width, clientHeight: height } = host
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const onScreen = (site: LatLon) => {
      const point = vector(site.latitude_deg, site.longitude_deg, 1.002)
      const facing = point.clone().normalize().dot(camera.position.clone().normalize()) > 0.15
      const projected = point.project(camera)
      return { facing, x: ((projected.x + 1) / 2) * host.clientWidth, y: ((1 - projected.y) / 2) * host.clientHeight }
    }

    // A click that is not a drag picks the nearest Site under the pointer. On the map the Regions
    // and Sites are buttons of their own, so the canvas leaves the click to them.
    let pressed: { x: number; y: number } | null = null
    const onUp = (event: PointerEvent) => {
      if ((live.current.mode ?? 'orbit') === 'map') return
      if (!pressed || Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 5) return
      const box = host.getBoundingClientRect()
      let best: { id: string; distance: number } | null = null
      for (const site of live.current.sites) {
        const spot = onScreen(site)
        const distance = Math.hypot(spot.x - (event.clientX - box.left), spot.y - (event.clientY - box.top))
        if (spot.facing && distance <= PICK_RADIUS_PX && (!best || distance < best.distance)) best = { id: site.id, distance }
      }
      if (best && best.id !== live.current.site.id) live.current.onSelect(best.id)
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
    const onDouble = (event: MouseEvent) => {
      if ((live.current.mode ?? 'orbit') !== 'map' || !live.current.onPoint) return
      const place = groundAt(event)
      if (!place) return
      const round = (value: number) => Math.round(value * 100) / 100
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
    const onDown = (event: PointerEvent) => {
      pressed = { x: event.clientX, y: event.clientY }
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
    target.addEventListener('pointerup', onUp)
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
      if (dotsFor !== state.sites) rebuildDots(state.sites)

      const mode = state.mode ?? 'orbit'
      const map = mapLive.current
      const region = mode === 'map' ? (map.places.regions.find((entry) => entry.id === map.region) ?? null) : null
      const regionChanged = mode === 'map' && shownMode === 'map' && (region?.id ?? null) !== shownRegion
      // The dive to the ground comes first: while the camera is down there, or on its way, the
      // view's own flights wait. Coming back up lands where the view puts it.
      const wantDive = Boolean(state.dive) && !still
      if (wantDive !== shownDive) {
        const back = mode === 'map' ? (region ? regionPoint(region, camera.aspect) : mapPoint(camera.aspect)) : viewpoint(state.site)
        dive = {
          from: camera.position.clone(),
          to: wantDive ? divePoint(state.site) : back,
          fromUp: camera.up.clone(),
          // Straight down near the pole the Moon's axis is the line of sight, so the map's up is used.
          toUp: wantDive || mode === 'map' ? MAP_UP.clone() : ORBIT_UP.clone(),
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
          camera.lookAt(0, 0, 0)
          dive = null
        }
        if (!wantDive) {
          shownSite = state.site.id
          shownMode = mode
          shownRegion = region?.id ?? null
        }
        target.dataset.dive = dive ? (wantDive ? 'down' : 'up') : 'at-site'
      }
      // The camera flies when the view changes, in orbit when the Site does, and on the map when a
      // Region is flown into or out of. Choosing a Site on the map leaves the camera where it is.
      if (wantDive || dive) {
        // The view's own flights wait for the dive.
      } else if (shownMode !== mode || (mode === 'orbit' && shownSite !== state.site.id) || regionChanged) {
        const to = mode === 'map' ? (region ? regionPoint(region, camera.aspect) : mapPoint(camera.aspect)) : viewpoint(state.site)
        const up = mode === 'map' ? MAP_UP : ORBIT_UP
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
        shownRegion = region?.id ?? null
      }
      // No free zoom on the map: it is flown by its Regions, not by the wheel.
      controls.enabled = mode === 'orbit' && flight === null && fade === null && dive === null && !wantDive
      grid.visible = mode === 'map'
      dots.visible = mode !== 'map'
      if (dive) {
        const progress = Math.min(1, (now - dive.start) / DIVE_MS)
        // Down it speeds up into the ground; back up it slows into place.
        const eased = dive.down ? progress * progress : 1 - Math.pow(1 - progress, 2)
        camera.position.lerpVectors(dive.from, dive.to, eased)
        camera.up.lerpVectors(dive.fromUp, dive.toUp, eased).normalize()
        camera.lookAt(0, 0, 0)
        if (progress === 1) {
          target.dataset.dive = dive.down ? 'at-site' : ''
          state.onDive?.(dive.down)
          dive = null
        }
      } else if (flight) {
        const progress = Math.min(1, (now - flight.start) / flight.ms)
        const eased = 1 - Math.pow(1 - progress, 3)
        camera.position.lerpVectors(flight.from, flight.to, eased)
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
      // The dots keep their size on screen: up close they shrink, so they never cover the craters.
      // On the map the Sites are what you came for, so they stay larger and lighter than in orbit.
      const onMap = mode === 'map'
      const dotSize = Math.min(1, Math.max(onMap ? 0.22 : 0.06, ((camera.position.length() - 1) / DOT_FULL_SIZE_HEIGHT) * (onMap ? 1.7 : 1)))
      ring.scale.setScalar(Math.max(0.12, dotSize))
      for (const dot of dots.children as THREE.Mesh[]) {
        const chosen = dot.userData.id === state.site.id
        ;(dot.material as THREE.MeshBasicMaterial).color.set(chosen ? (state.sunUp ? SUN : DOT) : onMap ? DOT_ON_MAP : DOT_OTHER)
        dot.scale.setScalar((chosen ? 1.8 : 1) * dotSize)
      }

      // The Sun and the Earth, once the camera has settled for the frame. Not while it flies, and
      // not on the way down to the ground: they come back where it lands.
      camera.updateMatrixWorld()
      const stageWidth = host.clientWidth
      const stageHeight = host.clientHeight
      const flying = flight !== null || dive !== null || wantDive
      const bodyPx = bodySizes(Math.min(stageWidth, stageHeight))
      const moonAt = new THREE.Vector3(0, 0, 0).project(camera)
      const moonCentre = { x: ((moonAt.x + 1) / 2) * stageWidth, y: ((1 - moonAt.y) / 2) * stageHeight }
      const moonRing = moonRadiusPx(camera.position.length(), FIELD_OF_VIEW_DEG, stageHeight)
      // What the two keep clear of: the chosen Site's dot and its name, then each other.
      const bodyClear: Rect[] = []
      const siteSpot = onScreen(state.site)
      if (siteSpot.facing) {
        bodyClear.push({ left: siteSpot.x - DOT_CLEAR_PX, top: siteSpot.y - DOT_CLEAR_PX, right: siteSpot.x + DOT_CLEAR_PX, bottom: siteSpot.y + DOT_CLEAR_PX })
      }
      const nameBox = pin.current
      if (nameBox && !nameBox.hidden) {
        const name = nameBox.getBoundingClientRect()
        const stage = host.getBoundingClientRect()
        bodyClear.push({ left: name.left - stage.left, top: name.top - stage.top, right: name.right - stage.left, bottom: name.bottom - stage.top })
      }
      const seat = (key: 'sun' | 'earth', where: LatLon | null, radius: number) => {
        const seen = where && !flying ? vector(where.latitude_deg, where.longitude_deg).transformDirection(camera.matrixWorldInverse) : null
        const spot = seen
          ? bodyPlace(seen.x, seen.y, moonCentre, moonRing + BODY_GAP_PX + radius, radius, { width: stageWidth, height: stageHeight, inset: BODY_INSET }, bodyClear)
          : null
        publish(key, spot, radius)
        if (spot) bodyClear.push({ left: spot.x - radius, top: spot.y - radius, right: spot.x + radius, bottom: spot.y + radius })
        return spot
      }
      // Along the ray through that spot, as far from the camera as the Moon's centre: one pixel is then this wide.
      const depth = camera.position.length()
      const perPixel = (2 * depth * Math.tan((FIELD_OF_VIEW_DEG * Math.PI) / 360)) / stageHeight
      const ahead = camera.getWorldDirection(new THREE.Vector3())
      const putAt = (object: THREE.Object3D, spot: { x: number; y: number }) => {
        const ray = new THREE.Vector3((spot.x / stageWidth) * 2 - 1, 1 - (spot.y / stageHeight) * 2, 0.5).unproject(camera).sub(camera.position).normalize()
        object.position.copy(camera.position).addScaledVector(ray, depth / ray.dot(ahead))
      }
      const sunSpot = seat('sun', state.sun, bodyPx.sun)
      sunDisc.visible = sunHalo.visible = sunSpot !== null
      if (sunSpot) {
        putAt(sunDisc, sunSpot)
        sunHalo.position.copy(sunDisc.position)
        sunDisc.scale.setScalar(bodyPx.sun * perPixel)
        sunHalo.scale.setScalar(bodyPx.sun * perPixel * 2 * HALO_REACH)
        sunDisc.lookAt(camera.position)
      }
      const earthSpot = seat('earth', state.earth ?? null, bodyPx.earth)
      earthBall.visible = earthSpot !== null
      if (earthSpot && state.earth) {
        putAt(earthBall, earthSpot)
        earthBall.scale.setScalar(bodyPx.earth * perPixel)
        // Lit from where the Sun is, wherever the Earth is drawn.
        if (state.sun) earthShade.uniforms.sunDirection.value.copy(vector(state.sun.latitude_deg, state.sun.longitude_deg)).normalize()
        // The face turned to the Moon at the Cursor faces the Moon. Which way north leans is only
        // known from the Site's own sky, which the view from the ground has: here the Earth's north
        // is down for a Site in the south and up for one in the north.
        if (state.cursorMs !== undefined) {
          const toMoon = vector(state.earth.latitude_deg, state.earth.longitude_deg).normalize().negate()
          const lean = state.site.latitude_deg < 0 ? 180 : 0
          const [x, y, z] = earthAttitude(subLunarPoint(state.cursorMs), lean, [toMoon.x, toMoon.y, toMoon.z], [camera.up.x, camera.up.y, camera.up.z])
          if ([...x, ...y, ...z].every(Number.isFinite)) {
            earthBall.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)))
          }
        }
      }

      renderer.render(scene, camera)
      target.dataset.ready = 'true'

      const label = pin.current
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
        const toLeft = spot.x - PIN_GAP - PIN_EDGE
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
      target.removeEventListener('dblclick', onDouble)
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerleave', onLeave)
      window.clearTimeout(readoutTimer)
      controls.dispose()
      for (const dot of dots.children as THREE.Mesh[]) (dot.material as THREE.Material).dispose()
      dotShape.dispose()
      moon.geometry.dispose()
      undress()
      material.dispose()
      for (const shape of gridShapes) shape.dispose()
      gridLine.dispose()
      ringShape.dispose()
      ;(ring.material as THREE.Material).dispose()
      stars.geometry.dispose()
      stars.material.dispose()
      for (const body of [sunDisc, earthBall]) {
        body.geometry.dispose()
        ;(body.material as THREE.Material).dispose()
      }
      earthMap?.dispose()
      sunHalo.material.map?.dispose()
      sunHalo.material.dispose()
      for (const line of [toSun, toEarth, toOccluder]) {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }
      renderer.dispose()
    }
    // `elements` is made once and never replaced, so the scene is still set up once.
  }, [elements])

  // The wait that ends the loading is on its own, so nothing that goes wrong while the scene is
  // set up can leave the stage loading for ever.
  useEffect(() => {
    const waited = window.setTimeout(() => setDressed(true), DRESS_WAIT_MS)
    return () => window.clearTimeout(waited)
  }, [])

  if (!supported) return <p className="stage__note">{props.unavailable}</p>

  return (
    <div className="globe" ref={frame} data-dressed={dressed} data-mode={mode}>
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
      <span className="globe__readout" ref={readout} aria-hidden="true" hidden />
      <div className="globe__grid" ref={gridLabels} aria-hidden="true" hidden>
        {(props.meridianLabels ?? []).slice(0, 4).map((text) => (
          <span key={text}>{text}</span>
        ))}
        {LABELLED_LATITUDES.map((latitude) => (
          <span key={latitude}>{`${-latitude}°\u00a0S`}</span>
        ))}
      </div>
    </div>
  )
}
