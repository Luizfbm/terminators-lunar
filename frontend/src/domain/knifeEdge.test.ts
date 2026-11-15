import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KNIFE_MAX_DISTANCE_M, knifeEdge, type KnifePoint, type KnifeScatter } from './knifeEdge'

// Read at run time, not imported: the web image has only frontend/ and its build
// type-checks this file (see src/buildContext.test.ts).
const example: { value: unknown } = JSON.parse(
  readFileSync(new URL('../../../contract/examples/visibility-scatter-001.example.json', import.meta.url), 'utf8'),
)
const scatter = example.value as KnifeScatter

/** The Site's own numbers at every point: a Site where a miss changes nothing. */
function steady(window: KnifeScatter): KnifeScatter {
  return { ...window, points: window.points.map((point) => ({ ...point, metrics: window.points[0].metrics })) }
}

/** The same scatter with one point's Sun and Earth hours replaced. */
function withPoint(window: KnifeScatter, index: number, metrics: Partial<KnifePoint['metrics']>): KnifeScatter {
  const base = steady(window)
  return { ...base, points: base.points.map((point, i) => (i === index ? { ...point, metrics: { ...point.metrics, ...metrics } } : point)) }
}

describe('a Site where a small miss changes the answer', () => {
  // Read off the contract's example by hand: the Site has the Sun for the whole 708.73 h Window, and
  // 250 m to the south (point 13, azimuth 180°) it has it for 250.13 h.
  it('names the point that loses the most Sun, 250 m to the south', () => {
    const edge = knifeEdge(scatter)
    expect(edge?.kind).toBe('loses')
    expect(edge?.body).toBe('sun')
    expect(edge?.point.distance_m).toBe(250)
    expect(edge?.point.azimuth_deg).toBe(180)
    expect(edge?.hours).toBeCloseTo(708.73 - 250.13333333333333, 6)
  })

  it('flags the Earth when only the Earth is lost', () => {
    const edge = knifeEdge(withPoint(scatter, 17, { earth_visible_hours: 0 }))
    expect(edge).toMatchObject({ kind: 'loses', body: 'earth' })
    expect(edge?.hours).toBeCloseTo(329.06444444444446, 6)
  })

  it('flags a Site that is the worse place when a point nearby has what it lacks', () => {
    // The Site has no Sun at all, and one point 250 m away has it for 100 h.
    const dark = steady(scatter)
    const points = dark.points.map((point, i) => {
      if (i === 0) return { ...point, metrics: { ...point.metrics, sunlit_hours: 0 } }
      return { ...point, metrics: { ...point.metrics, sunlit_hours: i === 9 ? 100 : 0 } }
    })
    expect(knifeEdge({ ...dark, points })).toMatchObject({ kind: 'gains', body: 'sun', hours: 100 })
  })

  it('puts a loss before a bigger gain', () => {
    const points = steady(scatter).points.map((point, i) => {
      if (i === 1) return { ...point, metrics: { ...point.metrics, sunlit_hours: point.metrics.sunlit_hours - 80 } }
      if (i === 2) return { ...point, metrics: { ...point.metrics, sunlit_hours: point.metrics.sunlit_hours + 300 } }
      return point
    })
    expect(knifeEdge({ ...scatter, points })).toMatchObject({ kind: 'loses', hours: 80 })
  })
})

describe('a stable Site', () => {
  it('says nothing when all 19 points agree with the Site', () => {
    expect(knifeEdge(steady(scatter))).toBeNull()
  })

  it('says nothing for a change of hours: a Sunset that moves, not a night that appears', () => {
    // 10 % of 708.73 h is 70.9 h. A point 40 h worse is a different Sunset, not a different Site.
    expect(knifeEdge(withPoint(scatter, 13, { sunlit_hours: 708.73 - 40 }))).toBeNull()
    expect(knifeEdge(withPoint(scatter, 13, { sunlit_hours: 708.73 - 71 }))).not.toBeNull()
  })

  it('does not count a flip beyond the miss IM-2 made, as at 500 m', () => {
    const far = withPoint(scatter, 13, { sunlit_hours: 0 })
    const moved = { ...far, points: far.points.map((point, i) => (i === 13 ? { ...point, distance_m: KNIFE_MAX_DISTANCE_M + 250 } : point)) }
    expect(knifeEdge(moved)).toBeNull()
  })

  it('does not flag minutes on a short Window', () => {
    const day: KnifeScatter = { ...withPoint(scatter, 13, { sunlit_hours: 708.73 - 0.5 }), query: { duration_hours: 5 } }
    expect(knifeEdge(day)).toBeNull()
  })

  it('has nothing to say about an empty scatter', () => {
    expect(knifeEdge({ query: { duration_hours: 24 }, points: [] })).toBeNull()
  })
})
