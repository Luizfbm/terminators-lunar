import { describe, expect, it } from 'vitest'
import { compassIndex, groundDirection, sampleAt, subPointsAt, toVector, type Vec3, maskElevationAt, fromVector } from './sky'

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const close = (a: Vec3, b: Vec3) => a.every((value, i) => Math.abs(value - b[i]!) < 1e-9)

describe('compassIndex', () => {
  it('names the nearest of the eight compass points', () => {
    expect(compassIndex(0)).toBe(0)
    expect(compassIndex(22.4)).toBe(0)
    expect(compassIndex(22.6)).toBe(1)
    expect(compassIndex(143)).toBe(3)
    expect(compassIndex(270)).toBe(6)
  })

  it('wraps just below north back to north, and takes negative azimuths', () => {
    expect(compassIndex(359)).toBe(0)
    expect(compassIndex(-90)).toBe(6)
  })
})

describe('toVector', () => {
  it('puts the north pole on +Y, 0° longitude on +X and 90° east on −Z', () => {
    expect(close(toVector(90, 0), [0, 1, 0])).toBe(true)
    expect(close(toVector(0, 0), [1, 0, 0])).toBe(true)
    expect(close(toVector(0, 90), [0, 0, -1])).toBe(true)
  })
})

describe('groundDirection', () => {
  const site = { latitude_deg: -89.4661, longitude_deg: -136.949 }

  it('stays in the ground plane of the Site', () => {
    const up = toVector(site.latitude_deg, site.longitude_deg)
    for (const azimuth of [0, 90, 143, 270]) {
      expect(Math.abs(dot(groundDirection(site, azimuth), up))).toBeLessThan(1e-9)
    }
  })

  it('points north towards the north pole and east at a right angle to it', () => {
    const north = groundDirection(site, 0)
    const east = groundDirection(site, 90)
    expect(north[1]).toBeGreaterThan(0)
    expect(Math.abs(dot(north, east))).toBeLessThan(1e-9)
  })
})

describe('subPointsAt', () => {
  const samples = [
    { t: '2026-11-20T12:00:00Z', sun: { latitude_deg: -1.4, longitude_deg: 170 }, earth: { latitude_deg: 5, longitude_deg: 2 } },
    { t: '2026-11-20T13:00:00Z', sun: { latitude_deg: -1.6, longitude_deg: -179 }, earth: { latitude_deg: 5.2, longitude_deg: 2.2 } },
  ]

  it('interpolates between the two hourly samples around the instant', () => {
    const half = subPointsAt(samples, Date.parse('2026-11-20T12:30:00Z'))!
    expect(half.sun.latitude_deg).toBeCloseTo(-1.5, 9)
    expect(half.earth.longitude_deg).toBeCloseTo(2.1, 9)
  })

  it('crosses ±180° the short way instead of sweeping back through 0°', () => {
    const half = subPointsAt(samples, Date.parse('2026-11-20T12:30:00Z'))!
    expect(half.sun.longitude_deg).toBeCloseTo(175.5, 9)
  })

  it('uses the nearest sample outside the range, and null with no samples', () => {
    expect(subPointsAt(samples, Date.parse('2026-11-19T00:00:00Z'))!.sun.longitude_deg).toBe(170)
    expect(subPointsAt(samples, Date.parse('2026-11-21T00:00:00Z'))!.sun.longitude_deg).toBe(-179)
    expect(subPointsAt([], 0)).toBeNull()
  })
})

describe('sampleAt', () => {
  const samples = [{ t: '2026-11-20T12:00:00Z' }, { t: '2026-11-20T12:15:00Z' }, { t: '2026-11-20T12:30:00Z' }]

  it('takes the sample at or just before the instant', () => {
    expect(sampleAt(samples, Date.parse('2026-11-20T12:20:00Z'))).toBe(samples[1])
    expect(sampleAt(samples, Date.parse('2026-11-20T12:15:00Z'))).toBe(samples[1])
  })

  it('clamps to the ends', () => {
    expect(sampleAt(samples, Date.parse('2026-11-20T00:00:00Z'))).toBe(samples[0])
    expect(sampleAt(samples, Date.parse('2026-11-21T00:00:00Z'))).toBe(samples[2])
    expect(sampleAt([], 0)).toBeNull()
  })
})

describe('maskElevationAt', () => {
  const mask = [0, 90, 180, 270].map((azimuth_deg, index) => ({ azimuth_deg, elevation_deg: index + 1 }))

  it('reads the sample nearest to the azimuth', () => {
    expect(maskElevationAt(mask, 100)).toBe(2)
    expect(maskElevationAt(mask, 200)).toBe(3)
  })

  it('goes round through north: 350° is nearer to 0° than to 270°', () => {
    expect(maskElevationAt(mask, 350)).toBe(1)
  })
})

describe('fromVector', () => {
  it('undoes toVector, east and west, north and south', () => {
    for (const [lat, lon] of [[-89.4661, -136.949], [-84.3, 31.5], [12, 170], [0, -90]] as const) {
      const back = fromVector(toVector(lat, lon))
      expect(back.latitude_deg).toBeCloseTo(lat, 9)
      expect(back.longitude_deg).toBeCloseTo(lon, 9)
    }
  })

  it('reads the axes as the Moon is laid out: +x is 0°, -z is 90°E, -y is the south pole', () => {
    expect(fromVector([1, 0, 0]).latitude_deg).toBeCloseTo(0, 9)
    expect(fromVector([1, 0, 0]).longitude_deg).toBeCloseTo(0, 9)
    expect(fromVector([0, 0, -1]).longitude_deg).toBeCloseTo(90, 9)
    expect(fromVector([0, -1, 0]).latitude_deg).toBeCloseTo(-90, 9)
  })
})
