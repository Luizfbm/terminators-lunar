// What the two panels ask `GET /sites/{site_id}/windows`, and what they read from the link.

/** The Query the panels hang from: the answer on screen. */
export interface WindowsQuery {
  siteId: string
  /** The Window start, an ISO instant. */
  start: string
  durationHours: number
  observerHeightM: number
}

export interface WindowsRequest {
  siteId: string
  params: URLSearchParams
}

/** The contract's Window instants carry whole seconds, so drop the milliseconds. */
function toApiInstant(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function request(query: WindowsQuery, startMs: number, shifts: Record<string, string>): WindowsRequest {
  return {
    siteId: query.siteId,
    params: new URLSearchParams({
      start: toApiInstant(startMs),
      duration_hours: String(query.durationHours),
      observer_height_m: String(query.observerHeightM),
      ...shifts,
    }),
  }
}

/** The UTC year the Query's Window starts in. */
export function yearOf(query: WindowsQuery): number {
  return new Date(query.start).getUTCFullYear()
}

/** The day to land: the Query's Window started on every day of its year, from 1 January. */
export function yearRequest(query: WindowsQuery): WindowsRequest {
  return request(query, Date.UTC(yearOf(query), 0, 1), { first_shift_days: '0', last_shift_days: '365' })
}

/** The slip: the Query's own Window, with the route's default shifts (30 days early to 150 late). */
export function slipRequest(query: WindowsQuery): WindowsRequest {
  return request(query, Date.parse(query.start), {})
}

/** A key that changes whenever the request does. */
export function requestKey({ siteId, params }: WindowsRequest): string {
  return `${siteId}?${params.toString()}`
}

/** The link parameter the slip reads its Darkness tolerance from, in hours. */
export const TOLERANCE_PARAM = 'tolerance'

/**
 * The Darkness tolerance in the link, in hours, or null when the link has none or it is not a
 * number of hours the slip can draw (negative, or not finite).
 */
export function toleranceFromLink(search: string): number | null {
  const raw = new URLSearchParams(search).get(TOLERANCE_PARAM)?.trim()
  if (!raw) return null
  const hours = Number(raw)
  return Number.isFinite(hours) && hours >= 0 ? hours : null
}
