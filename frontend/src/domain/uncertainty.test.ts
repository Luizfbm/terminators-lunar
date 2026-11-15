import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n/i18n'
import {
  DEFAULT_RETRY_SECONDS,
  GIVE_UP_MS,
  matchBand,
  nextPoll,
  parseRetryAfter,
  rangeText,
  spreadOf,
  spreadText,
  START_TRACK,
  type EventBand,
  type PollTrack,
} from './uncertainty'

const en = createI18n('en', 'en-GB')
const pt = createI18n('pt', 'pt-BR')

const band = (type: EventBand['type'], t: string, extra: Partial<EventBand> = {}): EventBand => ({
  type,
  t,
  clones_with_event: 32,
  ...extra,
})

describe('matchBand', () => {
  const sunset = band('sunset', '2026-11-20T16:21:00Z')
  const earthset = band('earthset', '2026-11-30T03:45:00Z')

  it('takes the band at the Event’s own position', () => {
    expect(matchBand([sunset, earthset], { type: 'earthset', t: '2026-11-30T03:45:00Z' }, 1)).toBe(earthset)
  })

  it('finds the band by type and instant when the lists have drifted apart', () => {
    expect(matchBand([earthset, sunset], { type: 'sunset', t: '2026-11-20T16:21:00Z' }, 0)).toBe(sunset)
  })

  it('compares instants, not spellings', () => {
    expect(matchBand([sunset], { type: 'sunset', t: '2026-11-20T16:21:00.000Z' }, 0)).toBe(sunset)
  })

  it('gives nothing for an Event no band is about: the same type at another time, or another type at the same time', () => {
    expect(matchBand([sunset], { type: 'sunset', t: '2026-11-21T16:21:00Z' }, 0)).toBeNull()
    expect(matchBand([sunset], { type: 'sunrise', t: '2026-11-20T16:21:00Z' }, 0)).toBeNull()
    expect(matchBand([], { type: 'sunset', t: '2026-11-20T16:21:00Z' }, 0)).toBeNull()
  })
})

describe('spreadOf', () => {
  const window = { earliest: '2026-11-20T14:10:00Z', latest: '2026-11-20T15:30:00Z' }

  it('is a window while at least half the clones have the Event', () => {
    expect(spreadOf(band('sunset', '2026-11-20T15:00:00Z', window), 32)).toEqual({
      kind: 'window',
      earliestMs: Date.parse(window.earliest),
      latestMs: Date.parse(window.latest),
    })
    // Exactly half still counts as "most of the time it happens".
    expect(spreadOf(band('sunset', '2026-11-20T15:00:00Z', { ...window, clones_with_event: 16 }), 32)?.kind).toBe('window')
  })

  it('says the Event may not happen when fewer than half the clones have it, window or not', () => {
    const spread = { kind: 'maybe', withEvent: 9, clones: 32 }
    expect(spreadOf(band('sunset', '2026-11-20T15:00:00Z', { clones_with_event: 9 }), 32)).toEqual(spread)
    expect(spreadOf(band('sunset', '2026-11-20T15:00:00Z', { ...window, clones_with_event: 9 }), 32)).toEqual(spread)
    expect(spreadOf(band('sunset', '2026-11-20T15:00:00Z', { clones_with_event: 15 }), 32)?.kind).toBe('maybe')
  })

  it('has nothing to say when the window is missing although most clones have the Event', () => {
    expect(spreadOf(band('sunset', '2026-11-20T15:00:00Z'), 32)).toBeNull()
    expect(spreadOf(band('sunset', '2026-11-20T15:00:00Z', { earliest: window.earliest }), 32)).toBeNull()
  })

  it('keeps the earlier end first', () => {
    const spread = spreadOf(band('sunset', '2026-11-20T15:00:00Z', { earliest: window.latest, latest: window.earliest }), 32)
    expect(spread).toMatchObject({ earliestMs: Date.parse(window.earliest), latestMs: Date.parse(window.latest) })
  })
})

