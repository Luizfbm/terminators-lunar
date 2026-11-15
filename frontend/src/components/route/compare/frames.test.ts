import { describe, expect, it } from 'vitest'
import { routeExample } from './exampleData'
import { planFrame, swarmFrame, swarmSteps, SWARM_END, ZOOM_END, zoomAt } from './frames'
import type { RoutePlan, Swarm } from './types'

const [normal, multi] = routeExample.plans
const swarm = routeExample.swarm as Swarm

describe('the zoom-out', () => {
  it('opens at 2.4x on the start and ends at 1x once the first quarter is over', () => {
    expect(zoomAt(0)).toEqual({ zoom: 2.4, ease: 0 })
    expect(zoomAt(ZOOM_END).zoom).toBeCloseTo(1)
    expect(zoomAt(0.9).zoom).toBe(1)
    expect(zoomAt(ZOOM_END / 2).zoom).toBeLessThan(1.7)
  })
})

describe('where each plan is at a point of the animation', () => {
  // The example's own totals: Normal 11 hazards, 0 vetoes, 2289 m; Multiresolution 7, 25 and 2540 m.
  it('adds up, at the end, to what the API says the plan did', () => {
    for (const plan of [normal, multi]) {
      const end = planFrame(plan, 1)
      expect(end.index).toBe(plan.path.length - 1)
      expect(end.hazards).toBe(plan.hazards_hit)
      expect(end.vetoes).toBe(plan.vetoes)
      expect(end.distanceM).toBeCloseTo(plan.distance_m)
      expect(end.arrived).toBe(true)
    }
    expect(planFrame(normal, 1).hazards).toBe(11)
    expect(planFrame(multi, 1).vetoes).toBe(25)
  })

  it('has not met a hazard before the Rover reaches the waypoint that holds it', () => {
    const first = normal.path.findIndex((w) => w.hazard)
    expect(first).toBeGreaterThan(1)
    const before = planFrame(normal, (first - 1) / (normal.path.length - 1))
    const at = planFrame(normal, first / (normal.path.length - 1))
    expect(before.hazards).toBe(0)
    expect(at.hazards).toBeGreaterThanOrEqual(1)
  })

  it('counts a waypoint that is both a hazard and a veto in both', () => {
    const plan: RoutePlan = {
      ...multi,
      path: [
        { x_m: 0, y_m: 0, slope_5m_deg: 0, hazard: false, veto: false, battery_fraction: 1 },
        { x_m: 50, y_m: 0, slope_5m_deg: 20, hazard: true, veto: true, battery_fraction: 0.9 },
      ],
    }
    const frame = planFrame(plan, 1)
    expect([frame.hazards, frame.vetoes, frame.batteryFraction]).toEqual([1, 1, 0.9])
  })

  it('starts at the first waypoint and never goes past the last', () => {
    expect(planFrame(normal, 0).index).toBe(1)
    expect(planFrame(normal, 5).index).toBe(normal.path.length - 1)
  })
})

describe('the swarm’s frames', () => {
  it('shows generation 1 first and generation 5 once the search is over', () => {
    expect(swarmFrame(swarm, 0)?.generation).toBe(1)
    const last = swarmFrame(swarm, 1)
    expect(last?.generation).toBe(5)
    expect(last?.generations).toBe(5)
    expect(last?.settled).toBe(true)
    expect(swarmFrame(swarm, SWARM_END - 0.01)?.settled).toBe(false)
  })

  it('walks the generations in order, one fifth of the search each', () => {
    // The search takes the first 65% of the animation: five slices of 13%.
    const middles = [0, 1, 2, 3, 4].map((k) => (k + 0.5) * (SWARM_END / 5))
    expect(middles.map((p) => swarmFrame(swarm, p)?.generation)).toEqual([1, 2, 3, 4, 5])
  })

  it('has 100 agents and, at the end, every one stopped where the API says: all fallen in this example', () => {
    const end = swarmFrame(swarm, 1)
    expect(end?.total).toBe(100)
    expect(end?.survivors).toBe(0)
    expect(end?.fallen).toBe(100)
    expect(end?.agents.every((a) => a.state === 'fallen')).toBe(true)
    // The last position of an agent is the last point of its recorded path.
    const generation = swarm.generations[4].agents
    end?.agents.forEach((agent, i) => {
      const last = generation[i].path[generation[i].path.length - 1]
      expect([agent.x_m, agent.y_m]).toEqual(last)
    })
  })

  it('keeps every agent on its own path until its time runs out: nobody falls on the first frame', () => {
    const start = swarmFrame(swarm, 0)
    expect(start?.fallen).toBe(0)
    expect(start?.agents.every((a) => a.state === 'moving')).toBe(true)
    expect(start?.agents[0].index).toBeLessThanOrEqual(1)
  })

  it('draws the earlier generations as faint trails and none before generation 2', () => {
    expect(swarmFrame(swarm, 0)?.earlier).toEqual([])
    expect(swarmFrame(swarm, 1)?.earlier).toEqual([0, 1, 2, 3])
  })

  it('marks a survivor as arrived and counts only the fallen', () => {
    const tiny: Swarm = {
      illustration: true,
      agents_per_generation: 2,
      generations: [
        {
          generation: 1,
          survivors: 1,
          agents: [
            { dead: true, path: [[0, 0], [10, 0]] },
            { dead: false, path: [[0, 0], [10, 0], [20, 0], [30, 0]] },
          ],
        },
      ],
    }
    expect(swarmSteps(tiny)).toBe(4)
    const end = swarmFrame(tiny, 1)
    expect(end?.fallen).toBe(1)
    expect(end?.agents.map((a) => a.state)).toEqual(['fallen', 'arrived'])
    expect(end?.survivors).toBe(1)
  })

  it('says nothing when the route came without a swarm', () => {
    expect(swarmFrame({ illustration: true, agents_per_generation: 100, generations: [] }, 0.5)).toBeNull()
  })
})
