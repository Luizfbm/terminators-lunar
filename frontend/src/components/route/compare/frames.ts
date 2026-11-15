import type { RoutePlan, Swarm } from './types'

/**
 * What is on screen at a point of the animation, from the API's paths and swarm. `progress` runs
 * from 0 to 1. Nothing here plans or scores a route: it only says how far along each recorded path
 * the animation has got (ADR 0002).
 */

/** The first quarter of the animation zooms out from the Rover to the whole crop. */
export const ZOOM_END = 0.26
/** The swarm runs through its generations in the first two thirds; the rest shows the last one settled. */
export const SWARM_END = 0.65
const ZOOM_FROM = 2.4

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** Zoom 2.4x on the start easing out to 1x; `ease` is 0 to 1 and also moves the focus to the centre. */
export function zoomAt(progress: number): { zoom: number; ease: number } {
  const t = clamp01(progress / ZOOM_END)
  const ease = 1 - Math.pow(1 - t, 3)
  return { zoom: ZOOM_FROM - (ZOOM_FROM - 1) * ease, ease }
}

export interface PlanFrame {
  /** Index of the last waypoint the Rover has reached. */
  index: number
  /** Waypoints steeper than the limit, up to `index`. */
  hazards: number
  /** Vetoes up to `index`. */
  vetoes: number
  /** Distance so far, in metres: the plan's `distance_m` spread evenly over its waypoints. */
  distanceM: number
  /** Battery at the Rover's waypoint, 0 to 1. */
  batteryFraction: number
  /** The Rover is at the last waypoint. */
  arrived: boolean
}

export function planFrame(plan: RoutePlan, progress: number): PlanFrame {
  const last = plan.path.length - 1
  if (last < 1) return { index: 0, hazards: 0, vetoes: 0, distanceM: 0, batteryFraction: plan.path[0]?.battery_fraction ?? 1, arrived: true }
  const index = Math.max(1, Math.min(last, Math.floor(clamp01(progress) * last)))
  let hazards = 0
  let vetoes = 0
  for (let i = 0; i <= index; i++) {
    if (plan.path[i].hazard) hazards++
    if (plan.path[i].veto) vetoes++
  }
  return {
    index,
    hazards,
    vetoes,
    distanceM: (index / last) * plan.distance_m,
    batteryFraction: plan.path[index].battery_fraction,
    arrived: index === last,
  }
}

export type AgentState = 'moving' | 'fallen' | 'arrived'

export interface AgentFrame {
  state: AgentState
  /** Where the agent is, in the plane. */
  x_m: number
  y_m: number
  /** Direction of travel in radians on the plane (atan2 of dy, dx), for the moving ones. */
  heading: number
  /** Index of the last path point reached. */
  index: number
}

export interface SwarmFrame {
  /** Generation on screen, from 1. */
  generation: number
  generations: number
  /** The generation's `survivors`, as the API says. */
  survivors: number
  total: number
  /** Agents of this generation that stopped for good by now. */
  fallen: number
  /** The generations before this one, whose faint trails stay. */
  earlier: number[]
  /** The swarm has stopped searching and shows its last generation. */
  settled: boolean
  agents: AgentFrame[]
}

/** The longest path of the swarm: one time axis for every agent of every generation. */
export function swarmSteps(swarm: Swarm): number {
  let longest = 4
  for (const generation of swarm.generations) {
    for (const agent of generation.agents) longest = Math.max(longest, agent.path.length)
  }
  return longest
}

export function swarmFrame(swarm: Swarm, progress: number): SwarmFrame | null {
  const generations = swarm.generations
  if (generations.length === 0) return null
  const phase = clamp01(progress / SWARM_END)
  const g = Math.min(generations.length - 1, Math.floor(Math.min(0.999, phase) * generations.length))
  const localT = progress < SWARM_END ? Math.max(0.04, Math.min(1, phase * generations.length - g)) : 1
  const stepFloat = localT * (swarmSteps(swarm) - 1)
  const generation = generations[g]
  let fallen = 0
  const agents: AgentFrame[] = []
  for (const agent of generation.agents) {
    const path = agent.path
    if (path.length === 0) continue
    const index = Math.min(path.length - 1, Math.floor(stepFloat))
    const at = path[index]
    const before = path[Math.max(0, index - 1)]
    const after = path[Math.min(path.length - 1, index + 1)]
    const reachedEnd = stepFloat >= path.length - 1
    if (agent.dead && reachedEnd) fallen++
    agents.push({
      state: reachedEnd ? (agent.dead ? 'fallen' : 'arrived') : 'moving',
      x_m: at[0],
      y_m: at[1],
      heading: Math.atan2(after[1] - before[1], after[0] - before[0]),
      index,
    })
  }
  return {
    generation: generation.generation,
    generations: generations.length,
    survivors: generation.survivors,
    total: generation.agents.length,
    fallen,
    earlier: Array.from({ length: g }, (_, i) => i),
    settled: progress >= SWARM_END,
    agents,
  }
}
