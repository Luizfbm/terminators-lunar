import { toVector, type LatLon } from './sky'

/** Where the globe's camera goes for each button of the menu that turns the Moon. */
export type MoonView = 'initial' | 'dark' | 'north' | 'south'
/** The views that are a place on the Moon. `initial` is not one: it is the opening framing, on the side of the chosen Site, which the globe works out. */
export type MoonPlace = Exclude<MoonView, 'initial'>

/**
 * The camera's distance from the Moon's centre, in radii, in every view of the globe. At 5 the Moon fills
 * 71% of the height of the stage, so it is not cut by the screen (at 3.4 it was 107%). Chosen by the
 * trying it.
 */
export const VIEW_DISTANCE = 5
/** The globe's vertical field of view, in degrees: the one number the framing below and the camera share. */
export const GLOBE_FIELD_OF_VIEW_DEG = 32
/**
 * On a stage taller than wide the disc is limited by the width, not the height: at 5 radii on a phone
 * (390 by 506) the Moon spanned 92% of the width and its limb touched the edges. It never takes more than
 * this share of the width, so the sky behind it has room to show.
 */
export const MOON_WIDTH_SHARE = 0.8
/** The farthest the framing goes: beyond it the Moon is a marble. The globe's zoom limit is raised to match. */
export const MAX_FRAMING_DISTANCE = 8

/**
 * The camera's distance, in radii, that frames the whole Moon on a stage of this `aspect` (width over height): the
 * usual `VIEW_DISTANCE` where the height is the limit (a desktop), farther where the width is (a phone upright).
 * This is the camera's composition only: how large the Sun and the Earth are in the Moon's sky does not depend on it.
 */
export function viewDistanceFor(aspect: number, fieldOfViewDeg = GLOBE_FIELD_OF_VIEW_DEG): number {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return VIEW_DISTANCE
  // The limb is at asin(1/d) from the axis; its tangent, over the tangent of half the field, is the share of the half height.
  const widthLimit = MOON_WIDTH_SHARE * aspect * Math.tan((fieldOfViewDeg * Math.PI) / 360)
  const distance = Math.sqrt(1 + 1 / widthLimit ** 2)
  return Math.min(MAX_FRAMING_DISTANCE, Math.max(VIEW_DISTANCE, distance))
}
/**
 * The poles are looked at from this far off them, a hair, so the pole is in the middle of the disc and the
 * camera's up (the Moon's axis) is not along the way it looks, which has no sense at the pole itself.
 */
const POLE_OFFSET_DEG = 0.5

/** A camera position, in radii of the Moon, in the frame of the globe. */
export type Position = readonly [number, number, number]

const along = (latitudeDeg: number, longitudeDeg: number, distance: number): Position => {
  const [x, y, z] = toVector(latitudeDeg, longitudeDeg)
  return [x * distance, y * distance, z * distance]
}

/**
 * The camera position for a view, straight over a point of the Moon so that point is in the middle of the
 * disc. Dark is the middle of the night side, the point opposite the Sun, so it needs to know where the Sun
 * is, and without that there is nowhere to turn to. North and south are over the poles. `distance` is how
 * far the camera is, in radii. There is no view straight over the point under the Sun: from there the Sun is
 * behind the camera and the sky behind the Moon would not show it.
 */
export function viewTarget(view: MoonPlace, sun: LatLon | null, distance = VIEW_DISTANCE): Position | null {
  if (view === 'north') return along(90 - POLE_OFFSET_DEG, 0, distance)
  if (view === 'south') return along(-90 + POLE_OFFSET_DEG, 0, distance)
  if (!sun) return null
  return along(-sun.latitude_deg, sun.longitude_deg + 180, distance)
}
