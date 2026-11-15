/**
 * The seven planets in the sky of the Moon, for the backdrop the globe draws behind it.
 *
 * Illustration only (ADR 0007): the directions are not in any number of an answer and not in the
 * Proof. They come from `astronomy-engine` (MIT, VSOP87 planets and a truncated lunar series, good to
 * about an arcminute, under a pixel on the stage). The Sun and the Earth on the same stage come from
 * the engine's answer, so the frame the planets are drawn in is tied to theirs, see `moonFrame`.
 */
import { Body, GeoMoon, GeoVector, Illumination, RotationAxis } from 'astronomy-engine'
import { toVector, type LatLon, type Vec3 } from './sky'

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'

export interface Planet {
  id: PlanetId
  body: Body
  /** Its colour as the eye takes it: a hint, not a spectrum. */
  colour: number
}

export const PLANETS: readonly Planet[] = [
  { id: 'mercury', body: Body.Mercury, colour: 0xd9d3c7 },
  { id: 'venus', body: Body.Venus, colour: 0xfff1cf },
  { id: 'mars', body: Body.Mars, colour: 0xff9467 },
  { id: 'jupiter', body: Body.Jupiter, colour: 0xffe8cc },
  { id: 'saturn', body: Body.Saturn, colour: 0xf1d79b },
  { id: 'uranus', body: Body.Uranus, colour: 0xa8e9ee },
  { id: 'neptune', body: Body.Neptune, colour: 0x7f9fff },
]

const RAD = Math.PI / 180

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => {
  const size = length(a)
  return [a[0] / size, a[1] / size, a[2] / size]
}
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const vec = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z]

/** A rotation as three rows: `apply(matrix, v)` is the matrix times the vector. */
export type Matrix = readonly [Vec3, Vec3, Vec3]
export const apply = (m: Matrix, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)]

/** The angle between two directions, in degrees. */
export const separationDeg = (a: Vec3, b: Vec3): number => Math.atan2(length(cross(a, b)), dot(a, b)) / RAD

/**
 * The directions from the centre of the Moon that the planets and the frame need at an instant, all
 * in the library's inertial frame (EQJ: the mean equator and equinox of J2000, which is the ICRF to
 * about 20 milliarcseconds).
 *
 * A planet is its geometric direction from the Moon's centre: the planet's position from the Earth
 * (corrected for the light's travel time, without the aberration of the observer's own motion, as
 * JPL Horizons gives it as "astrometric") minus the Moon's position from the Earth. The Moon matters
 * for Mars and the inner planets: 384,400 km is up to 0.4° of parallax for them.
 */
export interface InertialSky {
  earth: Vec3
  sun: Vec3
  /** The Moon's north pole (IAU 2015 rotation model, which the library carries). */
  pole: Vec3
  planets: { id: PlanetId; direction: Vec3 }[]
}

export function inertialSky(ms: number): InertialSky {
  const when = new Date(ms)
  const moon = vec(GeoMoon(when))
  const from = (body: Body): Vec3 => unit(minus(vec(GeoVector(body, when, false)), moon))
  return {
    earth: unit([-moon[0], -moon[1], -moon[2]]),
    sun: from(Body.Sun),
    pole: vec(RotationAxis(Body.Moon, when).north),
    planets: PLANETS.map((planet) => ({ id: planet.id, direction: from(planet.body) })),
  }
}

/**
 * The visual magnitude each planet has, as seen from the Earth (the Moon is close enough: its
 * distance changes none of them by a hundredth). It changes over weeks, so it is asked on its own.
 */
export function planetMagnitudes(ms: number): Record<PlanetId, number> {
  const when = new Date(ms)
  const magnitudes = {} as Record<PlanetId, number>
  for (const planet of PLANETS) magnitudes[planet.id] = Illumination(planet.body, when).mag
  return magnitudes
}

/** Below this sine of the angle between the Sun and the Earth in the Moon's sky (about 14.5°), the Sun does not fix the frame well. */
const SUN_FIXES_THE_FRAME = 0.25

/**
 * The rotation that takes a direction in the library's inertial frame to the Moon's body-fixed frame
 * as the globe uses it (`toVector`: Y through the north pole, X through 0° longitude; the frame the
 * engine's sub-solar and sub-Earth points are in, MOON_ME, the mean Earth / polar axis frame).
 *
 * The library does not give the Moon's orientation in that frame (its IAU model is an approximation
 * of it), but the answer already carries two directions in it that the library also gives in its own
 * frame: the Earth and the Sun as seen from the Moon (`earthMe`, `sunMe`, from the answer's sub-Earth
 * and sub-solar points; `earth`, `sun` here, from the library). Two directions known in both frames
 * fix the rotation (the TRIAD method). That ties the planets to the Sun and the Earth on screen: where
 * the Sun and the Earth are drawn, the planets are drawn by the same rotation.
 *
 * The Earth is the first direction, so it is exact. The second is the Sun, but near new and full Moon
 * the Sun and the Earth are the same line (or opposite) in the Moon's sky and the Sun would fix the
 * turn about that line badly (a tenth of a degree of error in either would turn the planets by
 * several). There the Moon's north pole stands in for it: its direction in the body-fixed frame is
 * the Y axis by definition, and it is about 90° from the Earth, so it fixes the turn well.
 */
