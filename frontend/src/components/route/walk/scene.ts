import * as THREE from 'three'
import { centreOf, normalAt, reliefAt, type WalkGrid } from './terrain'
import type { Navigation, PlanePoint, RouteWaypoint, WalkSun } from './types'
import type { WalkState } from './walk'

// The 3D stage of the walk, after Eduardo's `surface_3d_terrain.js`: a mesh of the grid's own heights,
// the two routes, the trail, the goal's beacon, the rays and the rover. It draws no micro-relief and no
// rocks: every height on screen is the grid's. Only the browser runs it (it needs WebGL); the movement
// and the collection live in walk.ts, which is tested.

const GROUND = [0.46, 0.48, 0.52] as const
const STEEP = [0.72, 0.24, 0.22] as const
const MEASURED = [0.34, 0.54, 0.62] as const
const ROUTE_COLOUR: Record<Navigation, number> = { normal: 0xf4f1ea, multiresolution: 0x10b981 }
const TRAIL_COLOUR = 0x00e5ff
const RAY_COLOUR = 0xfacc15

const ROUTE_LIFT_M = 3
const TRAIL_LIFT_M = 2
const TRAIL_CAPACITY = 6000
/** Eduardo's chase camera: close behind the rover, or far back and high for the tactical view. */
const CHASE_DISTANCE_M = 24
const CHASE_HEIGHT_M = 11
const TACTICAL_DISTANCE_M = 340
const TACTICAL_HEIGHT_M = 370
const LOOK_AHEAD_M = 95

export interface SceneInput {
  grid: WalkGrid
  /** The Rover's slope limit, for the red ground. */
  slopeLimitDeg: number
  routes: Record<Navigation, RouteWaypoint[]>
  goal: PlanePoint
  rays: PlanePoint[]
  /** The picture's context is gone: the stage falls back to the flat map. */
  onLost: () => void
}

export interface SceneFrame {
  state: WalkState
  accepted: Navigation
  sun: WalkSun | null
  /** 0 behind the rover, 1 from far above; the camera eases toward it. */
  view: number
  dt: number
  time: number
}

export interface WalkScene {
  resize: (width: number, height: number) => void
  frame: (frame: SceneFrame) => void
  dispose: () => void
}

function paintGround(colours: Float32Array, grid: WalkGrid, slopeLimitDeg: number) {
  for (let i = 0; i < grid.n * grid.n; i++) {
    // Red where the 5 m slope of the block is past the limit, blue where a laser shot fell, grey elsewhere.
    const colour = grid.slope5Deg[i] > slopeLimitDeg ? STEEP : grid.measured[i] ? MEASURED : GROUND
    colours[i * 3] = colour[0]
    colours[i * 3 + 1] = colour[1]
    colours[i * 3 + 2] = colour[2]
  }
}

function terrainGeometry(grid: WalkGrid, slopeLimitDeg: number): THREE.BufferGeometry {
  const { n } = grid
  const positions = new Float32Array(n * n * 3)
  const colours = new Float32Array(n * n * 3)
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const at = row * n + col
      const { x, y } = centreOf(grid, row, col)
      // x east, up is the height, and -z is plane north (+y).
      positions[at * 3] = x
      positions[at * 3 + 1] = grid.reliefM[at]
      positions[at * 3 + 2] = -y
    }
  }
  paintGround(colours, grid, slopeLimitDeg)
  const index = new Uint32Array((n - 1) * (n - 1) * 6)
  let k = 0
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col
      index.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], k)
      k += 6
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  geometry.computeVertexNormals()
  return geometry
}

function pathGeometry(grid: WalkGrid, path: RouteWaypoint[], lift: number): THREE.BufferGeometry {
  const positions = new Float32Array(path.length * 3)
  path.forEach((point, i) => {
    positions[i * 3] = point.x_m
    positions[i * 3 + 1] = reliefAt(grid, point.x_m, point.y_m) + lift
    positions[i * 3 + 2] = -point.y_m
  })
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3))
}

