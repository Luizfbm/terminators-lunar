import { describe, expect, it } from 'vitest'
import { currentRow, durationParts, oneDecimal, periodRows, sectionsOf, summarise } from './panelData'

const H = 3_600_000
const start = Date.UTC(2026, 10, 15)
const iso = (hours: number) => new Date(start + hours * H).toISOString()
const period = (body: string, state: string, from: number, to: number) => ({ body, state, start: iso(from), end: iso(to) })

// A 100 h Window: Sun up 0–60, down 60–100; Earth up 0–20, down 20–50, up 50–90, down 90–100.
const periods = [
  period('sun', 'visible', 0, 60),
  period('sun', 'hidden', 60, 100),
  period('earth', 'visible', 0, 20),
  period('earth', 'hidden', 20, 50),
  period('earth', 'visible', 50, 90),
  period('earth', 'hidden', 90, 100),
]

describe('periodRows', () => {
  it('lists visible and hidden periods of one body in time order', () => {
    expect(periodRows(periods, 'earth', start, start + 100 * H)).toEqual([
      { start, end: start + 20 * H, visible: true },
      { start: start + 20 * H, end: start + 50 * H, visible: false },
      { start: start + 50 * H, end: start + 90 * H, visible: true },
      { start: start + 90 * H, end: start + 100 * H, visible: false },
    ])
  })

  it('clips to the Window and drops what falls outside it', () => {
    expect(periodRows(periods, 'sun', start + 10 * H, start + 50 * H)).toEqual([{ start: start + 10 * H, end: start + 50 * H, visible: true }])
  })
})

describe('currentRow', () => {
  const rows = periodRows(periods, 'sun', start, start + 100 * H)

  it('finds the row that holds the Cursor, start included and end excluded', () => {
    expect(currentRow(rows, start)).toBe(0)
    expect(currentRow(rows, start + 60 * H)).toBe(1)
  })

  it('keeps the last row marked with the Cursor on the Window end', () => {
    expect(currentRow(rows, start + 100 * H)).toBe(1)
  })

  it('marks nothing outside the rows', () => {
    expect(currentRow(rows, start - H)).toBe(-1)
    expect(currentRow([], start)).toBe(-1)
  })
})

describe('summarise', () => {
  it('reads the backend metrics and measures the longest stretch without the Earth', () => {
    const summary = summarise({
      query: { start: iso(0), end: iso(100) },
      periods,
      metrics: { sunlit_hours: 60, earth_visible_hours: 60, sun_and_earth_hours: 30, lcsp_hours: 40 },
    })
    expect(summary).toEqual({ windowMs: 100 * H, sunMs: 60 * H, earthMs: 60 * H, bothMs: 30 * H, longestNightMs: 40 * H, longestNoEarthMs: 30 * H })
  })
})

describe('durationParts', () => {
  it('gives hours to one decimal under 48 h', () => {
    expect(durationParts(47.94 * H)).toEqual({ hours: 47.9, days: null })
    expect(durationParts(0)).toEqual({ hours: 0, days: null })
  })

  it('gives whole hours and days to one decimal from 48 h', () => {
    expect(durationParts(48 * H)).toEqual({ hours: 48, days: 2 })
    expect(durationParts(317.4 * H)).toEqual({ hours: 317, days: 13.2 })
  })
})

describe('oneDecimal', () => {
  const en = new Intl.NumberFormat('en-GB').format
  const pt = new Intl.NumberFormat('pt-BR').format

  it('keeps the decimal of a whole number, in the formatter’s own sign', () => {
    expect(oneDecimal(12, en)).toBe('12.0')
    expect(oneDecimal(12, pt)).toBe('12,0')
  })

  it('rounds to one decimal', () => {
    expect(oneDecimal(3.46, en)).toBe('3.5')
    expect(oneDecimal(3.46, pt)).toBe('3,5')
    expect(oneDecimal(1234.5, pt)).toBe('1.234,5')
  })
})

describe('sectionsOf', () => {
  it('gives the panel without a vehicle only what exists without one (Level 1, issue #151)', () => {
    const site = sectionsOf('site')
    expect(site).toEqual(['countdown', 'sentence', 'summary', 'note'])
    for (const vehicleOnly of ['vehicle', 'energy', 'comms', 'hint'] as const) expect(site).not.toContain(vehicleOnly)
  })

  it('keeps the landing panel of Level 2 as it was made, in its order', () => {
    expect(sectionsOf('vehicle')).toEqual(['vehicle', 'summary', 'hint', 'energy', 'comms', 'note'])
  })
})
