import { useMemo } from 'react'
import { getJson } from '../../api/client'
import { useOnDemand, type PanelState } from '../../hooks/useLadder'
import type { Rover, RoverList } from './types'
import { moonFirst } from './mission'

/** The catalogue, Moon rovers first (the API already says so; the order is kept if it ever does not). */
export async function getRovers(signal: AbortSignal): Promise<Rover[]> {
  const list = await getJson<RoverList>('/rovers', new URLSearchParams(), signal)
  return moonFirst(list.rovers)
}

/**
 * The rovers, asked once the picker is on screen. `given` skips the request, for a page that
 * already holds the catalogue.
 */
export function useRovers(given?: Rover[]): { state: PanelState<Rover[]>; retry: () => void } {
  const asked = useOnDemand<Rover[]>(given === undefined, 'rovers', getRovers)
  const ready = useMemo<PanelState<Rover[]> | null>(() => (given ? { status: 'ready', data: moonFirst(given) } : null), [given])
  return { state: ready ?? asked.state, retry: asked.retry }
}
