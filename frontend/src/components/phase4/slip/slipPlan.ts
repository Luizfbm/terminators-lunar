// Plan B for a launch that slips (the implementation): which slip to look at, what to ask
// `GET /sites/{site_id}/neighbours`, and the link that makes a nearby Site the chosen one.
import type { components } from '../../../api/schema'
import { readLink, writeLink } from '../../../domain/query'
import type { ShiftedWindow, SiteWindows } from '../site-windows/types'

/** `GET /sites/{site_id}/neighbours`: the asked Site and its nearby Sites over one Window, ranked. */
export type SiteNeighbours = components['schemas']['SiteNeighbours']
export type NeighbourSite = components['schemas']['NeighbourSite']

/** How many nearby Sites the panel lists. */
export const SHOWN = 3

/** The slips the panel offers, in days late: a week (the default), two weeks, a month. */
export const SLIP_DAYS = [7, 14, 30] as const

export interface SlipChoice {
  /** `worst` is the late start with the least Sun-and-Earth time, when it is none of SLIP_DAYS. */
  kind: 'days' | 'worst'
  window: ShiftedWindow
}

/** The slips the panel offers for these Windows: those of SLIP_DAYS in the list, then the worst late one. */
export function slipChoices(data: SiteWindows): SlipChoice[] {
  const byShift = new Map(data.windows.map((w) => [w.shift_days, w]))
  const choices: SlipChoice[] = SLIP_DAYS.flatMap((days) => {
    const window = byShift.get(days)
    return window ? [{ kind: 'days' as const, window }] : []
  })
  // Ties go to the earlier start, as the route ranks its best and worst.
  const worst = data.windows
    .filter((w) => w.shift_days > 0)
    .reduce<ShiftedWindow | null>((low, w) => (!low || w.sun_and_earth_hours < low.sun_and_earth_hours ? w : low), null)
  if (worst && !choices.some((c) => c.window.shift_days === worst.shift_days)) choices.push({ kind: 'worst', window: worst })
  return choices
}

/** The planned Window: the one that did not slip. */
export function plannedOf(data: SiteWindows): ShiftedWindow | null {
  return data.windows.find((w) => w.shift_days === 0) ?? null
}

/** The slip costs Sun-and-Earth time: only then are the nearby Sites worth asking about. */
export function isWorse(slipped: ShiftedWindow, planned: ShiftedWindow): boolean {
  return slipped.sun_and_earth_hours < planned.sun_and_earth_hours
}

export interface NeighboursRequest {
  siteId: string
  params: URLSearchParams
}

/** The slipped Window at the same Site, with the Query's length and Observer height. */
export function neighboursRequest(data: SiteWindows, slipped: ShiftedWindow): NeighboursRequest {
  return {
    siteId: data.site.id,
    params: new URLSearchParams({
      start: slipped.start,
      duration_hours: String(data.duration_hours),
      observer_height_m: String(data.observer_height_m),
    }),
  }
}

export function neighboursKey({ siteId, params }: NeighboursRequest): string {
  return `${siteId}?${params.toString()}`
}

/** The nearby Sites to list: the route ranks them, the panel shows the first SHOWN. */
export function shown(data: SiteNeighbours): NeighbourSite[] {
  return data.neighbours.slice(0, SHOWN)
}

/**
 * The link that opens a nearby Site on the slipped date: the `site` and `start` the App reads when
 * it opens, everything else in the current link kept, and the Cursor left to start over.
 */
export function neighbourHref(search: string, siteId: string, slippedStart: string): string {
  const query = writeLink({ ...readLink(search), site: siteId, startDay: slippedStart.slice(0, 10), cursorMs: null }, search)
  return query || '?'
}
