import { expect, it } from 'vitest'
import { lowGraphics, lightGraphicsSearch } from './graphicsMode'
it('uses light graphics only when requested', () => {
  expect(lowGraphics('')).toBe(false)
  expect(lowGraphics('?graphics=low')).toBe(true)
})
it('keeps the Site and replaces a previous rendering preference', () => {
  const result = lightGraphicsSearch('?site=001&graphics=high')
  expect(result).toBe('?site=001&graphics=low')
  expect(lightGraphicsSearch(result)).toBe(result)
})
