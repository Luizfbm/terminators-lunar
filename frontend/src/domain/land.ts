import type { LandPlace } from './pick'
import { siteKey, type SiteRef } from './query'

/**
 * On the polar map a click lands after this long, unless a second click comes first: a double click
 * keeps asking about the point without leaving the map, as it always did. One gesture, one request.
 */
export const MAP_CLICK_DELAY_MS = 320

/**
 * What "Land" asks the Query about: the Curated Site the click snapped to, by its code, or the point
 * itself as a custom Site. A typed coordinate's key (`custom:…`) is no code, so it goes as its point.
 */
export function landRef(place: LandPlace): SiteRef {
  if (place.siteId && !place.siteId.startsWith('custom:')) return place.siteId
  return { latitudeDeg: place.lat, longitudeDeg: place.lon }
}

/** A landing on its way: the key of the Site it asked for, where it was, and the Site to go back to. */
export interface Landing {
  key: string
  place: LandPlace
  /** The name of the Site it snapped to, if any. */
  name: string | null
  /** The Site asked for before, to go back to when the landing is cancelled. */
  previous: SiteRef | null
}

export const startLanding = (place: LandPlace, name: string | null, previous: SiteRef | null): Landing => ({
  key: siteKey(landRef(place)),
  place,
  name,
  previous,
})

/**
 * Where a landing is, from the Site the app asks about now and the state of its answer:
 * - `asking`: the answer for the landing point is on its way;
 * - `failed`: the answer came back with an error (kept on screen with a way to try again);
 * - `arrived`: the answer is ready, so the stage can go down to the ground there;
 * - `stale`: another Site was asked for in the meantime, so the landing is dropped;
 * - `none`: no landing.
 * The ground view is never shown for the point before: only `arrived` takes the stage down.
 */
export type LandingPhase = 'none' | 'asking' | 'failed' | 'arrived' | 'stale'

export function landingPhase(landing: Landing | null, askedKey: string, status: 'loading' | 'error' | 'ready'): LandingPhase {
  if (!landing) return 'none'
  if (landing.key !== askedKey) return 'stale'
  if (status === 'ready') return 'arrived'
  return status === 'error' ? 'failed' : 'asking'
}
