import { SphereGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { earthAttitude, earthNorthAt, earthRoll, moonEcliptic, subLunarPoint, sunEclipticLongitude } from './earthFace'

// Reference values from SPICE with the project's own kernels (DE440, pck00011, MOON_ME), for the
// default Site at 89.4661°S 136.949°W: the sub-lunar point on the Earth in IAU_EARTH, the Sun and
// the Earth in the Site's sky, and the roll of the Earth's north pole on that sky, all with light
// time and aberration. Computed by a script kept with the requirement.
const SPICE = [
  { t: '2026-11-14T00:00:00Z', subLat: -26.072, subLon: -127.906, sun: [263.552, 1.497], earth: [135.692, -5.031], roll: -174.81 },
  { t: '2026-11-14T12:00:00Z', subLat: -24.934, subLon: 58.019, sun: [257.459, 1.441], earth: [134.999, -4.499], roll: -172.46 },
  { t: '2026-11-15T06:00:00Z', subLat: -22.726, subLon: 156.67, sun: [248.322, 1.359], earth: [133.961, -3.625], roll: -169.18 },
  { t: '2026-11-20T00:00:00Z', subLat: 1.147, subLon: -62.95, sun: [190.544, 1.02], earth: [129.734, 2.83], roll: -157.52 },
  { t: '2026-11-28T18:00:00Z', subLat: 20.914, subLon: 149.211, sun: [84.367, 1.538], earth: [141.798, 1.547], roll: 168.0 },
  { t: '2025-03-06T17:30:00Z', subLat: 27.96, subLon: 8.091, sun: [231.699, -0.018], earth: [142.367, 6.007], roll: -174.12 },
  { t: '2027-06-01T03:00:00Z', subLat: 12.868, subLon: 84.08, sun: [358.828, -0.856], earth: [130.09, 5.518], roll: -157.99 },
] as const

const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

describe('the face of the Earth turned to the Moon', () => {
  it.each(SPICE)('at $t has the Moon overhead where SPICE says, to within 0.6 of a degree', ({ t, subLat, subLon }) => {
    const point = subLunarPoint(Date.parse(t))
    // Measured against these seven: 0.23° at most in latitude, 0.34° in longitude.
    expect(Math.abs(point.latitudeDeg - subLat)).toBeLessThan(0.4)
    expect(apart(point.longitudeDeg, subLon)).toBeLessThan(0.6)
  })

  it('turns once a day: twelve hours later the other side of the Earth faces the Moon', () => {
    const start = Date.parse('2026-11-14T00:00:00Z')
    const turned = apart(subLunarPoint(start + 12 * 3_600_000).longitudeDeg, subLunarPoint(start).longitudeDeg)
    // Half a turn, less the six degrees the Moon moves along its orbit meanwhile.
    expect(turned).toBeGreaterThan(170)
    expect(turned).toBeLessThanOrEqual(180)
  })

  it('stays within the tropics the Moon can reach', () => {
    for (let day = 0; day < 60; day++) {
      const { latitudeDeg } = subLunarPoint(Date.parse('2026-11-01T00:00:00Z') + day * 86_400_000)
      expect(Math.abs(latitudeDeg)).toBeLessThan(29)
    }
  })
})

describe('the Moon and the Sun among the stars', () => {
  it('has the Moon opposite the Sun at a total lunar eclipse', () => {
    // 14 March 2025, greatest eclipse at 06:58 UTC.
    const ms = Date.parse('2025-03-14T06:58:00Z')
    expect(apart(moonEcliptic(ms).longitudeDeg, sunEclipticLongitude(ms) + 180)).toBeLessThan(0.5)
    expect(Math.abs(moonEcliptic(ms).latitudeDeg)).toBeLessThan(0.6)
  })

  it('has the Sun at the equinox point on the March equinox', () => {
    // 20 March 2026, 14:46 UTC.
    expect(apart(sunEclipticLongitude(Date.parse('2026-03-20T14:46:00Z')), 0)).toBeLessThan(0.05)
  })
})

describe('how the Earth is tilted in the sky of the Site', () => {
  it.each(SPICE)('at $t leans as SPICE says, to within a degree', ({ t, sun, earth, roll }) => {
    const earthAt = { azimuthDeg: earth[0], elevationDeg: earth[1] }
    const north = earthNorthAt(Date.parse(t), { azimuthDeg: sun[0], elevationDeg: sun[1] }, earthAt)
    expect(north).not.toBeNull()
    // Measured against these seven: 0.35° at most.
    expect(apart(earthRoll(north!, earthAt), roll)).toBeLessThan(1)
  })

  it('is seen upside down from the south pole of the Moon: north points down', () => {
    for (const { t, sun, earth } of SPICE) {
      const earthAt = { azimuthDeg: earth[0], elevationDeg: earth[1] }
      const north = earthNorthAt(Date.parse(t), { azimuthDeg: sun[0], elevationDeg: sun[1] }, earthAt)!
      expect(Math.abs(earthRoll(north, earthAt))).toBeGreaterThan(150)
    }
  })

  it('gives no answer when the Sun and the Earth are in line in the sky', () => {
    const ms = Date.parse('2026-11-14T00:00:00Z')
    expect(earthNorthAt(ms, { azimuthDeg: 135.7, elevationDeg: -5 }, { azimuthDeg: 135.7, elevationDeg: -5 })).toBeNull()
  })
})

describe('turning the drawn Earth', () => {
  type V = readonly [number, number, number]
  const RAD = Math.PI / 180
  /** Where a place on the ball ends up in the scene: the ball's own vector for it, turned. */
  const placed = (axes: [V, V, V], latitudeDeg: number, longitudeDeg: number): number[] => {
    const own = [
      Math.cos(latitudeDeg * RAD) * Math.cos(longitudeDeg * RAD),
      Math.sin(latitudeDeg * RAD),
      -Math.cos(latitudeDeg * RAD) * Math.sin(longitudeDeg * RAD),
    ]
    return [0, 1, 2].map((part) => axes[0][part] * own[0] + axes[1][part] * own[1] + axes[2][part] * own[2])
  }
  const near = (a: number[], b: readonly number[]) => a.forEach((value, at) => expect(value).toBeCloseTo(b[at], 9))
  // The Earth due north of the eye in the scene (-z), so the way back to the eye is +z.
  const towardsEye: V = [0, 0, 1]

  it('turns the sub-lunar point to face the eye', () => {
    for (const point of [{ latitudeDeg: 0, longitudeDeg: 0 }, { latitudeDeg: -26, longitudeDeg: -128 }, { latitudeDeg: 21, longitudeDeg: 149 }]) {
      near(placed(earthAttitude(point, 0, towardsEye), point.latitudeDeg, point.longitudeDeg), towardsEye)
    }
  })

  it('with no lean has north up and east to the right of the eye', () => {
    const axes = earthAttitude({ latitudeDeg: 0, longitudeDeg: 0 }, 0, towardsEye)
    near(placed(axes, 90, 0), [0, 1, 0])
    // Looking towards -z with +y up, the right hand is +x: that is where 90°E must be.
    near(placed(axes, 0, 90), [1, 0, 0])
  })

  it('leans north towards the right for a positive lean, and upside down at 180', () => {
    near(placed(earthAttitude({ latitudeDeg: 0, longitudeDeg: 0 }, 90, towardsEye), 90, 0), [1, 0, 0])
    near(placed(earthAttitude({ latitudeDeg: 0, longitudeDeg: 0 }, 180, towardsEye), 90, 0), [0, -1, 0])
    // Upside down, east is on the left.
    near(placed(earthAttitude({ latitudeDeg: 0, longitudeDeg: 0 }, 180, towardsEye), 0, 90), [-1, 0, 0])
  })

  it('is a rotation: the three axes stay unit long and at right angles', () => {
    const [x, y, z] = earthAttitude({ latitudeDeg: -26, longitudeDeg: -128 }, -175, [0.3, -0.2, 0.93])
    const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    for (const axis of [x, y, z]) expect(dot(axis, axis)).toBeCloseTo(1, 9)
    expect(dot(x, y)).toBeCloseTo(0, 9)
    expect(dot(y, z)).toBeCloseTo(0, 9)
    expect(dot(z, x)).toBeCloseTo(0, 9)
  })
})

describe('the ball the map of the Earth is wrapped on', () => {
  // earthAttitude takes the ball's axes on trust: north +y, Greenwich +x, 90°E -z. This reads them
  // off the sphere the scene really uses, so a change in the library would show here.
  const ball = new SphereGeometry(1, 48, 32)
  const position = ball.getAttribute('position')
  const uv = ball.getAttribute('uv')
  /** The point of the ball where the map's (u, v) lands; u runs east from 180°W, v up from the south pole. */
  const at = (u: number, v: number): number[] => {
    let best = 0
    let gap = Infinity
    for (let index = 0; index < uv.count; index++) {
      const apart = Math.hypot(uv.getX(index) - u, uv.getY(index) - v)
      if (apart < gap) {
        gap = apart
        best = index
      }
    }
    return [position.getX(best), position.getY(best), position.getZ(best)]
  }
  const near = (a: number[], b: number[]) => a.forEach((value, index) => expect(value).toBeCloseTo(b[index], 6))

  it('has Greenwich, in the middle of the map, at +x', () => near(at(0.5, 0.5), [1, 0, 0]))
  it('has 90°E, three quarters across the map, at -z', () => near(at(0.75, 0.5), [0, 0, -1]))
  it('has the top of the map, the north pole, at +y', () => expect(at(0.5, 1)[1]).toBeCloseTo(1, 6))
})

