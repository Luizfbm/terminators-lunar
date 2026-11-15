import { ApiError, getJson } from '../../../api/client'
import { GridDecodeError, decodeGrid } from './decode'
import type { DecodedGrid, HazardGrid, SiteHazard } from './types'

/** Everything the inspector draws: the numbers, and the grid they belong to (null when none lies within 15 km). */
export interface HazardData {
  hazard: SiteHazard
  grid: DecodedGrid | null
}

const path = (siteId: string, tail: string) => `/sites/${encodeURIComponent(siteId)}/hazard${tail}`

export function getHazard(siteId: string, signal: AbortSignal): Promise<SiteHazard> {
  return getJson<SiteHazard>(path(siteId, ''), new URLSearchParams(), signal)
}

export function getHazardGrid(siteId: string, signal: AbortSignal): Promise<HazardGrid> {
  return getJson<HazardGrid>(path(siteId, '/grid'), new URLSearchParams(), signal)
}

/**
 * Asks for the numbers and the grid together and decodes the grid. A Site with no grid within 15 km
 * answers `grid: null` in the numbers, and the grid is not asked for.
 */
export async function loadHazard(siteId: string, signal: AbortSignal): Promise<HazardData> {
  const hazardRequest = getHazard(siteId, signal)
  // Asked in parallel; a Site with no grid answers 422 here, which the numbers' `grid: null` already says.
  const gridRequest = getHazardGrid(siteId, signal).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === 'no_hazard_grid') return null
    throw error
  })
  const [hazard, raw] = await Promise.all([hazardRequest, gridRequest])
  if (hazard.grid === null || raw === null) return { hazard, grid: null }
  try {
    return { hazard, grid: decodeGrid(raw) }
  } catch (error) {
    if (error instanceof GridDecodeError) throw new ApiError('decode')
    throw error
  }
}
