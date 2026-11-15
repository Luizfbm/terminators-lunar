import type { Locale } from '../../i18n/messages'
import { coordinateParts } from '../globeMap/map'
import { fill, STRINGS as MAP_STRINGS } from '../globeMap/strings'

/** A landing place as the stage says it: the Site's name when it snapped to one, else its coordinate. */
export function placeText(place: { lat: number; lon: number }, name: string | null, locale: Locale): string {
  if (name) return name
  const s = MAP_STRINGS[locale]
  const parts = coordinateParts({ latitude_deg: place.lat, longitude_deg: place.lon })
  return fill(s.coordinate, { lat: String(parts.lat), ns: s[parts.ns], lon: String(parts.lon), ew: s[parts.ew] })
}

/**
 * The northernmost latitude the server answers a custom Site at, as `/meta` gives it
 * (`coverage.custom_max_latitude_deg`), in words: "80° S", "60° N".
 */
export function limitText(latitudeDeg: number, locale: Locale): string {
  const s = MAP_STRINGS[locale]
  const value = Math.round(Math.abs(latitudeDeg) * 100) / 100
  return `${value}°\u00a0${latitudeDeg < 0 ? s.S : s.N}`
}
