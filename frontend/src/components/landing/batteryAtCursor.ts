/**
 * The battery at the Cursor, read off the backend's Charge series (`/visibility/energy`
 * `charge_fraction`, one value per `/visibility` timeline sample). No physics: only the sample at
 * the Cursor, its neighbours, and the first later sample that is empty or full.
 */

// The backend stores exactly 0 and exactly 1 at the ends; this only absorbs float noise.
const EPS = 1e-9

export type BatteryState = 'charging' | 'full' | 'discharging' | 'empty' | 'steady'

export interface BatteryReading {
  /** Whole percent of capacity; 0 and 100 only when the sample is empty or full. */
  percent: number
  state: BatteryState
  /** Where the series heads from here and how long until it gets there; `ms` null when not within the Window. */
  next: { to: 'empty' | 'full'; ms: number | null } | null
}

/**
 * The instant of each value of the series: the timeline's own sample times when they match one for
 * one (the contract says they do), else the Window start plus whole steps, never past the end.
 */
export function seriesTimes(
  sampleTimes: readonly string[],
  count: number,
  startMs: number,
  endMs: number,
  stepMinutes: number,
): number[] {
  if (sampleTimes.length === count) return sampleTimes.map((t) => Date.parse(t))
  const stepMs = stepMinutes * 60_000
  return Array.from({ length: count }, (_, index) => Math.min(endMs, startMs + index * stepMs))
}

/** The sample at or just before `t` (the first one before the series starts), as `sampleAt` does. */
export function indexAt(timesMs: readonly number[], t: number): number {
  let low = 0
  let high = timesMs.length - 1
  if (high < 0 || t <= timesMs[0]!) return 0
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (timesMs[mid]! <= t) low = mid
    else high = mid - 1
  }
  return low
}

const isFull = (value: number) => value >= 1 - EPS
const isEmpty = (value: number) => value <= EPS

/** The battery at the Cursor `t`, or null when the series is empty or does not match its times. */
export function batteryAt(values: readonly number[], timesMs: readonly number[], t: number): BatteryReading | null {
  if (values.length === 0 || values.length !== timesMs.length) return null
  const index = indexAt(timesMs, t)
  const value = values[index]!
  const after = values[index + 1]
  const before = values[index - 1]
  // The trend is toward the next sample; the last sample has none, so it looks back instead.
  const delta = after !== undefined ? after - value : before !== undefined ? value - before : 0
  const trend = delta > EPS ? 1 : delta < -EPS ? -1 : 0
  const full = isFull(value)
  const empty = isEmpty(value)
  const state: BatteryState = full ? 'full' : empty ? 'empty' : trend > 0 ? 'charging' : trend < 0 ? 'discharging' : 'steady'
  const percent = full ? 100 : empty ? 0 : Math.min(99, Math.max(1, Math.round(value * 100)))

  const firstAfter = (reached: (v: number) => boolean): number | null => {
    for (let j = index + 1; j < values.length; j++) if (reached(values[j]!)) return Math.max(0, timesMs[j]! - t)
    return null
  }
  let next: BatteryReading['next'] = null
  if (trend < 0 && !empty) next = { to: 'empty', ms: firstAfter(isEmpty) }
  else if (trend > 0 && !full) next = { to: 'full', ms: firstAfter(isFull) }
  return { percent, state, next }
}

/** The battery at the Cursor from the two answers as they come: the timeline's samples and the Charge series. */
export function readingAtCursor(
  samples: readonly { t: string }[],
  energy: { charge_fraction: readonly number[]; step_minutes: number },
  startMs: number,
  endMs: number,
  cursorMs: number,
): BatteryReading | null {
  const times = seriesTimes(
    samples.map((sample) => sample.t),
    energy.charge_fraction.length,
    startMs,
    endMs,
    energy.step_minutes,
  )
  return batteryAt(energy.charge_fraction, times, cursorMs)
}
