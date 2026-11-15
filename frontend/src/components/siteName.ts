import type { Site } from '../api/client'
import { isCustomSite } from '../domain/query'
import { coordinateParts } from '../domain/sites'
import type { I18n } from '../i18n/i18n'

/** "89.47° S, 136.95° W" in the visitor's language. */
export function coordinate(site: Site, { t, formatNumber }: I18n): string {
  const parts = coordinateParts(site)
  return t('sites.coordinate', {
    lat: formatNumber(parts.lat),
    ns: t(`sites.hemisphere.${parts.latHemisphere}`),
    lon: formatNumber(parts.lon),
    ew: t(`sites.hemisphere.${parts.lonHemisphere}`),
  })
}

/**
 * The name to show. A Curated Site keeps its published name; the API calls every custom Site the
 * same thing, in English, so a custom Site is named here by the coordinate the answer carries.
 */
export function siteName(site: Site, i18n: I18n): string {
  return isCustomSite(site) ? i18n.t('sites.custom.name', { coordinate: coordinate(site, i18n) }) : site.name
}
