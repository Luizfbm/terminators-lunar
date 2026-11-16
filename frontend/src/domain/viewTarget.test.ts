import { describe, expect, it } from 'vitest'
import { toVector } from './sky'
import { moonRadiusPx } from './moonDisc'
import { EARTH_ANGULAR_RADIUS_DEG, projectedRadiusPx, SUN_ANGULAR_RADIUS_DEG } from './spaceScale'
import { GLOBE_FIELD_OF_VIEW_DEG, MAX_FRAMING_DISTANCE, MOON_WIDTH_SHARE, VIEW_DISTANCE, viewDistanceFor, viewTarget } from './viewTarget'

const length = (p: readonly [number, number, number]) => Math.hypot(...p)
const dot = (a: readonly [number, number, number], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
/** The angle in degrees between the camera's direction and a point of the Moon. */
const apart = (camera: readonly [number, number, number], point: readonly number[]) => (Math.acos(Math.min(1, dot(camera, point) / length(camera))) * 180) / Math.PI

describe('where the menu turns the Moon', () => {
  const sun = { latitude_deg: 12, longitude_deg: 40 }

  it('has the south pole in the middle of the disc: the camera is straight over it, a hair off', () => {
    const south = viewTarget('south', null)!
    expect(apart(south, [0, -1, 0])).toBeLessThan(0.51)
    expect(length(south)).toBeCloseTo(VIEW_DISTANCE, 12)
  })

  it('has the north pole in the middle of the disc the same way, from the other side', () => {
    const north = viewTarget('north', null)!
    expect(apart(north, [0, 1, 0])).toBeLessThan(0.51)
    expect(north[1]).toBeGreaterThan(3)
    expect(length(north)).toBeCloseTo(VIEW_DISTANCE, 12)
  })

  it('is not exactly over the pole, where the Moon\'s axis cannot be the camera\'s up', () => {
    expect(viewTarget('south', null)![0]).not.toBe(0)
    expect(viewTarget('north', null)![0]).not.toBe(0)
  })

  it('never puts the camera over the point under the Sun, where the Sun would be behind it', () => {
    for (const view of ['dark', 'north', 'south'] as const) {
      const camera = viewTarget(view, sun)!
      // The Sun's direction as seen from the camera must not be the direction the camera looks in.
      const towardsSun = dot(camera, toVector(sun.latitude_deg, sun.longitude_deg)) / length(camera)
      expect(towardsSun).toBeLessThan(0.99)
    }
  })

  it('has the night side in the middle for the dark side: straight over the point opposite the Sun', () => {
    const dark = viewTarget('dark', sun)!
    expect(apart(dark, toVector(sun.latitude_deg, sun.longitude_deg))).toBeCloseTo(180, 6)
  })

  it('puts the camera as far as it is asked to', () => {
    for (const view of ['dark', 'north', 'south'] as const) expect(length(viewTarget(view, sun, 5.5)!)).toBeCloseTo(5.5, 12)
  })

  it('has nowhere to turn to for the night side while it does not know where the Sun is', () => {
    expect(viewTarget('dark', null)).toBeNull()
  })
})

describe('how far the camera stands to frame the Moon (issue 150)', () => {
  /** What share of the stage's width and height the Moon's disc takes, from the camera distance the framing gives. */
  const shares = (width: number, height: number) => {
    const distance = viewDistanceFor(width / height)
    const radius = moonRadiusPx(distance, GLOBE_FIELD_OF_VIEW_DEG, height)
    return { distance, ofWidth: (2 * radius) / width, ofHeight: (2 * radius) / height }
  }

  it('keeps the distance of 5 radii on a desktop stage, where the height is the limit', () => {
    for (const [width, height] of [[1440, 723], [1920, 900], [1024, 768]]) expect(viewDistanceFor(width / height)).toBe(VIEW_DISTANCE)
  })

  it('stands farther on a phone upright: at 5 radii the Moon spanned 92% of a 390 by 506 stage, edge to edge', () => {
    expect((moonRadiusPx(VIEW_DISTANCE, GLOBE_FIELD_OF_VIEW_DEG, 506) * 2) / 390).toBeGreaterThan(0.9)
    const framed = shares(390, 506)
    expect(framed.distance).toBeGreaterThan(5.5)
    expect(framed.ofWidth).toBeCloseTo(MOON_WIDTH_SHARE, 2)
  })

  it('never lets the Moon take more of the width than the share, or more of the height than at 5 radii, at any aspect', () => {
    const atFive = (2 * moonRadiusPx(VIEW_DISTANCE, GLOBE_FIELD_OF_VIEW_DEG, 1000)) / 1000
    for (const aspect of [0.4, 0.5, 0.77, 1, 1.3, 2, 3]) {
      const distance = viewDistanceFor(aspect)
      const ofHeight = (2 * moonRadiusPx(distance, GLOBE_FIELD_OF_VIEW_DEG, 1000)) / 1000
      expect(ofHeight).toBeLessThanOrEqual(atFive + 1e-9)
      // Only a stage so narrow that the farthest framing is still too near may go over the share.
      if (distance < MAX_FRAMING_DISTANCE) expect(ofHeight / aspect).toBeLessThanOrEqual(MOON_WIDTH_SHARE + 1e-9)
    }
  })

  it('stands farther the narrower the stage is, and never nearer than the opening distance', () => {
    const distances = [2, 1.3, 1, 0.77, 0.6, 0.5].map((aspect) => viewDistanceFor(aspect))
    distances.forEach((distance, at) => {
      expect(distance).toBeGreaterThanOrEqual(VIEW_DISTANCE)
      if (at > 0) expect(distance).toBeGreaterThanOrEqual(distances[at - 1])
    })
    expect(Math.max(...distances)).toBeLessThanOrEqual(MAX_FRAMING_DISTANCE)
  })

  it('falls back to the opening distance for a stage that has no size yet', () => {
    for (const aspect of [0, -1, NaN, Infinity]) expect(viewDistanceFor(aspect)).toBe(VIEW_DISTANCE)
  })

  it('is only the camera: the Sun and the Earth keep the angles of the ephemeris, and the framing is not an input of their size', () => {
    expect(SUN_ANGULAR_RADIUS_DEG).toBeCloseTo(0.2665, 3)
    expect(EARTH_ANGULAR_RADIUS_DEG).toBeCloseTo(0.9497, 3)
    expect(projectedRadiusPx(SUN_ANGULAR_RADIUS_DEG, GLOBE_FIELD_OF_VIEW_DEG, 723)).toBeCloseTo(5.9, 1)
    expect(projectedRadiusPx(EARTH_ANGULAR_RADIUS_DEG, GLOBE_FIELD_OF_VIEW_DEG, 723)).toBeCloseTo(20.9, 0)
  })

  it('has the camera over each place at the distance asked, so the menu views frame the Moon like the opening one', () => {
    const distance = viewDistanceFor(390 / 506)
    for (const view of ['dark', 'north', 'south'] as const) expect(length(viewTarget(view, { latitude_deg: 0, longitude_deg: 10 }, distance)!)).toBeCloseTo(distance, 12)
  })
})