export function moonFrame(sky: Pick<InertialSky, 'earth' | 'sun' | 'pole'>, earthMe: Vec3, sunMe: Vec3): Matrix {
  const sunFixesIt = length(cross(sky.earth, sky.sun)) >= SUN_FIXES_THE_FRAME && length(cross(earthMe, sunMe)) >= SUN_FIXES_THE_FRAME
  const secondInertial = sunFixesIt ? sky.sun : sky.pole
  const secondBodyFixed = sunFixesIt ? sunMe : ([0, 1, 0] as const)

  // An orthonormal basis from two directions: the first, the normal to both, and the third to complete it.
  const basis = (first: Vec3, second: Vec3): Matrix => {
    const b = unit(cross(first, second))
    return [unit(first), b, cross(unit(first), b)]
  }
  const inertial = basis(sky.earth, secondInertial)
  const bodyFixed = basis(earthMe, secondBodyFixed)
  // A vector's parts along the inertial axes, laid out again along the body-fixed ones: R = sum of bodyFixed_i x inertial_i.
  const row = (r: number): Vec3 => [0, 1, 2].map((c) => bodyFixed.reduce((sum, axis, i) => sum + axis[r] * inertial[i][c], 0)) as unknown as Vec3
  return [row(0), row(1), row(2)]
}

export interface SkyPlanet {
  id: PlanetId
  /** A unit vector in the globe's own axes: from the centre of the Moon to the planet, as `toVector` gives them. */
  direction: Vec3
  magnitude: number
}

/**
 * Where the planets are in the Moon's sky at an instant, in the globe's axes, given where the answer
 * puts the Earth and the Sun at the same instant (their sub-Earth and sub-solar points).
 */
export function planetsInTheSky(ms: number, earth: LatLon, sun: LatLon, magnitudes: Record<PlanetId, number> = planetMagnitudes(ms)): SkyPlanet[] {
  const sky = inertialSky(ms)
  const frame = moonFrame(sky, toVector(earth.latitude_deg, earth.longitude_deg), toVector(sun.latitude_deg, sun.longitude_deg))
  return sky.planets.map(({ id, direction }) => ({ id, direction: apply(frame, direction), magnitude: magnitudes[id] }))
}

/** How a planet of a visual magnitude is drawn: a point of light, bigger and stronger the brighter it is. */
export interface PointLook {
  /** Its size on the screen, in pixels across: a planet is far under a pixel, so this is the glow of a point, not its size. */
  sizePx: number
  opacity: number
  /** 0 for the faintest we draw, 1 for the brightest. */
  brightness: number
}

/** Venus at its brightest (-4.9) and a planet too faint for the naked eye (7.8, Neptune) are the ends of what is drawn. */
const BRIGHTEST_MAGNITUDE = -4.5
const FAINTEST_MAGNITUDE = 6.5

/** The planets Uranus and Neptune and fainter are labelled only where there is room. */
export const FAINT_MAGNITUDE = 4.5

export function pointLook(magnitude: number): PointLook {
  // Magnitudes are logarithmic, and so is the eye: a straight line in magnitude is the right look.
  const brightness = Math.min(1, Math.max(0, (FAINTEST_MAGNITUDE - magnitude) / (FAINTEST_MAGNITUDE - BRIGHTEST_MAGNITUDE)))
  return { sizePx: 3 + 5 * brightness, opacity: 0.4 + 0.6 * brightness, brightness }
}

/** A box on the stage, in pixels from its top left corner. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const inside = (box: Box, bounds: Box) => box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom

export interface LabelCandidate {
  id: PlanetId
  /** Where the point is on the stage, in pixels. */
  x: number
  y: number
  /** How far the label starts from the point, and the size of its text. */
  gap: number
  width: number
  height: number
  magnitude: number
}

/** On which side of its point a label goes. */
export type LabelSide = 'right' | 'left'

/**
 * Which planets are named, and on which side of the point. The brightest are chosen first, and a name
 * is left out when it would cover the edge of the stage, anything in `keepClear` (the Site and its
 * name, the Sun, the Earth, the strips of the caption and the view buttons) or the name or point of
 * another planet. A faint planet (Uranus, Neptune) is named only with no other planet within `crowd`
 * pixels: where the sky is crowded it is the one that goes without a name. Its point stays.
 */
export function chooseLabels(candidates: readonly LabelCandidate[], bounds: Box, keepClear: readonly Box[], crowd = 48): Map<PlanetId, LabelSide> {
  const chosen = new Map<PlanetId, LabelSide>()
  const accepted: Box[] = []
  // Every point, named or not, is in the way of the names of the others; its own name may touch it.
  const point = (c: LabelCandidate): Box => ({ left: c.x - c.gap, top: c.y - c.gap, right: c.x + c.gap, bottom: c.y + c.gap })
  for (const candidate of [...candidates].sort((a, b) => a.magnitude - b.magnitude)) {
    const crowded = candidates.some((other) => other !== candidate && Math.hypot(other.x - candidate.x, other.y - candidate.y) < crowd)
    if (candidate.magnitude > FAINT_MAGNITUDE && crowded) continue
    const inTheWay = [...keepClear, ...accepted, ...candidates.filter((other) => other !== candidate).map(point)]
    for (const side of ['right', 'left'] as const) {
      const left = side === 'right' ? candidate.x + candidate.gap : candidate.x - candidate.gap - candidate.width
      const box: Box = { left, top: candidate.y - candidate.height / 2, right: left + candidate.width, bottom: candidate.y + candidate.height / 2 }
      if (inside(box, bounds) && !inTheWay.some((entry) => overlaps(box, entry))) {
        chosen.set(candidate.id, side)
        accepted.push(box)
        break
      }
    }
  }
  return chosen
}
