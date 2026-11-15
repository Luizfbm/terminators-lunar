import { describe, expect, it } from 'vitest'
import { toVector } from './sky'
import { VIEW_DISTANCE, viewTarget } from './viewTarget'

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

  it('has the day side in the middle for the initial position: straight over the point under the Sun', () => {
    const initial = viewTarget('initial', sun)!
    expect(apart(initial, toVector(sun.latitude_deg, sun.longitude_deg))).toBeLessThan(1e-6)
    expect(length(initial)).toBeCloseTo(VIEW_DISTANCE, 12)
  })

  it('has the night side in the middle for the dark side: straight over the point opposite the Sun', () => {
    const dark = viewTarget('dark', sun)!
    expect(apart(dark, toVector(sun.latitude_deg, sun.longitude_deg))).toBeCloseTo(180, 6)
  })

  it('puts the camera as far as it is asked to', () => {
    for (const view of ['initial', 'dark', 'north', 'south'] as const) expect(length(viewTarget(view, sun, 5.5)!)).toBeCloseTo(5.5, 12)
  })

  it('has nowhere to turn to for the day or the night side while it does not know where the Sun is', () => {
    expect(viewTarget('initial', null)).toBeNull()
    expect(viewTarget('dark', null)).toBeNull()
  })
})
