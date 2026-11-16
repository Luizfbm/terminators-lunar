import { describe, expect, it } from 'vitest'
import { countdown, intersect, intervalsOf, longestMs, totalMs, type Interval } from './intervals'

const H = 3_600_000
const start = Date.parse('2026-11-15T00:00:00Z')
const end = start + 48 * H
const iso = (ms: number) => new Date(ms).toISOString()

// 15/11/2026: the screen after a landing measures the Window from the backend's periods.
describe('the stretches after a landing', () => {
  const periods = [
    { body: 'sun', state: 'visible', start: iso(start - 5 * H), end: iso(start + 10 * H) },
    { body: 'sun', state: 'hidden', start: iso(start + 10 * H), end: iso(start + 30 * H) },
    { body: 'sun', state: 'visible', start: iso(start + 30 * H), end: iso(end + 9 * H) },
    { body: 'earth', state: 'visible', start: iso(start + 4 * H), end: iso(start + 20 * H) },
  ]

  it('clip each body to the Window', () => {
    expect(intervalsOf(periods, 'sun', 'visible', start, end)).toEqual([
      [start, start + 10 * H],
      [start + 30 * H, end],
    ])
    expect(intervalsOf(periods, 'sun', 'hidden', start, end)).toEqual([[start + 10 * H, start + 30 * H]])
    expect(intervalsOf(periods, 'earth', 'hidden', start, end)).toEqual([])
  })

  it('add up, find the longest and the time with both', () => {
    const sun = intervalsOf(periods, 'sun', 'visible', start, end)
    const earth = intervalsOf(periods, 'earth', 'visible', start, end)
    expect(totalMs(sun)).toBe(28 * H)
    expect(longestMs(sun)).toBe(18 * H)
    expect(longestMs([])).toBe(0)
    expect(intersect(sun, earth)).toEqual([[start + 4 * H, start + 10 * H]])
  })

  it('count down to the end of a stretch, or to the next one, or say none comes back', () => {
    const sun: Interval[] = [
      [start, start + 10 * H],
      [start + 30 * H, end],
    ]
    expect(countdown(sun, start + 4 * H, end)).toEqual({ on: true, ms: 6 * H, endsWithWindow: false })
    expect(countdown(sun, start + 12 * H, end)).toEqual({ on: false, ms: 18 * H, endsWithWindow: false })
    expect(countdown(sun, start + 40 * H, end)).toEqual({ on: true, ms: 8 * H, endsWithWindow: true })
    expect(countdown([[start, start + H]], start + 2 * H, end)).toEqual({ on: false, ms: null, endsWithWindow: false })
  })
})
