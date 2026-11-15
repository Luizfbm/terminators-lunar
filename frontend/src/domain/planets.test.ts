import { Body, GeoVector, RotationAxis } from 'astronomy-engine'
import { describe, expect, it } from 'vitest'
import {
  apply,
  chooseLabels,
  FAINT_MAGNITUDE,
  inertialSky,
  moonFrame,
  PLANETS,
  planetsInTheSky,
  pointLook,
  separationDeg,
  type LabelCandidate,
  type Matrix,
  type PlanetId,
} from './planets'
import { fromVector, toVector, type Vec3 } from './sky'

const RAD = Math.PI / 180
const radec = (raDeg: number, decDeg: number): Vec3 => [Math.cos(decDeg * RAD) * Math.cos(raDeg * RAD), Math.cos(decDeg * RAD) * Math.sin(raDeg * RAD), Math.sin(decDeg * RAD)]

/**
 * JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api), fetched once on 2026-11-15 with
 *   format=text, EPHEM_TYPE='OBSERVER', CENTER='500@301' (the centre of the Moon), TLIST='2026-11-15 12:00',
 *   TIME_TYPE='UT', QUANTITIES='1' (astrometric RA and DEC, ICRF), ANG_FORMAT='DEG', CSV_FORMAT='YES',
 *   and COMMAND set to the planet's body centre: 199, 299, 499, 599, 699, 799, 899.
 * Right ascension and declination in degrees.
 */
const HORIZONS_2026_11_15_1200: Record<PlanetId, [number, number]> = {
  mercury: [213.28299, -10.98209],
  venus: [199.91791, -9.80542],
  mars: [148.06479, 14.95719],
  jupiter: [147.95983, 13.7402],
  saturn: [8.51865, 0.79853],
  uranus: [61.75634, 20.74829],
  neptune: [1.88654, -0.71672],
}
const INSTANT = Date.UTC(2026, 10, 15, 12)

/**
 * The same service, for the Moon seen from the Earth: COMMAND='301', CENTER='500@399', QUANTITIES='14,15'
 * (ObsSub-LON/LAT, SunSub-LON/LAT), in the MOON_ME frame, east longitude positive. This is what the
 * engine's sub-Earth and sub-solar points are, so it stands in for them.
 */
const SUB_POINTS_2026_11_15_1200 = {
  earth: { latitude_deg: 2.701345, longitude_deg: 356.693692 - 360 },
  sun: { latitude_deg: -1.556542, longitude_deg: 108.340594 },
}
/** A partial lunar eclipse: from the Moon, the Earth and the Sun are 0.5° apart. Same query, TLIST='2026-08-28 04:13'. */
const ECLIPSE = Date.UTC(2026, 7, 28, 4, 13)
const SUB_POINTS_2026_08_28_0413 = {
  earth: { latitude_deg: -0.57412, longitude_deg: 355.391901 - 360 },
  sun: { latitude_deg: -0.11438, longitude_deg: 355.454951 - 360 },
}

const vectorOf = (point: { latitude_deg: number; longitude_deg: number }) => toVector(point.latitude_deg, point.longitude_deg)

/**
 * The Moon's orientation by the IAU model the library carries (pole and prime meridian), as a rotation
 * to the globe's axes: the body-fixed x on the 0° meridian, y east, z north, then (x, y, z) to
 * (X, Y, Z) = (x, z, -y). It stands in for the engine's answer over a lunation of instants.
 */
const iau = (ms: number): Matrix => {
  const { ra, dec, spin } = RotationAxis(Body.Moon, new Date(ms))
  const rz = (a: number): Matrix => [[Math.cos(a * RAD), Math.sin(a * RAD), 0], [-Math.sin(a * RAD), Math.cos(a * RAD), 0], [0, 0, 1]]
  const rx = (a: number): Matrix => [[1, 0, 0], [0, Math.cos(a * RAD), Math.sin(a * RAD)], [0, -Math.sin(a * RAD), Math.cos(a * RAD)]]
  const times = (a: Matrix, b: Matrix): Matrix => a.map((row) => [0, 1, 2].map((c) => row[0] * b[0][c] + row[1] * b[1][c] + row[2] * b[2][c])) as unknown as Matrix
  // The library gives the pole's right ascension in sidereal hours.
  const bodyFixed = times(rz(spin), times(rx(90 - dec), rz(90 + ra * 15)))
  return [bodyFixed[0], bodyFixed[2], bodyFixed[1].map((value) => -value) as unknown as Vec3]
}

