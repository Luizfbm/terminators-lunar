/** Why the picked start and end cannot go as a Window, checked in this order. */
export type PickWindowError = 'missing' | 'order' | 'outside' | 'too_long'

/** The engine coverage from /meta. */
export interface Coverage {
  window_min: string
  window_max: string
  max_duration_hours: number
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/**
 * The instant of a datetime-local value (`YYYY-MM-DDTHH:MM`, local time), or NaN when it is not one.
 * Built with `new Date(y, m, d, hh, mm)` because Date.parse of that text is not read the same way
 * everywhere. A value Date rolls over (2024-02-30, 24:00, or a time skipped by a daylight-saving
 * change) does not read back the same, so it is no value.
 */
function localMs(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return NaN
  const [y, m, d, hh, mm] = match.slice(1).map(Number)
  const date = new Date(y, m - 1, d, hh, mm)
  const same =
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && date.getHours() === hh && date.getMinutes() === mm
  return same ? date.getTime() : NaN
}

/** A UTC instant (ms) as a datetime-local value in local time, for the initial start. Seconds are dropped. */
export function toLocalInput(ms: number): string {
  const date = new Date(ms)
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** How long the Window offered for a landing is, before the visitor changes it. */
export const DEFAULT_PICK_DAYS = 10

/** Window lengths, in days, offered as one-click buttons beside the dates. */
export const QUICK_DAYS = [1, 3, 7, 10, 14, 30] as const

/**
 * The end `hours` after a start, never past the longest Window or the end of the coverage. Empty when
 * the start is no value, so the field stays empty with it.
 */
export function endAfter(start: string, hours: number, coverage: Coverage): string {
  const startMs = localMs(start)
  if (Number.isNaN(startMs)) return ''
  const lastMs = Math.floor(Date.parse(coverage.window_max) / MINUTE_MS) * MINUTE_MS
  const endMs = Math.min(startMs + Math.min(hours, coverage.max_duration_hours) * HOUR_MS, lastMs)
  return endMs > startMs ? toLocalInput(endMs) : ''
}

/** The end to offer for a start: DEFAULT_PICK_DAYS later. */
export const defaultEnd = (start: string, coverage: Coverage): string => endAfter(start, DEFAULT_PICK_DAYS * 24, coverage)

/**
 * The min/max attributes of both inputs: the coverage in local time. The inputs only take whole
 * minutes, so min is rounded up and max down, and every value between them is inside the coverage
 * (the backend refuses a Window that ends even 1 s past `window_max`).
 */
export function inputBounds(coverage: Coverage): { min: string; max: string } {
  const minMs = Math.ceil(Date.parse(coverage.window_min) / MINUTE_MS) * MINUTE_MS
  const maxMs = Math.floor(Date.parse(coverage.window_max) / MINUTE_MS) * MINUTE_MS
  return { min: toLocalInput(minMs), max: toLocalInput(maxMs) }
}

/**
 * The Window for the Query, in UTC: start day and time, and its length in hours (fractional when
 * the minutes are). Assumes values `checkPickWindow` passed; anything else gives NaN hours.
 */
export function toChoiceWindow(start: string, end: string): { startDay: string; startTime: string; hours: number } {
  const startMs = localMs(start)
  const iso = Number.isFinite(startMs) ? new Date(startMs).toISOString() : ''
  return { startDay: iso.slice(0, 10), startTime: iso.slice(11, 16), hours: (localMs(end) - startMs) / HOUR_MS }
}

/** Why the picked start and end (datetime-local values, local time) cannot go as a Window, or null when they can. */
export function checkPickWindow(start: string, end: string, coverage: Coverage): PickWindowError | null {
  const startMs = localMs(start)
  const endMs = localMs(end)
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 'missing'
  // An empty Window has nothing to show, so the end must come strictly after the start.
  if (endMs <= startMs) return 'order'
  if (startMs < Date.parse(coverage.window_min) || endMs > Date.parse(coverage.window_max)) return 'outside'
  return (endMs - startMs) / HOUR_MS > coverage.max_duration_hours ? 'too_long' : null
}
