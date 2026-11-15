import { describe, expect, it } from 'vitest'
import { readLink, writeLink } from '../../../domain/query'

describe('the Landing scatter radius in the link', () => {
  it('comes back from the link it was written to', () => {
    const state = { ...readLink('?site=001&stats=1'), radiusM: 500 }
    const link = writeLink(state)
    expect(new URLSearchParams(link).get('radius')).toBe('500')
    expect(readLink(link)).toEqual(state)
  })

  it('leaves the default out and refuses a radius the API would refuse', () => {
    expect(writeLink({ ...readLink('?site=001'), radiusM: null })).toBe('?site=001')
    expect(readLink('?radius=39').radiusM).toBeUndefined()
    expect(readLink('?radius=1001').radiusM).toBeUndefined()
    expect(readLink('?radius=').radiusM).toBeUndefined()
    expect(readLink('?radius=1000').radiusM).toBe(1000)
  })

  // The App rewrites the whole link whenever its own state changes; the panel's radius must survive it.
  it('survives a rewrite by the App, which keeps what it does not own', () => {
    const before = '?site=001&radius=100'
    const rewritten = writeLink({ ...readLink(before), site: 'CR05', view: 'map' })
    expect(readLink(rewritten).radiusM).toBe(100)
    expect(readLink(rewritten).site).toBe('CR05')
  })
})
