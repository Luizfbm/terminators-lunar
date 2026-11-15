/**
 * How big the Sun and the Earth are in the sky of the Moon, for the backdrop the globe draws behind
 * the Moon.
 *
 * Only their angular sizes matter there: the backdrop turns with the camera and never moves with it,
 * so a body in it is as far as the sky. These are mean values, for display only. The engine's answers
 * (where the Sun and the Earth are at the Cursor, and when they are hidden) come from the ephemeris;
 * the frontend only takes the direction from them.
 */

/** Mean radius of the Earth: IAU 2015 nominal value / NASA Earth Fact Sheet, 6371.0 km. */
export const EARTH_RADIUS_KM = 6371.0
/** Mean distance between the centres of the Earth and the Moon: NASA Moon Fact Sheet, 384,400 km. */
export const EARTH_MOON_DISTANCE_KM = 384_400
/** Nominal radius of the Sun: IAU 2015 Resolution B3, 695,700 km. */
export const SUN_RADIUS_KM = 695_700
/** The astronomical unit: IAU 2012 Resolution B2, 149,597,870.7 km. The Sun's mean distance from the Moon, to a fraction of a percent. */
export const ASTRONOMICAL_UNIT_KM = 149_597_870.7

const RAD = Math.PI / 180

/** The angle, in degrees, that a sphere of `radius` spans (from its centre to its limb) when its centre is `distance` away. */
export const angularRadiusDeg = (radius: number, distance: number): number => Math.asin(Math.min(1, radius / distance)) / RAD

/** How big the Earth looks from the Moon, as an angle of radius: about 0.95° (1.9° across). */
export const EARTH_ANGULAR_RADIUS_DEG = angularRadiusDeg(EARTH_RADIUS_KM, EARTH_MOON_DISTANCE_KM)
/** How big the Sun looks from the Moon, as an angle of radius: about 0.2665° (0.53° across). */
export const SUN_ANGULAR_RADIUS_DEG = angularRadiusDeg(SUN_RADIUS_KM, ASTRONOMICAL_UNIT_KM)

/** In the backdrop's own units, which mean nothing outside it: how far the two are drawn, and what its camera sees. */
export const BACKDROP_EARTH_DISTANCE = 400
export const BACKDROP_SUN_DISTANCE = 500
export const BACKDROP_NEAR = 1
export const BACKDROP_FAR = 1000

/** The radius of a ball `distance` away that spans `angularRadiusDeg` of the sky. */
export const sphereRadius = (distance: number, angularRadiusDeg: number): number => distance * Math.sin(angularRadiusDeg * RAD)

/** The radius of a flat disc that faces the eye, `distance` away, and spans `angularRadiusDeg` of the sky. */
export const discRadius = (distance: number, angularRadiusDeg: number): number => distance * Math.tan(angularRadiusDeg * RAD)

/**
 * How many pixels a body of angular radius `angularRadiusDeg` takes, in radius, straight ahead on a
 * stage `heightPx` tall seen with a vertical field of view of `fieldOfViewDeg`.
 */
export const projectedRadiusPx = (angularRadiusDeg: number, fieldOfViewDeg: number, heightPx: number): number =>
  ((heightPx / 2) * Math.tan(angularRadiusDeg * RAD)) / Math.tan((fieldOfViewDeg * RAD) / 2)

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
