/**
 * The countdown beside the Sun and Earth rows of the time strip, after a landing. No physics: it reads
 * the backend's periods through `domain/intervals` and only picks the words and rounds the span.
 */
import { countdown, type Interval } from '../../domain/intervals'

const HOUR_MS = 3_600_000

/** Under 48 h, hours to one decimal; from 48 h, whole hours and days to one decimal (as the prototype). */
export function hoursSpan(ms: number): { hours: number; days: number | null } {
  const hours = Math.max(0, ms) / HOUR_MS
  if (hours < 48) return { hours: Math.round(hours * 10) / 10, days: null }
  return { hours: Math.round(hours), days: Math.round((hours / 24) * 10) / 10 }
}

export type CountdownSays = 'loses' | 'back' | 'untilEnd' | 'noReturn'

export interface CountdownLine {
  says: CountdownSays
  /** The span to say, or null for "no return". */
  ms: number | null
  /** The body is out of sight at the Cursor: drawn in the muted red. */
  lost: boolean
}

/**
 * What the countdown says at the Cursor. At the very end of the Window the Cursor is read just
 * before it, so a body up to the end reads "until the end" rather than "no return".
 */
export function countdownLine(intervals: readonly Interval[], cursorMs: number, endMs: number): CountdownLine {
  const at = Math.min(cursorMs, endMs - 1)
  const c = countdown(intervals, at, endMs)
  if (c.on) return { says: c.endsWithWindow ? 'untilEnd' : 'loses', ms: c.ms, lost: false }
  return c.ms === null ? { says: 'noReturn', ms: null, lost: true } : { says: 'back', ms: c.ms, lost: true }
}
