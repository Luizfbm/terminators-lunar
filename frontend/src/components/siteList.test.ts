import { describe, expect, it } from 'vitest'
import { scrollTopToShow } from './siteList'

describe('scrollTopToShow', () => {
  const view = { top: 0, height: 400 }

  // Validation check: the list opened at the top while the chosen Site sat 4,110 px
  // further down. On opening, the chosen Site goes to the middle of the list.
  it('centres the chosen Site when the list opens', () => {
    expect(scrollTopToShow(view, { top: 4110, height: 44 }, true)).toBe(4110 + 22 - 200)
  })

  it('never asks for a negative scroll for a Site near the top', () => {
    expect(scrollTopToShow(view, { top: 44, height: 44 }, true)).toBe(0)
  })

  it('moves the least it can for the arrow keys', () => {
    expect(scrollTopToShow({ top: 100, height: 400 }, { top: 200, height: 44 }, false)).toBe(100)
    expect(scrollTopToShow({ top: 100, height: 400 }, { top: 60, height: 44 }, false)).toBe(60)
    expect(scrollTopToShow({ top: 100, height: 400 }, { top: 480, height: 44 }, false)).toBe(480 + 44 - 400)
  })
})
