import { API_BASE_URL, ApiError } from '../../api/client'
import type { components } from '../../api/schema'
export type RouteRequest = components['schemas']['RouteRequest']
export type RouteResponse = components['schemas']['RouteResponse']

export async function planRoute(body: RouteRequest, signal: AbortSignal): Promise<RouteResponse> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/routes/plan`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new ApiError('network')
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as { code?: string }
    throw new ApiError(problem.code ?? 'unknown')
  }
  return response.json() as Promise<RouteResponse>
}
