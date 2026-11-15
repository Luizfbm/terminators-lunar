import type { LatLon } from './sky'

/**
 * The latitude and the longitude, in degrees, of a point of the globe given as a vector from its
 * centre, in the frame of `toVector` (y along the Moon's axis, longitude east of the 0° meridian).
 */
export function latLonOfVector(x: number, y: number, z: number): LatLon {
  const length = Math.hypot(x, y, z) || 1
  return {
    latitude_deg: (Math.asin(Math.max(-1, Math.min(1, y / length))) * 180) / Math.PI,
    longitude_deg: (Math.atan2(-z, x) * 180) / Math.PI,
  }
}

/** What the landing hook is told: where, to a thousandth of a degree, and which Site if the point snapped to one. */
export interface LandPlace {
  lat: number
  lon: number
  siteId?: string
}

const thousandth = (value: number) => Math.round(value * 1000) / 1000

export const landPlace = (place: LatLon, siteId?: string): LandPlace => ({
  lat: thousandth(place.latitude_deg),
  lon: thousandth(place.longitude_deg),
  ...(siteId ? { siteId } : {}),
})

/** Whether the bubble goes to the left of the dot: when there is no room on the right, with `edge` of the stage as its limit. */
export const bubbleOnLeft = (dotX: number, gap: number, bubbleWidth: number, stageWidth: number, edge = 0.985): boolean =>
  dotX + gap + bubbleWidth > stageWidth * edge
