import { describe, expect, it } from 'vitest'
import {
  angularRadiusDeg,
  discRadius,
  EARTH_ANGULAR_RADIUS_DEG,
  moonHides,
  projectedRadiusPx,
  SUN_ANGULAR_RADIUS_DEG,
  sphereRadius,
} from './spaceScale'

describe('how big the Earth and the Sun are in the sky of the Moon', () => {
  it('has the Earth 1.9 degrees across, from 6,371 km at 384,400 km', () => {
    expect(EARTH_ANGULAR_RADIUS_DEG).toBeCloseTo(0.9496, 3)
    expect(2 * EARTH_ANGULAR_RADIUS_DEG).toBeCloseTo(1.9, 1)
  })

  it('has the Sun 0.53 degrees across, from its radius and the astronomical unit', () => {
    expect(SUN_ANGULAR_RADIUS_DEG).toBeCloseTo(0.2665, 3)
    expect(2 * SUN_ANGULAR_RADIUS_DEG).toBeCloseTo(0.533, 3)
  })

  it('has the Earth about 3.6 times the width of the Sun', () => {
    expect(EARTH_ANGULAR_RADIUS_DEG / SUN_ANGULAR_RADIUS_DEG).toBeGreaterThan(3.4)
    expect(EARTH_ANGULAR_RADIUS_DEG / SUN_ANGULAR_RADIUS_DEG).toBeLessThan(3.8)
  })
})

describe('a body drawn at any distance spans the angle it is given', () => {
  it('gives a ball the radius that spans that angle', () => {
    for (const distance of [10, 400, 12_000]) {
      expect(angularRadiusDeg(sphereRadius(distance, EARTH_ANGULAR_RADIUS_DEG), distance)).toBeCloseTo(EARTH_ANGULAR_RADIUS_DEG, 9)
    }
  })

  it('gives a disc the radius that spans that angle, twice as big twice as far', () => {
    const near = discRadius(500, SUN_ANGULAR_RADIUS_DEG)
    expect(near).toBeCloseTo(2.325, 2)
    expect(discRadius(1000, SUN_ANGULAR_RADIUS_DEG)).toBeCloseTo(2 * near, 9)
    expect(Math.atan(near / 500) / (Math.PI / 180)).toBeCloseTo(SUN_ANGULAR_RADIUS_DEG, 9)
  })

  it('has a ball and a disc agree for such small angles', () => {
    expect(sphereRadius(500, SUN_ANGULAR_RADIUS_DEG)).toBeCloseTo(discRadius(500, SUN_ANGULAR_RADIUS_DEG), 3)
  })
})

describe('how big a body is on the stage', () => {
  it('fills half the height when its angle is half the field of view', () => {
    expect(projectedRadiusPx(16, 32, 800)).toBeCloseTo(400, 9)
  })

  it('draws the Sun a few pixels wide and the Earth about 25, on a desktop stage', () => {
    expect(projectedRadiusPx(SUN_ANGULAR_RADIUS_DEG, 32, 800)).toBeCloseTo(6.5, 1)
    expect(projectedRadiusPx(EARTH_ANGULAR_RADIUS_DEG, 32, 800)).toBeCloseTo(23.1, 1)
  })

  it('grows with the height of the stage', () => {
    expect(projectedRadiusPx(EARTH_ANGULAR_RADIUS_DEG, 32, 1600)).toBeCloseTo(2 * projectedRadiusPx(EARTH_ANGULAR_RADIUS_DEG, 32, 800), 9)
  })
})

describe('the Moon hiding a body', () => {
  it('hides what is straight behind it and shows what is beside it', () => {
    expect(moonHides([0, 0, 3.4], [0, 0, -221])).toBe(true)
    expect(moonHides([0, 0, 3.4], [0, 80, -221])).toBe(false)
    expect(moonHides([0, 0, 3.4], [221, 0, 0])).toBe(false)
  })

  it('does not hide what is between the eye and the Moon', () => {
    expect(moonHides([0, 0, 3.4], [0, 0, 100])).toBe(false)
  })

  it('hides a body in the sky behind it by a point far along the same direction', () => {
    expect(moonHides([0, 0, 6], [0, 0, -1e6])).toBe(true)
    expect(moonHides([0, 1.2, 6], [0, 0, -1e6])).toBe(false)
  })
})
