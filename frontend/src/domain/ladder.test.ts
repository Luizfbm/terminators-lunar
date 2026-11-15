import { describe, expect, it } from 'vitest'
import { isPoint, ladderVerdict, type Rung } from './ladder'

const rung = (resolution_m: number, sunset: string | null, earthset: string | null = null): Rung => ({
  resolution_m,
  next_sunset: sunset === null ? null : { t: sunset },
  next_earthset: earthset === null ? null : { t: earthset },
})

describe('ladderVerdict', () => {
  it('measures the coarsest rung against the finest, whatever order they come in', () => {
    // CR05 from 2026-11-14, the contract's example: 240 m sets 5 h 44 min after 20 m.
    const verdict = ladderVerdict([
      rung(20, '2026-11-21T00:55:26Z'),
      rung(240, '2026-11-21T06:39:40Z'),
      rung(80, '2026-11-21T02:47:20Z'),
    ])
    expect(verdict).toEqual({ kind: 'later', event: 'sunset', ms: (5 * 3600 + 44 * 60 + 14) * 1000, coarse: 240, fine: 20 })
  })

  it('says earlier when the coarse terrain hides the Sun first', () => {
    const verdict = ladderVerdict([rung(240, '2026-11-21T00:00:00Z'), rung(20, '2026-11-21T02:00:00Z')])
    expect(verdict).toMatchObject({ kind: 'earlier', ms: 7_200_000 })
  })

  it('calls Sunsets under a minute apart the same', () => {
    const verdict = ladderVerdict([rung(240, '2026-11-21T00:00:40Z'), rung(20, '2026-11-21T00:00:00Z')])
    expect(verdict).toEqual({ kind: 'same', event: 'sunset' })
  })

  it('falls back to the Earthset when no rung has a Sunset', () => {
    // Site 001 in late November: the Sun never sets, the Earth does.
    const verdict = ladderVerdict([
      rung(240, null, '2026-11-30T06:06:49Z'),
      rung(20, null, '2026-11-30T06:08:29Z'),
    ])
    expect(verdict).toMatchObject({ kind: 'earlier', event: 'earthset', ms: 100_000 })
  })

  it('says which rung alone has the Sunset', () => {
    expect(ladderVerdict([rung(240, null), rung(20, '2026-11-21T00:00:00Z')])).toEqual({
      kind: 'only',
      event: 'sunset',
      resolution: 20,
    })
  })

  it('has nothing to compare without events or without two rungs', () => {
    expect(ladderVerdict([rung(240, null), rung(20, null)])).toEqual({ kind: 'none' })
    expect(ladderVerdict([rung(20, '2026-11-21T00:00:00Z')])).toEqual({ kind: 'none' })
  })
})

describe('isPoint', () => {
  it('is true only when the spread is under the shown precision', () => {
    expect(isPoint({ min: 0, max: 0 }, 1 / 60)).toBe(true)
    expect(isPoint({ min: 436.1, max: 442.2 }, 1 / 60)).toBe(false)
  })
})
