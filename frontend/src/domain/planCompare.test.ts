import { describe, expect, it } from 'vitest'
import { comparePlans, planBQuery, sameQuery, TIE_HOURS, TIE_SHARE, type Plan, type PlanMetrics } from './planCompare'
import type { Query } from './query'

const DURATION = 708.73

const metrics = (patch: Partial<PlanMetrics> = {}): PlanMetrics => ({
  sun_and_earth_hours: 300,
  sunlit_hours: 500,
  earth_visible_hours: 400,
  lcip_hours: 120,
  lcsp_hours: 40,
  mean_sun_fraction: 0.6,
  ...patch,
})

const plan = (patch: Partial<PlanMetrics> = {}, durationHours = DURATION): Plan => ({ metrics: metrics(patch), durationHours })
const rowOf = (c: ReturnType<typeof comparePlans>, key: keyof PlanMetrics) => c.rows.find((r) => r.metric === key)!

describe('comparePlans: better and tie, row by row', () => {
  it('marks the plan with the larger value, for every metric but the longest night', () => {
    const c = comparePlans(plan(), plan({ sun_and_earth_hours: 310, sunlit_hours: 480, lcip_hours: 130, earth_visible_hours: 390 }))
    expect(rowOf(c, 'sun_and_earth_hours').better).toBe('b')
    expect(rowOf(c, 'sunlit_hours').better).toBe('a')
    expect(rowOf(c, 'earth_visible_hours').better).toBe('a')
    expect(rowOf(c, 'lcip_hours').better).toBe('b')
  })

  it('marks the plan with the shorter longest night (LCSP), not the longer one', () => {
    expect(rowOf(comparePlans(plan({ lcsp_hours: 40 }), plan({ lcsp_hours: 10 })), 'lcsp_hours').better).toBe('b')
    expect(rowOf(comparePlans(plan({ lcsp_hours: 10 }), plan({ lcsp_hours: 40 })), 'lcsp_hours').better).toBe('a')
  })

  it('lists the six metrics in the order of the numbers table', () => {
    expect(comparePlans(plan(), plan()).rows.map((r) => r.metric)).toEqual([
      'sun_and_earth_hours',
      'sunlit_hours',
      'earth_visible_hours',
      'lcip_hours',
      'lcsp_hours',
      'mean_sun_fraction',
    ])
  })

  it('treats a difference under half an hour as a tie, in either direction', () => {
    const c = comparePlans(plan(), plan({ sun_and_earth_hours: 300 + TIE_HOURS - 0.01, lcsp_hours: 40 - TIE_HOURS + 0.01 }))
    expect(rowOf(c, 'sun_and_earth_hours').better).toBe('tie')
    expect(rowOf(c, 'lcsp_hours').better).toBe('tie')
    expect(rowOf(comparePlans(plan({ lcip_hours: 120.3 }), plan()), 'lcip_hours').better).toBe('tie')
  })

  it('treats exactly half an hour as a difference: the threshold is for gaps smaller than it', () => {
    expect(rowOf(comparePlans(plan(), plan({ sun_and_earth_hours: 300.5 })), 'sun_and_earth_hours').better).toBe('b')
    // The same gap off values with rounding noise still counts.
    expect(rowOf(comparePlans(plan({ lcip_hours: 0.1 + 0.2 }), plan({ lcip_hours: 0.8 })), 'lcip_hours').better).toBe('b')
  })

  it('treats a difference under half a percentage point of mean Sun fraction as a tie', () => {
    expect(rowOf(comparePlans(plan(), plan({ mean_sun_fraction: 0.6 + TIE_SHARE - 0.0005 })), 'mean_sun_fraction').better).toBe('tie')
    const c = comparePlans(plan(), plan({ mean_sun_fraction: 0.62 }))
    expect(rowOf(c, 'mean_sun_fraction').better).toBe('b')
    expect(rowOf(c, 'mean_sun_fraction').unit).toBe('share')
    expect(rowOf(c, 'mean_sun_fraction').gap).toBeCloseTo(0.02, 10)
  })

  it('keeps the raw metrics on each row and the gap in hours when the Windows have the same length', () => {
    const r = rowOf(comparePlans(plan(), plan({ sun_and_earth_hours: 312.5 })), 'sun_and_earth_hours')
    expect(r).toMatchObject({ a: 300, b: 312.5, better: 'b', unit: 'hours' })
    expect(r.gap).toBeCloseTo(12.5, 10)
  })

  it('never names a winner on two zeros (no Sun at either Site)', () => {
    const none = { sunlit_hours: 0, lcip_hours: 0, sun_and_earth_hours: 0, mean_sun_fraction: 0 }
    expect(comparePlans(plan(none), plan(none)).summary).toEqual({ kind: 'inseparable' })
  })
})

