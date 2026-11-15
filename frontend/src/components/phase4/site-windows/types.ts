import type { components } from '../../../api/schema'

/** One Window of `GET /sites/{site_id}/windows`, started `shift_days` from the asked start. */
export type ShiftedWindow = components['schemas']['ShiftedWindow']

/** `GET /sites/{site_id}/windows`: the same Window started on other days, ranked. */
export type SiteWindows = components['schemas']['SiteWindows']

/** What a panel is showing. The panel only draws the state it is given. */
export type PanelState<T> =
  | { status: 'loading' }
  | { status: 'error'; code: string }
  | { status: 'ready'; data: T }
  /** A custom Site: the route serves Curated Sites only, so it is never asked. */
  | { status: 'curated-only' }

/** One synodic month, the default Window, in hours (the contract's default `duration_hours`). */
export const SYNODIC_MONTH_HOURS = 708.73

/** The Window lengths the shortcuts offer, in hours. */
export const WINDOW_SHORTCUTS = [7 * 24, 14 * 24, 28 * 24, SYNODIC_MONTH_HOURS] as const

/** Nothing to rank: no Window in the list ever has the Sun and the Earth together. */
export function isEmpty(data: SiteWindows): boolean {
  return data.windows.every((w) => w.sun_and_earth_hours === 0)
}
