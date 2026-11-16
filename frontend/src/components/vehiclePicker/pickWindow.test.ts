import { describe, expect, it } from 'vitest'
import { checkPickWindow, inputBounds, toChoiceWindow, toLocalInput } from './pickWindow'
import { wrapIndex } from './vehicles'

const coverage = { window_min: '2023-08-01T00:00:00Z', window_max: '2032-12-31T23:59:59Z', max_duration_hours: 1440 }

// The inputs are local time, so every one is built from a known UTC instant: the tests pass in any
// time zone. The instants stay clear of the usual daylight-saving change days.
const at = (y: number, month: number, d: number, hh = 0, mm = 0) => toLocalInput(Date.UTC(y, month - 1, d, hh, mm))

describe('the Window from the picked start and end', () => {
  it('goes to the Query in UTC, with the length in hours, fractional when the minutes are', () => {
    expect(toChoiceWindow(at(2026, 6, 10, 14, 30), at(2026, 6, 11, 2, 0))).toEqual({ startDay: '2026-06-10', startTime: '14:30', hours: 11.5 })
    expect(toChoiceWindow(at(2026, 1, 5), at(2026, 1, 6))).toEqual({ startDay: '2026-01-05', startTime: '00:00', hours: 24 })
  })

  it('takes exactly 60 days, the longest the engine takes, and refuses one minute more', () => {
    expect(toChoiceWindow(at(2026, 1, 5, 12), at(2026, 3, 6, 12)).hours).toBe(1440)
    expect(checkPickWindow(at(2026, 1, 5, 12), at(2026, 3, 6, 12), coverage)).toBeNull()
    expect(checkPickWindow(at(2026, 1, 5, 12), at(2026, 3, 6, 12, 1), coverage)).toBe('too_long')
  })

  it('needs the end strictly after the start', () => {
    expect(checkPickWindow(at(2026, 6, 10, 14), at(2026, 6, 10, 14), coverage)).toBe('order')
    expect(checkPickWindow(at(2026, 6, 10, 14), at(2026, 6, 10, 13, 59), coverage)).toBe('order')
    expect(checkPickWindow(at(2026, 6, 10, 14), at(2026, 6, 10, 14, 1), coverage)).toBeNull()
  })

  it('asks for both when one is empty or is not a datetime-local value', () => {
    expect(checkPickWindow('', at(2026, 6, 10), coverage)).toBe('missing')
    expect(checkPickWindow(at(2026, 6, 10), '', coverage)).toBe('missing')
    expect(checkPickWindow('2026-06-10', at(2026, 6, 11), coverage)).toBe('missing')
    expect(checkPickWindow('2026-06-10T14:00:00', at(2026, 6, 11), coverage)).toBe('missing')
  })

  it('treats a date or time that does not exist as missing, not as the one Date rolls it over to', () => {
    expect(checkPickWindow('2024-02-30T10:00', '2024-03-05T10:00', coverage)).toBe('missing')
    expect(checkPickWindow('2024-02-28T24:00', '2024-03-05T10:00', coverage)).toBe('missing')
    expect(checkPickWindow('2024-02-28T10:60', '2024-03-05T10:00', coverage)).toBe('missing')
    expect(checkPickWindow('2024-02-29T10:00', '2024-03-05T10:00', coverage)).toBeNull()
  })

  it('refuses a start before the coverage', () => {
    expect(checkPickWindow(at(2023, 7, 31, 23, 59), at(2023, 8, 2), coverage)).toBe('outside')
    expect(checkPickWindow(at(2023, 8, 1), at(2023, 8, 2), coverage)).toBeNull()
  })

  it('refuses an end after the coverage, as the backend would with a 422', () => {
    expect(checkPickWindow(at(2032, 12, 30), at(2033, 1, 1), coverage)).toBe('outside')
    expect(checkPickWindow(at(2032, 12, 30), at(2032, 12, 31, 23, 59), coverage)).toBeNull()
  })

  it('checks in order: missing, order, outside, too long', () => {
    expect(checkPickWindow('', at(2023, 7, 1), coverage)).toBe('missing')
    expect(checkPickWindow(at(2023, 7, 31), at(2023, 7, 30), coverage)).toBe('order')
    expect(checkPickWindow(at(2023, 7, 1), at(2023, 12, 31), coverage)).toBe('outside')
  })
})

describe('the bounds of the inputs', () => {
  it('are the coverage ends in local time, to the minute', () => {
    expect(inputBounds(coverage)).toEqual({ min: at(2023, 8, 1), max: at(2032, 12, 31, 23, 59) })
  })

  it('round min up and max down, so both stay inside the coverage', () => {
    const odd = { ...coverage, window_min: '2023-08-01T00:00:30Z', window_max: '2032-12-31T23:59:30Z' }
    expect(inputBounds(odd)).toEqual({ min: at(2023, 8, 1, 0, 1), max: at(2032, 12, 31, 23, 59) })
  })

  it('are accepted as a start and an end', () => {
    const { min, max } = inputBounds(coverage)
    expect(checkPickWindow(min, at(2023, 8, 2), coverage)).toBeNull()
    expect(checkPickWindow(at(2032, 12, 30), max, coverage)).toBeNull()
  })
})

describe('a UTC instant as an input value', () => {
  it('reads back as the same instant', () => {
    const ms = Date.UTC(2026, 5, 10, 14, 30)
    expect(toLocalInput(ms)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(toChoiceWindow(toLocalInput(ms), toLocalInput(ms + 3_600_000))).toEqual({ startDay: '2026-06-10', startTime: '14:30', hours: 1 })
  })
})

describe('stepping through the vehicles', () => {
  it('goes round at both ends', () => {
    expect(wrapIndex(-1, 3)).toBe(2)
    expect(wrapIndex(3, 3)).toBe(0)
    expect(wrapIndex(1, 3)).toBe(1)
  })
})
