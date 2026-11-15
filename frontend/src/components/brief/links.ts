import type { VisibilityResult } from '../../api/client'
import { siteRefOf, utcDay, writeLink, type LinkState } from '../../domain/query'

/**
 * The links the brief prints: the Query and the Proof page, as full addresses. The Query is written
 * out in full (Site, Window start day, length, Observer height), not left to the defaults, because a
 * default Window starts at today's 00:00 UTC and a sheet kept for a week must still open the same
 * answer. The language and the Cursor go along, so the link reopens what the sheet says.
 */
export function briefLinks(baseUrl: string, result: VisibilityResult, locale: 'en' | 'pt', cursorMs: number): { query: string; proof: string } {
  const { query } = result
  const state: LinkState = {
    site: siteRefOf(query.site),
    startDay: utcDay(Date.parse(query.start)),
    hours: query.duration_hours,
    heightM: query.observer_height_m,
    cursorMs,
    language: locale,
    view: 'orbit',
    page: 'answer',
    stats: false,
  }
  return {
    query: `${baseUrl}${writeLink(state)}`,
    proof: `${baseUrl}${writeLink({ ...state, page: 'proof' })}`,
  }
}
