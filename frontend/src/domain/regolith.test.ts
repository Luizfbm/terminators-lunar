import { describe, expect, it } from 'vitest'
import { LUNAR_LAMBERT, lunarLambert } from './regolith'

const rad = (degrees: number) => (degrees * Math.PI) / 180
/** A slope tilted `tilt` degrees towards the Sun, in the plane of the Sun, seen by an eye 1° above it. */
function slope(sunElevationDeg: number, tiltDeg: number, lookTowardsSun: boolean) {
  const sun = [Math.cos(rad(sunElevationDeg)), Math.sin(rad(sunElevationDeg))]
  const way = lookTowardsSun ? 1 : -1
  const eye = [-way * Math.cos(rad(1)), Math.sin(rad(1))]
  const normal = [Math.sin(rad(tiltDeg)), Math.cos(rad(tiltDeg))]
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1]
  return { incidence: dot(normal, sun), emission: dot(normal, eye) }
}
const lambert = (cosIncidence: number) => Math.max(0, cosIncidence)

describe('the Lunar-Lambert mix for the terrain', () => {
  it('returns nothing for a surface turned away from the Sun', () => {
    expect(lunarLambert(0, 0.5)).toBe(0)
    expect(lunarLambert(-0.3, 0.5)).toBe(0)
  })

  it('is plain Lambert when the weight is zero, and plain Lommel-Seeliger, scaled, when it is one', () => {
    expect(lunarLambert(0.4, 0.2, { weight: 0, exposure: 5 })).toBeCloseTo(0.4, 12)
    expect(lunarLambert(0.4, 0.2, { weight: 1, exposure: 5 })).toBeCloseTo((5 * 0.4) / (0.4 + 0.2), 12)
  })

  it('keeps flat ground under the Sun of this app as bright as Lambert had it, so the lights keep their strength', () => {
    for (const look of [true, false]) {
      const flat = slope(8, 0, look)
      expect(lunarLambert(flat.incidence, flat.emission)).toBeCloseTo(lambert(flat.incidence), 2)
    }
  })

  it('keeps most of the slope shading Lambert gives, which pure Lommel-Seeliger from the ground would lose', () => {
    for (const look of [true, false]) {
      const flat = slope(8, 0, look)
      const facing = slope(8, 10, look)
      const mixed = lunarLambert(facing.incidence, facing.emission) / lunarLambert(flat.incidence, flat.emission)
      const plain = lambert(facing.incidence) / lambert(flat.incidence)
      // Under Lambert a 10° slope facing the Sun is 2.2 times flat ground; the mix keeps 1.4 times or more.
      expect(mixed).toBeGreaterThan(1.4)
      expect(mixed).toBeLessThan(plain)
      // The pure law, seen from the ground, would leave it at about 1.1 times: the hills would be drawn flat.
      const pure = lunarLambert(facing.incidence, facing.emission, { weight: 1, exposure: 1 }) / lunarLambert(flat.incidence, flat.emission, { weight: 1, exposure: 1 })
      expect(mixed).toBeGreaterThan(pure + 0.3)
    }
  })

  it('falls with the Sun leaving the normal, never rising again, and stays finite for an eye on the ground', () => {
    let last = Infinity
    for (let degrees = 0; degrees <= 90; degrees += 5) {
      const value = lunarLambert(Math.cos(rad(degrees)), 0.02)
      expect(value).toBeLessThanOrEqual(last + 1e-12)
      last = value
    }
    expect(Number.isFinite(lunarLambert(1e-9, 0))).toBe(true)
    expect(LUNAR_LAMBERT.weight).toBeGreaterThan(0)
    expect(LUNAR_LAMBERT.weight).toBeLessThan(1)
  })
})
