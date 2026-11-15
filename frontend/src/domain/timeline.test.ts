import { describe, expect, it } from 'vitest'
import { axisTicks, bands, dayTicks, evenTicks, sunSegments, sunTotals } from './timeline'

const START = Date.parse('2026-11-10T00:00:00Z')
const END = Date.parse('2026-11-13T00:00:00Z')

describe('sunSegments', () => {
  it('maps sunlit and shadow periods to fractions of the Window', () => {
    const segments = sunSegments(
      [
        { body: 'sun', state: 'visible', start: '2026-11-10T00:00:00Z', end: '2026-11-10T12:00:00Z' },
        { body: 'sun', state: 'hidden', start: '2026-11-10T12:00:00Z', end: '2026-11-11T00:00:00Z', short_shadow: false },
      ],
      START,
      END,
    )
    expect(segments).toEqual([
      { kind: 'sunlit', left: 0, width: 0.5 / 3 },
      { kind: 'shadow', left: 0.5 / 3, width: 0.5 / 3 },
    ])
  })

  it('marks Short shadows apart from long ones', () => {
    const [segment] = sunSegments(
      [{ body: 'sun', state: 'hidden', start: '2026-11-12T07:15:00Z', end: '2026-11-12T13:15:00Z', short_shadow: true }],
      START,
      END,
    )
    expect(segment?.kind).toBe('shortShadow')
  })

  it('clips periods that run past the Window and skips Earth periods', () => {
    const segments = sunSegments(
      [
        { body: 'sun', state: 'visible', start: '2026-11-09T00:00:00Z', end: '2026-11-11T00:00:00Z' },
        { body: 'earth', state: 'visible', start: '2026-11-10T00:00:00Z', end: '2026-11-13T00:00:00Z' },
      ],
      START,
      END,
    )
    expect(segments).toEqual([{ kind: 'sunlit', left: 0, width: 1 / 3 }])
  })
})

describe('dayTicks', () => {
  it('lists UTC midnights inside the Window', () => {
    expect(dayTicks(START + 3_600_000, END).map((t) => new Date(t).toISOString())).toEqual([
      '2026-11-11T00:00:00.000Z',
      '2026-11-12T00:00:00.000Z',
    ])
  })
})

describe('axisTicks', () => {
  it('marks the Window start and end, and labels both even when they are not midnights', () => {
    const ticks = axisTicks(START + 3_600_000, END - 3_600_000, 8)
    const edges = ticks.filter((tick) => tick.edge !== null)
    expect(edges.map((tick) => [tick.edge, tick.fraction, tick.label])).toEqual([
      ['start', 0, true],
      ['end', 1, true],
    ])
  })

  it('does not repeat a midnight that is the Window start', () => {
    const ticks = axisTicks(START, END, 8)
    expect(ticks.filter((tick) => tick.ms === START)).toHaveLength(1)
    expect(ticks.filter((tick) => tick.ms === END)).toHaveLength(1)
  })

  it('labels every midnight when there are few of them', () => {
    const midnights = axisTicks(START, END, 8).filter((tick) => tick.edge === null)
    expect(midnights.map((tick) => tick.label)).toEqual([true, true])
  })

  it('thins the labels of a long Window and leaves the midnights unlabelled between them', () => {
    const longEnd = START + 30 * 86_400_000
    const midnights = axisTicks(START, longEnd, 8).filter((tick) => tick.edge === null)
    const labelled = midnights.filter((tick) => tick.label)
    expect(labelled.length).toBeLessThanOrEqual(8)
    expect(labelled.length).toBeLessThan(midnights.length)
  })

  it('skips a midnight label that would sit on the edge label', () => {
    const ticks = axisTicks(START + 3_600_000, START + 3 * 86_400_000, 8)
    const nearStart = ticks.filter((tick) => tick.edge === null && tick.fraction < 0.12)
    expect(nearStart.every((tick) => !tick.label)).toBe(true)
  })
})

describe('bands', () => {
  const periods = [
    { body: 'sun', state: 'visible', start: '2026-11-10T00:00:00Z', end: '2026-11-11T00:00:00Z' },
    { body: 'sun', state: 'hidden', start: '2026-11-11T00:00:00Z', end: '2026-11-11T06:00:00Z', short_shadow: true },
    { body: 'sun', state: 'visible', start: '2026-11-11T06:00:00Z', end: '2026-11-12T00:00:00Z' },
    { body: 'sun', state: 'hidden', start: '2026-11-12T00:00:00Z', end: '2026-11-13T00:00:00Z', short_shadow: false },
    { body: 'earth', state: 'hidden', start: '2026-11-10T00:00:00Z', end: '2026-11-11T12:00:00Z' },
    { body: 'earth', state: 'visible', start: '2026-11-11T12:00:00Z', end: '2026-11-13T00:00:00Z' },
  ]

  it('draws Sun visible and Short shadows on the Sun row and leaves a long shadow as bare track', () => {
    const { sun } = bands(periods, START, END)
    expect(sun.map((band) => band.kind)).toEqual(['sun', 'shortShadow', 'sun'])
    expect(sun[1]!.left).toBeCloseTo(1 / 3, 9)
    expect(sun[1]!.width).toBeCloseTo(1 / 12, 9)
  })

  it('draws only the Earth visible periods on the Earth row', () => {
    const { earth } = bands(periods, START, END)
    expect(earth).toHaveLength(1)
    expect(earth[0]!.left).toBeCloseTo(0.5, 9)
    expect(earth[0]!.width).toBeCloseTo(0.5, 9)
  })
})

describe('sunTotals', () => {
  it('adds up visible and hidden time inside the Window', () => {
    const totals = sunTotals(
      [
        { body: 'sun', state: 'visible', start: '2026-11-09T00:00:00Z', end: '2026-11-11T00:00:00Z' },
        { body: 'sun', state: 'hidden', start: '2026-11-11T00:00:00Z', end: '2026-11-13T00:00:00Z', short_shadow: false },
      ],
      START,
      END,
    )
    expect(totals.visibleMs).toBeCloseTo(24 * 3_600_000, 3)
    expect(totals.hiddenMs).toBeCloseTo(48 * 3_600_000, 3)
  })
})

describe('evenTicks', () => {
  it('spaces the labels evenly and includes both ends of the Window', () => {
    const ticks = evenTicks(START, END, 4)
    expect(ticks).toHaveLength(5)
    expect(ticks[0]).toEqual({ ms: START, fraction: 0 })
    expect(ticks[4]).toEqual({ ms: END, fraction: 1 })
    expect(ticks[2]!.ms).toBe((START + END) / 2)
  })
})