/** A small low-poly rover: a body, four wheels and a panel tilted up at its front. Forward is -z. */
function buildRover(made: { dispose(): void }[]): THREE.Group {
  const group = new THREE.Group()
  const body = new THREE.BoxGeometry(3.4, 1.1, 4.6)
  const wheel = new THREE.CylinderGeometry(0.75, 0.75, 0.6, 14)
  wheel.rotateZ(Math.PI / 2)
  const panel = new THREE.BoxGeometry(3.6, 0.12, 2.8)
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.6, metalness: 0.2 })
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.9 })
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x1d3a7a, roughness: 0.35, metalness: 0.5, emissive: 0x0a1a40 })
  made.push(body, wheel, panel, bodyMaterial, wheelMaterial, panelMaterial)
  const bodyMesh = new THREE.Mesh(body, bodyMaterial)
  bodyMesh.position.y = 1.25
  group.add(bodyMesh)
  for (const [x, z] of [
    [-2.0, -1.6],
    [2.0, -1.6],
    [-2.0, 1.6],
    [2.0, 1.6],
  ]) {
    const mesh = new THREE.Mesh(wheel, wheelMaterial)
    mesh.position.set(x, 0.75, z)
    group.add(mesh)
  }
  const panelMesh = new THREE.Mesh(panel, panelMaterial)
  panelMesh.position.set(0, 2.2, -0.6)
  panelMesh.rotation.x = -0.35
  group.add(panelMesh)
  return group
}

