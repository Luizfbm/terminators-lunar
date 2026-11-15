import { describe, expect, it } from 'vitest'
import { buildQuery, clampCursor, initialCursor, isCustomSite, maxDays, readLink, siteKey, siteRefOf, startDayRange, writeLink } from './query'

const meta = {
  defaults: { site_id: '001', duration_hours: 708.73, observer_height_m: 2 },
  coverage: { custom_max_latitude_deg: -80, window_min: '2025-01-01T00:00:00Z', window_max: '2032-12-31T23:59:59Z', max_duration_hours: 1440 },
} as Parameters<typeof buildQuery>[0]

describe('buildQuery', () => {
  it('starts the Window at 00:00 UTC of today, whatever the hour', () => {
    const query = buildQuery(meta, new Date('2026-11-14T17:42:10.500Z'))
    expect(query.start.toISOString()).toBe('2026-11-14T00:00:00.000Z')
    expect(query.site).toBe('001')
    expect(query.durationHours).toBe(708.73)
    expect(query.observerHeightM).toBe(2)
  })

  it('takes the Site from the link when there is one', () => {
    expect(buildQuery(meta, new Date('2026-11-14T00:00:00Z'), 'CR05').site).toBe('CR05')
    expect(buildQuery(meta, new Date('2026-11-14T00:00:00Z'), '').site).toBe('001')
  })
})

describe('the link', () => {
  it('reads back what it wrote', () => {
    const state = { site: 'CR05', cursorMs: Date.parse('2026-11-21T00:55:26Z'), language: 'pt', view: 'ground', startDay: null, hours: null, heightM: null, page: 'proof', stats: false } as const
    expect(writeLink(state)).toBe('?site=CR05&t=2026-11-21T00%3A55%3A26Z&lang=pt&view=ground&page=proof')
    expect(readLink(writeLink(state))).toEqual(state)
  })

  it('leaves the defaults out, so the plain address is the plain screen', () => {
    expect(writeLink({ site: null, cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: false })).toBe('')
    expect(readLink('')).toEqual({ site: null, cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: false })
  })

  it('ignores values it does not know', () => {
    expect(readLink('?t=yesterday&lang=xx&view=space&page=nope')).toEqual({ site: null, cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: false })
  })
})

describe('the Cursor', () => {
  const start = Date.parse('2026-11-14T00:00:00Z')
  const end = Date.parse('2026-12-13T12:43:48Z')

  it('starts at now when the Window holds it, otherwise at the Window start', () => {
    expect(initialCursor(start, end, Date.parse('2026-11-14T17:00:00Z'))).toBe(Date.parse('2026-11-14T17:00:00Z'))
    expect(initialCursor(start, end, Date.parse('2026-11-13T17:00:00Z'))).toBe(start)
    expect(initialCursor(start, end, end)).toBe(start)
  })

  it('never leaves the Window', () => {
    expect(clampCursor(start - 1, start, end)).toBe(start)
    expect(clampCursor(end + 1, start, end)).toBe(end)
  })
})

describe('the chosen Window and height', () => {
  it('build the Query, and anything left null stays the default', () => {
    const query = buildQuery(meta, new Date('2026-11-14T17:00:00Z'), 'CR05', { startDay: '2027-03-01', hours: 240, heightM: 10 })
    expect(query.start.toISOString()).toBe('2027-03-01T00:00:00.000Z')
    expect(query.durationHours).toBe(240)
    expect(query.observerHeightM).toBe(10)
    const partly = buildQuery(meta, new Date('2026-11-14T17:00:00Z'), null, { startDay: null, hours: null, heightM: 0 })
    expect(partly.start.toISOString()).toBe('2026-11-14T00:00:00.000Z')
    expect(partly.durationHours).toBe(708.73)
    expect(partly.observerHeightM).toBe(0)
  })

  it('travel in the link and come back', () => {
    const state = { site: '001', cursorMs: null, language: null, view: 'orbit', startDay: '2027-03-01', hours: 240, heightM: 0, page: 'answer', stats: false } as const
    expect(writeLink(state)).toBe('?site=001&start=2027-03-01&hours=240&height=0')
    expect(readLink(writeLink(state))).toEqual(state)
  })

  it('drop link values that make no sense', () => {
    expect(readLink('?start=2027-13-45&hours=-3&height=80')).toMatchObject({ startDay: null, hours: null, heightM: null })
    expect(readLink('?start=yesterday&hours=lots&height=')).toMatchObject({ startDay: null, hours: null, heightM: null })
  })

  it('keep the Window inside the coverage', () => {
    expect(maxDays(meta.coverage)).toBe(60)
    expect(startDayRange(meta.coverage, 708.73)).toEqual({ min: '2025-01-01', max: '2032-12-02' })
    expect(startDayRange(meta.coverage, 24)).toEqual({ min: '2025-01-01', max: '2032-12-30' })
  })
})

