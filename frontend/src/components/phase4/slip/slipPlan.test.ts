import { describe, expect, it } from 'vitest'
import { readLink } from '../../../domain/query'
import type { ShiftedWindow, SiteWindows } from '../site-windows/types'
import { isWorse, neighbourHref, neighboursKey, neighboursRequest, plannedOf, shown, slipChoices, type SiteNeighbours } from './slipPlan'

const DAY_MS = 86_400_000

function window(shift: number, both: number): ShiftedWindow {
  const start = new Date(Date.UTC(2026, 10, 14) + shift * DAY_MS).toISOString().replace('.000Z', 'Z')
  return { shift_days: shift, start, end: start, sun_and_earth_hours: both, sunlit_hours: both, earth_visible_hours: both, lcsp_hours: 0 }
}

function windows(hours: (shift: number) => number, first = -30, last = 150): SiteWindows {
  const rows = []
  for (let s = first; s <= last; s++) rows.push(window(s, hours(s)))
  const site = { id: 'HW03', name: 'Haworth HW03', latitude_deg: -86.8596, longitude_deg: -19.8934, source: 'wueller2026' as const, source_reference: '', region_id: 'HW', curated: true, has_5m_dem: false }
  return { site, planned_start: rows[-first].start, duration_hours: 708.73, observer_height_m: 2, step_days: 1, windows: rows, best: rows[0], typical: rows[0], worst: rows[0] }
}

describe('slipChoices', () => {
  it('offers a week, two weeks and a month late, then the worst late start when it is none of those', () => {
    // Least time 41 days late; an earlier start (-10) is lower still but is not a slip.
    const data = windows((s) => (s === 41 ? 10 : s === -10 ? 1 : 300))
    expect(slipChoices(data).map((c) => [c.kind, c.window.shift_days])).toEqual([
      ['days', 7],
      ['days', 14],
      ['days', 30],
      ['worst', 41],
    ])
  })

  it('does not offer the worst twice when it is one of the fixed slips, and takes the earlier on a tie', () => {
    expect(slipChoices(windows((s) => (s === 14 ? 5 : 300))).map((c) => c.window.shift_days)).toEqual([7, 14, 30])
    // Every late start ties: the worst is the first late one, 1 day.
    expect(slipChoices(windows(() => 300)).map((c) => c.window.shift_days)).toEqual([7, 14, 30, 1])
  })

  it('leaves out a slip the list does not have (it would leave engine coverage)', () => {
    expect(slipChoices(windows(() => 300, -30, 10)).map((c) => c.window.shift_days)).toEqual([7, 1])
  })
})

describe('isWorse', () => {
  it('is true only when the slip loses Sun-and-Earth time', () => {
    const data = windows((s) => (s === 7 ? 200 : s === 14 ? 300 : 300))
    const planned = plannedOf(data)!
    expect(planned.shift_days).toBe(0)
    expect(isWorse(data.windows.find((w) => w.shift_days === 7)!, planned)).toBe(true)
    expect(isWorse(data.windows.find((w) => w.shift_days === 14)!, planned)).toBe(false)
  })
})

describe('neighboursRequest', () => {
  it('asks the slipped Window at the same Site, with the Query length and Observer height', () => {
    const data = windows(() => 300)
    const slipped = data.windows.find((w) => w.shift_days === 7)!
    const request = neighboursRequest(data, slipped)
    expect(request.siteId).toBe('HW03')
    expect(Object.fromEntries(request.params)).toEqual({ start: '2026-11-21T00:00:00Z', duration_hours: '708.73', observer_height_m: '2' })
    const other = neighboursRequest(data, data.windows.find((w) => w.shift_days === 14)!)
    expect(neighboursKey(request)).not.toBe(neighboursKey(other))
  })
})

describe('shown', () => {
  it('keeps the route order and the first three', () => {
    const row = (id: string, both: number) => ({ site: { id }, distance_km: 1, metrics: { sun_and_earth_hours: both } })
    const data = { neighbours: [row('A', 9), row('B', 8), row('C', 7), row('D', 6)] } as unknown as SiteNeighbours
    expect(shown(data).map((r) => r.site.id)).toEqual(['A', 'B', 'C'])
  })
})

describe('neighbourHref', () => {
  it('sets the Site and the slipped day, keeps the rest of the link and drops the Cursor', () => {
    const search = '?site=HW03&start=2026-11-14&hours=336&height=5&lang=pt&t=2026-11-15T00:00:00Z&tolerance=48'
    const href = neighbourHref(search, 'HW05', '2026-11-21T00:00:00Z')
    const link = readLink(href)
    expect(link.site).toBe('HW05')
    expect(link.startDay).toBe('2026-11-21')
    expect(link.hours).toBe(336)
    expect(link.heightM).toBe(5)
    expect(link.language).toBe('pt')
    expect(link.cursorMs).toBeNull()
    // A panel's own setting rides along.
    expect(new URLSearchParams(href).get('tolerance')).toBe('48')
  })

  it('works from the plain address too', () => {
    expect(readLink(neighbourHref('', 'CR06', '2026-11-21T00:00:00Z'))).toMatchObject({ site: 'CR06', startDay: '2026-11-21' })
  })
})
