import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n/i18n'
import { dialAngle, DIAL_LETTERS, DIAL_TICKS, facingEighth, onDial } from './compassDial'

describe('the round compass of the view from the ground (the requirement)', () => {
  it('has 24 ticks, one every 15°, the eight on the directions longer', () => {
    expect(DIAL_TICKS).toHaveLength(24)
    expect(DIAL_TICKS.map((tick) => tick.azimuthDeg)).toEqual(Array.from({ length: 24 }, (_, at) => at * 15))
    expect(DIAL_TICKS.filter((tick) => tick.major).map((tick) => tick.azimuthDeg)).toEqual(DIAL_LETTERS)
  })

  it('puts north under the top mark when the view faces north', () => {
    expect(dialAngle(0, 0)).toBe(0)
    const north = onDial(0, 0, 10)
    expect(north.x).toBeCloseTo(0, 9)
    expect(north.y).toBeCloseTo(-10, 9)
    // East on the right hand, as for someone standing facing north.
    expect(onDial(90, 0, 10).x).toBeCloseTo(10, 9)
  })

  it('turns the ring the other way from the view: after looking 30° right, north is 30° to the left', () => {
    expect(dialAngle(0, 30)).toBe(330)
    expect(onDial(0, 30, 10).x).toBeLessThan(0)
  })

  it('has south-west nearest the top mark when the view faces 237°', () => {
    const nearest = DIAL_LETTERS.reduce((best, azimuth) => {
      const away = (angle: number) => Math.min(dialAngle(angle, 237), 360 - dialAngle(angle, 237))
      return away(azimuth) < away(best) ? azimuth : best
    })
    expect(nearest).toBe(225)
    expect(facingEighth(237)).toBe(5)
  })

  it('names the eighth the view faces, wrapping past north', () => {
    expect(facingEighth(0)).toBe(0)
    expect(facingEighth(22.4)).toBe(0)
    expect(facingEighth(22.6)).toBe(1)
    expect(facingEighth(350)).toBe(0)
    expect(facingEighth(-30)).toBe(7)
    expect(facingEighth(720 + 90)).toBe(2)
  })

  it('has the letters and the accessible name in both languages', () => {
    const en = createI18n('en', 'en-GB')
    const pt = createI18n('pt', 'pt-BR')
    expect(DIAL_LETTERS.map((_, at) => en.t(`compass.${at}` as 'compass.0'))).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])
    expect(DIAL_LETTERS.map((_, at) => pt.t(`compass.${at}` as 'compass.0'))).toEqual(['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'])
    expect(en.t('sky.facing', { direction: en.t('direction.5') })).toBe('Looking south-west')
    expect(pt.t('sky.facing', { direction: pt.t('direction.5') })).toBe('Olhando para o sudoeste')
  })
})
