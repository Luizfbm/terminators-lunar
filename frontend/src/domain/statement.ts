import { nextEvent, type TimedEvent } from './sunset'

export type Body = 'sun' | 'earth'

export interface PeriodLike {
  body: string
  state: string
  start: string
  end: string
}

const RISE: Record<Body, string> = { sun: 'sunrise', earth: 'earthrise' }
const SET: Record<Body, string> = { sun: 'sunset', earth: 'earthset' }

/**
 * Whether the body is up at the instant. The period that contains the instant decides (a period
 * starts at its own start, so a Sunset exactly at the Cursor already hides the Sun). With no period
 * covering it, the body's last event at or before it decides; with no such event, the body is up.
 */
export function isUp(body: Body, periods: readonly PeriodLike[], events: readonly TimedEvent[], cursorMs: number): boolean {
  for (const period of periods) {
    if (period.body !== body) continue
    if (Date.parse(period.start) <= cursorMs && cursorMs < Date.parse(period.end)) {
      return period.state === 'visible'
    }
  }
  let last: TimedEvent | null = null
  let lastMs = -Infinity
  for (const event of events) {
    if (event.type !== RISE[body] && event.type !== SET[body]) continue
    const ms = Date.parse(event.t)
    if (ms <= cursorMs && ms > lastMs) {
      last = event
      lastMs = ms
    }
  }
  return last?.type !== SET[body]
}

/**
 * What the screen says about one body at the Cursor: while it is up, when it sets; while it is
 * hidden, when it rises. `stays` and `gone` mean nothing changes before the Window ends.
 */
export type Statement<E> = { kind: 'sets'; event: E } | { kind: 'stays' } | { kind: 'rises'; event: E } | { kind: 'gone' }

export function statement<E extends TimedEvent>(
  body: Body,
  periods: readonly PeriodLike[],
  events: readonly E[],
  cursorMs: number,
  windowEndMs: number,
): Statement<E> {
  if (isUp(body, periods, events, cursorMs)) {
    const set = nextEvent(events, SET[body], cursorMs, windowEndMs)
    return set ? { kind: 'sets', event: set } : { kind: 'stays' }
  }
  const rise = nextEvent(events, RISE[body], cursorMs, windowEndMs)
  return rise ? { kind: 'rises', event: rise } : { kind: 'gone' }
}
