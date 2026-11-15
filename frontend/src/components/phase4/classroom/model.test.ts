import { describe, expect, it } from 'vitest'
import { HILL_DEG, TILT_DEG, dayHours, highestSunDeg, hillElevationDeg, sunAzimuthDeg, sunElevationDeg, sunPath } from './model'

describe('the Classroom figure model', () => {
  it('puts a 300 m hill 10 km away at 1.554°, as worked by hand in the study', () => {
    // 10² / (2 × 1737.4) = 0.02878 km; (0.3 − 0.02878) / 10 = 0.02712; atan = 1.554°.
    expect(Math.abs(hillElevationDeg(300, 10_000) - 1.554)).toBeLessThan(0.001)
    expect(HILL_DEG).toBeGreaterThan(TILT_DEG)
  })

  it('never lets the Sun climb past the tilt at the pole', () => {
    expect(highestSunDeg(-90)).toBe(TILT_DEG)
    const highest = Math.max(...sunPath(-90, -TILT_DEG, 0.5).map((point) => point.elevationDeg))
    expect(Math.abs(highest - TILT_DEG)).toBeLessThan(1e-9)
  })

  it('gives the textbook noon Sun at 30° S in southern summer', () => {
    expect(sunElevationDeg(-30, -TILT_DEG, 0)).toBeCloseTo(61.54, 6)
    expect(highestSunDeg(-30)).toBeCloseTo(61.54, 6)
  })

  it('puts the noon Sun to the north of a southern Site and the morning Sun to the east', () => {
    expect(Math.abs(sunAzimuthDeg(-30, 0, 0))).toBeLessThan(1e-9)
    expect(sunAzimuthDeg(-30, 0, -90)).toBeGreaterThan(0)
  })

  it('has the hill hide the Sun far longer at the pole than at 30° S', () => {
    const mid = dayHours(-30, -TILT_DEG)
    const pole = dayHours(-90, -TILT_DEG)
    expect(pole.above).toBeCloseTo(708.7, 0)
    expect(pole.behindHill).toBeGreaterThan(10 * mid.behindHill)
  })
})
