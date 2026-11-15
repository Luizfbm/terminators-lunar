import { describe, expect, it } from 'vitest'
import { en, errorKey, fill, pt, text, type HazardKey } from './strings'

const keys = Object.keys(en) as HazardKey[]
const placeholders = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the inspector’s words', () => {
  it('has every key in both languages, and nothing extra', () => {
    expect(Object.keys(pt).sort()).toEqual([...keys].sort())
  })

  it('fills the same placeholders in both languages', () => {
    for (const key of keys) expect(placeholders(pt[key]), key).toEqual(placeholders(en[key]))
  })

  it('has no empty text', () => {
    for (const key of keys) {
      expect(en[key].trim(), key).not.toBe('')
      expect(pt[key].trim(), key).not.toBe('')
    }
  })

  it('names the two variants as the requirement does, and only those', () => {
    expect(text('en', 'hazard.normal')).toBe('Normal navigation')
    expect(text('en', 'hazard.multi')).toBe('Multiresolution')
    expect(text('pt', 'hazard.normal')).toBe('Navegação Normal')
    expect(text('pt', 'hazard.multi')).toBe('Multirresolução')
  })

  it('never uses the words the requirement rules out', () => {
    const all = [...keys.map((key) => en[key]), ...keys.map((key) => pt[key])].join('\n')
    expect(all).not.toMatch(/Marcato/i)
    expect(all).not.toMatch(/\b(Sem|Com) Tese\b/i)
    expect(all).not.toMatch(/\b(with|without) thesis\b/i)
    expect(all).not.toMatch(/\bAI\b|\bIA\b|artificial intelligence|inteligência artificial|machine learning/i)
  })

  it('says the numbers belong to the grid and its distance, not to the Site’s point', () => {
    const params = { grid: 'DM1', distance: '1.3' }
    expect(text('en', 'hazard.ownership', params)).toBe(
      'These numbers belong to grid DM1, whose centre is 1.3 km from the Site. They are not the Site’s own point.',
    )
    expect(text('pt', 'hazard.ownership', { grid: 'DM1', distance: '1,3' })).toBe(
      'Estes números são da grade DM1, cujo centro está a 1,3 km do Local. Não são do ponto do próprio Local.',
    )
  })

  it('uses the glossary’s words for the Site and the Confidence level', () => {
    expect(text('en', 'hazard.levelLabel')).toBe('Confidence level')
    expect(text('pt', 'hazard.legendSite')).toBe('Local')
    expect(text('en', 'hazard.legendSite')).toBe('Site')
  })

  it('leaves a placeholder alone when it has no value', () => {
    expect(fill('{a} and {b}', { a: 'x' })).toBe('x and {b}')
  })

  it('has a message for each problem the API or the page can report, in both languages', () => {
    for (const code of ['network', 'no_hazard_grid', 'decode', 'busy', 'something_else']) {
      for (const locale of ['en', 'pt'] as const) expect(text(locale, errorKey(code)).length).toBeGreaterThan(10)
    }
    expect(errorKey('no_hazard_grid')).toBe('hazard.error.no_hazard_grid')
    expect(errorKey('network')).toBe('hazard.error.network')
    expect(errorKey('busy')).toBe('hazard.error.unknown')
  })
})
