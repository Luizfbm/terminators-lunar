import { describe, expect, it } from 'vitest'
import { exampleRoute } from './fixtures'
import type { RouteWaypoint } from './types'
import {
  ARRIVE_M,
  AUTO_SPEED_M_S,
  AUTO_TURN_MAX_DEG_S,
  BACK_M_S,
  COLLECT_M,
  EDGE_MARGIN_M,
  FORWARD_M_S,
  NO_KEYS,
  OFF_PATH_M,
  TURN_DEG_S,
  batteryAt,
  bearingDeg,
  collectRays,
  faceSun,
  initialState,
  nearestIndex,
  resumeAuto,
  stepAuto,
  stepManual,
  turnBetween,
  wrapDeg,
  type WalkState,
  type WalkWorld,
} from './walk'

const flat: WalkWorld = { halfM: 5000, slopeLimitDeg: 15, slope5At: () => 0 }
const at = (x: number, y: number, headingDeg = 0, rest: Partial<WalkState> = {}): WalkState => ({
  ...initialState({ start: { x_m: x, y_m: y }, goal: { x_m: x, y_m: y + 100 } }, []),
  headingDeg,
  ...rest,
})
const waypoint = (x: number, y: number, battery = 1): RouteWaypoint => ({
  x_m: x,
  y_m: y,
  slope_5m_deg: 1,
  hazard: false,
  veto: false,
  battery_fraction: battery,
})
const forward = { ...NO_KEYS, forward: true }

describe('manual walking', () => {
  it('goes forward along the heading, measured clockwise from +y', () => {
    const north = stepManual(at(0, 0, 0), forward, 1, flat)
    expect(north.x).toBeCloseTo(0, 6)
    expect(north.y).toBeCloseTo(FORWARD_M_S, 6)
    const east = stepManual(at(0, 0, 90), forward, 1, flat)
    expect(east.x).toBeCloseTo(FORWARD_M_S, 6)
    expect(east.y).toBeCloseTo(0, 6)
    expect(east.distanceM).toBeCloseTo(FORWARD_M_S, 6)
  })

  it('backs up slower than it goes forward', () => {
    const back = stepManual(at(0, 0, 0), { ...NO_KEYS, back: true }, 1, flat)
    expect(back.y).toBeCloseTo(-BACK_M_S, 6)
    expect(BACK_M_S).toBeLessThan(FORWARD_M_S)
  })

  it('turns right with D and the right arrow, left with A and the left arrow, and wraps at north', () => {
    expect(stepManual(at(0, 0, 10), { ...NO_KEYS, right: true }, 1, flat).headingDeg).toBeCloseTo(10 + TURN_DEG_S, 6)
    expect(stepManual(at(0, 0, 10), { ...NO_KEYS, left: true }, 1, flat).headingDeg).toBeCloseTo(360 + 10 - TURN_DEG_S, 6)
  })

  it('does nothing without a key, and returns the same state', () => {
    const start = at(5, 5, 33)
    expect(stepManual(start, NO_KEYS, 1 / 60, flat)).toBe(start)
  })

  it('stops short of the grid’s edge', () => {
    const edge = flat.halfM - EDGE_MARGIN_M
    const north = stepManual(at(0, edge - 10, 0), forward, 1, flat)
    expect(north.y).toBe(edge)
    const west = stepManual(at(-edge + 10, 0, 270), forward, 1, flat)
    expect(west.x).toBe(-edge)
  })

  it('keeps a trail, a point every 25 m or so', () => {
    let state = at(0, 0, 0)
    for (let i = 0; i < 60; i++) state = stepManual(state, forward, 1 / 60, flat)
    // 60 frames at 95 m/s over a second walk 95 m: the start, then a point each time 25 m were passed.
    expect(state.trail[0]).toEqual({ x_m: 0, y_m: 0 })
    expect(state.trail.length).toBeGreaterThanOrEqual(4)
    expect(state.trail.length).toBeLessThanOrEqual(6)
    for (let i = 1; i < state.trail.length; i++) {
      const gap = Math.hypot(state.trail[i].x_m - state.trail[i - 1].x_m, state.trail[i].y_m - state.trail[i - 1].y_m)
      expect(gap).toBeGreaterThan(25)
      expect(gap).toBeLessThan(25 + FORWARD_M_S / 60 + 1e-6)
    }
  })

  it('counts each time it steps onto steep ground, not each step it stays there', () => {
    // Steeper than the 15 degree limit from y = 100 to y = 200 only.
    const world: WalkWorld = { ...flat, slope5At: (_x, y) => (y >= 100 && y < 200 ? 18 : 3) }
    let state = at(0, 0, 0)
    for (let i = 0; i < 600; i++) state = stepManual(state, forward, 1 / 60, world)
    // 950 m north: through the steep band once.
    expect(state.y).toBeGreaterThan(200)
    expect(state.steepEntered).toBe(1)
    expect(state.onSteep).toBe(false)
    // Back through it: a second entry.
    state = { ...state, headingDeg: 180 }
    for (let i = 0; i < 600; i++) state = stepManual(state, forward, 1 / 60, world)
    expect(state.steepEntered).toBe(2)
  })

  it('does not count ground exactly at the limit as steep', () => {
    const world: WalkWorld = { ...flat, slope5At: () => 15 }
    expect(stepManual(at(0, 0, 0), forward, 1 / 60, world).steepEntered).toBe(0)
  })
})

