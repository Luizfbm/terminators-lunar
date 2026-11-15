import type { PlanePoint, RouteComparison, RouteWaypoint } from './types'

// The walk's movement and the rays' collection, ported from Eduardo's `stepRover` and
// `pointToSun` (tese_ui.js) as plain functions with no three.js and no DOM, so they can be tested.
// His speeds are kept: they are a game's pace, not the rover's (the plan carries the real duration).

/** Degrees per second when a turn key is held. */
export const TURN_DEG_S = 55
/** Metres per second of the walk going forward, and backing up. */
export const FORWARD_M_S = 95
export const BACK_M_S = 60
/** The autonomous pace and how hard it steers toward the next waypoint. */
export const AUTO_SPEED_M_S = 85
export const AUTO_TURN_GAIN = 2.6
export const AUTO_TURN_MAX_DEG_S = 95
/** A waypoint closer than this is passed; the last one is reached inside `ARRIVE_M`. */
export const WAYPOINT_SKIP_M = 65
export const ARRIVE_M = 60
/** A ray is collected when the rover comes this close. */
export const COLLECT_M = 55
/** How far from the grid's edge the rover stops. */
export const EDGE_MARGIN_M = 200
/** A new trail point once the rover has moved this far from the last. */
export const TRAIL_STEP_M = 25
/** Farther than this from every waypoint, the plan says nothing about the battery (the plan "reaches" within 120 m). */
export const OFF_PATH_M = 120

/** What the walk needs to know about the ground, so tests can pass a flat one. */
export interface WalkWorld {
  halfM: number
  /** The Rover's slope limit, in degrees. */
  slopeLimitDeg: number
  slope5At: (x: number, y: number) => number
}

export interface WalkState {
  x: number
  y: number
  /** Degrees clockwise from the grid's +y axis, 0 <= value < 360. */
  headingDeg: number
  distanceM: number
  /** How many times the rover went onto ground steeper than the limit at 5 m (not how many steps it stayed). */
  steepEntered: number
  onSteep: boolean
  trail: PlanePoint[]
  /** Index of the waypoint the autonomous drive is heading for. */
  waypointIndex: number
  /** Indices into `solar_points` already collected. */
  collected: number[]
  /** The autonomous drive reached the end of the plan. */
  arrived: boolean
}

export interface Held {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
}

export const NO_KEYS: Held = { forward: false, back: false, left: false, right: false }

export const anyHeld = (held: Held) => held.forward || held.back || held.left || held.right

