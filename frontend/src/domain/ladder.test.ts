import { describe, expect, it } from 'vitest'
import { isPoint, ladderVerdict, sharedDem, type Rung } from './ladder'

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

// Validation check: at a global point the ladder showed 20, 80 and 240 m, but all three rungs read
// LDEM_128 (236.9 m) and gave the same number, so the labels claimed detail the data does not have.
describe('sharedDem', () => {
  const ldem = { product: 'LDEM_128', resolution_m: 236.9 }
  const rungWith = (...dems: { product: string; resolution_m: number }[]) => ({ dems })

  it('names the one DEM when every rung uses it', () => {
    expect(sharedDem([rungWith(ldem), rungWith(ldem), rungWith(ldem)])).toEqual(ldem)
  })

  it('does not care about the order of the DEMs inside a rung, and names the finest of several', () => {
    const polar = { product: 'LDEM_80S_20M', resolution_m: 20 }
    expect(sharedDem([rungWith(ldem, polar), rungWith(polar, ldem)])).toEqual(polar)
  })

  it('is null at the pole, where the rungs read different DEMs', () => {
    const fine = { product: 'LDEM_80S_20M', resolution_m: 20 }
    const coarse = { product: 'LDEM_80S_240M', resolution_m: 240 }
    expect(sharedDem([rungWith(coarse), rungWith(fine)])).toBeNull()
  })

  it('is null when only some rungs share a DEM, or the same product has another resolution', () => {
    const fine = { product: 'LDEM_80S_20M', resolution_m: 20 }
    expect(sharedDem([rungWith(ldem), rungWith(ldem), rungWith(fine)])).toBeNull()
    expect(sharedDem([rungWith(ldem), rungWith({ product: 'LDEM_128', resolution_m: 118 })])).toBeNull()
  })

  it('is null with fewer than two rungs or a rung that names no DEM', () => {
    expect(sharedDem([])).toBeNull()
    expect(sharedDem([rungWith(ldem)])).toBeNull()
    expect(sharedDem([rungWith(), rungWith()])).toBeNull()
  })
})

describe('the one-map sentence', () => {
  it('names the DEM and its real pixel, with the unit glued to the number, in both languages', async () => {
    const { en, pt } = await import('../i18n/catalogue/panels')
    const fill = (text: string) => text.replace('{product}', 'LDEM_128').replace('{resolution}', '237')
    expect(fill(en['ladder.oneMap'])).toBe(
      'Every resolution here uses the same map, LDEM_128, with pixels of about 237\u00a0m, so they all give the same answer. This Site has no finer terrain to compare with.',
    )
    expect(fill(pt['ladder.oneMap'])).toBe(
      'Todas as resoluções aqui usam o mesmo mapa, o LDEM_128, com pixels de cerca de 237\u00a0m, então todas dão a mesma resposta. Este Local não tem relevo mais fino para comparar.',
    )
  })
})