describe('angles', () => {
  it('wraps and measures the short way round', () => {
    expect(wrapDeg(-10)).toBe(350)
    expect(wrapDeg(725)).toBe(5)
    expect(turnBetween(350, 10)).toBeCloseTo(20, 6)
    expect(turnBetween(10, 350)).toBeCloseTo(-20, 6)
    expect(Math.abs(turnBetween(0, 180))).toBe(180)
  })

  it('reads a bearing from +y clockwise', () => {
    expect(bearingDeg({ x_m: 0, y_m: 0 }, { x_m: 0, y_m: 10 })).toBe(0)
    expect(bearingDeg({ x_m: 0, y_m: 0 }, { x_m: 10, y_m: 0 })).toBe(90)
    expect(bearingDeg({ x_m: 0, y_m: 0 }, { x_m: 0, y_m: -10 })).toBe(180)
    expect(bearingDeg({ x_m: 0, y_m: 0 }, { x_m: -10, y_m: 0 })).toBe(270)
  })
})

describe('autonomous drive', () => {
  // An L: 600 m north, then 600 m east, a waypoint every 50 m, battery falling along it.
  const path: RouteWaypoint[] = []
  for (let i = 0; i <= 12; i++) path.push(waypoint(0, i * 50, 1 - i * 0.01))
  for (let i = 1; i <= 12; i++) path.push(waypoint(i * 50, 600, 0.88 - i * 0.01))
  const run = (state: WalkState, frames: number) => {
    let now = state
    for (let i = 0; i < frames && !now.arrived; i++) now = stepAuto(now, path, 1 / 60, flat)
    return now
  }

  it('follows the waypoints round the corner and arrives at the last one', () => {
    const done = run(at(0, 0, 0), 60 * 60)
    expect(done.arrived).toBe(true)
    expect(Math.hypot(done.x - 600, done.y - 600)).toBeLessThan(ARRIVE_M + 5)
    expect(done.waypointIndex).toBe(path.length - 1)
    // It went the way of the plan: the corner was passed, not cut across the diagonal.
    expect(done.trail.some((point) => point.y_m > 520 && point.x_m < 100)).toBe(true)
  })

  it('turns toward a waypoint behind it no faster than its limit', () => {
    const start = at(0, 100, 180)
    const turned = stepAuto(start, path, 1 / 60, flat)
    expect(Math.abs(turnBetween(start.headingDeg, turned.headingDeg))).toBeLessThanOrEqual(AUTO_TURN_MAX_DEG_S / 60 + 1e-9)
  })

  it('drives at its own pace', () => {
    const moved = stepAuto(at(0, 0, 0), path, 1, flat)
    expect(moved.distanceM).toBeCloseTo(AUTO_SPEED_M_S, 6)
  })

  it('passes the waypoints it is already close to', () => {
    const near = stepAuto(at(0, 0, 0), path, 1 / 60, flat)
    // The start and the next 50 m waypoint are both inside 65 m, the one after is not.
    expect(near.waypointIndex).toBe(2)
  })

  it('does not move once arrived, or on an empty plan', () => {
    const done = { ...at(0, 0, 0), arrived: true }
    expect(stepAuto(done, path, 1, flat)).toBe(done)
    const idle = at(0, 0, 0)
    expect(stepAuto(idle, [], 1, flat)).toBe(idle)
  })

  it('resumes from the nearest waypoint after the rover was driven by hand', () => {
    const away = at(300, 600, 90, { arrived: true, waypointIndex: 0 })
    const resumed = resumeAuto(away, path)
    expect(resumed.arrived).toBe(false)
    expect(resumed.waypointIndex).toBe(nearestIndex(path, 300, 600))
    expect(path[resumed.waypointIndex].x_m).toBe(300)
  })
})

