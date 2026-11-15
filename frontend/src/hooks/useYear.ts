import { getYear, type SiteYear } from '../api/client'
import { useOnDemand, type PanelState } from './useLadder'

/** One calendar year at a Curated Site, asked only once the panel is opened. */
export function useYear(
  open: boolean,
  siteId: string,
  year: number,
  observerHeightM: number,
): { state: PanelState<SiteYear>; retry: () => void } {
  const key = [siteId, year, observerHeightM].join('|')
  return useOnDemand(open, key, (signal) => getYear(siteId, year, observerHeightM, signal))
}