describe('the planets as the Moon sees them, against JPL Horizons', () => {
  it('puts Jupiter within 0.1 degrees of where Horizons has it from the centre of the Moon', () => {
    const jupiter = inertialSky(INSTANT).planets.find((planet) => planet.id === 'jupiter')!
    const [ra, dec] = HORIZONS_2026_11_15_1200.jupiter
    // Horizons: RA 147.95983°, DEC +13.74020°. The library lands within 0.001°, a hundred times inside the tolerance.
    expect(separationDeg(jupiter.direction, radec(ra, dec))).toBeLessThan(0.1)
  })

  it('puts every planet within 0.1 degrees, Venus and Mercury included, which the Moon moves by 0.2 to 0.5 degrees', () => {
    for (const planet of inertialSky(INSTANT).planets) {
      const [ra, dec] = HORIZONS_2026_11_15_1200[planet.id]
      expect(separationDeg(planet.direction, radec(ra, dec)), planet.id).toBeLessThan(0.1)
    }
  })

  it('needs the Moon taken into account: from the centre of the Earth, Venus is off by more than the tolerance', () => {
    const fromEarth = GeoVector(Body.Venus, new Date(INSTANT), false)
    const [ra, dec] = HORIZONS_2026_11_15_1200.venus
    expect(separationDeg([fromEarth.x, fromEarth.y, fromEarth.z], radec(ra, dec))).toBeGreaterThan(0.1)
  })
})

