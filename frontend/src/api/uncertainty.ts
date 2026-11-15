import { API_BASE_URL, ApiError, siteParams, toApiInstant } from './client'
import type { components } from './schema'
import { parseRetryAfter } from '../domain/uncertainty'
import type { Query } from '../domain/query'

export type UncertaintyResult = components['schemas']['UncertaintyResult']
type UncertaintyPending = components['schemas']['UncertaintyPending']

/** 200: the band is there. 202: still being worked out; ask again after `retryAfterSeconds`. */
export type UncertaintyReply =
  | { status: 'ready'; data: UncertaintyResult }
  | { status: 'computing'; clonesDone: number; clones: number; retryAfterSeconds: number | null }

/**
 * The DEM Uncertainty band for the Query. The route runs in the background, so unlike the other
 * calls this one tells 200 from 202; any other status is an ApiError that the caller treats as
 * "no band" (the answer on screen does not depend on it).
 */
export async function getUncertainty(query: Query, signal: AbortSignal): Promise<UncertaintyReply> {
  const params = new URLSearchParams({
    ...siteParams(query.site),
    start: toApiInstant(query.start),
    duration_hours: String(query.durationHours),
    observer_height_m: String(query.observerHeightM),
  })
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/visibility/uncertainty?${params}`, { signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiError('network')
  }
  if (response.status === 202) {
    const pending = (await response.json()) as UncertaintyPending
    return {
      status: 'computing',
      clonesDone: pending.clones_done,
      clones: pending.clones,
      retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
    }
  }
  if (!response.ok) throw new ApiError(String(response.status))
  return { status: 'ready', data: (await response.json()) as UncertaintyResult }
}
