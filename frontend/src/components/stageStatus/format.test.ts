import { describe, expect, it } from 'vitest'
import { limitText, placeText } from './format'
import { STRINGS } from './strings'

describe('the words of a landing on the stage', () => {
  it('names the Site the click snapped to', () => {
    expect(placeText({ lat: 0.674, lon: 23.473 }, 'Apollo 11 (Tranquility Base)', 'en')).toBe('Apollo 11 (Tranquility Base)')
  })

  it('gives a free point as its coordinate, with the hemispheres of each language', () => {
    expect(placeText({ lat: -81.2345, lon: -10.5 }, null, 'en')).toBe('81.23° S, 10.5° W')
    expect(placeText({ lat: 12.5, lon: 170.25 }, null, 'pt')).toBe('12.5° N, 170.25° L')
  })

  // The limit comes from /meta, so it follows the server when it opens up the whole Moon.
  it('says the limit of a custom Site as /meta gives it, whatever it is', () => {
    expect(limitText(-80, 'en')).toBe('80°\u00a0S')
    expect(limitText(-60, 'pt')).toBe('60°\u00a0S')
    expect(limitText(90, 'en')).toBe('90°\u00a0N')
  })

  // Regression (2026-11-15): Back came in English only, whatever the language of the page.
  it('has Back, "Land" and the missions in Portuguese too, and not as a copy of the English', () => {
    for (const key of ['back', 'land', 'landHere', 'landAt', 'missions', 'cancel', 'retry'] as const) {
      expect(STRINGS.pt[key], key).not.toBe('')
      expect(STRINGS.pt[key], key).not.toBe(STRINGS.en[key])
    }
    expect(STRINGS.pt.back).toBe('Voltar')
  })

  it('has the same words in both languages, with the same placeholders', () => {
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
      expect(holes(STRINGS.pt[key]), key).toEqual(holes(STRINGS.en[key]))
    }
  })
})
