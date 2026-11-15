import { describe, expect, it } from 'vitest'
import { requestKey, slipRequest, toleranceFromLink, yearRequest, type WindowsQuery } from './request'

const query: WindowsQuery = { siteId: '001', start: '2026-11-14T00:00:00Z', durationHours: 336, observerHeightM: 2 }

describe('yearRequest', () => {
  it('asks from 1 January of the Query year, every day to the next 1 January, with the Query Window and height', () => {
    const { siteId, params } = yearRequest(query)
    expect(siteId).toBe('001')
    expect(Object.fromEntries(params)).toEqual({
      start: '2026-01-01T00:00:00Z',
      duration_hours: '336',
      observer_height_m: '2',
      first_shift_days: '0',
      last_shift_days: '365',
    })
  })

  it('takes the year from the UTC start, not the browser clock', () => {
    const late = yearRequest({ ...query, start: '2027-12-31T23:00:00Z' })
    expect(late.params.get('start')).toBe('2027-01-01T00:00:00Z')
  })
})

describe('slipRequest', () => {
  it('asks the Query own Window and leaves the shifts to the route defaults (-30 to +150)', () => {
    const { params } = slipRequest({ ...query, durationHours: 708.73 })
    expect(Object.fromEntries(params)).toEqual({ start: '2026-11-14T00:00:00Z', duration_hours: '708.73', observer_height_m: '2' })
  })
})

describe('requestKey', () => {
  it('differs between the year and the slip, and whenever the Query changes', () => {
    const keys = new Set([
      requestKey(yearRequest(query)),
      requestKey(slipRequest(query)),
      requestKey(slipRequest({ ...query, start: '2026-11-15T00:00:00Z' })),
      requestKey(slipRequest({ ...query, durationHours: 168 })),
      requestKey(slipRequest({ ...query, observerHeightM: 10 })),
      requestKey(slipRequest({ ...query, siteId: '002' })),
    ])
    expect(keys.size).toBe(6)
  })
})

describe('toleranceFromLink', () => {
  it('reads hours from the tolerance parameter', () => {
    expect(toleranceFromLink('?site=001&tolerance=48')).toBe(48)
    expect(toleranceFromLink('?tolerance=12.5')).toBe(12.5)
    expect(toleranceFromLink('?tolerance=0')).toBe(0)
  })

  it('is null when the link has none, or one the slip cannot draw', () => {
    expect(toleranceFromLink('')).toBeNull()
    expect(toleranceFromLink('?tolerance=')).toBeNull()
    expect(toleranceFromLink('?tolerance=abc')).toBeNull()
    expect(toleranceFromLink('?tolerance=-6')).toBeNull()
    expect(toleranceFromLink('?tolerance=Infinity')).toBeNull()
  })
})
