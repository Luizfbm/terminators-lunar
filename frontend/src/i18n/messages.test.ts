import { describe, expect, it } from 'vitest'
import { en, pt } from './messages'

describe('the message catalogues', () => {
  // Validation check: two error messages told the public about an "id".
  it('never show the word "id" to the public', () => {
    for (const catalogue of [en, pt]) {
      for (const [key, text] of Object.entries(catalogue)) {
        expect(text, key).not.toMatch(/\bids?\b/i)
      }
    }
  })

  // Validation check: a number could end a line and leave its unit on the next.
  it('keep every number glued to its unit', () => {
    for (const catalogue of [en, pt]) {
      expect(catalogue['duration.daysHours']).toMatch(/\{days\}\u00a0d/)
      expect(catalogue['duration.daysHours']).toMatch(/\{hours\}\u00a0h/)
      expect(catalogue['distance.km']).toMatch(/\{value\}\u00a0km/)
      expect(catalogue['duration.hoursMinutes']).toMatch(/\{hours\}\u00a0h/)
      expect(catalogue['duration.hoursMinutes']).toMatch(/\{minutes\}\u00a0min/)
      expect(catalogue['duration.minutes']).toMatch(/\{value\}\u00a0min/)
    }
  })

  it('have the same placeholders in both languages', () => {
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(holes(pt[key]), key).toEqual(holes(en[key]))
    }
  })
})
