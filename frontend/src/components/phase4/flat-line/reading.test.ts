import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { flatReading, flatSunUp, type RealSun } from './reading'
import type { FlatEvent, FlatResult } from './types'

// Read at run time, not imported: the web image has only frontend/ and its build
// type-checks this file (see src/buildContext.test.ts).
const example: { value: unknown } = JSON.parse(
  readFileSync(new URL('../../../../../contract/examples/visibility-flat-001.example.json', import.meta.url), 'utf8'),
)

const START = '2026-11-14T00:00:00Z'
const END = '2026-12-13T12:43:48Z'
const startMs = Date.parse(START)
const endMs = Date.parse(END)
const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

const METRICS = { sun_and_earth_hours: 0, sunlit_hours: 0, earth_visible_hours: 0, earth_visible_hours_any_part: 0, lcip_hours: 0, lcsp_hours: 0, mean_sun_fraction: 0 }

function flatWith(events: FlatEvent[], searchEnd = '2027-06-11T12:43:48Z', sunlit = 700): FlatResult {
  const query = (example.value as unknown as FlatResult).query
  return {
    query: { ...query, start: START, end: END },
    horizon_elevation_deg: -0.087,
    search_end: searchEnd,
    events,
    metrics: { ...METRICS, sunlit_hours: sunlit },
    provenance: (example.value as unknown as FlatResult).provenance,
  }
}

const at = (ms: number) => new Date(ms).toISOString()
const sunUpWindow: RealSun['periods'] = [{ body: 'sun', state: 'visible', start: START, end: END }]

describe('the line without terrain', () => {
  const cursor = startMs + 24 * HOUR_MS
  const realSet = cursor + 50 * HOUR_MS
  const real: RealSun = {
    periods: [
      { body: 'sun', state: 'visible', start: START, end: at(realSet) },
      { body: 'sun', state: 'hidden', start: at(realSet), end: END },
    ],
    events: [{ type: 'sunset', t: at(realSet) }],
    windowEndMs: endMs,
  }

  it('says how much later the Sun would set without terrain', () => {
    const flat = flatWith([{ type: 'sunset', t: at(realSet + 3 * 24 * HOUR_MS), azimuth_deg: 200 }])
    expect(flatReading(real, flat, cursor)).toEqual({ kind: 'later', event: 'sunset', ms: 3 * 24 * HOUR_MS })
  })

  it('says how much earlier, for a Site that sees past the flat horizon', () => {
    const flat = flatWith([{ type: 'sunset', t: at(realSet - 5 * HOUR_MS), azimuth_deg: 200 }])
    expect(flatReading(real, flat, cursor)).toEqual({ kind: 'earlier', event: 'sunset', ms: 5 * HOUR_MS })
  })

  it('calls a difference under a minute the same minute, never "0 min"', () => {
    const flat = flatWith([{ type: 'sunset', t: at(realSet + 30_000), azimuth_deg: 200 }])
    expect(flatReading(real, flat, cursor)).toEqual({ kind: 'same', event: 'sunset' })
  })

  it('names search_end when the flat Sun does not set before it, and counts the days from the Window end', () => {
    const reading = flatReading(real, flatWith([]), cursor)
    expect(reading).toEqual({ kind: 'never', event: 'sunset', untilMs: Date.parse('2027-06-11T12:43:48Z'), daysAfterWindow: 180 })
  })

  it('counts fewer days when coverage ends first', () => {
    const reading = flatReading(real, flatWith([], '2027-01-31T00:00:00Z'), cursor)
    expect(reading.kind === 'never' && reading.daysAfterWindow).toBe(48)
  })

  it('compares Sunrises while the real Sun is down', () => {
    const rise = realSet + 40 * HOUR_MS
    const down: RealSun = {
      ...real,
      periods: [
        { body: 'sun', state: 'visible', start: START, end: at(realSet) },
        { body: 'sun', state: 'hidden', start: at(realSet), end: at(rise) },
        { body: 'sun', state: 'visible', start: at(rise), end: END },
      ],
      events: [
        { type: 'sunset', t: at(realSet) },
        { type: 'sunrise', t: at(rise) },
      ],
    }
    const flat = flatWith([
      { type: 'sunset', t: at(realSet + 2 * HOUR_MS), azimuth_deg: 200 },
      { type: 'sunrise', t: at(rise - 10 * HOUR_MS), azimuth_deg: 80 },
    ])
    expect(flatReading(down, flat, realSet + 4 * HOUR_MS)).toEqual({ kind: 'earlier', event: 'sunrise', ms: 10 * HOUR_MS })
  })

  it('says the terrain hides the Sun when the flat one is up and the real one is not, never a negative span', () => {
    const flat = flatWith([{ type: 'sunset', t: at(realSet + 2 * HOUR_MS), azimuth_deg: 200 }])
    expect(flatReading(real, flat, realSet + MINUTE_MS)).toEqual({ kind: 'flatUp' })
  })

  it('says the Site sees past the flat horizon when the real Sun is up and the flat one has set', () => {
    const flat = flatWith([{ type: 'sunset', t: at(cursor - HOUR_MS), azimuth_deg: 200 }])
    expect(flatReading(real, flat, cursor)).toEqual({ kind: 'flatDown' })
  })

  it('gives the date when the real Sun stays up all Window and the flat one sets inside it', () => {
    const stays: RealSun = { periods: sunUpWindow, events: [], windowEndMs: endMs }
    const flatSet = cursor + 10 * 24 * HOUR_MS
    expect(flatReading(stays, flatWith([{ type: 'sunset', t: at(flatSet), azimuth_deg: 200 }]), cursor)).toEqual({
      kind: 'at',
      event: 'sunset',
      atMs: flatSet,
    })
  })

  // The contract's example at Site 001: no real Sunset in the Window and the first flat one 91 days
  // after the Window starts. The line must say the Sun does not set in this Window either.
  it('says "not in this Window either" for the example at Site 001', () => {
    const flat = example.value as unknown as FlatResult
    const windowEnd = Date.parse(flat.query.end)
    const stays: RealSun = { periods: [{ body: 'sun', state: 'visible', start: flat.query.start, end: flat.query.end }], events: [], windowEndMs: windowEnd }
    const reading = flatReading(stays, flat, Date.parse(flat.query.start))
    expect(reading.kind).toBe('notInWindow')
    const firstSet = Date.parse(flat.events.find((event) => event.type === 'sunset')?.t ?? '')
    expect(reading).toEqual({ kind: 'notInWindow', event: 'sunset', atMs: firstSet })
    expect(Math.floor((firstSet - Date.parse(flat.query.start)) / (24 * HOUR_MS))).toBe(91)
  })

  it('reads the flat Sun as up or down from its own events', () => {
    const flat = flatWith([
      { type: 'sunset', t: at(startMs + 10 * HOUR_MS), azimuth_deg: 200 },
      { type: 'sunrise', t: at(startMs + 20 * HOUR_MS), azimuth_deg: 80 },
    ])
    expect(flatSunUp(flat, startMs)).toBe(true)
    expect(flatSunUp(flat, startMs + 15 * HOUR_MS)).toBe(false)
    expect(flatSunUp(flat, startMs + 25 * HOUR_MS)).toBe(true)
    expect(flatSunUp(flatWith([], undefined, 0), startMs)).toBe(false)
  })
})
