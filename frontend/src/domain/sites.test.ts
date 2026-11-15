import { describe, expect, it } from 'vitest'
import type { Region, Site } from '../api/client'
import { activeIndex, coordinateParts, flatten, groupSites, isOffPole, matchesSearch, readCoordinate, readDegrees } from './sites'

const site = (id: string, name: string, region_id: string | null, latitude_deg = -89.4, longitude_deg = 10): Site => ({
  id,
  name,
  latitude_deg,
  longitude_deg,
  source: 'wueller2026',
  source_reference: 'Wueller et al. 2026',
  region_id,
  curated: true,
  has_5m_dem: true,
})

const region = (id: string, name: string, artemis_iii_current: boolean): Region => ({
  id,
  name,
  site_count: 1,
  artemis_iii_current,
  source_reference: 'Wueller et al. 2026, Table 1',
})

const RIDGE = site('001', 'Connecting Ridge (NASA site 001)', 'CR', -89.4661, -136.949)
const RIDGE_4 = site('CR04', 'Connecting Ridge 4', 'CR')
const HAWORTH = site('HW01', 'Haworth 1', 'HW', -87.2)
const POLAR = site('PSR1', 'Shackleton floor', null, -89.67, 129.78)
const APOLLO = site('APOLLO11', 'Apollo 11', null, 0.6741, 23.4733)
const CH3 = site('CH3', 'Chandrayaan-3 (Shiv Shakti)', null, -69.3734, 32.3198)
const SITES = [HAWORTH, RIDGE, APOLLO, RIDGE_4, POLAR, CH3]
const REGIONS = [region('CR', 'Connecting Ridge', true), region('HW', 'Haworth', false)]

describe('isOffPole', () => {
  it('is true only for a Site with no Region north of 80°S', () => {
    expect(isOffPole(APOLLO)).toBe(true)
    expect(isOffPole(CH3)).toBe(true)
    expect(isOffPole(POLAR)).toBe(false)
    expect(isOffPole(HAWORTH)).toBe(false)
  })
})

describe('matchesSearch', () => {
  it('finds a Site by part of its name or by its code, ignoring case and accents', () => {
    expect(matchesSearch(RIDGE, 'ridge')).toBe(true)
    expect(matchesSearch(RIDGE_4, 'cr04')).toBe(true)
    expect(matchesSearch(RIDGE, 'CONNÉCTING   ridge')).toBe(true)
    expect(matchesSearch(HAWORTH, 'ridge')).toBe(false)
  })

  it('needs every word typed', () => {
    expect(matchesSearch(RIDGE_4, 'ridge 4')).toBe(true)
    expect(matchesSearch(RIDGE, 'ridge haworth')).toBe(false)
  })

  it('lets everything through on an empty search', () => {
    expect(matchesSearch(APOLLO, '   ')).toBe(true)
  })
})

describe('groupSites', () => {
  it('groups by Region in the order /regions gives, then polar Sites, then off-pole ones', () => {
    const groups = groupSites(SITES, REGIONS, RIDGE, '')
    expect(groups.map((group) => group.key)).toEqual(['region-CR', 'region-HW', 'polar', 'off-pole'])
    expect(groups[0].sites).toEqual([RIDGE, RIDGE_4])
    expect(groups[3].sites).toEqual([APOLLO, CH3])
  })

  it('keeps a Region the list does not know yet, by its code, after the known ones', () => {
    const groups = groupSites([site('X1', 'Mystery 1', 'ZZ'), HAWORTH], REGIONS, HAWORTH, '')
    expect(groups.map((group) => group.key)).toEqual(['region-HW', 'region-ZZ'])
    const unknown = groups[1]
    expect(unknown.kind === 'region' && unknown.region).toBe(null)
  })

  it('lists the chosen Site before /sites arrives', () => {
    expect(flatten(groupSites([], [], RIDGE, ''))).toEqual([RIDGE])
  })

  it('lists the chosen Site once when it is also in the list', () => {
    expect(flatten(groupSites(SITES, REGIONS, RIDGE, '')).filter((entry) => entry.id === RIDGE.id)).toHaveLength(1)
  })

  it('leaves a custom Site out of the list: it sits in the coordinate fields', () => {
    const custom = { ...site('custom', 'Custom Site', null, -89.5, 10), source: 'custom' as const, curated: false }
    expect(flatten(groupSites(SITES, REGIONS, custom, '')).map((entry) => entry.id)).not.toContain('custom')
    expect(groupSites([], [], custom, '')).toEqual([])
  })

  it('filters with the search and drops groups left empty', () => {
    const groups = groupSites(SITES, REGIONS, RIDGE, 'apollo')
    expect(groups.map((group) => group.key)).toEqual(['off-pole'])
    expect(groupSites(SITES, REGIONS, RIDGE, 'nowhere')).toEqual([])
  })
})

