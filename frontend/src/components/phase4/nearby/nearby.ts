// The nearby Site that serves, said inside the answer: which neighbour to name, what to ask
// `GET /sites/{site_id}/neighbours`, which way it lies, and the link that makes it the chosen Site.
import type { Site, VisibilityResult } from '../../../api/client'
import { isCustomSite, readLink, writeLink } from '../../../domain/query'
import type { NeighbourSite, NeighboursRequest, SiteNeighbours } from '../slip/slipPlan'

/** Under a minute of Sun-and-Earth time either way is the same: the engine steps by minutes. */
export const GAIN_HOURS = 1 / 60

/** Only a Curated Site has neighbours; a custom Site (a typed coordinate) is never asked about. */
export function isAskable(site: Site): boolean {
  return !isCustomSite(site)
}

/** What to ask for the answer on screen: the same Site, Window and Observer height. */
export function nearbyRequest(result: VisibilityResult): NeighboursRequest {
  const { site, start, duration_hours: durationHours, observer_height_m: observerHeightM } = result.query
  return {
    siteId: site.id,
    params: new URLSearchParams({
      start,
      duration_hours: String(durationHours),
      observer_height_m: String(observerHeightM),
    }),
  }
}

/** The neighbour with the most Sun-and-Earth time (a tie goes to the nearer one), or null if there is none. */
export function bestNeighbour(data: SiteNeighbours): NeighbourSite | null {
  return data.neighbours.reduce<NeighbourSite | null>((best, row) => {
    if (!best) return row
    const gap = row.metrics.sun_and_earth_hours - best.metrics.sun_and_earth_hours
    return gap > 0 || (gap === 0 && row.distance_km < best.distance_km) ? row : best
  }, null)
}

type Point = Pick<Site, 'latitude_deg' | 'longitude_deg'>

/** Initial great-circle bearing from one point to another, in degrees from north, `[0, 360)`. */
export function bearingDeg(from: Point, to: Point): number {
  const rad = Math.PI / 180
  const lat1 = from.latitude_deg * rad
  const lat2 = to.latitude_deg * rad
  const dLon = (to.longitude_deg - from.longitude_deg) * rad
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) / rad + 360) % 360
}

export interface Nearby {
  site: Site
  distanceKm: number
  /** Initial compass bearing from the Site of the Query, in degrees clockwise from north. */
  bearingDeg: number
  /** Sun-and-Earth time of the neighbour over this Window, in hours. */
  bothHours: number
  /** Sun-and-Earth time of the Site of the Query over the same Window, in hours. */
  ownHours: number
}

/**
 * The line to say, or null for nothing: only a Curated Site, and only when its best neighbour has
 * more Sun-and-Earth time over the Window than the Site of the Query.
 */
export function nearbyOf(result: VisibilityResult, data: SiteNeighbours): Nearby | null {
  const site = result.query.site
  if (!isAskable(site)) return null
  const best = bestNeighbour(data)
  const own = result.metrics.sun_and_earth_hours
  if (!best || best.metrics.sun_and_earth_hours - own < GAIN_HOURS) return null
  return {
    site: best.site,
    distanceKm: best.distance_km,
    bearingDeg: bearingDeg(site, best.site),
    bothHours: best.metrics.sun_and_earth_hours,
    ownHours: own,
  }
}

/**
 * The link that opens the neighbour as the Site of the Query: the same Window start, length and
 * Observer height, everything else in the current link kept, and the Cursor left to start over.
 */
export function nearbyHref(search: string, result: VisibilityResult, siteId: string): string {
  const { start, duration_hours: hours, observer_height_m: heightM } = result.query
  const query = writeLink({ ...readLink(search), site: siteId, startDay: start.slice(0, 10), hours, heightM, cursorMs: null }, search)
  return query || '?'
}
