import { describe, expect, it } from 'vitest'
import { isUp, statement, type PeriodLike } from './statement'

const at = (stamp: string) => Date.parse(stamp)
const END = at('2026-11-13T00:00:00Z')

const periods: PeriodLike[] = [
  { body: 'sun', state: 'visible', start: '2026-11-10T00:00:00Z', end: '2026-11-10T19:45:00Z' },
  { body: 'sun', state: 'hidden', start: '2026-11-10T19:45:00Z', end: '2026-11-11T08:00:00Z' },
  { body: 'sun', state: 'visible', start: '2026-11-11T08:00:00Z', end: '2026-11-13T00:00:00Z' },
  { body: 'earth', state: 'hidden', start: '2026-11-10T00:00:00Z', end: '2026-11-12T06:00:00Z' },
  { body: 'earth', state: 'visible', start: '2026-11-12T06:00:00Z', end: '2026-11-13T00:00:00Z' },
]
const events = [
  { type: 'sunset', t: '2026-11-10T19:45:00Z' },
  { type: 'sunrise', t: '2026-11-11T08:00:00Z' },
  { type: 'earthrise', t: '2026-11-12T06:00:00Z' },
]

describe('isUp', () => {
  it('reads the period that holds the Cursor, for each body on its own', () => {
    expect(isUp('sun', periods, events, at('2026-11-10T12:00:00Z'))).toBe(true)
    expect(isUp('sun', periods, events, at('2026-11-11T00:00:00Z'))).toBe(false)
    expect(isUp('earth', periods, events, at('2026-11-10T12:00:00Z'))).toBe(false)
    expect(isUp('earth', periods, events, at('2026-11-12T12:00:00Z'))).toBe(true)
  })

  it('counts a Sunset exactly at the Cursor as already happened', () => {
    expect(isUp('sun', periods, events, at('2026-11-10T19:45:00Z'))).toBe(false)
  })

  it('falls back to the last event of that body when no period covers the Cursor', () => {
    expect(isUp('sun', [], events, at('2026-11-10T20:00:00Z'))).toBe(false)
    expect(isUp('sun', [], events, at('2026-11-11T09:00:00Z'))).toBe(true)
    // An Earthrise must not make the Sun count as up.
    expect(isUp('sun', [], [{ type: 'sunset', t: '2026-11-10T19:45:00Z' }, events[2]!], at('2026-11-12T07:00:00Z'))).toBe(false)
  })

  it('takes the body as up when nothing says otherwise', () => {
    expect(isUp('earth', [], [], at('2026-11-10T00:00:00Z'))).toBe(true)
  })
})

describe('statement', () => {
  it('counts to the next Sunset while the Sun is up', () => {
    expect(statement('sun', periods, events, at('2026-11-10T00:00:00Z'), END)).toEqual({ kind: 'sets', event: events[0] })
  })

  it('counts to the sunrise while the Sun is hidden', () => {
    expect(statement('sun', periods, events, at('2026-11-10T22:00:00Z'), END)).toEqual({ kind: 'rises', event: events[1] })
  })

  it('says the Sun stays when no Sunset is left in the Window', () => {
    expect(statement('sun', periods, events, at('2026-11-11T09:00:00Z'), END)).toEqual({ kind: 'stays' })
  })

  it('says the Sun is gone when it is hidden and no sunrise is left', () => {
    const night: PeriodLike[] = [{ body: 'sun', state: 'hidden', start: '2026-11-10T00:00:00Z', end: '2026-11-13T00:00:00Z' }]
    expect(statement('sun', night, [], at('2026-11-10T12:00:00Z'), END)).toEqual({ kind: 'gone' })
  })

  it('handles the Earth with its own events', () => {
    expect(statement('earth', periods, events, at('2026-11-10T00:00:00Z'), END)).toEqual({ kind: 'rises', event: events[2] })
    expect(statement('earth', periods, events, at('2026-11-12T12:00:00Z'), END)).toEqual({ kind: 'stays' })
  })
})
