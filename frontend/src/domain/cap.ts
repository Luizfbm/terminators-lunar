import type { LatLon } from './sky'

/** What `south_cap.json` says about the south-pole image: a square in south polar stereographic metres. */
export interface CapProjection {
  sphere_radius_m: number
  size_px: number
  x_min_m: number
  y_max_m: number
  metres_per_pixel: number
  /** The image names of this level, when the file lists them. */
  files?: { normal?: string; normal_small?: string; albedo?: string }
}

const DEG = 180 / Math.PI

/** Whether a fetched document has the numbers the cap needs. */
export function isCapProjection(value: unknown): value is CapProjection {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Record<string, unknown>
  return ['sphere_radius_m', 'size_px', 'x_min_m', 'y_max_m', 'metres_per_pixel'].every(
    (key) => typeof doc[key] === 'number' && Number.isFinite(doc[key]),
  )
}

/**
 * Where on the Moon a point of the cap's plane lies. The pole is at (0, 0), 0° longitude points
 * up (+y) and 90°E to the right (+x); the distance from the pole is 2R tan(45° + lat/2).
 */
export function capLatLon(xM: number, yM: number, sphereRadiusM: number): LatLon {
  const rho = Math.hypot(xM, yM)
  return {
    latitude_deg: 2 * Math.atan(rho / (2 * sphereRadiusM)) * DEG - 90,
    longitude_deg: rho === 0 ? 0 : Math.atan2(xM, yM) * DEG,
  }
}

/** The plane point under a pixel corner: column and row counted from the image's top left. */
export function capPoint(cap: CapProjection, column: number, row: number): { x: number; y: number } {
  return { x: cap.x_min_m + column * cap.metres_per_pixel, y: cap.y_max_m - row * cap.metres_per_pixel }
}