describe('the frame of the Moon', () => {
  it('keeps the Earth exactly where the answer puts it, and the Sun within a hundredth of a degree', () => {
    const sky = inertialSky(INSTANT)
    const earth = vectorOf(SUB_POINTS_2026_11_15_1200.earth)
    const sun = vectorOf(SUB_POINTS_2026_11_15_1200.sun)
    const frame = moonFrame(sky, earth, sun)
    expect(separationDeg(apply(frame, sky.earth), earth)).toBeLessThan(1e-9)
    expect(separationDeg(apply(frame, sky.sun), sun)).toBeLessThan(0.01)
  })

  it('agrees with the Moon\'s north pole of the library, which it was not given: within 0.01 degrees', () => {
    const sky = inertialSky(INSTANT)
    const frame = moonFrame(sky, vectorOf(SUB_POINTS_2026_11_15_1200.earth), vectorOf(SUB_POINTS_2026_11_15_1200.sun))
    expect(separationDeg(apply(frame, sky.pole), [0, 1, 0])).toBeLessThan(0.01)
  })

  it('still holds when the Sun and the Earth are almost the same direction, as at an eclipse', () => {
    const sky = inertialSky(ECLIPSE)
    const earth = vectorOf(SUB_POINTS_2026_08_28_0413.earth)
    const sun = vectorOf(SUB_POINTS_2026_08_28_0413.sun)
    expect(separationDeg(earth, sun)).toBeLessThan(1)
    const frame = moonFrame(sky, earth, sun)
    // The Sun cannot fix the turn about that line, so the pole does: the pole falls on the Y axis, the Earth on the answer's point.
    expect(separationDeg(apply(frame, sky.pole), [0, 1, 0])).toBeLessThan(0.01)
    expect(separationDeg(apply(frame, sky.earth), earth)).toBeLessThan(1e-9)
    // And the Sun, which was not used, is where the answer has it, to the accuracy of the pole's model.
    expect(separationDeg(apply(frame, sky.sun), sun)).toBeLessThan(0.05)
  })

  it('is a rotation: the angle between two bodies is the same in the Moon\'s frame as in the library\'s', () => {
    const sky = inertialSky(INSTANT)
    const planets = planetsInTheSky(INSTANT, SUB_POINTS_2026_11_15_1200.earth, SUB_POINTS_2026_11_15_1200.sun)
    const earth = vectorOf(SUB_POINTS_2026_11_15_1200.earth)
    for (const planet of planets) {
      expect(Math.hypot(...planet.direction)).toBeCloseTo(1, 12)
      const inertial = sky.planets.find((entry) => entry.id === planet.id)!.direction
      expect(separationDeg(planet.direction, earth)).toBeCloseTo(separationDeg(inertial, sky.earth), 9)
    }
  })

  it('keeps Jupiter and Mars, 1.2 degrees apart that day, as far apart as Horizons has them', () => {
    const planets = planetsInTheSky(INSTANT, SUB_POINTS_2026_11_15_1200.earth, SUB_POINTS_2026_11_15_1200.sun)
    const jupiter = planets.find((planet) => planet.id === 'jupiter')!
    const mars = planets.find((planet) => planet.id === 'mars')!
    const apart = separationDeg(radec(...HORIZONS_2026_11_15_1200.jupiter), radec(...HORIZONS_2026_11_15_1200.mars))
    expect(apart).toBeCloseTo(1.2, 1)
    expect(Math.abs(separationDeg(jupiter.direction, mars.direction) - apart)).toBeLessThan(0.01)
  })

  it('is the same rotation as the IAU model every six hours of a lunation, with the Sun and with the pole fixing it', () => {
    let withThePole = 0
    for (let step = 0; step < 4 * 30; step += 1) {
      const ms = INSTANT + step * 6 * 3_600_000
      const sky = inertialSky(ms)
      const truth = iau(ms)
      const frame = moonFrame(sky, apply(truth, sky.earth), apply(truth, sky.sun))
      if (separationDeg(sky.earth, sky.sun) % 180 < 14.5 || separationDeg(sky.earth, sky.sun) % 180 > 165.5) withThePole += 1
      for (const planet of sky.planets) {
        expect(separationDeg(apply(frame, planet.direction), apply(truth, planet.direction)), `${planet.id} at step ${step}`).toBeLessThan(1e-6)
      }
    }
    // The lunation does cross the stretches around new and full Moon, so both ways of fixing the frame ran.
    expect(withThePole).toBeGreaterThan(10)
    expect(withThePole).toBeLessThan(4 * 30 - 40)
  })

  it('has the IAU model put the sub-Earth point within a tenth of a degree of Horizons, so it is a fair stand-in for the engine', () => {
    const earth = fromVector(apply(iau(INSTANT), inertialSky(INSTANT).earth))
    expect(Math.abs(earth.latitude_deg - SUB_POINTS_2026_11_15_1200.earth.latitude_deg)).toBeLessThan(0.1)
    expect(Math.abs(earth.longitude_deg - SUB_POINTS_2026_11_15_1200.earth.longitude_deg)).toBeLessThan(0.1)
  })
})

describe('how bright a planet is drawn', () => {
  it('draws brighter planets bigger and stronger, by magnitude', () => {
    const venus = pointLook(-4.5)
    const jupiter = pointLook(-2.1)
    const saturn = pointLook(0.5)
    const neptune = pointLook(7.8)
    expect(venus.brightness).toBeGreaterThan(jupiter.brightness)
    expect(jupiter.brightness).toBeGreaterThan(saturn.brightness)
    expect(saturn.brightness).toBeGreaterThan(neptune.brightness)
    expect(venus.sizePx).toBeGreaterThan(saturn.sizePx)
    expect(venus.opacity).toBeGreaterThan(saturn.opacity)
  })

  it('stays between the faintest and the brightest it draws, so no planet vanishes or glares', () => {
    for (const magnitude of [-10, -4.9, 0, 5.7, 7.8, 30]) {
      const look = pointLook(magnitude)
      expect(look.brightness).toBeGreaterThanOrEqual(0)
      expect(look.brightness).toBeLessThanOrEqual(1)
      expect(look.sizePx).toBeGreaterThanOrEqual(3)
      expect(look.sizePx).toBeLessThanOrEqual(8)
      expect(look.opacity).toBeGreaterThanOrEqual(0.4)
      expect(look.opacity).toBeLessThanOrEqual(1)
    }
  })

  it('is a straight line in magnitude: five magnitudes make the same step anywhere on the scale', () => {
    expect(pointLook(-3).brightness - pointLook(2).brightness).toBeCloseTo(pointLook(0).brightness - pointLook(5).brightness, 12)
  })

  it('has one colour and one name key for each of the seven planets', () => {
    expect(PLANETS.map((planet) => planet.id)).toEqual(['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'])
    expect(new Set(PLANETS.map((planet) => planet.colour)).size).toBe(7)
  })
})

