import { describe, expect, it } from 'vitest'
import { DASH_PX, GAP_PX, MIN_GAP_IN_DASHES, dashAlong, dashPattern, onStageLength, type ScreenPoint } from './sunDashes'

/** A path of `count` samples a `step` px apart along a line, as the Sun's path looks straight ahead. */
const line = (count: number, step: number): ScreenPoint[] => Array.from({ length: count }, (_, at) => ({ x: 20 + at * step, y: 200, visible: true }))

describe('the dash pattern (issue 150)', () => {
  it('has the dash and the gap of a stage with room for them when the path shows long', () => {
    const pattern = dashPattern(2000, 1)
    expect(pattern.dashPx).toBe(DASH_PX)
    expect(pattern.gapPx).toBe(GAP_PX)
    expect(pattern.periodPx).toBe(DASH_PX + GAP_PX)
  })

  it('keeps the gap at least two and a half dashes, whatever the length and the density', () => {
    for (const length of [0, 40, 120, 336, 900, 5000, NaN, Infinity]) {
      for (const dpr of [1, 1.25, 1.5, 2, 3, 4, NaN]) {
        const { dashPx, gapPx } = dashPattern(length, dpr)
        expect(gapPx / dashPx).toBeGreaterThanOrEqual(MIN_GAP_IN_DASHES - 1e-9)
      }
    }
  })

  it('tightens a short path a little, so a few dashes still show, but never below 60%', () => {
    const long = dashPattern(5000, 1)
    const short = dashPattern(150, 1)
    expect(short.periodPx).toBeLessThan(long.periodPx)
    expect(short.periodPx).toBeGreaterThanOrEqual(long.periodPx * 0.6 - 1)
    expect(dashPattern(0, 1)).toEqual(dashPattern(-10, 1))
  })

  it('is made of whole device pixels, so it is as sharp on a phone as on a desktop', () => {
    for (const dpr of [1, 1.5, 2, 2.625, 3]) {
      const { dashPx, gapPx } = dashPattern(400, dpr)
      expect(Math.abs(dashPx * dpr - Math.round(dashPx * dpr))).toBeLessThan(1e-9)
      expect(Math.abs(gapPx * dpr - Math.round(gapPx * dpr))).toBeLessThan(1e-9)
      expect(dashPx * dpr).toBeGreaterThanOrEqual(2)
    }
  })

  it('has a gap that does not shrink on a denser screen', () => {
    expect(dashPattern(2000, 3).gapPx).toBeGreaterThanOrEqual(dashPattern(2000, 1).gapPx - 1 / 3)
  })
})

describe('where the dashes fall on the path', () => {
  const pattern = dashPattern(2000, 1)

  it('puts any two dashes a full period apart in the picture, however close the samples are', () => {
    for (const step of [1, 3, 6, 13, 40]) {
      const points = line(400, step)
      const dashes = dashAlong(points, pattern)
      expect(dashes.length).toBeGreaterThan(0)
      dashes.forEach((dash, at) => {
        if (at > 0) expect(points[dash.index].x - points[dashes[at - 1].index].x).toBeGreaterThanOrEqual(pattern.periodPx)
      })
    }
  })

  it('leaves a clear gap between the end of one dash and the start of the next, at every spacing of the samples', () => {
    for (const step of [1.1, 2, 5, 13]) {
      const points = line(600, step)
      const dashes = dashAlong(points, pattern)
      // A dash reaches at most half a dash each way, so the end-to-start gap is the period less a dash.
      const ends = dashes.map((dash) => ({ from: points[dash.index].x - dash.back * step, to: points[dash.index].x + dash.ahead * step }))
      ends.forEach((dash, at) => {
        if (at > 0) expect(dash.from - ends[at - 1].to).toBeGreaterThanOrEqual(pattern.gapPx - 1e-9)
      })
    }
  })

  it('keeps the same gap in pixels where the path is squeezed or stretched by the view, not the same number of degrees', () => {
    const gap = (points: ScreenPoint[]) => {
      const dashes = dashAlong(points, pattern)
      return points[dashes[1].index].x - points[dashes[0].index].x
    }
    // Squeezed: samples 2 px apart, so a dash is every few samples, a period apart.
    expect(gap(line(300, 2))).toBeGreaterThanOrEqual(pattern.periodPx)
    expect(gap(line(300, 2))).toBeLessThan(pattern.periodPx + 2)
    // Stretched: every sample is further than a period apart and carries a dash.
    expect(gap(line(300, 25))).toBeGreaterThanOrEqual(pattern.periodPx)
  })

  it('draws a dash on a sample only, and reaches no further than its neighbours', () => {
    const points = line(100, 13)
    for (const dash of dashAlong(points, pattern)) {
      expect(Number.isInteger(dash.index)).toBe(true)
      expect(dash.back).toBeGreaterThanOrEqual(0)
      expect(dash.back).toBeLessThanOrEqual(1)
      expect(dash.ahead).toBeLessThanOrEqual(1)
    }
  })

  it("makes a dash of the pattern's length where the samples are further apart than a dash", () => {
    const points = line(100, 13)
    const dash = dashAlong(points, pattern)[1]
    expect((dash.back + dash.ahead) * 13).toBeCloseTo(pattern.dashPx, 6)
  })

  it('does not touch the samples it is given: the trajectory is the same before and after', () => {
    const points = line(200, 7).map((point, at) => ({ ...point, y: 200 + Math.sin(at / 9) * 30 }))
    const before = JSON.parse(JSON.stringify(points))
    dashAlong(points, pattern)
    onStageLength(points, 1000, 600)
    expect(points).toEqual(before)
  })

  it('is the same picture, the same dashes, however many times it is asked', () => {
    const points = line(300, 4)
    expect(dashAlong(points, pattern)).toEqual(dashAlong(points, pattern))
  })

  it('breaks the chain at a sample that cannot be drawn and starts again after it, with no dash on it', () => {
    const points = line(200, 13)
    points[100] = { ...points[100], visible: false }
    const dashes = dashAlong(points, pattern)
    expect(dashes.some((dash) => dash.index === 100)).toBe(false)
    expect(dashes.some((dash) => dash.index === 101)).toBe(true)
    // A dash does not reach to the sample that is gone.
    for (const dash of dashes) {
      if (dash.index === 99) expect(dash.ahead).toBe(0)
      if (dash.index === 101) expect(dash.back).toBe(0)
    }
  })

  it('gives no dashes for no path, or for a path that is all behind the eye', () => {
    expect(dashAlong([], pattern)).toEqual([])
    expect(dashAlong(line(10, 13).map((point) => ({ ...point, visible: false })), pattern)).toEqual([])
  })
})

describe('how much of the path is on the stage', () => {
  it('sums the steps whose two ends are on it', () => {
    expect(onStageLength(line(11, 10), 1000, 400)).toBeCloseTo(100, 9)
  })

  it('leaves out the steps that go off it, and those behind the eye', () => {
    const points = line(11, 10)
    expect(onStageLength(points, 70, 400)).toBeCloseTo(50, 9)
    points[5] = { ...points[5], visible: false }
    expect(onStageLength(points, 1000, 400)).toBeCloseTo(80, 9)
  })
})
