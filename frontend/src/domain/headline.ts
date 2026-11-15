import type { MessageKey } from '../i18n/messages'
import type { TimedEvent } from './sunset'
import type { Body, PeriodLike, Statement } from './statement'

const CHANGES: Record<Body, readonly string[]> = { sun: ['sunset', 'sunrise'], earth: ['earthset', 'earthrise'] }

/**
 * Whether the body has already set or risen between the start of the Window and the Cursor
 * (a change exactly at the Cursor counts). Then the Window as a whole and the Window from the
 * Cursor on no longer say the same thing, and the headline has to say which one it means.
 */
export function movedPast(
  body: Body,
  periods: readonly PeriodLike[],
  events: readonly TimedEvent[],
  windowStartMs: number,
  cursorMs: number,
): boolean {
  const inside = (ms: number) => windowStartMs < ms && ms <= cursorMs
  if (events.some((event) => CHANGES[body].includes(event.type) && inside(Date.parse(event.t)))) return true
  return periods.some((period) => period.body === body && inside(Date.parse(period.start)))
}

/** The headline sentence for one body: the plain one, or the one that counts from the Cursor. */
export function headlineKey(body: Body, kind: Statement<unknown>['kind'], fromCursor: boolean): MessageKey {
  return `${body}.${kind}${fromCursor ? '.cursor' : ''}` as MessageKey
}
