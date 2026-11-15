import { describe, expect, it } from 'vitest'
import { buildQuery, clampCursor, initialCursor, isCustomSite, linkWithoutLayout, maxDays, readLink, siteKey, siteRefOf, startDayRange, writeLink } from './query'

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

  // 15/11/2026: the vehicle window before a landing asks for a start time, not only a day.
  it('start at the time picked before a landing, in UTC, and carry it in the link', () => {
    const query = buildQuery(meta, new Date('2026-11-14T17:00:00Z'), 'CR05', { startDay: '2027-03-01', startTime: '13:45', hours: 6.5, heightM: null })
    expect(query.start.toISOString()).toBe('2027-03-01T13:45:00.000Z')
    expect(query.durationHours).toBe(6.5)
    const state = { site: '001', cursorMs: null, language: null, view: 'map', startDay: '2027-03-01', startTime: '13:45', hours: 6.5, heightM: null, page: 'answer', stats: false } as const
    expect(writeLink(state)).toBe('?site=001&view=map&start=2027-03-01&time=13%3A45&hours=6.5')
    expect(readLink(writeLink(state))).toEqual(state)
  })

  it('read a link without a time, or with a broken one, as 00:00 UTC exactly as before', () => {
    expect(readLink('?start=2027-03-01')).not.toHaveProperty('startTime')
    expect(readLink('?start=2027-03-01&time=24:00')).not.toHaveProperty('startTime')
    expect(readLink('?time=10:00')).not.toHaveProperty('startTime')
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

describe('the link of Plan B', () => {
  const base = { site: 'CR05', cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: false } as const

  it('leaves the comparison out of a link that has none, so the old links read back exactly as before', () => {
    expect(readLink('?site=CR05')).not.toHaveProperty('planB')
    expect(readLink('?bsite=HW03&bstart=2027-03-01')).not.toHaveProperty('planB')
    expect(writeLink(base)).toBe('?site=CR05')
  })

  it('writes and reads a Plan B that changes everything', () => {
    const state = { ...base, planB: { site: 'HW03', startDay: '2027-03-01', hours: 240, heightM: 10 } }
    expect(writeLink(state)).toBe('?site=CR05&compare=1&bsite=HW03&bstart=2027-03-01&bhours=240&bheight=10')
    expect(readLink(writeLink(state))).toEqual(state)
  })

  it('writes only what Plan B changes: an open comparison alone is compare=1', () => {
    const state = { ...base, planB: { site: null, startDay: null, hours: null, heightM: null } }
    expect(writeLink(state)).toBe('?site=CR05&compare=1')
    expect(readLink(writeLink(state))).toEqual(state)
  })

  it('carries a typed coordinate as blat and blon', () => {
    const state = { ...base, planB: { site: { latitudeDeg: -89.5, longitudeDeg: 12.25 }, startDay: null, hours: null, heightM: null } }
    expect(writeLink(state)).toBe('?site=CR05&compare=1&blat=-89.5&blon=12.25')
    expect(readLink(writeLink(state))).toEqual(state)
  })

  it('ignores Plan B values it does not know, as it does for Plan A', () => {
    const read = readLink('?compare=1&bstart=tomorrow&bhours=-3&bheight=500&blat=-89')
    expect(read.planB).toEqual({ site: null, startDay: null, hours: null, heightM: null })
  })

  it('does not change a single parameter of Plan A', () => {
    const plain = { ...base, startDay: '2027-03-01', hours: 240, heightM: 10, radiusM: 100 }
    const withB = { ...plain, planB: { site: 'HW03', startDay: null, hours: null, heightM: null } }
    expect(writeLink(withB).replace('&compare=1&bsite=HW03', '')).toBe(writeLink(plain))
  })

  it('does not carry Plan B over from the current link by itself: the state decides', () => {
    expect(writeLink(base, '?compare=1&bsite=HW03')).toBe('?site=CR05')
  })
})


describe('the layout in the link', () => {
  const plain = { site: null, cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: false } as const

  it('is Larissa\'s layout without the parameter, so a plain link reads back as before', () => {
    expect(readLink('')).not.toHaveProperty('classic')
    expect(readLink('?site=CR05&stats=1')).not.toHaveProperty('classic')
    expect(writeLink(plain)).toBe('')
  })

  it('opens the classic layout with layout=classic, and writes it back', () => {
    expect(readLink('?layout=classic').classic).toBe(true)
    expect(writeLink({ ...plain, classic: true })).toBe('?layout=classic')
    expect(readLink(writeLink({ ...plain, classic: true, site: 'CR05', view: 'map' }))).toEqual({ ...plain, classic: true, site: 'CR05', view: 'map' })
  })

  it('reads any other value as no layout parameter', () => {
    for (const value of ['', 'cards', 'Classic', '1']) expect(readLink(`?layout=${value}`)).not.toHaveProperty('classic')
  })

  it('survives a change of Site and of page, which rewrite the link from what is open', () => {
    const open = '?layout=classic&site=001&stats=1'
    const toSite = writeLink({ ...readLink(open), site: 'CR05' }, open)
    expect(toSite).toBe('?site=CR05&stats=1&layout=classic')
    expect(readLink(toSite)).toMatchObject({ site: 'CR05', classic: true })
    const toProof = writeLink({ ...readLink(toSite), page: 'proof' }, toSite)
    expect(readLink(toProof)).toMatchObject({ page: 'proof', classic: true })
    expect(toProof.match(/layout=/g)).toHaveLength(1)
  })

  it('is not added to a link that did not have it', () => {
    const open = '?site=001'
    expect(writeLink({ ...readLink(open), site: 'CR05', page: 'proof' }, open)).toBe('?site=CR05&page=proof')
  })

  it('does not count as a Query: the plain address with only the layout still opens the cover', () => {
    expect(linkWithoutLayout('?layout=classic')).toBe('')
    expect(linkWithoutLayout('')).toBe('')
    expect(linkWithoutLayout('?layout=classic&site=001')).toBe('?site=001')
  })
})

describe('the details drawer in the link', () => {
  const plain = { site: null, cursorMs: null, language: null, view: 'orbit', startDay: null, hours: null, heightM: null, page: 'answer', stats: false } as const

  it('is closed without the parameter, and the plain link stays plain', () => {
    expect(readLink('')).not.toHaveProperty('details')
    expect(readLink('?site=CR05&stats=1')).not.toHaveProperty('details')
    expect(writeLink(plain)).toBe('')
    expect(writeLink({ ...plain, details: undefined })).toBe('')
  })

  it('goes in the link when open, and comes back', () => {
    expect(writeLink({ ...plain, details: true })).toBe('?details=1')
    expect(readLink('?details=1')).toEqual({ ...plain, details: true })
    expect(readLink(writeLink({ ...plain, details: true, site: 'CR05', view: 'ground', stats: true }))).toEqual({
      ...plain,
      details: true,
      site: 'CR05',
      view: 'ground',
      stats: true,
    })
  })

  it('is closed for any other value', () => {
    for (const value of ['', '0', 'yes', 'true']) expect(readLink(`?details=${value}`)).not.toHaveProperty('details')
  })

  it('is dropped when the state says closed, so closing the drawer cleans the link', () => {
    const open = '?site=CR05&details=1'
    expect(writeLink({ ...readLink(open), details: undefined }, open)).toBe('?site=CR05')
    expect(writeLink({ ...readLink(open), site: 'CR07' }, open)).toBe('?site=CR07&details=1')
  })

  it('is read in either layout', () => {
    expect(readLink('?layout=classic&details=1')).toMatchObject({ classic: true, details: true })
  })
})
