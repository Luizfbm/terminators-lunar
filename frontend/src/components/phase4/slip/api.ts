import { API_BASE_URL, ApiError } from '../../../api/client'
import { useOnDemand } from '../../../hooks/useLadder'
import type { PanelState } from '../site-windows/types'
import { neighboursKey, type NeighboursRequest, type SiteNeighbours } from './slipPlan'

async function problemCode(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as { code?: unknown }
    if (typeof problem.code === 'string') return problem.code
  } catch {
    // Not a problem document; fall through to the generic code.
  }
  return 'unknown'
}

/** `GET /sites/{site_id}/neighbours`: the problem `code` of an error, or `network` when unreachable. */
export async function getSiteNeighbours({ siteId, params }: NeighboursRequest, signal: AbortSignal): Promise<SiteNeighbours> {
  const url = `${API_BASE_URL}/sites/${encodeURIComponent(siteId)}/neighbours?${params.toString()}`
  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiError('network')
  }
  if (!response.ok) throw new ApiError(await problemCode(response))
  return (await response.json()) as SiteNeighbours
}

/** The nearby Sites for one slipped Window; asked only when `request` is set (the slip costs time). */
export function useNeighbours(request: NeighboursRequest | null): { state: PanelState<SiteNeighbours> | null; retry: () => void } {
  const { state, retry } = useOnDemand(request !== null, request ? neighboursKey(request) : '', (signal) =>
    getSiteNeighbours(request!, signal),
  )
  return { state: state.status === 'idle' ? null : state, retry }
}
