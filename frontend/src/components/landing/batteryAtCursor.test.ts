import { describe, expect, it } from 'vitest'
import { batteryAt, indexAt, readingAtCursor, seriesTimes } from './batteryAtCursor'

const H = 3_600_000
// One sample an hour from 0, as a short Window would give.
const times = (count: number) => Array.from({ length: count }, (_, i) => i * H)

describe('the battery at the Cursor, from the Charge series alone', () => {
  it('picks the sample at or just before the Cursor', () => {
    const at = times(5)
    expect(indexAt(at, -1)).toBe(0)
    expect(indexAt(at, 0)).toBe(0)
    expect(indexAt(at, 1.5 * H)).toBe(1)
    expect(indexAt(at, 2 * H)).toBe(2)
    expect(indexAt(at, 99 * H)).toBe(4)
    expect(indexAt([], 5)).toBe(0)
  })

  it('reads full at capacity and empty at zero, whatever comes next', () => {
    expect(batteryAt([1, 1, 0.9], times(3), 0)).toEqual({ percent: 100, state: 'full', next: null })
    expect(batteryAt([0, 0, 0], times(3), 0)).toEqual({ percent: 0, state: 'empty', next: null })
  })

  it('says charging when the next sample is higher, with the first full sample ahead', () => {
    const values = [0.5, 0.6, 0.8, 1, 1]
    expect(batteryAt(values, times(5), 0.5 * H)).toEqual({ percent: 50, state: 'charging', next: { to: 'full', ms: 2.5 * H } })
  })

  it('says discharging when the next sample is lower, with the first empty sample ahead', () => {
    const values = [1, 0.7, 0.4, 0.1, 0]
    expect(batteryAt(values, times(5), 1 * H)).toEqual({ percent: 70, state: 'discharging', next: { to: 'empty', ms: 3 * H } })
  })

  it('counts down to empty from a full sample that starts to fall', () => {
    expect(batteryAt([1, 0.5, 0], times(3), 0)).toEqual({ percent: 100, state: 'full', next: { to: 'empty', ms: 2 * H } })
  })

  it('counts up to full from an empty sample that starts to rise', () => {
    expect(batteryAt([0, 0.5, 1], times(3), 0)).toEqual({ percent: 0, state: 'empty', next: { to: 'full', ms: 2 * H } })
  })

  it('says "not within the Window" (ms null) when the end or the top is never reached', () => {
    expect(batteryAt([0.9, 0.8, 0.7], times(3), 0)?.next).toEqual({ to: 'empty', ms: null })
    expect(batteryAt([0.2, 0.3, 0.4], times(3), 0)?.next).toEqual({ to: 'full', ms: null })
  })

  it('looks back at the last sample, which has no next one', () => {
    expect(batteryAt([0.9, 0.8], times(2), 5 * H)).toEqual({ percent: 80, state: 'discharging', next: { to: 'empty', ms: null } })
  })

  it('says steady when the neighbour holds the same value', () => {
    expect(batteryAt([0.5, 0.5], times(2), 0)).toEqual({ percent: 50, state: 'steady', next: null })
  })

  it('keeps 0 % and 100 % for empty and full only', () => {
    expect(batteryAt([0.004, 0.003], times(2), 0)?.percent).toBe(1)
    expect(batteryAt([0.996, 0.995], times(2), 0)?.percent).toBe(99)
  })

  it('reads nothing from an empty or mismatched series', () => {
    expect(batteryAt([], [], 0)).toBeNull()
    expect(batteryAt([1, 0.5], [0], 0)).toBeNull()
  })

  it('takes the timeline times when they match the series, else whole steps from the start', () => {
    const iso = ['2026-01-01T00:00:00Z', '2026-01-01T00:15:00Z', '2026-01-01T00:20:00Z']
    const start = Date.parse(iso[0]!)
    expect(seriesTimes(iso, 3, start, start + 20 * 60_000, 15)).toEqual([start, start + 15 * 60_000, start + 20 * 60_000])
    expect(seriesTimes([], 3, start, start + 20 * 60_000, 15)).toEqual([start, start + 15 * 60_000, start + 20 * 60_000])
  })

  it('reads the Charge series against the timeline samples it matches one for one', () => {
    const samples = ['2026-01-01T00:00:00Z', '2026-01-01T00:15:00Z', '2026-01-01T00:30:00Z'].map((t) => ({ t }))
    const start = Date.parse(samples[0]!.t)
    const energy = { charge_fraction: [1, 0.5, 0], step_minutes: 15 }
    expect(readingAtCursor(samples, energy, start, start + 30 * 60_000, start + 20 * 60_000)).toEqual({
      percent: 50,
      state: 'discharging',
      next: { to: 'empty', ms: 10 * 60_000 },
    })
  })
})
