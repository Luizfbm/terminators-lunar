import { describe, expect, it } from 'vitest'
import { wrapFocus } from './details'

describe('wrapFocus', () => {
  it('leaves the browser alone in the middle of the drawer', () => {
    expect(wrapFocus(1, 4, false)).toBeNull()
    expect(wrapFocus(2, 4, true)).toBeNull()
  })

  it('goes round: Tab on the last control to the first, Shift+Tab on the first to the last', () => {
    expect(wrapFocus(3, 4, false)).toBe(0)
    expect(wrapFocus(0, 4, true)).toBe(3)
  })

  it('brings a focus that is outside every control back in', () => {
    expect(wrapFocus(-1, 4, false)).toBe(0)
    expect(wrapFocus(-1, 4, true)).toBe(3)
  })

  it('does nothing in a drawer with no control', () => {
    expect(wrapFocus(-1, 0, false)).toBeNull()
  })

  it('keeps a single control where it is', () => {
    expect(wrapFocus(0, 1, false)).toBe(0)
    expect(wrapFocus(0, 1, true)).toBe(0)
  })
})
