import { describe, expect, it } from 'vitest'
import { en, pt, roverText, type RoverKey } from './strings'

const KEYS = Object.keys(en) as RoverKey[]
const placeholders = (sentence: string) => [...sentence.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the picker in Portuguese and English', () => {
  it('has every key in both languages, none empty', () => {
    expect(Object.keys(pt).sort()).toEqual([...KEYS].sort())
    for (const key of KEYS) {
      expect(en[key].trim(), key).not.toBe('')
      expect(pt[key].trim(), key).not.toBe('')
    }
  })

  it('fills the same values in both languages', () => {
    for (const key of KEYS) expect(placeholders(pt[key]), key).toEqual(placeholders(en[key]))
  })

  it('labels the Mars rovers "What if it went to the Moon?" and "E se fosse à Lua?"', () => {
    expect(roverText('en', 'rover.marsLabel')).toBe('What if it went to the Moon?')
    expect(roverText('pt', 'rover.marsLabel')).toBe('E se fosse à Lua?')
  })

  it('uses the GLOSSARY terms as written', () => {
    expect(en['rover.dark']).toBe('Darkness tolerance')
    expect(pt['rover.dark']).toBe('Tolerância à escuridão')
    expect(en['rover.useHeight']).toContain('Observer height')
    expect(pt['rover.useHeight']).toContain('Altura do Observador')
    expect(en['rover.window']).toContain('Window')
    expect(pt['rover.window']).toContain('Janela')
    expect(en['rover.fitFits']).toContain('LCSP')
    expect(pt['rover.fitFits']).toContain('LCSP')
    expect(en['rover.fitNote']).toContain('Darkness tolerance')
    expect(pt['rover.fitNote']).toContain('Tolerância à escuridão')
    // The glossary avoids "period", "range" and "date" for a Window.
    expect(en['rover.window']).not.toMatch(/period|range/i)
  })

  it('names the direct link to the Earth DTE and the choice about it', () => {
    expect(en['rover.dte']).toContain('DTE')
    expect(pt['rover.dte']).toBe('Precisa ver a Terra (DTE)')
  })

  it('says estimated numbers are estimated, in both languages', () => {
    expect(en['rover.estimatedLegend']).toMatch(/estimated/)
    expect(pt['rover.estimatedLegend']).toMatch(/estimado/)
    expect(en['rover.estimatedTitle']).toMatch(/estimated/i)
    expect(pt['rover.estimatedTitle']).toMatch(/estimado/i)
  })

  it('does not mention AI, and does not use the names Eduardo’s plan retired', () => {
    for (const key of KEYS) {
      for (const sentence of [en[key], pt[key]]) {
        expect(sentence, key).not.toMatch(/\bAI\b|\bIA\b|artificial|inteligência|intelligence|Marcato|Sem Tese|Com Tese/i)
      }
    }
  })

  it('fills in the values, and leaves one it was not given', () => {
    expect(roverText('en', 'rover.cardDark', { hours: '57' })).toBe('57 h in the dark')
    expect(roverText('pt', 'rover.cardDark', { hours: '57' })).toBe('57 h no escuro')
    expect(roverText('en', 'rover.useHeight', {})).toBe('Use {height} m as the Observer height')
  })
})
