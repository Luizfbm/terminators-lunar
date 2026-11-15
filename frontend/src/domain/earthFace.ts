/**
 * Which face of the Earth is turned to the Moon at an instant, and how the Earth's axis is tilted
 * in the sky of a Site (the requirement), from short formulas of positional astronomy. The engine
 * gives where the Earth is in the sky; this only decides what to draw on it.
 *
 * The Moon's and the Sun's ecliptic positions are the low-precision series of the Astronomical
 * Almanac, good to a few tenths of a degree, which is a fraction of a pixel of the drawn Earth.
 */

const RAD = Math.PI / 180
const J2000_MS = Date.UTC(2000, 0, 1, 12)
const DAY_MS = 86_400_000

type Vector = readonly [number, number, number]

const sin = (degrees: number) => Math.sin(degrees * RAD)
const cos = (degrees: number) => Math.cos(degrees * RAD)
const wrap180 = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vector): Vector => {
  const length = Math.hypot(a[0], a[1], a[2])
  return [a[0] / length, a[1] / length, a[2] / length]
}

/** Days and Julian centuries since J2000.0, taking UTC for the uniform time scale (they differ by about a minute). */
const days = (ms: number) => (ms - J2000_MS) / DAY_MS
const centuries = (ms: number) => days(ms) / 36525

/** The obliquity of the ecliptic, in degrees. */
const obliquity = (ms: number) => 23.439 - 0.0000004 * days(ms)

/** The Moon's geocentric ecliptic longitude and latitude, in degrees. */
export function moonEcliptic(ms: number): { longitudeDeg: number; latitudeDeg: number } {
  const t = centuries(ms)
  const longitudeDeg =
    218.32 +
    481267.881 * t +
    6.29 * sin(135.0 + 477198.87 * t) -
    1.27 * sin(259.3 - 413335.36 * t) +
    0.66 * sin(235.7 + 890534.22 * t) +
    0.21 * sin(269.9 + 954397.74 * t) -
    0.19 * sin(357.5 + 35999.05 * t) -
    0.11 * sin(186.5 + 966404.03 * t)
  const latitudeDeg =
    5.13 * sin(93.3 + 483202.02 * t) + 0.28 * sin(228.2 + 960400.89 * t) - 0.28 * sin(318.3 + 6003.15 * t) - 0.17 * sin(217.6 - 407332.21 * t)
  return { longitudeDeg: ((longitudeDeg % 360) + 360) % 360, latitudeDeg }
}

/** The Sun's geocentric ecliptic longitude, in degrees. Its latitude is taken as zero. */
export function sunEclipticLongitude(ms: number): number {
  const d = days(ms)
  const anomaly = 357.528 + 0.9856003 * d
  return (((280.46 + 0.9856474 * d + 1.915 * sin(anomaly) + 0.02 * sin(2 * anomaly)) % 360) + 360) % 360
}

/** A unit vector in ecliptic axes: x to the equinox, z to the ecliptic's north pole. */
const ecliptic = (longitudeDeg: number, latitudeDeg: number): Vector => [
  cos(latitudeDeg) * cos(longitudeDeg),
  cos(latitudeDeg) * sin(longitudeDeg),
  sin(latitudeDeg),
]

/**
 * The point of the Earth that has the Moon overhead: the middle of the face the Moon sees.
 * Longitude is positive to the east.
 */
export function subLunarPoint(ms: number): { latitudeDeg: number; longitudeDeg: number } {
  const moon = moonEcliptic(ms)
  const tilt = obliquity(ms)
  // Ecliptic to equatorial: right ascension and declination of the Moon.
  const rightAscension = Math.atan2(sin(moon.longitudeDeg) * cos(tilt) - Math.tan(moon.latitudeDeg * RAD) * sin(tilt), cos(moon.longitudeDeg)) / RAD
  const declination = Math.asin(sin(moon.latitudeDeg) * cos(tilt) + cos(moon.latitudeDeg) * sin(tilt) * sin(moon.longitudeDeg)) / RAD
  // Greenwich sidereal time: how far the Earth has turned.
  const sidereal = 280.46061837 + 360.98564736629 * days(ms)
  return { latitudeDeg: declination, longitudeDeg: wrap180(rightAscension - sidereal) }
}

/** A direction in the sky of a Site, as the engine gives it: degrees from north through east, and above the level. */
export interface SkyDirection {
  azimuthDeg: number
  elevationDeg: number
}

/** The same direction as a unit vector with x east, y up and z south. */
const local = ({ azimuthDeg, elevationDeg }: SkyDirection): Vector => [
  cos(elevationDeg) * sin(azimuthDeg),
  sin(elevationDeg),
  -cos(elevationDeg) * cos(azimuthDeg),
]

/** Below this sine of the angle between the Sun and the Earth in the sky, the two do not fix the tilt. */
const TOO_CLOSE = 0.05

/**
 * The direction of the Earth's north pole in the Site's own axes (x east, y up, z south).
 *
 * The directions to the Earth and to the Sun are known twice: in the sky of the Site, from the
 * engine, and among the stars, from the formulas above. Two directions known in both fix how the
 * Site's axes sit among the stars, and with that the Earth's axis, which points 23.4° from the
 * ecliptic's pole, can be brought into the Site's sky. null near new and full Moon, when the Sun
 * and the Earth are in line seen from the Moon and one direction is not enough.
 */