describe('spreadText', () => {
  const nominal = Date.parse('2026-11-20T15:00:00Z')
  const window = (earliest: string, latest: string) =>
    ({ kind: 'window', earliestMs: Date.parse(earliest), latestMs: Date.parse(latest) }) as const

  it('says the window in English', () => {
    expect(spreadText(en, window('2026-11-20T14:10:00Z', '2026-11-20T15:30:00Z'), nominal)).toBe(
      'between 14:10 and 15:30 with the map’s height error',
    )
  })

  it('says the window in Portuguese', () => {
    expect(spreadText(pt, window('2026-11-20T14:10:00Z', '2026-11-20T15:30:00Z'), nominal)).toBe(
      'entre 14:10 e 15:30 com o erro de altura do mapa',
    )
  })

  it('names the day of an end that falls on another UTC day than the Event', () => {
    expect(spreadText(en, window('2026-11-20T23:10:00Z', '2026-11-21T00:30:00Z'), Date.parse('2026-11-20T23:50:00Z'))).toBe(
      'between 23:10 and 21 Nov, 00:30 with the map’s height error',
    )
  })

  it('does not say "between 15:00 and 15:00" when both ends fall in the same minute', () => {
    const text = spreadText(en, window('2026-11-20T15:00:10Z', '2026-11-20T15:00:40Z'), nominal)
    expect(text).toBe('around 15:00 with the map’s height error')
    expect(spreadText(pt, window('2026-11-20T15:00:10Z', '2026-11-20T15:00:40Z'), nominal)).toBe(
      'por volta de 15:00 com o erro de altura do mapa',
    )
  })

  it('says the Event may not happen at all, with how many versions of the terrain have it', () => {
    const maybe = { kind: 'maybe', withEvent: 9, clones: 32 } as const
    expect(spreadText(en, maybe, nominal)).toBe(
      'with the map’s height error it may not happen at all: only in 9 of 32 versions of the terrain',
    )
    expect(spreadText(pt, maybe, nominal)).toBe(
      'com o erro de altura do mapa, pode nem acontecer: só em 9 de 32 versões do relevo',
    )
  })

  it('says it in words when no version has the Event', () => {
    const none = { kind: 'maybe', withEvent: 0, clones: 32 } as const
    expect(spreadText(en, none, nominal)).toBe('with the map’s height error it may not happen at all: in none of 32 versions of the terrain')
    expect(spreadText(pt, none, nominal)).toBe('com o erro de altura do mapa, pode nem acontecer: em nenhuma das 32 versões do relevo')
  })
})

describe('rangeText', () => {
  it('gives hours in the span the table already uses', () => {
    // Numbers keep to their units with a no-break space; the test reads them as plain spaces.
    const plain = (text: string) => text.replaceAll(' ', ' ')
    expect(plain(rangeText(en, 'sunlit_hours', { low: 705.25, high: 708.5 }))).toBe('with the map’s height error: 29 d 9 h to 29 d 12 h')
    expect(plain(rangeText(pt, 'lcsp_hours', { low: 0, high: 2.25 }))).toBe('com o erro de altura do mapa: 0 min a 2 h 15 min')
  })

  it('gives the mean Sun fraction as a percentage with a decimal, since the band is often narrower than a whole percent', () => {
    expect(rangeText(en, 'mean_sun_fraction', { low: 0.996, high: 1 })).toBe('with the map’s height error: 99.6% to 100%')
    expect(rangeText(pt, 'mean_sun_fraction', { low: 0.996, high: 1 })).toBe('com o erro de altura do mapa: 99,6% a 100%')
  })
})

describe('parseRetryAfter', () => {
  it('reads whole seconds', () => {
    expect(parseRetryAfter('7')).toBe(7)
    expect(parseRetryAfter(' 12 ')).toBe(12)
  })

  it('has nothing for a header the browser could not read, a zero or a date', () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('0')).toBeNull()
    expect(parseRetryAfter('')).toBeNull()
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull()
  })
})

describe('nextPoll', () => {
  it('waits what the server asked', () => {
    expect(nextPoll(START_TRACK, 0, 2)?.delayMs).toBe(2000)
    expect(nextPoll(START_TRACK, 0, null)?.delayMs).toBe(DEFAULT_RETRY_SECONDS * 1000)
  })

  it('keeps the wait while clones keep coming in', () => {
    let track: PollTrack = START_TRACK
    for (const done of [0, 4, 9, 15]) {
      const next = nextPoll(track, done, 3)
      expect(next?.delayMs).toBe(3000)
      track = next!.track
    }
  })

  it('stretches the wait by half again for every ask that brings no new clone, up to 30 s', () => {
    let track: PollTrack = START_TRACK
    const delays: number[] = []
    for (let i = 0; i < 8; i++) {
      const next = nextPoll(track, 12, 5)!
      delays.push(next.delayMs)
      track = next.track
    }
    // The first ask is progress (from nothing to 12); the rest are stalls.
    expect(delays).toEqual([5000, 7500, 11250, 16875, 25313, 30000, 30000, 30000])
  })

  it('goes back to the server’s wait as soon as a clone comes in', () => {
    let track: PollTrack = START_TRACK
    for (let i = 0; i < 4; i++) track = nextPoll(track, 12, 5)!.track
    expect(nextPoll(track, 13, 5)?.delayMs).toBe(5000)
  })

  it('stops asking once the waits add up to the give-up time, and not before', () => {
    let track: PollTrack = START_TRACK
    let waited = 0
    let asks = 0
    for (;;) {
      const next = nextPoll(track, 12, 5)
      if (!next) break
      waited += next.delayMs
      track = next.track
      asks += 1
      expect(asks).toBeLessThan(1000)
    }
    expect(waited).toBeLessThanOrEqual(GIVE_UP_MS)
    expect(waited).toBeGreaterThan(GIVE_UP_MS - 30_000)
  })
})
