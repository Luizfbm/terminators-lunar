import type { components } from '../api/schema'
import type { I18n } from '../i18n/i18n'

export type EventBand = components['schemas']['EventBand']
export type MetricBand = components['schemas']['MetricBand']
type Metrics = components['schemas']['UncertaintyResult']['metrics']

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000

/** A Sunset, Sunrise, Earthset or Earthrise of the `/visibility` answer, as far as matching needs. */
export interface EventKey {
  type: string
  t: string
}

/**
 * The band of one Event. The route lists the Events in the order of `/visibility`, so the Event's
 * own position is tried first; if the lists have drifted apart, type and instant still find it.
 * No match means no band: a wrong one is worse than none.
 */
export function matchBand(bands: readonly EventBand[], event: EventKey, index: number): EventBand | null {
  const eventMs = Date.parse(event.t)
  const same = (band: EventBand) => band.type === event.type && Date.parse(band.t) === eventMs
  const at = bands[index]
  if (at && same(at)) return at
  return bands.find(same) ?? null
}

/** What the clones say about one Event: a window in time, or that it may not happen at all. */
export type Spread =
  | { kind: 'window'; earliestMs: number; latestMs: number }
  | { kind: 'maybe'; withEvent: number; clones: number }

/**
 * Fewer than half the clones having the Event means it may not happen: the window is then
 * meaningless, and the contract leaves it out. From half up, the window is the answer.
 */
export function spreadOf(band: EventBand, clones: number): Spread | null {
  if (2 * band.clones_with_event < clones) return { kind: 'maybe', withEvent: band.clones_with_event, clones }
  if (band.earliest === undefined || band.latest === undefined) return null
  const a = Date.parse(band.earliest)
  const b = Date.parse(band.latest)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return { kind: 'window', earliestMs: Math.min(a, b), latestMs: Math.max(a, b) }
}

type Words = Pick<I18n, 't' | 'formatTime' | 'formatDay'>

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * The line under an Event's time: "between 14:10 and 15:30 with the map's height error". The day
 * is spelled out only for an end that falls on another UTC day than the Event itself.
 */
export function spreadText({ t, formatTime, formatDay }: Words, spread: Spread, nominalMs: number): string {
  if (spread.kind === 'maybe') {
    return spread.withEvent === 0
      ? t('uncertainty.none', { total: String(spread.clones) })
      : t('uncertainty.maybe', { count: String(spread.withEvent), total: String(spread.clones) })
  }
  // A window under a minute wide is no window: the clock cannot show it, so say the error does not move the time.
  if (spread.latestMs - spread.earliestMs < MINUTE_MS) return t('uncertainty.steadyTime')
  const clock = (ms: number) => (dayOf(ms) === dayOf(nominalMs) ? formatTime(ms) : `${formatDay(ms)}, ${formatTime(ms)}`)
  return t('uncertainty.between', { from: clock(spread.earliestMs), to: clock(spread.latestMs) })
}

/** The metrics of the Numbers table that the route gives a band for. */
export type BandedMetric = keyof Metrics

/** `mean_sun_fraction` is a share from 0 to 1; the others are hours. */
const SHARES: readonly BandedMetric[] = ['mean_sun_fraction']

/** "29 d 9 h to 29 d 12 h": the metric's low and high in the units the table already uses. */
export function rangeText(
  { t, formatSpan, formatNumber }: Pick<I18n, 't' | 'formatSpan' | 'formatNumber'>,
  metric: BandedMetric,
  band: MetricBand,
): string {
  // One decimal for a share: the band is often narrower than a whole percent.
  const text = SHARES.includes(metric)
    ? (value: number) => `${formatNumber(Math.round(value * 1000) / 10)}%`
    : (value: number) => formatSpan(value * HOUR_MS)
  const low = text(band.low)
  const high = text(band.high)
  // Both ends read the same on screen: there is no range to show.
  return low === high ? t('uncertainty.steadyNumber') : t('uncertainty.range', { low, high })
}

// ---- Asking again -------------------------------------------------------------------------

/** What to wait when the server names no `Retry-After`, in seconds. */
export const DEFAULT_RETRY_SECONDS = 5
const LONGEST_WAIT_MS = 30_000
/** After this long without a band the app stops asking and says nothing: the answer stands without it. */
export const GIVE_UP_MS = 15 * 60_000

/** `Retry-After` as whole seconds. The date form is not worth parsing here: the server sends seconds. */
export function parseRetryAfter(header: string | null): number | null {
  if (header === null || !/^\d+$/.test(header.trim())) return null
  const seconds = Number(header)
  return seconds >= 1 ? seconds : null
}

/** What the polling loop remembers between two asks. */
export interface PollTrack {
  /** Asks in a row that brought no new clone. */
  stalls: number
  lastDone: number
  waitedMs: number
}

export const START_TRACK: PollTrack = { stalls: 0, lastDone: -1, waitedMs: 0 }

/**
 * How long to wait before asking again after a 202, or null to stop asking. The server's
 * `Retry-After` is the base; every ask in a row without a new clone stretches it by half again,
 * up to 30 s, so a stuck job is not hammered; once the waits add up to `GIVE_UP_MS`, stop.
 */
export function nextPoll(
  track: PollTrack,
  clonesDone: number,
  retryAfterSeconds: number | null,
): { delayMs: number; track: PollTrack } | null {
  const stalls = clonesDone > track.lastDone ? 0 : track.stalls + 1
  const base = (retryAfterSeconds ?? DEFAULT_RETRY_SECONDS) * 1000
  const delayMs = Math.min(LONGEST_WAIT_MS, Math.round(base * 1.5 ** stalls))
  const waitedMs = track.waitedMs + delayMs
  if (waitedMs > GIVE_UP_MS) return null
  return { delayMs, track: { stalls, lastDone: clonesDone, waitedMs } }
}