describe('coordinateParts', () => {
  it('turns the sign into a hemisphere and keeps two decimals', () => {
    expect(coordinateParts(RIDGE)).toEqual({ lat: 89.47, latHemisphere: 'S', lon: 136.95, lonHemisphere: 'W' })
    expect(coordinateParts(APOLLO)).toEqual({ lat: 0.67, latHemisphere: 'N', lon: 23.47, lonHemisphere: 'E' })
  })
})

describe('readDegrees', () => {
  it('reads a signed number, with a point or a comma, and the typographic minus', () => {
    expect(readDegrees('-89.45', 'latitude')).toBe(-89.45)
    expect(readDegrees(' −89,45 ', 'latitude')).toBe(-89.45)
    expect(readDegrees('10', 'longitude')).toBe(10)
  })

  it('turns a hemisphere letter into the sign, in English and Portuguese', () => {
    expect(readDegrees('89.45 S', 'latitude')).toBe(-89.45)
    expect(readDegrees('89.45°S', 'latitude')).toBe(-89.45)
    expect(readDegrees('89.45° s', 'latitude')).toBe(-89.45)
    expect(readDegrees('137.3 W', 'longitude')).toBe(-137.3)
    expect(readDegrees('137,3 O', 'longitude')).toBe(-137.3)
    expect(readDegrees('137.3 E', 'longitude')).toBe(137.3)
    expect(readDegrees('137.3 L', 'longitude')).toBe(137.3)
  })

  it('refuses what it cannot read for sure', () => {
    expect(readDegrees('', 'latitude')).toBe(null)
    expect(readDegrees('south', 'latitude')).toBe(null)
    expect(readDegrees('-89 S', 'latitude')).toBe(null)
    expect(readDegrees('89 W', 'latitude')).toBe(null)
    expect(readDegrees('10 S', 'longitude')).toBe(null)
    expect(readDegrees('91', 'latitude')).toBe(null)
    expect(readDegrees('181', 'longitude')).toBe(null)
    expect(readDegrees('1e2', 'longitude')).toBe(null)
  })
})

describe('readCoordinate', () => {
  it('gives the coordinate when both parts read and the point is on the polar maps', () => {
    expect(readCoordinate('89.5 S', '10 E', -80)).toEqual({ ok: true, coordinate: { latitudeDeg: -89.5, longitudeDeg: 10 } })
    expect(readCoordinate('-80', '0', -80)).toEqual({ ok: true, coordinate: { latitudeDeg: -80, longitudeDeg: 0 } })
  })

  it('says a latitude north of the limit is north, and nothing about a good longitude', () => {
    expect(readCoordinate('-79.99', '0', -80)).toEqual({ ok: false, problems: { latitude: 'north', longitude: null } })
    expect(readCoordinate('89.5', '0', -80)).toEqual({ ok: false, problems: { latitude: 'north', longitude: null } })
  })

  // Validation check: "50 S" with no longitude showed one grey line that named
  // neither cause. Each part now says its own, both at once.
  it('names both causes when the latitude is north of the maps and the longitude is empty', () => {
    expect(readCoordinate('50 S', '', -80)).toEqual({ ok: false, problems: { latitude: 'north', longitude: 'missing' } })
  })

  it('tells an empty part from one that is not degrees', () => {
    expect(readCoordinate('-89.5', '   ', -80)).toEqual({ ok: false, problems: { latitude: null, longitude: 'missing' } })
    expect(readCoordinate('', '10', -80)).toEqual({ ok: false, problems: { latitude: 'missing', longitude: null } })
    expect(readCoordinate('x', '10', -80)).toEqual({ ok: false, problems: { latitude: 'unreadable', longitude: null } })
    expect(readCoordinate('-89.5', '10 Q', -80)).toEqual({ ok: false, problems: { latitude: null, longitude: 'unreadable' } })
    expect(readCoordinate('south', 'west', -80)).toEqual({ ok: false, problems: { latitude: 'unreadable', longitude: 'unreadable' } })
  })
})

describe('activeIndex', () => {
  // Validation check: the highlight was kept as a position. When the Regions arrived
  // after the list opened, the groups reordered and the same position named a Haworth Site, while the
  // chosen Connecting Ridge Site had moved 4,110 px down.
  it('stays on the same Site when the list reorders', () => {
    // Before the Regions arrive, Haworth comes first, as the catalogue lists it; after, Connecting Ridge.
    const before = flatten(groupSites(SITES, [], RIDGE, ''))
    const after = flatten(groupSites(SITES, REGIONS, RIDGE, ''))
    expect(before[activeIndex(before, RIDGE.id)]).toBe(RIDGE)
    expect(after[activeIndex(after, RIDGE.id)]).toBe(RIDGE)
    expect(activeIndex(after, RIDGE.id)).not.toBe(activeIndex(before, RIDGE.id))
  })

  it('falls back to the first Site when the one it names is not listed', () => {
    expect(activeIndex([HAWORTH, RIDGE], 'gone')).toBe(0)
    expect(activeIndex([HAWORTH, RIDGE], null)).toBe(0)
  })
})
