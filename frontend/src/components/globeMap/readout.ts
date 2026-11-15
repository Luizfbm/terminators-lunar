import type { LatLon } from '../../domain/sky'
import { coordinateParts } from './map'
import { fill, STRINGS } from './strings'

/** Degrees with two decimals, in the reader's language: "137.30" or "137,30". */
const DEGREES = {
  en: new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pt: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}

/** The readout under the pointer on the map: where it is, and that a double click asks about it. */
export function readoutText(point: LatLon, locale: 'en' | 'pt', touch: boolean): string {
  const s = STRINGS[locale]
  const parts = coordinateParts(point)
  const where = fill(s.coordinate, {
    lat: DEGREES[locale].format(parts.lat),
    ns: s[parts.ns],
    lon: DEGREES[locale].format(parts.lon),
    ew: s[parts.ew],
  })
  return `${where} · ${touch ? s.askTouch : s.askMouse}`
}
