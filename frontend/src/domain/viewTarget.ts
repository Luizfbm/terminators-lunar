import { toVector, type LatLon } from './sky'

/** Where the globe's camera goes for each button of the menu that turns the Moon. */
export type MoonView = 'initial' | 'dark' | 'north' | 'south'

/**
 * The camera's distance from the Moon's centre, in radii, in every view of the globe. At 5 the Moon fills
 * 71% of the height of the stage, so it is not cut by the screen (at 3.4 it was 107%). Chosen by the
 * Larissa by trying it.
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
 * disc. Initial is the middle of the day side, straight over the point under the Sun; dark is the middle of
 * the night side, the point opposite it; both need to know where the Sun is, and without that there is
 * nowhere to turn to. North and south are over the poles. `distance` is how far the camera is, in radii.
 */
export function viewTarget(view: MoonView, sun: LatLon | null, distance = VIEW_DISTANCE): Position | null {
  if (view === 'north') return along(90 - POLE_OFFSET_DEG, 0, distance)
  if (view === 'south') return along(-90 + POLE_OFFSET_DEG, 0, distance)
  if (!sun) return null
  return view === 'initial' ? along(sun.latitude_deg, sun.longitude_deg, distance) : along(-sun.latitude_deg, sun.longitude_deg + 180, distance)
}
