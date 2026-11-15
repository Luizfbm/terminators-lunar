import { describe, expect, it } from 'vitest'
import {
  angularRadiusDeg,
  CAMERA_FAR,
  discRadius,
  EARTH_DISTANCE,
  EARTH_RADIUS,
  moonHides,
  projectedRadiusPx,
  STAR_DISTANCE,
  SUN_ANGULAR_RADIUS_DEG,
  SUN_DISPLAY_DISTANCE,
} from './spaceScale'

describe('the Earth in Moon radii', () => {
  it('is 384,400 km away and 6,371 km across the radius, about 221.3 and 3.667 Moon radii', () => {
    expect(EARTH_DISTANCE).toBeCloseTo(221.25, 1)
    expect(EARTH_RADIUS).toBeCloseTo(3.667, 3)
  })

  it('spans a little under 1 degree of radius, and nearly 2 across, in the sky of the Moon', () => {
    // The Earth's angular diameter seen from the Moon is about 1.9 degrees.
    expect(2 * angularRadiusDeg(EARTH_RADIUS, EARTH_DISTANCE)).toBeCloseTo(1.9, 1)
  })
})

describe('the Sun', () => {
  it('spans about 0.53 degrees across, whatever the distance it is drawn at', () => {
    expect(SUN_ANGULAR_RADIUS_DEG * 2).toBeCloseTo(0.5329, 3)
    const radius = discRadius(SUN_DISPLAY_DISTANCE, SUN_ANGULAR_RADIUS_DEG)
    expect(angularRadiusDeg(radius, SUN_DISPLAY_DISTANCE)).toBeCloseTo(SUN_ANGULAR_RADIUS_DEG, 4)
    // The radius of a disc 12,000 radii away that fills 0.2665 degrees: about 55.8.
    expect(radius).toBeCloseTo(55.8, 1)
    // Twice as far, twice as big: the same angle.
    expect(discRadius(2 * SUN_DISPLAY_DISTANCE, SUN_ANGULAR_RADIUS_DEG)).toBeCloseTo(2 * radius, 9)
  })

  it('is drawn beyond the Earth, in front of the stars, and inside what the camera sees', () => {
    expect(SUN_DISPLAY_DISTANCE).toBeGreaterThan(EARTH_DISTANCE * 10)
    expect(SUN_DISPLAY_DISTANCE).toBeLessThan(STAR_DISTANCE)
    expect(STAR_DISTANCE).toBeLessThan(CAMERA_FAR)
  })
})

describe('how big a body is on the stage', () => {
  it('fills half the height when its limb is at the edge of the field of view', () => {
    // A sphere of radius 1 seen from 1 / sin(16 degrees) away has its limb 16 degrees off axis.
    expect(projectedRadiusPx(1, 1 / Math.sin((16 * Math.PI) / 180), 32, 800)).toBeCloseTo(400, 6)
  })

  it('shrinks with distance, and has no edge from inside', () => {
    expect(projectedRadiusPx(1, 6, 32, 800)).toBeLessThan(projectedRadiusPx(1, 3, 32, 800))
    expect(projectedRadiusPx(1, 1, 32, 800)).toBe(Infinity)
  })

  it('draws the Sun a few pixels wide on a desktop stage, as small as it is in the sky', () => {
    const px = projectedRadiusPx(discRadius(SUN_DISPLAY_DISTANCE, SUN_ANGULAR_RADIUS_DEG), SUN_DISPLAY_DISTANCE, 32, 800)
    // 0.2665 degrees against a 16-degree half field, on 400 px of half height.
    expect(px).toBeCloseTo(6.5, 1)
  })

  it('draws the Earth nearly four times the Sun from the Moon', () => {
    const sun = projectedRadiusPx(discRadius(SUN_DISPLAY_DISTANCE, SUN_ANGULAR_RADIUS_DEG), SUN_DISPLAY_DISTANCE, 32, 800)
    const earth = projectedRadiusPx(EARTH_RADIUS, EARTH_DISTANCE, 32, 800)
    expect(earth / sun).toBeGreaterThan(3)
    expect(earth / sun).toBeLessThan(4)
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

  it('hides a body behind it from far away too', () => {
    expect(moonHides([0, 0, 300], [0, 0, -12_000])).toBe(true)
    expect(moonHides([0, 3, 300], [0, 0, -12_000])).toBe(false)
  })
})
