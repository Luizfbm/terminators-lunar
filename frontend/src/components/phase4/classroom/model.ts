// The Classroom figure's teaching model (ADR 0005, to be written in requirement the implementation). Closed form, on a
// smooth Moon: it explains why a small hill matters at the pole and never answers a Query.

/** Mean lunar radius, km. */
export const MOON_RADIUS_KM = 1737.4
/** The Moon's axial tilt to the ecliptic: the Sun's declination swings between ±1.54° over a year. */
export const TILT_DEG = 1.54
/** One lunar day (synodic month), in hours. */
export const LUNAR_DAY_HOURS = 708.7

const RAD = Math.PI / 180

/** Elevation of a hill top seen from the ground, with the Moon's curvature: atan((h − d²/2R) / d). */
export function hillElevationDeg(heightM: number, distanceM: number): number {
  const h = heightM / 1000
  const d = distanceM / 1000
  return Math.atan((h - (d * d) / (2 * MOON_RADIUS_KM)) / d) / RAD
}

/** The example hill of the sentence: 300 m high, 10 km away. */
export const HILL = { heightM: 300, distanceM: 10_000 }
export const HILL_DEG = hillElevationDeg(HILL.heightM, HILL.distanceM)
/** The hill stands to the east: a flat top this many degrees of azimuth wide, then a slope on each side. */
export const HILL_AZIMUTH_DEG = 90
export const HILL_TOP_HALF_DEG = 12
export const HILL_SLOPE_DEG = 8

/** sin e = sin φ sin δ + cos φ cos δ cos H. Latitude negative in the south. */
export function sunElevationDeg(latitudeDeg: number, declinationDeg: number, hourAngleDeg: number): number {
  const phi = latitudeDeg * RAD
  const delta = declinationDeg * RAD
  const h = hourAngleDeg * RAD
  return Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(h)) / RAD
}

/** Azimuth from north, clockwise (east is +90), in [-180, 180). */
export function sunAzimuthDeg(latitudeDeg: number, declinationDeg: number, hourAngleDeg: number): number {
  const phi = latitudeDeg * RAD
  const delta = declinationDeg * RAD
  const h = hourAngleDeg * RAD
  // Measured from south, positive to the west; turned to north-clockwise below.
  const fromSouth = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)) / RAD
  const fromNorth = fromSouth + 180
  return ((((fromNorth + 180) % 360) + 360) % 360) - 180
}

/** The highest the Sun climbs over a year at this latitude: 90° − |φ| + tilt, never above 90°. */
export function highestSunDeg(latitudeDeg: number): number {
  return Math.min(90, 90 - Math.abs(latitudeDeg) + TILT_DEG)
}

/** Elevation of the example hill's skyline at an azimuth: a ridge with a flat top, 0 away from it. */
export function hillAt(azimuthDeg: number): number {
  const off = Math.abs(azimuthDeg - HILL_AZIMUTH_DEG)
  if (off <= HILL_TOP_HALF_DEG) return HILL_DEG
  const down = (off - HILL_TOP_HALF_DEG) / HILL_SLOPE_DEG
  return down >= 1 ? 0 : HILL_DEG * 0.5 * (1 + Math.cos(Math.PI * down))
}

export interface PathPoint {
  hourAngleDeg: number
  azimuthDeg: number
  elevationDeg: number
}

/** The Sun's path over one lunar day, one point per `stepDeg` of hour angle. */
export function sunPath(latitudeDeg: number, declinationDeg: number, stepDeg = 1): PathPoint[] {
  const points: PathPoint[] = []
  for (let hourAngle = -180; hourAngle <= 180; hourAngle += stepDeg) {
    points.push({
      hourAngleDeg: hourAngle,
      azimuthDeg: sunAzimuthDeg(latitudeDeg, declinationDeg, hourAngle),
      elevationDeg: sunElevationDeg(latitudeDeg, declinationDeg, hourAngle),
    })
  }
  return points
}

/** Hours of one lunar day with the Sun's centre above the bare horizon, and hidden by the hill. */
export function dayHours(latitudeDeg: number, declinationDeg: number): { above: number; behindHill: number } {
  const step = 0.1
  const hoursPerStep = (LUNAR_DAY_HOURS / 360) * step
  let above = 0
  let behindHill = 0
  for (let hourAngle = -180; hourAngle < 180; hourAngle += step) {
    const elevation = sunElevationDeg(latitudeDeg, declinationDeg, hourAngle)
    if (elevation <= 0) continue
    above += hoursPerStep
    if (elevation < hillAt(sunAzimuthDeg(latitudeDeg, declinationDeg, hourAngle))) behindHill += hoursPerStep
  }
  return { above, behindHill }
}
