import { describe, expect, it } from 'vitest'
import { nextSunset } from './sunset'

const WINDOW_START = Date.parse('2026-11-10T00:00:00Z')
const WINDOW_END = Date.parse('2026-11-13T00:00:00Z')

const events = [
  { type: 'sunset', t: '2026-11-10T19:45:00Z' },
  { type: 'sunrise', t: '2026-11-11T15:30:00Z' },
  { type: 'earthset', t: '2026-11-12T03:15:00Z' },
  { type: 'sunset', t: '2026-11-12T07:15:00Z' },
  { type: 'sunrise', t: '2026-11-12T13:15:00Z' },
]

describe('nextSunset', () => {
  it('picks the only Sunset ahead of the Cursor when one is left', () => {
    const cursor = Date.parse('2026-11-12T08:00:00Z')
    const sunset = nextSunset([{ type: 'sunset', t: '2026-11-12T19:00:00Z' }], cursor, WINDOW_END)
    expect(sunset?.t).toBe('2026-11-12T19:00:00Z')
  })

  it('picks the earliest of several Sunsets ahead of the Cursor', () => {
    const sunset = nextSunset(events, WINDOW_START, WINDOW_END)
    expect(sunset?.t).toBe('2026-11-10T19:45:00Z')
  })

  it('skips Sunsets already past and returns the next one', () => {
    const cursor = Date.parse('2026-11-10T20:00:00Z')
    const sunset = nextSunset(events, cursor, WINDOW_END)
    expect(sunset?.t).toBe('2026-11-12T07:15:00Z')
  })

  it('returns null when no Sunset falls inside the Window', () => {
    const cursor = Date.parse('2026-11-12T08:00:00Z')
    const windowEnd = Date.parse('2026-11-12T12:00:00Z')
    expect(nextSunset(events, cursor, windowEnd)).toBeNull()
  })

  it('returns null when the Window has no Sunset at all', () => {
    const sunrises = events.filter((event) => event.type === 'sunrise')
    expect(nextSunset(sunrises, WINDOW_START, WINDOW_END)).toBeNull()
  })

  it('skips a Sunset that is exactly at the Cursor', () => {
    const cursor = Date.parse('2026-11-10T19:45:00Z')
    const sunset = nextSunset(events, cursor, WINDOW_END)
    expect(sunset?.t).toBe('2026-11-12T07:15:00Z')
  })

  it('ignores a Sunset that is exactly at the end of the Window', () => {
    const windowEnd = Date.parse('2026-11-10T19:45:00Z')
    expect(nextSunset(events, WINDOW_START, windowEnd)).toBeNull()
  })
})
