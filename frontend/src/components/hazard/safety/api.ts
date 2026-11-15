import { getJson } from '../../../api/client'
import type { HazardAround, SiteHazard } from './types'

/** The Monte Carlo numbers of the grid nearest the Site; they do not depend on the Window. */
export function getHazard(siteId: string, signal: AbortSignal): Promise<SiteHazard> {
  return getJson<SiteHazard>(`/sites/${encodeURIComponent(siteId)}/hazard`, new URLSearchParams(), signal)
}

/** The 50 m cells over the slope limit within `radiusM` of the Site's own point on its grid. */
export function getAround(siteId: string, radiusM: number, signal: AbortSignal): Promise<HazardAround> {
  return getJson<HazardAround>(
    `/sites/${encodeURIComponent(siteId)}/hazard/around`,
    new URLSearchParams({ radius_m: String(radiusM) }),
    signal,
  )
}
