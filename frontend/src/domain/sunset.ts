export interface TimedEvent {
  type: string
  t: string
}

/** The first event of one type strictly after the Cursor and strictly before the end of the Window. */
export function nextEvent<E extends TimedEvent>(
  events: readonly E[],
  type: string,
  cursorMs: number,
  windowEndMs: number,
): E | null {
  let best: E | null = null
  let bestMs = Infinity
  for (const event of events) {
    if (event.type !== type) continue
    const ms = Date.parse(event.t)
    if (ms > cursorMs && ms < windowEndMs && ms < bestMs) {
      best = event
      bestMs = ms
    }
  }
  return best
}

/**
 * The first Sunset strictly after the Cursor and strictly before the end of the Window.
 * A Sunset exactly at the Cursor has already happened, so it is skipped.
 */
export function nextSunset<E extends TimedEvent>(events: readonly E[], cursorMs: number, windowEndMs: number): E | null {
  return nextEvent(events, 'sunset', cursorMs, windowEndMs)
}

/** Same rules as {@link nextSunset}, for the Sun rising. */
export function nextSunrise<E extends TimedEvent>(events: readonly E[], cursorMs: number, windowEndMs: number): E | null {
  return nextEvent(events, 'sunrise', cursorMs, windowEndMs)
}
