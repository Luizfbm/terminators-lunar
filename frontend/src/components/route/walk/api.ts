import { getJson } from '../../../api/client'
import { useOnDemand, type PanelState } from '../../../hooks/useLadder'
import { decodeGrid, type WalkGrid } from './terrain'
import type { HazardGrid } from './types'

/** `GET /sites/{site_id}/hazard/grid`: the 10 x 10 km ground grid nearest the Site. */
export function getHazardGrid(siteId: string, signal: AbortSignal): Promise<HazardGrid> {
  return getJson<HazardGrid>(`/sites/${encodeURIComponent(siteId)}/hazard/grid`, new URLSearchParams(), signal)
}

// The grid is a few hundred kB of base64: kept decoded for the last few Sites, so coming back to one is instant.
const decoded = new Map<string, WalkGrid>()
const KEEP = 3

async function loadGrid(siteId: string, signal: AbortSignal): Promise<WalkGrid> {
  const kept = decoded.get(siteId)
  if (kept) return kept
  const grid = decodeGrid(await getHazardGrid(siteId, signal))
  decoded.set(siteId, grid)
  while (decoded.size > KEEP) decoded.delete(decoded.keys().next().value as string)
  return grid
}

/** The decoded grid of a Site, asked once the walk is on screen; `state.code` says why it could not be had. */
export function useWalkGrid(siteId: string): { state: PanelState<WalkGrid>; retry: () => void } {
  return useOnDemand(true, siteId, (signal) => loadGrid(siteId, signal))
}