describe('on the contract example', () => {
  const route = exampleRoute()
  const multi = route.plans.find((plan) => plan.navigation === 'multiresolution')!
  const normal = route.plans.find((plan) => plan.navigation === 'normal')!

  it('starts on the route’s start facing along its plan', () => {
    for (const plan of [normal, multi]) {
      const state = initialState(route, plan.path)
      expect([state.x, state.y]).toEqual([route.start.x_m, route.start.y_m])
      const next = plan.path.find((point) => Math.hypot(point.x_m - route.start.x_m, point.y_m - route.start.y_m) > 1)!
      expect(state.headingDeg).toBeCloseTo(bearingDeg(route.start, { x_m: next.x_m, y_m: next.y_m }), 9)
    }
  })

  it('drives both plans to their end on flat ground, along their waypoints', () => {
    for (const plan of [normal, multi]) {
      let state = initialState(route, plan.path)
      let frames = 0
      while (!state.arrived && frames++ < 60 * 120) state = stepAuto(state, plan.path, 1 / 60, flat)
      expect(state.arrived).toBe(true)
      const end = plan.path[plan.path.length - 1]
      expect(Math.hypot(state.x - end.x_m, state.y - end.y_m)).toBeLessThan(ARRIVE_M + 5)
      // The rover covers about the plan's own length: it follows the plan and does not wander.
      expect(state.distanceM).toBeGreaterThan(plan.distance_m * 0.9)
      expect(state.distanceM).toBeLessThan(plan.distance_m * 1.25)
    }
  })

  it('reads the battery from the plan at the waypoint nearest the rover', () => {
    const sagging = multi.path.map((point, index) => ({ ...point, battery_fraction: 1 - index / 200 }))
    const here = sagging[10]
    const reading = batteryAt(sagging, here.x_m + 3, here.y_m - 2)
    expect(reading?.index).toBe(10)
    expect(reading?.fraction).toBe(here.battery_fraction)
    expect(reading?.offsetM).toBeCloseTo(Math.hypot(3, 2), 9)
  })
})

describe('battery', () => {
  const path = [waypoint(0, 0, 1), waypoint(50, 0, 0.8), waypoint(100, 0, 0.6)]

  it('is the plan’s own figure and nothing computed from the walk', () => {
    expect(batteryAt(path, 52, 4)?.fraction).toBe(0.8)
    expect(batteryAt(path, 100, 0)?.fraction).toBe(0.6)
  })

  it('has no figure once the rover is more than 120 m from every waypoint', () => {
    expect(batteryAt(path, 50, OFF_PATH_M)).not.toBeNull()
    expect(batteryAt(path, 50, OFF_PATH_M + 1)).toBeNull()
    expect(batteryAt([], 0, 0)).toBeNull()
  })
})

describe('facing the Sun', () => {
  it('points the heading at the Sun’s azimuth and leaves everything else', () => {
    const start = at(10, 20, 123, { distanceM: 40 })
    const turned = faceSun(start, 215.5)
    expect(turned.headingDeg).toBe(215.5)
    expect([turned.x, turned.y, turned.distanceM]).toEqual([10, 20, 40])
    expect(faceSun(start, 365).headingDeg).toBe(5)
    expect(faceSun(start, -90).headingDeg).toBe(270)
  })

  it('then drives toward the Sun', () => {
    const walked = stepManual(faceSun(at(0, 0, 0), 90), forward, 1, flat)
    expect(walked.x).toBeGreaterThan(90)
    expect(Math.abs(walked.y)).toBeLessThan(1e-6)
  })
})

describe('collecting the rays', () => {
  const rays = [
    { x_m: 100, y_m: 0 },
    { x_m: 0, y_m: 300 },
    { x_m: 1000, y_m: 1000 },
  ]

  it('picks up a ray the rover comes within 55 m of', () => {
    expect(collectRays(at(100, COLLECT_M - 1), rays).collected).toEqual([0])
    expect(collectRays(at(100, COLLECT_M + 1), rays).collected).toEqual([])
  })

  it('picks each ray up once, and several together', () => {
    const pair = [
      { x_m: 100, y_m: 0 },
      { x_m: 110, y_m: 10 },
    ]
    const both = collectRays(at(100, 0), pair)
    expect(both.collected).toEqual([0, 1])
    expect(collectRays(both, pair)).toBe(both)
  })

  it('collects along a drive and gives no energy: only the count changes', () => {
    let state = at(0, 0, 90)
    for (let i = 0; i < 120; i++) state = collectRays(stepManual(state, forward, 1 / 60, flat), rays)
    expect(state.collected).toEqual([0])
    // Nothing else of the walk depends on a ray: the rover is where the keys put it.
    expect(state.y).toBeCloseTo(0, 6)
    expect(state.steepEntered).toBe(0)
  })

  it('leaves the state alone when there are no rays, as in the contract example', () => {
    const state = at(0, 0)
    expect(collectRays(state, exampleRoute().solar_points)).toBe(state)
  })
})
