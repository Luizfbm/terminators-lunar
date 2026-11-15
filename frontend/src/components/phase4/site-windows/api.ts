import { API_BASE_URL, ApiError } from '../../../api/client'
import type { WindowsRequest } from './request'
import type { SiteWindows } from './types'

async function problemCode(response: Response): Promise<string> {
  try {
    const problem = (await response.json()) as { code?: unknown }
    if (typeof problem.code === 'string') return problem.code
  } catch {
    // Not a problem document; fall through to the generic code.
  }
  return 'unknown'
}

/**
 * `GET /sites/{site_id}/windows`, the way `api/client.ts` asks every route: the problem `code` of
 * an error, or `network` when the server could not be reached.
 */
export async function getSiteWindows({ siteId, params }: WindowsRequest, signal: AbortSignal): Promise<SiteWindows> {
  const url = `${API_BASE_URL}/sites/${encodeURIComponent(siteId)}/windows?${params.toString()}`
  let response: Response
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiError('network')
  }
  if (!response.ok) throw new ApiError(await problemCode(response))
  return (await response.json()) as SiteWindows
}
