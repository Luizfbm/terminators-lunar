import { getJson } from '../../../api/client'
import type { components } from '../../../api/schema'

export type SiteHazard = components['schemas']['SiteHazard']
export type HazardRun = components['schemas']['HazardRun']
export type HazardMethod = components['schemas']['HazardMethod']
export type HazardMeasured = components['schemas']['HazardMeasured']

/**
 * The hazard numbers never depend on the Window, so one answer per Site serves every panel that
 * asks for it: the plan comparison and the uncertainty line share it. A failed ask is forgotten, so
 * the next one tries again.
 */
const asked = new Map<string, Promise<SiteHazard>>()

/** `GET /sites/{site_id}/hazard`. Only Curated Sites have one; the caller never asks for a coordinate. */
export function getSiteHazard(siteId: string): Promise<SiteHazard> {
  const known = asked.get(siteId)
  if (known) return known
  // The ask outlives any one panel (another may be waiting for the same answer), so it has no signal of its own.
  const ask = getJson<SiteHazard>(`/sites/${encodeURIComponent(siteId)}/hazard`, new URLSearchParams(), new AbortController().signal)
  asked.set(siteId, ask)
  ask.catch(() => asked.delete(siteId))
  return ask
}
