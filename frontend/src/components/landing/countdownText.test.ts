import { describe, expect, it } from 'vitest'
import type { Interval } from '../../domain/intervals'
import { countdownLine, hoursSpan } from './countdownText'

const H = 3_600_000

describe('the countdown beside the Sun and Earth rows', () => {
  it('says hours to one decimal under 48 h', () => {
    expect(hoursSpan(5.24 * H)).toEqual({ hours: 5.2, days: null })
    expect(hoursSpan(47.9 * H)).toEqual({ hours: 47.9, days: null })
    expect(hoursSpan(0)).toEqual({ hours: 0, days: null })
  })

  it('says whole hours and days to one decimal from 48 h', () => {
    expect(hoursSpan(48 * H)).toEqual({ hours: 48, days: 2 })
    expect(hoursSpan(123.4 * H)).toEqual({ hours: 123, days: 5.1 })
  })

  const end = 100 * H
  const sun: Interval[] = [
    [10 * H, 20 * H],
    [50 * H, end],
  ]

  it('counts to the loss inside a stretch', () => {
    expect(countdownLine(sun, 12 * H, end)).toEqual({ says: 'loses', ms: 8 * H, lost: false })
  })

  it('counts to the return outside a stretch, in the lost colour', () => {
    expect(countdownLine(sun, 30 * H, end)).toEqual({ says: 'back', ms: 20 * H, lost: true })
  })

  it('says "until the end" when the stretch lasts to the end of the Window', () => {
    expect(countdownLine(sun, 60 * H, end)).toEqual({ says: 'untilEnd', ms: 40 * H, lost: false })
  })

  it('reads the very end of the Window as just before it', () => {
    expect(countdownLine(sun, end, end).says).toBe('untilEnd')
  })

  it('says "no return" when nothing starts before the end', () => {
    expect(countdownLine([[0, 10 * H]], 30 * H, end)).toEqual({ says: 'noReturn', ms: null, lost: true })
    expect(countdownLine([], 0, end)).toEqual({ says: 'noReturn', ms: null, lost: true })
  })
})
