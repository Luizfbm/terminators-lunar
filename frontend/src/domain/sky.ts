/** Geometry the screen needs to draw the globe and to name a direction. No ephemeris: that is the backend's. */

export type Vec3 = readonly [number, number, number]

export interface LatLon {
  latitude_deg: number
  longitude_deg: number
}

export interface SubPointSample {
  t: string
  sun: LatLon
  earth: LatLon
}

const RAD = Math.PI / 180

/** Index of the compass point nearest to an azimuth: 0 north, 1 north-east, ... 7 north-west. */
export function compassIndex(azimuthDeg: number): number {
  const wrapped = ((azimuthDeg % 360) + 360) % 360
  return Math.round(wrapped / 45) % 8
}

/**
 * Selenographic latitude and longitude to a unit vector in the globe's own axes: Y through the north
 * pole, X through 0° longitude, east longitude turning towards −Z (how a sphere wraps a map centred on 0°).
 */
export function toVector(latitudeDeg: number, longitudeDeg: number): Vec3 {
  const lat = latitudeDeg * RAD
  const lon = longitudeDeg * RAD
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)]
}

/** A unit vector along the ground at a Site, pointing at an azimuth (clockwise from local north). */
export function groundDirection(site: LatLon, azimuthDeg: number): Vec3 {
  const lon = site.longitude_deg * RAD
  const up = toVector(site.latitude_deg, site.longitude_deg)
  const east: Vec3 = [-Math.sin(lon), 0, -Math.cos(lon)]
  // north = up × east, which at the poles still follows the Site's own meridian.
  const north: Vec3 = [
    up[1] * east[2] - up[2] * east[1],
    up[2] * east[0] - up[0] * east[2],
    up[0] * east[1] - up[1] * east[0],
  ]
  const a = azimuthDeg * RAD
  return [
    east[0] * Math.sin(a) + north[0] * Math.cos(a),
    east[1] * Math.sin(a) + north[1] * Math.cos(a),
    east[2] * Math.sin(a) + north[2] * Math.cos(a),
  ]
}

function lerpLongitude(a: number, b: number, k: number): number {
  let delta = b - a
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  const value = a + delta * k
  return ((value + 540) % 360) - 180
}

/**
 * The sub-solar and sub-Earth points at an instant, interpolated between the hourly samples around
 * it. Longitude is unwrapped across ±180° first. Outside the samples, the nearest one is used.
 */
export function subPointsAt(samples: readonly SubPointSample[], ms: number): { sun: LatLon; earth: LatLon } | null {
  if (samples.length === 0) return null
  const first = samples[0]!
  const last = samples[samples.length - 1]!
  if (ms <= Date.parse(first.t)) return { sun: first.sun, earth: first.earth }
  if (ms >= Date.parse(last.t)) return { sun: last.sun, earth: last.earth }
  let low = 0
  let high = samples.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (Date.parse(samples[middle]!.t) <= ms) low = middle
    else high = middle
  }
  const a = samples[low]!
  const b = samples[high]!
  const span = Date.parse(b.t) - Date.parse(a.t)
  const k = span > 0 ? (ms - Date.parse(a.t)) / span : 0
  const mix = (p: LatLon, q: LatLon): LatLon => ({
    latitude_deg: p.latitude_deg + (q.latitude_deg - p.latitude_deg) * k,
    longitude_deg: lerpLongitude(p.longitude_deg, q.longitude_deg, k),
  })
  return { sun: mix(a.sun, b.sun), earth: mix(a.earth, b.earth) }
}

export interface SkySample {
  t: string
  sun: { azimuth_deg: number; elevation_deg: number; fraction: number }
  earth: { azimuth_deg: number; elevation_deg: number; visible: boolean }
}

/** The timeline sample at or just before an instant (the samples are evenly spaced and sorted). */
export function sampleAt<S extends { t: string }>(samples: readonly S[], ms: number): S | null {
  if (samples.length === 0) return null
  const startMs = Date.parse(samples[0]!.t)
  if (samples.length === 1 || ms <= startMs) return samples[0]!
  const stepMs = Date.parse(samples[1]!.t) - startMs
  const index = Math.min(samples.length - 1, Math.max(0, Math.floor((ms - startMs) / stepMs)))
  return samples[index]!
}

/** The Horizon mask's elevation at an azimuth: the sample nearest to it, going round through north. */
export function maskElevationAt(mask: readonly { azimuth_deg: number; elevation_deg: number }[], azimuthDeg: number): number {
  let best = 0
  let gap = Infinity
  for (const point of mask) {
    const apart = Math.abs(((point.azimuth_deg - azimuthDeg + 540) % 360) - 180)
    if (apart < gap) {
      gap = apart
      best = point.elevation_deg
    }
  }
  return best
}

/** The place on the Moon a unit vector points at: the inverse of `toVector`. */
export function fromVector([x, y, z]: Vec3): LatLon {
  return {
    latitude_deg: Math.asin(Math.max(-1, Math.min(1, y))) / RAD,
    longitude_deg: Math.atan2(-z, x) / RAD,
  }
}
