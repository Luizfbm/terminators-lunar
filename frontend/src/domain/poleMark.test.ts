import { describe, expect, it } from 'vitest'
import { poleMark, visibleRuns } from './poleMark'

const centre = { x: 400, y: 300 }

describe('the mark of a pole on the stage', () => {
  it('draws the letter, and a dot on the Moon, for a pole that faces the eye', () => {
    const mark = poleMark({ x: 400, y: 190 }, { x: 400, y: 171 }, true, 0.5, centre, 180)!
    expect(mark.letter).toEqual({ x: 400, y: 171 })
    expect(mark.dot).toEqual({ x: 400, y: 190 })
    expect(mark.opacity).toBe(1)
  })

  it('keeps the letter, with no dot, for a pole behind the Moon whose letter is still outside the disc', () => {
    const mark = poleMark({ x: 400, y: 130 }, { x: 400, y: 88 }, false, -0.1, centre, 180)!
    expect(mark.dot).toBeNull()
    expect(mark.letter).toEqual({ x: 400, y: 88 })
    expect(mark.opacity).toBe(1)
  })

  it('fades the letter once the pole is well behind', () => {
    expect(poleMark({ x: 400, y: 130 }, { x: 400, y: 70 }, false, -0.5, centre, 180)!.opacity).toBe(0.6)
  })

  it('draws nothing for a pole behind the Moon whose letter is hidden by the disc', () => {
    expect(poleMark({ x: 400, y: 280 }, { x: 400, y: 275 }, false, -0.99, centre, 180)).toBeNull()
  })

  it('draws nothing when the camera is inside the Moon, where there is no disc', () => {
    expect(poleMark({ x: 400, y: 190 }, { x: 400, y: 171 }, true, 0.5, centre, Infinity)).toBeNull()
  })

  it('does not depend on any Site: the same pole and camera give the same mark', () => {
    const a = poleMark({ x: 400, y: 190 }, { x: 400, y: 171 }, true, 0.5, centre, 180)
    const b = poleMark({ x: 400, y: 190 }, { x: 400, y: 171 }, true, 0.5, centre, 180)
    expect(a).toEqual(b)
  })
})

describe('the visible half of the Equator', () => {
  const at = (n: number) => ({ x: n, y: 0 })

  it('splits where the circle goes behind the Moon', () => {
    const runs = visibleRuns([0, 1, 2, 3, 4, 5].map(at), [false, true, true, false, true, false])
    expect(runs.map((run) => run.map((p) => p.x))).toEqual([[1, 2], [4]])
  })

  it('joins the run that wraps past the end of the circle to the one at its start', () => {
    const runs = visibleRuns([0, 1, 2, 3, 4, 5].map(at), [true, true, false, false, true, true])
    expect(runs.map((run) => run.map((p) => p.x))).toEqual([[4, 5, 0, 1]])
  })

  it('is empty with the whole Equator behind', () => {
    expect(visibleRuns([0, 1].map(at), [false, false])).toEqual([])
  })
})
