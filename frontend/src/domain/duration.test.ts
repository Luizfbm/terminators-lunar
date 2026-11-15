import { describe, expect, it } from 'vitest'
import { splitDuration, splitSpan } from './duration'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('splitDuration', () => {
  it('keeps the minutes next to the hours', () => {
    expect(splitDuration(19 * HOUR + 45 * MINUTE)).toEqual({ hours: 19, minutes: 45 })
  })

  it('reports zero hours below one hour', () => {
    expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 })
    expect(splitDuration(45 * MINUTE)).toEqual({ hours: 0, minutes: 45 })
    expect(splitDuration(59 * MINUTE + 59_000)).toEqual({ hours: 0, minutes: 59 })
  })

  it('rounds down to the whole minute', () => {
    expect(splitDuration(HOUR + 30_000)).toEqual({ hours: 1, minutes: 0 })
  })

  it('treats a negative duration as zero', () => {
    expect(splitDuration(-5 * MINUTE)).toEqual({ hours: 0, minutes: 0 })
  })
})

describe('splitSpan', () => {
  it('breaks a long wait into days, hours and minutes', () => {
    expect(splitSpan(38 * HOUR + 12 * MINUTE)).toEqual({ days: 1, hours: 14, minutes: 12 })
    expect(splitSpan(23 * HOUR + 59 * MINUTE)).toEqual({ days: 0, hours: 23, minutes: 59 })
  })

  it('counts a negative span as zero', () => {
    expect(splitSpan(-HOUR)).toEqual({ days: 0, hours: 0, minutes: 0 })
  })
})