export function earthNorthAt(ms: number, sun: SkyDirection, earth: SkyDirection): Vector | null {
  const moon = moonEcliptic(ms)
  // Seen from the Moon the Earth is opposite to where the Moon is seen from the Earth; the Sun is
  // where the Earth sees it, to within a sixth of a degree.
  const earthAmongStars = ecliptic(moon.longitudeDeg + 180, -moon.latitudeDeg)
  const sunAmongStars = ecliptic(sunEclipticLongitude(ms), 0)
  const earthInSky = local(earth)
  const sunInSky = local(sun)
  const across = cross(earthAmongStars, sunAmongStars)
  const acrossInSky = cross(earthInSky, sunInSky)
  if (Math.hypot(...across) < TOO_CLOSE || Math.hypot(...acrossInSky) < TOO_CLOSE) return null

  // Three perpendicular directions built the same way in both sets of axes.
  const stars = [earthAmongStars, unit(across), cross(earthAmongStars, unit(across))] as const
  const sky = [earthInSky, unit(acrossInSky), cross(earthInSky, unit(acrossInSky))] as const
  const tilt = obliquity(ms)
  const pole: Vector = [0, sin(tilt), cos(tilt)]
  const parts = stars.map((axis) => dot(pole, axis))
  return unit([
    parts[0] * sky[0][0] + parts[1] * sky[1][0] + parts[2] * sky[2][0],
    parts[0] * sky[0][1] + parts[1] * sky[1][1] + parts[2] * sky[2][1],
    parts[0] * sky[0][2] + parts[1] * sky[1][2] + parts[2] * sky[2][2],
  ])
}

/**
 * How the Earth's north pole leans on the sky for someone looking at the Earth with the zenith
 * up: degrees from straight up, positive towards the right. 180 is north straight down.
 */
export function earthRoll(north: Vector, earth: SkyDirection): number {
  const towards = local(earth)
  const right = unit(cross(towards, [0, 1, 0]))
  const up = cross(right, towards)
  return Math.atan2(dot(north, right), dot(north, up)) / RAD
}

/**
 * How to turn a ball textured with a map of the Earth so that it shows what the Site sees.
 *
 * The ball's own axes are those of a sphere wrapped with an equirectangular map whose middle is
 * the Greenwich meridian: north is +y, 0° of longitude is +x and 90°E is -z. `towardsEye` is the
 * unit vector from the Earth to the eye in the scene, and `up` the scene's up. The sub-lunar
 * point faces the eye, and north leans `rollDeg` from up on the sky towards the right.
 *
 * Returns the scene directions of the ball's x, y and z axes: the columns of its rotation.
 */
export function earthAttitude(
  subLunar: { latitudeDeg: number; longitudeDeg: number },
  rollDeg: number,
  towardsEye: Vector,
  up: Vector = [0, 1, 0],
): [Vector, Vector, Vector] {
  // The sky as the eye sees it around the Earth: right and up, both across the line of sight.
  const lineOfSight: Vector = [-towardsEye[0], -towardsEye[1], -towardsEye[2]]
  const right = unit(cross(lineOfSight, up))
  const skyUp = cross(right, lineOfSight)
  const lean: Vector = [
    skyUp[0] * cos(rollDeg) + right[0] * sin(rollDeg),
    skyUp[1] * cos(rollDeg) + right[1] * sin(rollDeg),
    skyUp[2] * cos(rollDeg) + right[2] * sin(rollDeg),
  ]
  // North makes 90° minus the sub-lunar latitude with the direction to the eye.
  const north = unit([
    towardsEye[0] * sin(subLunar.latitudeDeg) + lean[0] * cos(subLunar.latitudeDeg),
    towardsEye[1] * sin(subLunar.latitudeDeg) + lean[1] * cos(subLunar.latitudeDeg),
    towardsEye[2] * sin(subLunar.latitudeDeg) + lean[2] * cos(subLunar.latitudeDeg),
  ])
  // The same three perpendicular directions in the scene and on the ball: north, across, and the third.
  const frame = (pole: Vector, towards: Vector): [Vector, Vector, Vector] => {
    const across = unit(cross(pole, towards))
    return [pole, across, cross(pole, across)]
  }
  const scene = frame(north, towardsEye)
  const facing: Vector = [
    cos(subLunar.latitudeDeg) * cos(subLunar.longitudeDeg),
    sin(subLunar.latitudeDeg),
    -cos(subLunar.latitudeDeg) * sin(subLunar.longitudeDeg),
  ]
  const ball = frame([0, 1, 0], facing)
  // Rotation = scene axes times the transpose of the ball's: column k is where the ball's axis k goes.
  const column = (k: number): Vector => [
    scene[0][0] * ball[0][k] + scene[1][0] * ball[1][k] + scene[2][0] * ball[2][k],
    scene[0][1] * ball[0][k] + scene[1][1] * ball[1][k] + scene[2][1] * ball[2][k],
    scene[0][2] * ball[0][k] + scene[1][2] * ball[1][k] + scene[2][2] * ball[2][k],
  ]
  return [column(0), column(1), column(2)]
}

