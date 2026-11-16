import { describe, expect, it } from 'vitest'
import { timeAtPointer } from './timelinePointer'

describe('landing timeline uses the plot rather than the label column', () => {
  it('maps the visible beginning, midpoint and end to the Window', () => {
    // Track starts at x=100, its 56 px label precedes the 600 px plot.
    expect(timeAtPointer(156, 156, 600, 1000, 4600)).toBe(1000)
    expect(timeAtPointer(456, 156, 600, 1000, 4600)).toBe(2800)
    expect(timeAtPointer(756, 156, 600, 1000, 4600)).toBe(4600)
  })
  it('clamps dragging beyond the plot', () => {
    expect(timeAtPointer(100, 156, 600, 1000, 4600)).toBe(1000)
    expect(timeAtPointer(900, 156, 600, 1000, 4600)).toBe(4600)
  })
  it('does not divide by zero while the view is hidden', () => {
    expect(timeAtPointer(100, 100, 0, 1000, 4600)).toBe(1000)
  })
})
