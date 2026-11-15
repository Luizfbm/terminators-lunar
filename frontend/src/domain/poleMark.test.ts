import { describe, expect, it } from 'vitest'
import { letterClear, poleMark } from './poleMark'

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

describe('a letter that keeps clear of what is behind the Moon', () => {
  const sun = { x: 300, y: 200, r: 40 }

  it('is clear when nothing is near', () => {
    expect(letterClear({ x: 600, y: 100 }, 20, [sun], [{ left: 0, top: 0, right: 200, bottom: 300 }])).toBe(true)
  })

  it('is not clear when its square touches the disc of the Sun or of the Earth', () => {
    expect(letterClear({ x: 300, y: 150 }, 20, [sun], [])).toBe(false)
    expect(letterClear({ x: 300, y: 150 }, 20, [{ x: 900, y: 0, r: 5 }, sun], [])).toBe(false)
  })

  it('is clear of a disc it only comes near at the corner of its square', () => {
    // The nearest corner of the square is (342, 138): 62 px from the disc's centre, more than its 40 px radius.
    expect(letterClear({ x: 362, y: 118 }, 20, [sun], [])).toBe(true)
  })

  it('is not clear inside the menu, and is clear once it is just outside', () => {
    const menu = { left: 0, top: 0, right: 212, bottom: 380 }
    expect(letterClear({ x: 150, y: 100 }, 20, [], [menu])).toBe(false)
    expect(letterClear({ x: 240, y: 100 }, 20, [], [menu])).toBe(true)
    expect(letterClear({ x: 230, y: 100 }, 20, [], [menu])).toBe(false)
  })
})
