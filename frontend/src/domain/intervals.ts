/**
 * Stretches of time inside the Window, for the screen after a landing. No physics here: the periods come
 * from the backend (`/visibility` `periods`), and this only clips, joins and measures them.
 */

/** [start, end) in UTC milliseconds. */
export type Interval = readonly [number, number]

export interface PeriodLike {
  body: string
  state: string
  start: string
  end: string
}

/** The periods of one body in one state, clipped to the Window and sorted. */
export function intervalsOf(
  periods: readonly PeriodLike[],
  body: 'sun' | 'earth',
  state: 'visible' | 'hidden',
  startMs: number,
  endMs: number,
): Interval[] {
  const out: Interval[] = []
  for (const period of periods) {
    if (period.body !== body || period.state !== state) continue
    const from = Math.max(Date.parse(period.start), startMs)
    const to = Math.min(Date.parse(period.end), endMs)
    if (to > from) out.push([from, to])
  }
  return out.sort((a, b) => a[0] - b[0])
}

/** Total length, in milliseconds. */
export const totalMs = (intervals: readonly Interval[]): number => intervals.reduce((sum, [a, b]) => sum + (b - a), 0)

/** The longest one, in milliseconds; 0 when there is none. */
export const longestMs = (intervals: readonly Interval[]): number => intervals.reduce((most, [a, b]) => Math.max(most, b - a), 0)

/** Where both lists hold at once: the time with the Sun and the Earth together. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = []
  for (const [a1, b1] of a) {
    for (const [a2, b2] of b) {
      const from = Math.max(a1, a2)
      const to = Math.min(b1, b2)
      if (to > from) out.push([from, to])
    }
  }
  return out.sort((x, y) => x[0] - y[0])
}

/**
 * What the countdown beside a row says at the Cursor `t`:
 * - inside a stretch: `on`, and how long until it ends (`endsWithWindow` when it lasts to the Window's end);
 * - outside: not `on`, and how long until the next one starts, or null when none starts before the end.
 */
export interface Countdown {
  on: boolean
  ms: number | null
  endsWithWindow: boolean
}

export function countdown(intervals: readonly Interval[], t: number, endMs: number): Countdown {
  const current = intervals.find(([a, b]) => t >= a && t < b)
  if (current) return { on: true, ms: current[1] - t, endsWithWindow: current[1] >= endMs }
  const next = intervals.find(([a]) => a > t)
  return { on: false, ms: next ? next[0] - t : null, endsWithWindow: false }
}
