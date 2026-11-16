import { direction } from './skyScene'

/** Keep measured directions at least 2.5° apart, including repeat passes in long windows.
 * This changes the markers only; samples, ephemerides and the timeline remain untouched. */
export function solarPathDirections(samples: readonly { sun: { azimuth_deg: number; elevation_deg: number } }[]): (readonly number[])[] {
  const kept: (readonly number[])[] = []
  const limit = Math.cos(2.5 * Math.PI / 180)
  for (const { sun } of samples) {
    const point = direction(sun.azimuth_deg, sun.elevation_deg)
    if (kept.every(other => point[0] * other[0] + point[1] * other[1] + point[2] * other[2] <= limit)) kept.push(point)
  }
  return kept
}
