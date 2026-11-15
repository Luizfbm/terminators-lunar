import type { VisibilityResult } from '../../api/client'

/** A precision analysis belongs to the full Query and the view in which it was opened. */
export function precisionContext(query: VisibilityResult['query'], view: string): string {
  return JSON.stringify([query.site.id, query.site.latitude_deg, query.site.longitude_deg, query.start, query.end, query.observer_height_m, view])
}
