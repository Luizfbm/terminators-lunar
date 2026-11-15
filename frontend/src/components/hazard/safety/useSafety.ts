import type { VisibilityResult } from '../../../api/client'
import { useOnDemand } from '../../../hooks/useLadder'
import { getAround, getHazard } from './api'
import { RADIUS_M, viewOf, type View } from './logic'

/**
 * What the safety circle shows for the Site on screen. Both answers depend on the Site only, so
 * they are asked once per Site, not once per Window; a custom Site has no grid and asks for nothing.
 */
export function useSafety(result: VisibilityResult): View {
  const site = result.query.site
  const custom = site.source === 'custom'
  const hazard = useOnDemand(!custom, site.id, (signal) => getHazard(site.id, signal)).state
  // The count needs the grid: it is asked only once the hazard answer says there is one.
  const hasGrid = hazard.status === 'ready' && hazard.data.grid !== null
  const around = useOnDemand(hasGrid, site.id, (signal) => getAround(site.id, RADIUS_M, signal)).state
  return viewOf(custom, hazard, around)
}
