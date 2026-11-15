import type { Region, Site } from '../api/client'
import { isCustomSite, type Coordinate } from './query'

/** Polar DEMs reach 80°S; a Site north of that with no Region is one of the off-pole landers. */
const POLAR_LIMIT_DEG = -80

export function isOffPole(site: Site): boolean {
  return site.region_id === null && site.latitude_deg > POLAR_LIMIT_DEG
}

/** Lower case, accents dropped, spaces squeezed: "Shackleton–de Gerlache" finds "de gerlache". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** A Site matches when every word typed appears in its name or its code. */
export function matchesSearch(site: Site, search: string): boolean {
  const words = fold(search).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const haystack = `${fold(site.name)} ${fold(site.id)}`
  return words.every((word) => haystack.includes(word))
}

export type SiteGroup =
  | { kind: 'region'; key: string; region: Region | null; regionId: string; sites: Site[] }
  | { kind: 'polar'; key: string; sites: Site[] }
  | { kind: 'offPole'; key: string; sites: Site[] }

/**
 * The Sites to list, filtered by the search and grouped: one group per Region in the order
 * `/regions` gives (a Region the list does not know yet keeps its code), then polar Sites
 * with no Region, then the off-pole Sites. Inside a group Sites keep catalogue order.
 * The chosen Site is always listed when the search matches it, even before `/sites` arrives,
 * unless it is a custom Site: that one lives in the coordinate fields, not in the list.
 */
export function groupSites(
  sites: readonly Site[],
  regions: readonly Region[],
  current: Site,
  search: string,
): SiteGroup[] {
  const listed = isCustomSite(current) || sites.some((site) => site.id === current.id)
  const all = listed ? sites : [current, ...sites]
  const shown = all.filter((site) => matchesSearch(site, search))
  const order = new Map(regions.map((region, index) => [region.id, index]))
  const byRegion = new Map<string, Site[]>()
  const polar: Site[] = []
  const offPole: Site[] = []
  for (const site of shown) {
    if (site.region_id !== null) {
      const list = byRegion.get(site.region_id) ?? []
      list.push(site)
      byRegion.set(site.region_id, list)
    } else if (isOffPole(site)) {
      offPole.push(site)
    } else {
      polar.push(site)
    }
  }
  const regionIds = [...byRegion.keys()].sort(
    (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
  )
  const groups: SiteGroup[] = regionIds.map((regionId) => ({
    kind: 'region',
    key: `region-${regionId}`,
    region: regions.find((region) => region.id === regionId) ?? null,
    regionId,
    sites: byRegion.get(regionId) ?? [],
  }))
  if (polar.length) groups.push({ kind: 'polar', key: 'polar', sites: polar })
  if (offPole.length) groups.push({ kind: 'offPole', key: 'off-pole', sites: offPole })
  return groups
}

/** The Sites in the order the list shows them, for the arrow keys. */
export function flatten(groups: readonly SiteGroup[]): Site[] {
  return groups.flatMap((group) => group.sites)
}

/** Degrees north or south and east or west, two decimals, sign turned into a letter. */
export function coordinateParts(site: Site): { lat: number; latHemisphere: 'N' | 'S'; lon: number; lonHemisphere: 'E' | 'W' } {
  const round = (value: number) => Math.round(Math.abs(value) * 100) / 100
  return {
    lat: round(site.latitude_deg),
    latHemisphere: site.latitude_deg < 0 ? 'S' : 'N',
    lon: round(site.longitude_deg),
    lonHemisphere: site.longitude_deg < 0 ? 'W' : 'E',
  }
}

/**
 * What is wrong with each typed part, so the form can say the cause beside the field (the requirement):
 * left empty, not degrees, or (for the latitude) north of the polar maps. `null` means that part is fine.
 */
export interface CoordinateProblems {
  latitude: 'missing' | 'unreadable' | 'north' | null
  longitude: 'missing' | 'unreadable' | null
}

export type CoordinateReading =
  | { ok: true; coordinate: Coordinate }
  | { ok: false; problems: CoordinateProblems }

/**
 * Degrees as a visitor types them: "-89.45", "−89,45", "89.45 S" or "89.45°S" for the latitude;
 * "137.3 W" (or "O" in Portuguese), "-137.3" or "137.3 E"/"L" for the longitude. A letter and a
 * minus sign together are refused, since they could disagree.
 */
export function readDegrees(text: string, axis: 'latitude' | 'longitude'): number | null {
  const clean = text.replace(/\u2212/g, '-').replace(',', '.').replace('°', ' ').replace(/\s+/g, ' ').trim()
  const match = /^([+-]?)(\d+(?:\.\d*)?|\.\d+) ?([A-Za-z])?$/.exec(clean)
  if (!match) return null
  const [, sign, digits, letter] = match
  let value = Number(digits) * (sign === '-' ? -1 : 1)
  if (letter) {
    const hemisphere = letter.toUpperCase()
    const negative = axis === 'latitude' ? 'S' : 'WO'
    const positive = axis === 'latitude' ? 'N' : 'EL'
    if (sign || !(negative + positive).includes(hemisphere)) return null
    if (negative.includes(hemisphere)) value = -value
  }
  const limit = axis === 'latitude' ? 90 : 180
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null
}

/**
 * A typed coordinate, or what is wrong with each part: the engine only has maps south of
 * `maxLatitudeDeg`. Both parts are checked, so "50 S" with no longitude names both causes at once.
 */
export function readCoordinate(latitude: string, longitude: string, maxLatitudeDeg: number): CoordinateReading {
  const latitudeDeg = readDegrees(latitude, 'latitude')
  const longitudeDeg = readDegrees(longitude, 'longitude')
  const problems: CoordinateProblems = {
    latitude:
      latitude.trim() === '' ? 'missing' : latitudeDeg === null ? 'unreadable' : latitudeDeg > maxLatitudeDeg ? 'north' : null,
    longitude: longitude.trim() === '' ? 'missing' : longitudeDeg === null ? 'unreadable' : null,
  }
  if (latitudeDeg === null || longitudeDeg === null || problems.latitude || problems.longitude) return { ok: false, problems }
  return { ok: true, coordinate: { latitudeDeg, longitudeDeg } }
}

/**
 * Where the highlight sits in the list: on the Site it names, wherever that Site has moved to, or on
 * the first one when it is not listed. Kept by Site and not by position, because the list reorders
 * when the Regions arrive after it opened (the requirement: the highlight jumped to another Region).
 */
export function activeIndex(flat: readonly Site[], activeId: string | null): number {
  return Math.max(0, flat.findIndex((site) => site.id === activeId))
}
