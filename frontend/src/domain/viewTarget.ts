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
