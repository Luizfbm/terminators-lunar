/**
 * The parallel drawn round the south pole of the globe. 84°S: Athena is at 84.8°S and has to be
 * inside it; 85° or 87.5° would leave it out. The one number to change, here.
 */
export const POLAR_CIRCLE_LATITUDE = -84

/** The Moon's mean radius, in km (the sphere of the globe). */
const MOON_RADIUS_KM = 1737.4
/** Below this height of the camera the circle is hidden: it only makes sense in the view from orbit. */
export const POLAR_CIRCLE_HIDDEN_BELOW_KM = 150

/** The points of a parallel, every `stepDeg` of longitude and closing on the first. */
export function latitudeCircle(latitudeDeg: number, stepDeg = 1): { latitude_deg: number; longitude_deg: number }[] {
  const count = Math.round(360 / stepDeg)
  return Array.from({ length: count + 1 }, (_, at) => ({ latitude_deg: latitudeDeg, longitude_deg: (at * 360) / count }))
}

/** Whether the circle is drawn, from the camera's distance to the Moon's centre in radii. */
export const polarCircleShown = (distanceRadii: number): boolean => (distanceRadii - 1) * MOON_RADIUS_KM >= POLAR_CIRCLE_HIDDEN_BELOW_KM
