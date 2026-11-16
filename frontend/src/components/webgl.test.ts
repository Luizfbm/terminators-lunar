import { afterEach, describe, expect, it, vi } from 'vitest'
import { canDraw } from './webgl'
afterEach(() => vi.unstubAllGlobals())
describe('WebGL capability probe', () => {
  it('releases the probe context instead of consuming a GPU slot', () => {
    const loseContext = vi.fn()
    const getContext = vi.fn(() => ({ getExtension: () => ({ loseContext }) }))
    vi.stubGlobal('document', { createElement: () => ({ getContext }) })
    expect(canDraw()).toBe(true)
    expect(getContext).toHaveBeenCalledWith('webgl2')
    expect(loseContext).toHaveBeenCalledOnce()
  })
  it('requires WebGL2 for Three', () => {
    const getContext = vi.fn((kind: string) => kind === 'webgl' ? {} : null)
    vi.stubGlobal('document', { createElement: () => ({ getContext }) })
    expect(canDraw()).toBe(false)
  })
  it('handles unavailable context creation', () => {
    vi.stubGlobal('document', { createElement: () => { throw new Error('unavailable') } })
    expect(canDraw()).toBe(false)
  })
})
