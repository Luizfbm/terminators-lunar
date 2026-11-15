import { describe, expect, it } from 'vitest'
import { latitudeOf } from './Sheet'

describe('the Classroom figure in the link', () => {
  it('is closed without the parameter', () => {
    expect(latitudeOf(null)).toBeNull()
  })

  it('reopens at the latitude the link carries', () => {
    expect(latitudeOf('30')).toBe(30)
    expect(latitudeOf('88.5')).toBe(88.5)
    expect(latitudeOf('0')).toBe(0)
  })

  it('opens at the pole when the latitude in the link is not one', () => {
    for (const bad of ['', ' ', 'abc', '-1', '91', 'Infinity']) expect(latitudeOf(bad), bad).toBe(90)
  })
})
