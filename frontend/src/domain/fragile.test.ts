import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FRAGILE_CLEARANCE_DEG, fragileHours, type FragileInput } from './fragile'

// Read at run time, not imported: the web image has only frontend/ and its build
// type-checks this file (see src/buildContext.test.ts).
const example: { value: unknown } = JSON.parse(
  readFileSync(new URL('../../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8'),
)

const T0 = Date.parse('2026-11-20T00:00:00Z')
const HOUR = 3_600_000

/** A Horizon mask every 0.5°, flat at `base`, with the given azimuths (in degrees) raised to their own elevation. */
function mask(base: number, raised: Record<number, number> = {}) {
  return Array.from({ length: 720 }, (_, i) => ({
    azimuth_deg: i * 0.5,
    elevation_deg: raised[i * 0.5] ?? base,
  }))
}

interface Pose {
  azimuth_deg: number
  elevation_deg: number
}

/** An hourly timeline: one sample per hour, the Sun's and the Earth's poses given step by step; the Window ends at the last sample. */
function hourly(suns: Pose[], earths: Pose[], horizon: FragileInput['horizon']['samples']): FragileInput {
  const stamp = (i: number) => new Date(T0 + i * HOUR).toISOString()
  return {
    query: { end: stamp(suns.length - 1) },
    timeline: { step_minutes: 60, samples: suns.map((sun, i) => ({ t: stamp(i), sun, earth: earths[i]! })) },
    horizon: { samples: horizon },
  }
}

const at = (azimuth_deg: number, elevation_deg: number): Pose => ({ azimuth_deg, elevation_deg })
const far = (n: number, elevation_deg: number) => Array.from({ length: n }, () => at(90, elevation_deg))

describe('the limit', () => {
  it('is 0.5°, the value Luiz decided on 15/11/2026', () => {
    expect(FRAGILE_CLEARANCE_DEG).toBe(0.5)
  })
})

describe('fragile hours', () => {
  it('is zero for a body that is always well clear of the Horizon mask', () => {
    // Flat mask at 0°: the Sun stays 3° above it and the Earth 2° above it, in 5 samples and 4 steps.
    const result = hourly(far(5, 3), far(5, 2), mask(0))
    expect(fragileHours(result)).toEqual({ sun: 0, earth: 0 })
  })

  it('counts one step of the timeline for each sample within the limit', () => {
    // Clearances of the Sun, by hand, over a flat mask at 0°: 2, 0.4, 0.2, -0.3, 0.6, then the Window's end.
    // 0.4, 0.2 and -0.3 are under 0.5: three steps of one hour. 0.6 and 2 are not.
    const sun = [2, 0.4, 0.2, -0.3, 0.6, 2].map((e) => at(90, e))
    const result = hourly(sun, far(6, 5), mask(0))
    expect(fragileHours(result)).toEqual({ sun: 3, earth: 0 })
  })

  it('counts the Sun and the Earth apart', () => {
    const sun = [0.1, 0.1, 4, 4].map((e) => at(90, e))
    const earth = [4, 0.2, 0.2, 0.2].map((e) => at(180, e))
    expect(fragileHours(hourly(sun, earth, mask(0)))).toEqual({ sun: 2, earth: 2 })
  })

  it('does not count a clearance of exactly the limit', () => {
    // Only "less than 0.5°" counts.
    const result = hourly([at(90, 0.5), at(90, 0.5), at(90, 0.5)], far(3, 5), mask(0))
    expect(fragileHours(result).sun).toBe(0)
  })

  it('reads the Horizon mask at the body’s azimuth, not a flat one', () => {
    // The mask is 10° high to the east (azimuth 90°) and 0° elsewhere. A Sun at 10.3° over the east is
    // 0.3° off the ridge; the same elevation to the west is 10.3° clear of the ground there.
    const result = hourly([at(90, 10.3), at(90, 10.3), at(270, 10.3), at(270, 10.3)], far(4, 20), mask(0, { 90: 10 }))
    expect(fragileHours(result)).toEqual({ sun: 2, earth: 0 })
  })

  it('goes round through north: azimuths past 359.5° read the mask at 0°', () => {
    // The mask is 5° at 359.5° and at 0°, and 0° elsewhere. 359.9° is nearest to the 0° sample, 0.2° to
    // the 359.5° one and 359.7° to the 359.5° one: all three have the 5° ridge under them.
    const horizon = mask(0, { 0: 5, 359.5: 5 })
    const sun = [at(359.9, 5.3), at(0.2, 4.9), at(359.7, 5.2), at(180, 5.3)]
    expect(fragileHours(hourly(sun, far(4, 20), horizon))).toEqual({ sun: 3, earth: 0 })
  })

  it('counts a body below the Horizon mask while it is within the limit', () => {
    // -0.4° is below the ground and still counts; -0.6° and -10° are too far down to matter.
    const sun = [-0.4, -0.6, -10, -0.4, 2].map((e) => at(90, e))
    expect(fragileHours(hourly(sun, far(5, 20), mask(0)))).toEqual({ sun: 2, earth: 0 })
  })

  it('counts nothing for the sample at the Window’s end, and only part of a step cut short by it', () => {
    // Samples at 0, 1 and 2 h, all within the limit, but the Window ends at 2.5 h: 1 h + 1 h + 0.5 h.
    const result = hourly(far(3, 0.1), far(3, 5), mask(0))
    expect(fragileHours({ ...result, query: { end: new Date(T0 + 2.5 * HOUR).toISOString() } }).sun).toBe(2.5)
    // And at the end itself, nothing: 2 h of steps for the three samples of a 2 h Window.
    expect(fragileHours(result).sun).toBe(2)
  })

  it('uses the timeline’s step', () => {
    const result = hourly(far(3, 0.1), far(3, 5), mask(0))
    const quarter = { ...result, timeline: { ...result.timeline, step_minutes: 15 } }
    // 15 minute steps, the first two samples inside a Window that ends at the third: 0.25 h each.
    expect(fragileHours({ ...quarter, query: { end: new Date(T0 + 2 * HOUR).toISOString() } }).sun).toBe(0.5)
  })

  it('has no hours for an empty timeline', () => {
    expect(fragileHours({ ...hourly([], [], mask(0)), query: { end: new Date(T0).toISOString() } })).toEqual({ sun: 0, earth: 0 })
  })
})

describe('Connecting Ridge CR01 in the contract example', () => {
  // Counted outside the app, in a script that scans the 720 mask samples for the nearest azimuth and
  // takes the 15-minute steps of the 960 before the Window's end: 170 steps for the Sun, 63 for the Earth.
  it('has 42.5 h of the Sun and 15.75 h of the Earth within 0.5° of the terrain', () => {
    const hours = fragileHours(example.value as FragileInput)
    expect(hours.sun).toBeCloseTo(42.5, 9)
    expect(hours.earth).toBeCloseTo(15.75, 9)
  })
})