export function wrapDeg(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** The bearing from one point to another, degrees clockwise from +y. */
export function bearingDeg(from: PlanePoint, to: PlanePoint): number {
  return wrapDeg((Math.atan2(to.x_m - from.x_m, to.y_m - from.y_m) * 180) / Math.PI)
}

/** The signed turn from one heading to a bearing, -180 to 180. */
export function turnBetween(fromDeg: number, toDeg: number): number {
  const diff = wrapDeg(toDeg - fromDeg)
  return diff > 180 ? diff - 360 : diff
}

/** Where a walk starts: on the route's start, facing along the first leg of the chosen plan. */
export function initialState(route: Pick<RouteComparison, 'start' | 'goal'>, path: RouteWaypoint[]): WalkState {
  const next = path.find((point) => Math.hypot(point.x_m - route.start.x_m, point.y_m - route.start.y_m) > 1)
  const aim = next ? { x_m: next.x_m, y_m: next.y_m } : route.goal
  return {
    x: route.start.x_m,
    y: route.start.y_m,
    headingDeg: bearingDeg(route.start, aim),
    distanceM: 0,
    steepEntered: 0,
    onSteep: false,
    trail: [{ x_m: route.start.x_m, y_m: route.start.y_m }],
    waypointIndex: 0,
    collected: [],
    arrived: false,
  }
}

/** Moves the rover along its heading, stopping at the grid's edge, and keeps the trail and the steep count. */
function advance(state: WalkState, metres: number, world: WalkWorld): WalkState {
  if (metres === 0) return state
  const limit = world.halfM - EDGE_MARGIN_M
  const rad = (state.headingDeg * Math.PI) / 180
  const x = Math.min(limit, Math.max(-limit, state.x + Math.sin(rad) * metres))
  const y = Math.min(limit, Math.max(-limit, state.y + Math.cos(rad) * metres))
  const onSteep = world.slope5At(x, y) > world.slopeLimitDeg
  const last = state.trail[state.trail.length - 1]
  const trail =
    !last || Math.hypot(x - last.x_m, y - last.y_m) > TRAIL_STEP_M ? [...state.trail, { x_m: x, y_m: y }] : state.trail
  return {
    ...state,
    x,
    y,
    distanceM: state.distanceM + Math.hypot(x - state.x, y - state.y),
    onSteep,
    steepEntered: state.steepEntered + (onSteep && !state.onSteep ? 1 : 0),
    trail,
  }
}

/** One frame of the keys: turn, then move, the way Eduardo's loop does. `dt` is in seconds. */
export function stepManual(state: WalkState, held: Held, dt: number, world: WalkWorld): WalkState {
  let turn = 0
  if (held.left) turn = -TURN_DEG_S * dt
  if (held.right) turn = TURN_DEG_S * dt
  let metres = 0
  if (held.forward) metres = FORWARD_M_S * dt
  if (held.back) metres = -BACK_M_S * dt
  const turned = turn === 0 ? state : { ...state, headingDeg: wrapDeg(state.headingDeg + turn) }
  return advance(turned, metres, world)
}

/**
 * One frame of the autonomous drive: steer toward the next waypoint of the accepted plan (passing the
 * ones within `WAYPOINT_SKIP_M`) and drive, until the last waypoint is within `ARRIVE_M`.
 */
export function stepAuto(state: WalkState, path: RouteWaypoint[], dt: number, world: WalkWorld): WalkState {
  if (state.arrived || path.length === 0) return state
  const last = path.length - 1
  const from = { x_m: state.x, y_m: state.y }
  const gap = (index: number) => Math.hypot(path[index].x_m - state.x, path[index].y_m - state.y)
  let index = Math.min(state.waypointIndex, last)
  while (index < last && gap(index) < WAYPOINT_SKIP_M) index++
  if (index === last && gap(last) < ARRIVE_M) return { ...state, waypointIndex: index, arrived: true }
  const wanted = bearingDeg(from, { x_m: path[index].x_m, y_m: path[index].y_m })
  const diff = turnBetween(state.headingDeg, wanted)
  const turn = Math.max(-AUTO_TURN_MAX_DEG_S * dt, Math.min(AUTO_TURN_MAX_DEG_S * dt, diff * AUTO_TURN_GAIN * dt))
  const steered = { ...state, waypointIndex: index, headingDeg: wrapDeg(state.headingDeg + turn) }
  return advance(steered, AUTO_SPEED_M_S * dt, world)
}

/** The F key and the Sun button: face the Sun, the way Eduardo's `pointToSun` does. */
export function faceSun(state: WalkState, azimuthDeg: number): WalkState {
  return { ...state, headingDeg: wrapDeg(azimuthDeg) }
}

/**
 * Picks up the rays the rover is close to. A ray carries no energy (the contract says so): collecting
 * only counts it. Returns the same state when none is new.
 */
export function collectRays(state: WalkState, rays: PlanePoint[]): WalkState {
  const fresh: number[] = []
  rays.forEach((ray, index) => {
    if (state.collected.includes(index)) return
    if (Math.hypot(ray.x_m - state.x, ray.y_m - state.y) < COLLECT_M) fresh.push(index)
  })
  return fresh.length === 0 ? state : { ...state, collected: [...state.collected, ...fresh] }
}

export interface PlanBattery {
  /** The battery fraction of the plan's nearest waypoint, 0 to 1. */
  fraction: number
  index: number
  /** How far the rover is from that waypoint. */
  offsetM: number
}

/**
 * The battery the screen shows: `battery_fraction` of the accepted plan's waypoint nearest the rover.
 * Nothing is computed from the walk. Null once the rover is farther than `OFF_PATH_M` from the plan,
 * where the plan has no figure to give.
 */
export function batteryAt(path: RouteWaypoint[], x: number, y: number): PlanBattery | null {
  let best: PlanBattery | null = null
  for (let index = 0; index < path.length; index++) {
    const offsetM = Math.hypot(path[index].x_m - x, path[index].y_m - y)
    if (best === null || offsetM < best.offsetM) best = { fraction: path[index].battery_fraction, index, offsetM }
  }
  return best !== null && best.offsetM <= OFF_PATH_M ? best : null
}

/** The index of the waypoint nearest a point. */
export function nearestIndex(path: RouteWaypoint[], x: number, y: number): number {
  let best = 0
  let bestGap = Infinity
  for (let index = 0; index < path.length; index++) {
    const gap = Math.hypot(path[index].x_m - x, path[index].y_m - y)
    if (gap < bestGap) {
      best = index
      bestGap = gap
    }
  }
  return best
}

/** Hands the wheel to the autonomous drive from wherever the rover stands: it heads for the nearest waypoint. */
export function resumeAuto(state: WalkState, path: RouteWaypoint[]): WalkState {
  return { ...state, waypointIndex: nearestIndex(path, state.x, state.y), arrived: false }
}