describe('comparePlans: Windows of different length', () => {
  it('compares the totals as shares of their own Window, so a longer Window does not win by being longer', () => {
    // 15 d at 50 % against 30 d at 50 %: 180 h against 360 h, and the same share.
    const a = plan({ sun_and_earth_hours: 180, sunlit_hours: 180, earth_visible_hours: 180 }, 360)
    const b = plan({ sun_and_earth_hours: 360, sunlit_hours: 360, earth_visible_hours: 360 }, 720)
    const c = comparePlans(a, b)
    expect(c.sameLength).toBe(false)
    for (const key of ['sun_and_earth_hours', 'sunlit_hours', 'earth_visible_hours'] as const) {
      expect(rowOf(c, key).better, key).toBe('tie')
      expect(rowOf(c, key).unit).toBe('share')
    }
  })

  it('still finds a real difference in share, with the gap as a share', () => {
    const c = comparePlans(plan({ sun_and_earth_hours: 180 }, 360), plan({ sun_and_earth_hours: 432 }, 720))
    const r = rowOf(c, 'sun_and_earth_hours')
    expect(r.better).toBe('b')
    expect(r.gap).toBeCloseTo(0.1, 10)
  })

  it('compares the longest periods in hours whatever the lengths', () => {
    const c = comparePlans(plan({ lcsp_hours: 40 }, 360), plan({ lcsp_hours: 90 }, 720))
    expect(rowOf(c, 'lcsp_hours')).toMatchObject({ better: 'a', unit: 'hours' })
  })

  it('counts Windows that differ by under half an hour as the same length', () => {
    expect(comparePlans(plan({}, 708.73), plan({}, 708.9)).sameLength).toBe(true)
    expect(comparePlans(plan({}, 708.73), plan({}, 720)).sameLength).toBe(false)
  })
})

describe('comparePlans: the summary', () => {
  it('says the plans cannot be told apart when every row ties', () => {
    const c = comparePlans(plan(), plan({ sun_and_earth_hours: 300.2, lcsp_hours: 40.2, mean_sun_fraction: 0.602 }))
    expect(c.summary).toEqual({ kind: 'inseparable' })
  })

  it('says the plans cannot be told apart for the same metrics twice', () => {
    expect(comparePlans(plan(), plan()).summary).toEqual({ kind: 'inseparable' })
  })

  it('names the plan that is better somewhere and worse nowhere', () => {
    const c = comparePlans(plan(), plan({ sun_and_earth_hours: 330, lcsp_hours: 10 }))
    expect(c.summary.kind).toBe('ahead')
    if (c.summary.kind !== 'ahead') return
    expect(c.summary.winner).toBe('b')
    expect(c.summary.wins).toBe(2)
    expect(c.summary.headline.metric).toBe('sun_and_earth_hours')
  })

  it('names plan A when it is the one ahead', () => {
    const c = comparePlans(plan({ lcip_hours: 200 }), plan())
    expect(c.summary).toMatchObject({ kind: 'ahead', winner: 'a', wins: 1 })
  })

  it('gives both sides when each plan is better somewhere, leading with Sun and Earth together', () => {
    const c = comparePlans(plan(), plan({ sun_and_earth_hours: 330, lcsp_hours: 90 }))
    expect(c.summary.kind).toBe('mixed')
    if (c.summary.kind !== 'mixed') return
    expect(c.summary.headline).toMatchObject({ metric: 'sun_and_earth_hours', better: 'b' })
    expect(c.summary.against).toMatchObject({ metric: 'lcsp_hours', better: 'a' })
  })

  it('leads with the first metric that has a winner when Sun and Earth together ties', () => {
    const c = comparePlans(plan(), plan({ sun_and_earth_hours: 300.1, lcip_hours: 200, mean_sun_fraction: 0.5 }))
    expect(c.summary.kind).toBe('mixed')
    if (c.summary.kind !== 'mixed') return
    expect(c.summary.headline).toMatchObject({ metric: 'lcip_hours', better: 'b' })
    expect(c.summary.against).toMatchObject({ metric: 'mean_sun_fraction', better: 'a' })
  })
})

describe('Plan B as a Query', () => {
  const a: Query = { site: '001', start: new Date('2026-11-14T00:00:00Z'), durationHours: DURATION, observerHeightM: 2 }

  it('takes from Plan A whatever the link leaves out', () => {
    const b = planBQuery(a, { site: null, startDay: null, hours: null, heightM: null })
    expect(b).toEqual(a)
    expect(sameQuery(a, b)).toBe(true)
  })

  it('takes what the link changes', () => {
    const b = planBQuery(a, { site: 'CR05', startDay: '2027-03-01', hours: 240, heightM: 10 })
    expect(b).toEqual({ site: 'CR05', start: new Date('2027-03-01T00:00:00Z'), durationHours: 240, observerHeightM: 10 })
    expect(sameQuery(a, b)).toBe(false)
  })

  it('takes a typed coordinate as the Site', () => {
    const b = planBQuery(a, { site: { latitudeDeg: -89.5, longitudeDeg: 10 }, startDay: null, hours: null, heightM: null })
    expect(b.site).toEqual({ latitudeDeg: -89.5, longitudeDeg: 10 })
    expect(sameQuery(a, b)).toBe(false)
  })

  it('tells one different field from the same question', () => {
    for (const link of [
      { site: 'CR05', startDay: null, hours: null, heightM: null },
      { site: null, startDay: '2026-11-15', hours: null, heightM: null },
      { site: null, startDay: null, hours: 100, heightM: null },
      { site: null, startDay: null, hours: null, heightM: 3 },
    ]) {
      expect(sameQuery(a, planBQuery(a, link))).toBe(false)
    }
  })
})
