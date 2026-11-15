// GET /visibility/dsn for the Query on screen (the requirement), read as `api/client.ts` reads the other
// routes, and a small store so the timeline's row can draw what the panel asked for.
import { API_BASE_URL, ApiError, type VisibilityResult } from '../../../api/client'
import type { DsnResult, DsnState } from './types'

type Query = VisibilityResult['query']

function siteParams(query: Query): Record<string, string> {
  const { site } = query
  return site.source === 'custom'
    ? { latitude_deg: String(site.latitude_deg), longitude_deg: String(site.longitude_deg) }
    : { site_id: site.id }
}

/** The request for the Query on screen; it is also the key the panel and the row share. */
export function dsnPath(query: Query): string {
  const params = new URLSearchParams({
    ...siteParams(query),
    start: query.start.replace(/\.\d{3}Z$/, 'Z'),
    duration_hours: String(query.duration_hours),
    observer_height_m: String(query.observer_height_m),
  })
  return `/visibility/dsn?${params.toString()}`
}

export async function getDsn(query: Query, signal: AbortSignal): Promise<DsnResult> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${dsnPath(query)}`, { signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiError('network')
  }
  if (!response.ok) {
    let code = 'unknown'
    try {
      const problem = (await response.json()) as { code?: unknown }
      if (typeof problem.code === 'string') code = problem.code
    } catch {
      // Not a problem document.
    }
    throw new ApiError(code)
  }
  return (await response.json()) as DsnResult
}

// The panel asks only once it is opened; the row on the timeline draws whatever the panel got for
// the same request. One entry is enough: only one Query is on screen.
let shown: { key: string; state: DsnState } | null = null
const listeners = new Set<() => void>()

export function publishDsn(key: string, state: DsnState | null): void {
  if (state === null) {
    if (shown?.key !== key) return
    shown = null
  } else {
    if (shown?.key === key && shown.state === state) return
    shown = { key, state }
  }
  listeners.forEach((listener) => listener())
}

export function subscribeDsn(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function shownDsn(): { key: string; state: DsnState } | null {
  return shown
}
