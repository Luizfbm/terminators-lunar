/**
 * Where the Sun and the Earth stand in the 3D scene of the Moon, in Moon radii.
 *
 * These are mean values, for display only: they put the two bodies out there at the scale of
 * the real thing so that the camera can go round the Moon and find them. They are not an
 * ephemeris. The engine's answers (where the Sun and the Earth are at the Cursor, and when they
 * are hidden) come from the ephemeris; the frontend only takes the direction from them.
 */

/** Mean radius of the Moon: IAU 2015 / NASA Moon Fact Sheet, 1737.4 km. One scene unit. */
export const MOON_RADIUS_KM = 1737.4
/** Mean radius of the Earth: IAU 2015 nominal value / NASA Earth Fact Sheet, 6371.0 km. */
export const EARTH_RADIUS_KM = 6371.0
/** Mean distance between the centres of the Earth and the Moon: NASA Moon Fact Sheet, 384,400 km. */
export const EARTH_MOON_DISTANCE_KM = 384_400
/** Nominal radius of the Sun: IAU 2015 Resolution B3, 695,700 km. */
export const SUN_RADIUS_KM = 695_700
/** The astronomical unit: IAU 2012 Resolution B2, 149,597,870.7 km. The Sun's mean distance from the Moon, to a fraction of a percent. */
export const ASTRONOMICAL_UNIT_KM = 149_597_870.7

/** The Earth's distance and radius in Moon radii: about 221.3 and 3.667. */
export const EARTH_DISTANCE = EARTH_MOON_DISTANCE_KM / MOON_RADIUS_KM
export const EARTH_RADIUS = EARTH_RADIUS_KM / MOON_RADIUS_KM

/** How big the Sun looks from the Moon, as an angle of radius: a little over a quarter of a degree (0.53° across). */
export const SUN_ANGULAR_RADIUS_DEG = (Math.asin(SUN_RADIUS_KM / ASTRONOMICAL_UNIT_KM) * 180) / Math.PI

/**
 * The Sun is drawn at this distance, in Moon radii, not at its real 86,000: far beyond the Earth
 * and inside the camera's far plane, so the depth buffer keeps its precision. Its size is set from
 * the distance so that it spans the angle it really spans in the sky of the Moon.
 */
export const SUN_DISPLAY_DISTANCE = 12_000
/** The stars sit beyond the Sun. */
export const STAR_DISTANCE = 18_000
/** The camera sees as far as this, past the stars. */
export const CAMERA_FAR = 20_000

const RAD = Math.PI / 180

/** The radius of a disc that spans `angularRadiusDeg` of the sky when it is `distance` away. */
export const discRadius = (distance: number, angularRadiusDeg: number): number => distance * Math.tan(angularRadiusDeg * RAD)

/** The angle, in degrees, that a sphere of `radius` spans (from its centre to its limb) when its centre is `distance` away. */
export const angularRadiusDeg = (radius: number, distance: number): number => Math.asin(Math.min(1, radius / distance)) / RAD

/** How many pixels a sphere's radius takes on a stage `heightPx` tall, from a camera with a vertical field of view of `fieldOfViewDeg`. */
export function projectedRadiusPx(radius: number, distance: number, fieldOfViewDeg: number, heightPx: number): number {
  if (distance <= radius) return Infinity
  return ((heightPx / 2) * Math.tan(Math.asin(radius / distance))) / Math.tan((fieldOfViewDeg * RAD) / 2)
}

type Vec3 = readonly [number, number, number]

/**
 * Whether the straight line from `from` to `to` goes through the Moon, a sphere of radius 1 at the
 * origin: the Moon is between the eye and the body, and hides it.
 */
export function moonHides(from: Vec3, to: Vec3): boolean {
  const along: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const a = along[0] ** 2 + along[1] ** 2 + along[2] ** 2
  const b = 2 * (from[0] * along[0] + from[1] * along[1] + from[2] * along[2])
  const c = from[0] ** 2 + from[1] ** 2 + from[2] ** 2 - 1
  const discriminant = b * b - 4 * a * c
  if (a === 0 || discriminant <= 0) return false
  const root = Math.sqrt(discriminant)
  const entering = (-b - root) / (2 * a)
  const leaving = (-b + root) / (2 * a)
  // The sphere is crossed somewhere between the two points.
  return entering < 1 && leaving > 0
}
