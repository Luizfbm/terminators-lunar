import { getJson, siteParams, toApiInstant } from '../../../api/client'
import type { Query, SiteRef } from '../../../domain/query'
import type { ScatterResult, TerrainResult } from './types'

/**
 * The Landing scatter: the Query asked at 19 points around the Site. The Query goes out exactly as
 * /visibility asks it, so the answer the server warmed for the default Query is the one it finds.
 */
export function getScatter(query: Query, radiusM: number, signal: AbortSignal): Promise<ScatterResult> {
  const params = new URLSearchParams({
    ...siteParams(query.site),
    start: toApiInstant(query.start),
    duration_hours: String(query.durationHours),
    observer_height_m: String(query.observerHeightM),
    radius_m: String(radiusM),
  })
  return getJson<ScatterResult>('/visibility/scatter', params, signal)
}

/** The Slope around the Site with NASA's defaults (100 m, 10°), and the nearest permanent shadow. */
export function getTerrain(site: SiteRef, signal: AbortSignal): Promise<TerrainResult> {
  return getJson<TerrainResult>('/terrain', new URLSearchParams(siteParams(site)), signal)
}
