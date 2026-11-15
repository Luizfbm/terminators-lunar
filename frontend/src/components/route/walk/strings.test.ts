import { describe, expect, it } from 'vitest'
import { en, errorKey, pt, walkText, type WalkKey } from './strings'

const keys = Object.keys(en) as WalkKey[]
const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the walk’s text', () => {
  it('has every key in both languages, with the same slots', () => {
    expect(Object.keys(pt).sort()).toEqual([...keys].sort())
    for (const key of keys) {
      expect(pt[key].trim(), key).not.toBe('')
      expect(slots(pt[key]), key).toEqual(slots(en[key]))
    }
  })

  it('names the two navigations as the project does, and only them', () => {
    expect(en['walk.plan.normal']).toBe('Normal navigation')
    expect(en['walk.plan.multiresolution']).toBe('Multiresolution')
    expect(pt['walk.plan.normal']).toBe('Navegação Normal')
    expect(pt['walk.plan.multiresolution']).toBe('Multirresolução')
  })

  it('never says Tese, Marcato or anything about AI, in either language', () => {
    for (const text of [...Object.values(en), ...Object.values(pt)]) {
      expect(text).not.toMatch(/\btese\b|marcato|\bAI\b|\bIA\b|artificial|intelig|machine learning/i)
    }
  })

  it('says the rays are an illustration that gives no energy, and where the battery comes from', () => {
    expect(en['walk.rays.note']).toMatch(/illustration/i)
    expect(en['walk.rays.note']).toMatch(/no energy/i)
    expect(pt['walk.rays.note']).toMatch(/ilustração/i)
    expect(pt['walk.rays.note']).toMatch(/não dão energia/i)
    expect(en['walk.battery.note']).toMatch(/plan/i)
    expect(pt['walk.battery.note']).toMatch(/plano/i)
  })

  it('fills the slots of the language asked for', () => {
    expect(walkText('en')('walk.pace.note', { hours: '1.8' })).toBe('The walk is played far faster than the rover drives. The plan’s own drive takes 1.8 h.')
    expect(walkText('pt')('walk.pace.note', { hours: '1,8' })).toContain('1,8 h')
    expect(walkText('pt')('walk.plan.normal')).toBe('Navegação Normal')
    // A slot with no value stays visible rather than turning into "undefined".
    expect(walkText('en')('walk.pace.note')).toContain('{hours}')
  })

  it('turns a problem code into a message of its own, or the generic one', () => {
    expect(errorKey('no_hazard_grid')).toBe('walk.error.no_hazard_grid')
    expect(errorKey('network')).toBe('walk.error.network')
    expect(errorKey('anything else')).toBe('walk.error.unknown')
    expect(errorKey('toString')).toBe('walk.error.unknown')
  })
})