describe('a custom Site (the requirement)', () => {
  const point = { latitudeDeg: -89.5, longitudeDeg: 10.25 }
  const site = {
    id: 'custom',
    name: 'Custom Site',
    latitude_deg: -89.5,
    longitude_deg: 10.25,
    source: 'custom',
    source_reference: 'User-provided coordinate',
    region_id: null,
    curated: false,
    has_5m_dem: false,
  } as const

  it('asks the Query for the coordinate, not for a code', () => {
    expect(buildQuery(meta, new Date('2026-11-14T00:00:00Z'), point).site).toEqual(point)
  })

  it('travels in the link as lat and lon, never with a site', () => {
    const state = { site: point, cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: false } as const
    expect(writeLink(state)).toBe('?lat=-89.5&lon=10.25')
    expect(readLink(writeLink(state))).toEqual(state)
  })

  it('is read back from a link even north of the polar maps, so the API can say why it cannot answer', () => {
    expect(readLink('?lat=-70&lon=10').site).toEqual({ latitudeDeg: -70, longitudeDeg: 10 })
  })

  it('drops a coordinate that is half there or off the Moon', () => {
    expect(readLink('?lat=-89.5').site).toBe(null)
    expect(readLink('?lat=-89.5&lon=').site).toBe(null)
    expect(readLink('?lat=-95&lon=10').site).toBe(null)
    expect(readLink('?lat=-89&lon=200').site).toBe(null)
  })

  it('lets a Site code in the link win over a coordinate', () => {
    expect(readLink('?site=CR05&lat=-89.5&lon=10').site).toBe('CR05')
  })

  it('has a key that follows the coordinate', () => {
    expect(siteKey(point)).toBe('-89.5,10.25')
    expect(siteKey('CR05')).toBe('CR05')
    expect(siteKey(null)).toBe('')
  })

  it('is asked again by its coordinate, a Curated Site by its code', () => {
    expect(isCustomSite(site)).toBe(true)
    expect(siteRefOf(site)).toEqual(point)
    expect(siteRefOf({ ...site, id: 'CR05', source: 'wueller2026', curated: true })).toBe('CR05')
  })
})

describe('the map view in the link', () => {
  it('goes in the link and comes back', () => {
    const state = { site: null, cursorMs: null, language: null, view: 'map', startDay: null, hours: null, heightM: null, page: 'answer', stats: false } as const
    expect(writeLink(state)).toBe('?view=map')
    expect(readLink('?view=map').view).toBe('map')
  })
})

describe('"Stats for nerds" in the link', () => {
  it('goes in the link when open and comes back', () => {
    const state = { site: null, cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: true } as const
    expect(writeLink(state)).toBe('?stats=1')
    expect(readLink('?stats=1')).toEqual(state)
  })

  it('is closed for any other value', () => {
    expect(readLink('?stats=0').stats).toBe(false)
    expect(readLink('?stats=yes').stats).toBe(false)
  })
})

describe('the Details drawer in the link', () => {
  const closed = { site: null, cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: false } as const

  it('goes in the link when open and comes back', () => {
    expect(writeLink({ ...closed, details: true })).toBe('?details=1')
    expect(readLink('?details=1')).toEqual({ ...closed, details: true })
  })

  it('is left out when closed, so the plain address stays the plain screen', () => {
    expect(writeLink({ ...closed, details: false })).toBe('')
    expect(readLink('?details=0').details).toBeUndefined()
    expect(readLink('?details=yes').details).toBeUndefined()
  })

  it('rides along with the rest of the Query', () => {
    expect(writeLink({ ...closed, site: 'CR05', stats: true, details: true })).toBe('?site=CR05&stats=1&details=1')
  })
})

describe('the link and the panels', () => {
  // the requirement: a panel keeps its own setting in the link, and the App's link writer used to drop it.
  it('carries the parameters it does not own', () => {
    const state = readLink('?site=001&flat=1&classroom=88')
    expect(writeLink({ ...state, view: 'ground' }, '?site=001&flat=1&classroom=88')).toBe('?flat=1&classroom=88&site=001&view=ground')
  })

  it('still owns its own parameters when the old link had them', () => {
    expect(writeLink(readLink('?site=001'), '?site=CR05&stats=1&flat=1')).toBe('?flat=1&site=001')
  })
})

