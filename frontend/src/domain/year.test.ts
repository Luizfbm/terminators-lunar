import { describe, expect, it } from 'vitest'
import { bestMonth, shareOfMonth, yearOf, type Month } from './year'

const month = (n: number, both: number, lit = 0): Month => ({
  month: n,
  start: `2027-${String(n).padStart(2, '0')}-01T00:00:00Z`,
  end: n === 12 ? '2028-01-01T00:00:00Z' : `2027-${String(n + 1).padStart(2, '0')}-01T00:00:00Z`,
  sunlit_hours: lit,
  sun_and_earth_hours: both,
})

describe('bestMonth', () => {
  it('picks the month with the most Sun and Earth together, the first on a tie', () => {
    expect(bestMonth([month(1, 336), month(8, 377), month(12, 391), month(11, 391)])?.month).toBe(12)
    expect(bestMonth([month(3, 10), month(4, 10)])?.month).toBe(3)
    expect(bestMonth([])).toBeNull()
  })
})

describe('shareOfMonth', () => {
  it('is the hours over the month length, kept between 0 and 1', () => {
    expect(shareOfMonth(month(1, 0), 744)).toBe(1)
    expect(shareOfMonth(month(2, 0), 336)).toBe(0.5)
    expect(shareOfMonth(month(1, 0), 900)).toBe(1)
    expect(shareOfMonth(month(1, 0), -3)).toBe(0)
  })
})

describe('yearOf', () => {
  it('reads the Window start in UTC, not in the browser zone', () => {
    expect(yearOf('2027-01-01T00:30:00Z')).toBe(2027)
    expect(yearOf('2026-12-31T23:30:00Z')).toBe(2026)
  })
})