export function createWalkScene(canvas: HTMLCanvasElement, input: SceneInput): WalkScene {
  // Throws when the context cannot be had: the caller falls back to the flat map.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x050506)
  const lost = (event: Event) => {
    event.preventDefault()
    input.onLost()
  }
  canvas.addEventListener('webglcontextlost', lost)

  const { grid } = input
  const made: { dispose(): void }[] = []
  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2(0x070a10, 0.0006)
  scene.fog = fog
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, 1, 40000)

  const ambient = new THREE.AmbientLight(0x3a4860, 0.6)
  const sunlight = new THREE.DirectionalLight(0xfff4dd, 2)
  scene.add(ambient, sunlight)

  const terrain = new THREE.Mesh(
    terrainGeometry(grid, input.slopeLimitDeg),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.04 }),
  )
  made.push(terrain.geometry, terrain.material as THREE.Material)
  scene.add(terrain)

  // Both routes stay on screen; the accepted one is the bright one.
  const routeLines = {} as Record<Navigation, THREE.Line>
  const routePoints = {} as Record<Navigation, THREE.Points>
  for (const navigation of ['normal', 'multiresolution'] as const) {
    const geometry = pathGeometry(grid, input.routes[navigation], ROUTE_LIFT_M)
    const lineMaterial = new THREE.LineBasicMaterial({ color: ROUTE_COLOUR[navigation], transparent: true })
    const pointMaterial = new THREE.PointsMaterial({ color: ROUTE_COLOUR[navigation], size: 4, sizeAttenuation: false, transparent: true })
    routeLines[navigation] = new THREE.Line(geometry, lineMaterial)
    routePoints[navigation] = new THREE.Points(geometry, pointMaterial)
    made.push(geometry, lineMaterial, pointMaterial)
    scene.add(routeLines[navigation], routePoints[navigation])
  }

  // The trail grows into a buffer set aside at the start, so it never reallocates while walking.
  const trailPositions = new Float32Array(TRAIL_CAPACITY * 3)
  const trailGeometry = new THREE.BufferGeometry()
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3))
  trailGeometry.setDrawRange(0, 0)
  const trailMaterial = new THREE.LineBasicMaterial({ color: TRAIL_COLOUR })
  const trail = new THREE.Line(trailGeometry, trailMaterial)
  trail.frustumCulled = false
  made.push(trailGeometry, trailMaterial)
  scene.add(trail)
  let trailCount = 0

  const beaconGeometry = new THREE.CylinderGeometry(1.2, 1.2, 42, 12)
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: 0xffd147, transparent: true, opacity: 0.7 })
  const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial)
  beacon.position.set(input.goal.x_m, reliefAt(grid, input.goal.x_m, input.goal.y_m) + 21, -input.goal.y_m)
  made.push(beaconGeometry, beaconMaterial)
  scene.add(beacon)

  const boltGeometry = new THREE.OctahedronGeometry(1.5, 0)
  boltGeometry.scale(0.65, 1.45, 0.65)
  const boltMaterial = new THREE.MeshStandardMaterial({ color: RAY_COLOUR, emissive: 0xeab308, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.2 })
  const ringGeometry = new THREE.RingGeometry(1.8, 2.3, 18)
  ringGeometry.rotateX(-Math.PI / 2)
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
  made.push(boltGeometry, boltMaterial, ringGeometry, ringMaterial)
  const rays = input.rays.map((ray) => {
    const holder = new THREE.Group()
    const ground = reliefAt(grid, ray.x_m, ray.y_m)
    holder.position.set(ray.x_m, ground, -ray.y_m)
    const bolt = new THREE.Mesh(boltGeometry, boltMaterial)
    bolt.position.y = 3
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.position.y = 1.2
    holder.add(bolt, ring)
    scene.add(holder)
    return { holder, bolt }
  })

  const rover = buildRover(made)
  scene.add(rover)

  const up = new THREE.Vector3(0, 1, 0)
  const tilt = new THREE.Quaternion()
  const yaw = new THREE.Quaternion()
  const normal = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const lookAt = new THREE.Vector3()
  let zoom = 0

  return {
    resize(width, height) {
      if (width <= 0 || height <= 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },
    frame({ state, accepted, sun, view, dt, time }) {
      const heading = (state.headingDeg * Math.PI) / 180
      const ground = reliefAt(grid, state.x, state.y)

      // The rover stands on the ground, tilted to it and turned to its heading.
      const n = normalAt(grid, state.x, state.y)
      normal.set(n.x, n.z, -n.y)
      tilt.setFromUnitVectors(up, normal)
      yaw.setFromAxisAngle(up, -heading)
      rover.quaternion.copy(tilt).multiply(yaw)
      rover.position.set(state.x, ground, -state.y)

      // The Sun's direction at the Cursor, taken in the grid's plane the way the route's solar points are.
      if (sun) {
        const az = (sun.azimuthDeg * Math.PI) / 180
        const el = (Math.max(sun.elevationDeg, 3) * Math.PI) / 180
        sunlight.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(1000)
        sunlight.intensity = 2
        ambient.intensity = 0.6
      } else {
        sunlight.position.set(300, 800, 200)
        sunlight.intensity = 0.8
        ambient.intensity = 1
      }

      for (const navigation of ['normal', 'multiresolution'] as const) {
        const on = navigation === accepted
        ;(routeLines[navigation].material as THREE.LineBasicMaterial).opacity = on ? 0.95 : 0.35
        ;(routePoints[navigation].material as THREE.PointsMaterial).opacity = on ? 0.95 : 0.35
      }

      // Only the trail's new points are written; a shorter trail is a new walk, and starts the buffer over.
      const wanted = Math.min(state.trail.length, TRAIL_CAPACITY)
      if (wanted < trailCount) trailCount = 0
      for (let i = trailCount; i < wanted; i++) {
        const point = state.trail[i]
        trailPositions[i * 3] = point.x_m
        trailPositions[i * 3 + 1] = reliefAt(grid, point.x_m, point.y_m) + TRAIL_LIFT_M
        trailPositions[i * 3 + 2] = -point.y_m
      }
      if (wanted !== trailCount) {
        trailGeometry.attributes.position.needsUpdate = true
        trailGeometry.setDrawRange(0, wanted)
        trailCount = wanted
      }

      rays.forEach((ray, index) => {
        const taken = state.collected.includes(index)
        ray.holder.visible = !taken
        if (taken) return
        ray.bolt.position.y = 3 + Math.sin(time * 2.8 + index) * 0.45
        ray.bolt.rotation.y = time * 1.8 + index
      })

      // Eduardo's camera: behind and above the rover, easing out to a far, high view and back.
      zoom += (view - zoom) * Math.min(1, dt * 5)
      fog.density = 0.0006 * (1 - zoom * 0.85)
      const distance = CHASE_DISTANCE_M + zoom * (TACTICAL_DISTANCE_M - CHASE_DISTANCE_M)
      const height = CHASE_HEIGHT_M + zoom * (TACTICAL_HEIGHT_M - CHASE_HEIGHT_M)
      ahead.set(Math.sin(heading), 0, -Math.cos(heading))
      // The camera's place in the plane, then lifted: never under the ground, whatever rises behind the rover.
      const camX = state.x - ahead.x * distance
      const camY = state.y + ahead.z * distance
      camera.position.set(camX, Math.max(ground + height, reliefAt(grid, camX, camY) + 6), -camY)
      const look = LOOK_AHEAD_M * (1 - zoom * 0.75)
      lookAt.set(state.x + ahead.x * look, ground - 2.5 * (1 - zoom), -state.y + ahead.z * look)
      camera.lookAt(lookAt)
      renderer.render(scene, camera)
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', lost)
      for (const thing of made) thing.dispose()
      renderer.dispose()
    },
  }
}
