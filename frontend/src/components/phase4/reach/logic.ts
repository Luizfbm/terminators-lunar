import type { Occluder, VisibilityEvent, VisibilityResult } from '../../../api/client'
import { statement, type Body } from '../../../domain/statement'

/**
 * How far out the engine walks the terrain, in km: the outer edge of the coarsest DEM band
 * (`LADDER[-1].outer_m` and the `OFFPOLE_LADDERS` in `backend/app/horizon.py`, 300 000 m). It is the same
 * for every Site, the pole and the off-pole ones. The contract does not carry it, so it is kept here.
 * The 304 km of the ground view is the edge of the drawn map, not the reach of the engine.
 */
export const HORIZON_REACH_KM = 300

export type ReachEvent = 'sunset' | 'sunrise' | 'earthset' | 'earthrise'

/** What hides one body at its next change: the event and how far the Occluder is, in metres. */
export interface ReachItem {
  event: ReachEvent
  distanceM: number
}

const EVENT: Record<Body, { sets: ReachEvent; rises: ReachEvent }> = {
  sun: { sets: 'sunset', rises: 'sunrise' },
  earth: { sets: 'earthset', rises: 'earthrise' },
}

/**
 * The Occluder of the next Sunset or Sunrise and of the next Earthset or Earthrise at the Cursor,
 * the same ones the Countdown names. A body that stays up or stays hidden has none to name.
 */
export function reachItems(result: VisibilityResult, cursorMs: number): ReachItem[] {
  const windowEndMs = Date.parse(result.query.end)
  const items: ReachItem[] = []
  for (const body of ['sun', 'earth'] as const) {
    const said = statement<VisibilityEvent>(body, result.periods, result.events, cursorMs, windowEndMs)
    if (said.kind === 'stays' || said.kind === 'gone') continue
    const occluder: Occluder = said.event.occluder
    items.push({ event: EVENT[body][said.kind], distanceM: occluder.distance_m })
  }
  return items
}
