import { isUp, type PeriodLike } from '../../../domain/statement'
import type { TimedEvent } from '../../../domain/sunset'
import type { FlatEvent, FlatResult } from './types'

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

/** The real answer the line is read against: what the Countdown already has. */
export interface RealSun {
  periods: readonly PeriodLike[]
  events: readonly TimedEvent[]
  windowEndMs: number
}

/**
 * What the line says at the Cursor. It follows the Countdown: while the real Sun is up it compares
 * Sunsets, while it is down it compares Sunrises. Two answers that disagree on whether the Sun is up
 * at all get a sentence of their own, never a negative span.
 */
export type FlatReading =
  | { kind: 'later' | 'earlier'; event: 'sunset' | 'sunrise'; ms: number }
  | { kind: 'same'; event: 'sunset' | 'sunrise' }
  /** The flat Sun does not change state before `search_end`. */
  | { kind: 'never'; event: 'sunset' | 'sunrise'; untilMs: number; daysAfterWindow: number }
  /** The real Sun does not change state in the Window; the flat one does, at `atMs`, inside it. */
  | { kind: 'at'; event: 'sunset' | 'sunrise'; atMs: number }
  /** Neither changes state in the Window; the flat Sun first does at `atMs`, after it. */
  | { kind: 'notInWindow'; event: 'sunset' | 'sunrise'; atMs: number }
  /** The real Sun is hidden and the flat one is up: the terrain hides it. */
  | { kind: 'flatUp' }
  /** The real Sun is up and the flat one has set: the Site sees past the flat horizon. */
  | { kind: 'flatDown' }

function nextOf<E extends { type: string; t: string }>(events: readonly E[], type: string, afterMs: number, untilMs: number): number | null {
  let best: number | null = null
  for (const event of events) {
    if (event.type !== type) continue
    const ms = Date.parse(event.t)
    if (ms > afterMs && ms <= untilMs && (best === null || ms < best)) best = ms
  }
  return best
}

/**
 * Whether the flat Sun is up at the instant. The flat answer has events and no periods: the last Sun
 * event at or before the instant decides; with none, the first one after it; with no Sun event at
 * all, the Window's sunlit hours do.
 */
export function flatSunUp(flat: FlatResult, ms: number): boolean {
  const sun = flat.events.filter((event) => event.type === 'sunrise' || event.type === 'sunset')
  const before = sun.filter((event) => Date.parse(event.t) <= ms)
  if (before.length > 0) return before[before.length - 1].type === 'sunrise'
  const after = sun.find((event) => Date.parse(event.t) > ms)
  if (after) return after.type === 'sunset'
  return flat.metrics.sunlit_hours > 0
}

export function flatReading(real: RealSun, flat: FlatResult, cursorMs: number): FlatReading {
  const searchEndMs = Date.parse(flat.search_end)
  const realUp = isUp('sun', real.periods, real.events, cursorMs)
  const flatUp = flatSunUp(flat, cursorMs)
  if (!realUp && flatUp) return { kind: 'flatUp' }
  if (realUp && !flatUp) return { kind: 'flatDown' }

  const event = realUp ? 'sunset' : 'sunrise'
  const realMs = nextOf(real.events, event, cursorMs, real.windowEndMs)
  const flatMs = nextOf<FlatEvent>(flat.events, event, cursorMs, searchEndMs)
  if (flatMs === null) {
    const windowEndMs = Date.parse(flat.query.end)
    return { kind: 'never', event, untilMs: searchEndMs, daysAfterWindow: Math.round((searchEndMs - windowEndMs) / DAY_MS) }
  }
  if (realMs === null) return { kind: flatMs > real.windowEndMs ? 'notInWindow' : 'at', event, atMs: flatMs }
  const diff = flatMs - realMs
  // A minute is the finest step the screen shows a duration in.
  if (Math.abs(diff) < MINUTE_MS) return { kind: 'same', event }
  return { kind: diff > 0 ? 'later' : 'earlier', event, ms: Math.abs(diff) }
}