describe('which planets are named', () => {
  const stage = { left: 8, top: 48, right: 800, bottom: 540 }
  const candidate = (id: PlanetId, x: number, y: number, magnitude: number): LabelCandidate => ({ id, x, y, gap: 6, width: 50, height: 14, magnitude })

  it('names a planet on its right, where there is room', () => {
    expect(chooseLabels([candidate('jupiter', 300, 200, -2)], stage, []).get('jupiter')).toBe('right')
  })

  it('moves a name to the left when the right would pass the edge of the stage', () => {
    expect(chooseLabels([candidate('jupiter', 780, 200, -2)], stage, []).get('jupiter')).toBe('left')
  })

  it('leaves a name out when neither side fits on the stage', () => {
    expect(chooseLabels([candidate('jupiter', 400, 20, -2)], stage, []).has('jupiter')).toBe(false)
    expect(chooseLabels([candidate('jupiter', 400, 535, -2)], stage, []).has('jupiter')).toBe(false)
  })

  it('keeps a name off anything it was told to keep clear, such as the Site and its name', () => {
    const siteAndName = { left: 300, top: 190, right: 420, bottom: 210 }
    // Right is covered by the Site's name; the left is free.
    expect(chooseLabels([candidate('jupiter', 290, 200, -2)], stage, [siteAndName]).get('jupiter')).toBe('left')
    // Both sides covered: no name.
    expect(chooseLabels([candidate('jupiter', 290, 200, -2)], stage, [siteAndName, { left: 200, top: 190, right: 284, bottom: 210 }]).has('jupiter')).toBe(false)
  })

  it('gives the name to the brighter of two planets that would overlap, and the other goes without or to its left', () => {
    const named = chooseLabels([candidate('mars', 300, 200, 0.7), candidate('jupiter', 322, 202, -2.1)], stage, [])
    expect(named.get('jupiter')).toBe('right')
    // Mars lies on Jupiter's left, the side its name can still go.
    expect(named.get('mars')).toBe('left')
  })

  it('names no planet over the point of another', () => {
    const named = chooseLabels([candidate('venus', 300, 200, -4.5), candidate('saturn', 340, 200, 0.5)], stage, [])
    // Saturn's point is within Venus's name on its right, so Venus's name goes to the left.
    expect(named.get('venus')).toBe('left')
  })

  it('hides the name of a faint planet when another planet is crowding it, and keeps it when it is alone', () => {
    expect(FAINT_MAGNITUDE).toBeLessThan(5.6)
    const crowded = chooseLabels([candidate('uranus', 300, 200, 5.7), candidate('mars', 330, 230, 0.7)], stage, [])
    expect(crowded.has('uranus')).toBe(false)
    expect(crowded.has('mars')).toBe(true)
    const alone = chooseLabels([candidate('uranus', 300, 200, 5.7), candidate('mars', 600, 400, 0.7)], stage, [])
    expect(alone.has('uranus')).toBe(true)
  })

  it('names a faint planet whose neighbour is far enough, the same as a bright one', () => {
    expect(chooseLabels([candidate('neptune', 100, 300, 7.8)], stage, []).get('neptune')).toBe('right')
  })

  it('leaves out every name when nothing is on the stage', () => {
    expect(chooseLabels([], stage, []).size).toBe(0)
  })
})
