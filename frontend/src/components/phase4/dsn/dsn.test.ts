import { describe, expect, it } from 'vitest'
import type { VisibilityResult } from '../../../api/client'
import { dsnPath, publishDsn, shownDsn, subscribeDsn } from './api'
import { minus, pieces, QUIET_SHARE, weightOf } from './bands'
import { STRINGS } from './strings'

const query = {
  site: { id: '001', name: 'Connecting Ridge 001', latitude_deg: -89.47, longitude_deg: -136.95, source: 'wueller2026', curated: true },
  start: '2026-11-14T00:00:00Z',
  end: '2026-12-13T12:43:48Z',
  duration_hours: 708.73,
  observer_height_m: 2,
  step_minutes: 15,
} as unknown as VisibilityResult['query']

describe('the request', () => {
  it('names a Curated Site by its code', () => {
    expect(dsnPath(query)).toBe('/visibility/dsn?site_id=001&start=2026-11-14T00%3A00%3A00Z&duration_hours=708.73&observer_height_m=2')
  })

  it('names a custom Site by its point', () => {
    const custom = { ...query, site: { ...query.site, source: 'custom' } } as VisibilityResult['query']
    expect(dsnPath(custom)).toMatch(/^\/visibility\/dsn\?latitude_deg=-89\.47&longitude_deg=-136\.95&start=/)
  })
})

describe('the bands', () => {
  const start = Date.parse('2026-11-14T00:00:00Z')
  const end = start + 100 * 3_600_000
  const at = (hours: number) => new Date(start + hours * 3_600_000).toISOString()

  it('places each span as a fraction of the Window, clipped to it', () => {
    expect(pieces([{ start: at(10), end: at(30) }, { start: at(90), end: at(120) }], start, end)).toEqual([
      { left: 0.1, width: expect.closeTo(0.2, 10) },
      { left: 0.9, width: expect.closeTo(0.1, 10) },
    ])
  })

  it('finds the stretches with the Earth up and no dish', () => {
    const earth = [{ start: at(0), end: at(50) }]
    const link = [{ start: at(0), end: at(20) }, { start: at(30), end: at(50) }]
    expect(minus(earth, link)).toEqual([{ start: at(20), end: at(30) }])
    expect(minus(earth, earth)).toEqual([])
  })

  it('weighs the gap against Earth visible', () => {
    expect(weightOf(329.1, 0)).toBe('same')
    expect(weightOf(329.1, 0.01)).toBe('same')
    expect(weightOf(329.1, 329.1 * QUIET_SHARE * 0.5)).toBe('quiet')
    expect(weightOf(329.1, 18.9)).toBe('full')
    expect(weightOf(0, 0)).toBe('same')
  })
})

describe('the store the timeline row reads', () => {
  it('keeps the latest state for a key and lets it go only for that key', () => {
    let calls = 0
    const stop = subscribeDsn(() => (calls += 1))
    publishDsn('a', { status: 'loading' })
    expect(shownDsn()?.key).toBe('a')
    publishDsn('b', null)
    expect(shownDsn()?.key).toBe('a')
    publishDsn('a', null)
    expect(shownDsn()).toBeNull()
    expect(calls).toBe(2)
    stop()
  })
})

describe('the strings', () => {
  it('has every string in both languages, with the same placeholders', () => {
    expect(Object.keys(STRINGS.pt).sort()).toEqual(Object.keys(STRINGS.en).sort())
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) expect(holes(STRINGS.pt[key]), key).toEqual(holes(STRINGS.en[key]))
  })
})
