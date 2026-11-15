import { isCoordinate, type SiteRef } from './query'
import type { LatLon } from './sky'

/** A Site as the globe draws it: where it is, what it is called, and its key. */
export interface PlacedSite extends LatLon {
  id: string
  name: string
  region_id?: string | null
}

/** A custom Site's key on the globe: its coordinate, so the globe flies again when another point is typed. */
export const customKey = (point: LatLon) => `custom:${point.latitude_deg},${point.longitude_deg}`

/**
 * The Site the globe marks (the requirement). While an answer is on its way it is the Site asked for, so a
 * click on another Site moves the ring and the camera at once; otherwise it is the Site of the answer
 * on screen, so the ring never disagrees with the numbers. `answered` is also the fallback when the
 * Site asked for is not known yet (the list of Sites still loading, say); `answeredIsCustom` keys it
 * by its coordinate.
 */
export function chosenGlobeSite(
  ref: SiteRef | null,
  sites: readonly PlacedSite[],
  defaultId: string | null,
  answered: PlacedSite,
  answeredIsCustom: boolean,
  customName: (point: LatLon) => string,
  asking = true,
): PlacedSite {
  const shown = answeredIsCustom ? { ...answered, id: customKey(answered) } : answered
  if (!asking) return shown
  if (isCoordinate(ref)) {
    const point = { latitude_deg: ref.latitudeDeg, longitude_deg: ref.longitudeDeg }
    const key = customKey(point)
    // The answer for this very point is on screen: keep its name, as the API echoes it.
    if (shown.id === key) return shown
    return { ...point, id: key, name: customName(point) }
  }
  const id = ref ?? defaultId
  return sites.find((site) => site.id === id) ?? shown
}
