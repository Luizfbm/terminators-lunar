import { describe, expect, it } from 'vitest'
import { routeParams } from './api'
import { assumptionRows, avoidedSentence, distanceText, durationText, estimateSentence, footerRows, roverLine } from './describe'
import { routeExample } from './exampleData'
import { createI18n } from '../../../i18n/i18n'
import { en, pt, textFor, type CompareKey } from './strings'

const keys = Object.keys(en) as CompareKey[]
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('the panel’s strings', () => {
  it('has every string in both languages, with the same placeholders', () => {
    expect(Object.keys(pt).sort()).toEqual([...keys].sort())
    for (const key of keys) expect(placeholders(pt[key]), key).toEqual(placeholders(en[key]))
  })

  it('has no empty string and does not leave English in the Portuguese', () => {
    for (const key of keys) {
      expect(en[key].trim(), key).not.toBe('')
      expect(pt[key].trim(), key).not.toBe('')
    }
    expect(pt.title).toBe('Navegação Normal × Multirresolução')
    expect(en.title).toBe('Normal navigation × Multiresolution')
  })

  // The rules for the words on screen: two plans only, never a mention of AI, never the old names.
  it('names only the two plans and never mentions AI or the old labels', () => {
    const forbidden = [/\bIA\b/, /\bAI\b/i, /neuro/i, /\bMLP\b/i, /machine learning/i, /marcato/i, /sem tese/i, /com tese/i, /\bwith thesis\b/i]
    for (const catalogue of [en, pt]) {
      for (const key of keys) {
        for (const word of forbidden) expect(catalogue[key], `${key} ~ ${word}`).not.toMatch(word)
      }
    }
    expect(en['nav.normal']).toBe('Normal navigation')
    expect(en['nav.multiresolution']).toBe('Multiresolution')
    expect(pt['nav.normal']).toBe('Navegação Normal')
    expect(pt['nav.multiresolution']).toBe('Multirresolução')
  })

  it('says the swarm is an illustration and the planner’s numbers are assumptions, in both languages', () => {
    expect(en['swarm.note']).toMatch(/illustration of the search, not a result/)
    expect(pt['swarm.note']).toMatch(/ilustração da busca, não é resultado/)
    expect(en['assumptions.line']).toMatch(/assumptions, not measurements/)
    expect(pt['assumptions.line']).toMatch(/suposições, não medidas/)
  })

  it('labels every number the example’s `assumptions` lists, in both languages, not just its raw name', () => {
    for (const name of Object.keys(routeExample.assumptions)) {
      expect(textFor('en').assumption(name), name).not.toBe(name)
      expect(textFor('pt').assumption(name), name).not.toBe(name)
    }
    expect(textFor('en').assumption('a_number_added_later')).toBe('a_number_added_later')
  })
})

describe('the numbers under the panes, from the example route', () => {
  const english = createI18n('en', 'en-GB')
  const portuguese = createI18n('pt', 'pt-BR')

  it('lists distance, time, hazards, vetoes and battery of both plans as the API sent them', () => {
    const rows = footerRows(routeExample, textFor('en'), english)
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect([by.hazards.normal, by.hazards.multiresolution]).toEqual(['11', '7'])
    expect([by.vetoes.normal, by.vetoes.multiresolution]).toEqual(['0', '25'])
    expect(by.distance.normal).toBe('2.29 km')
    expect(by.distance.multiresolution).toBe('2.54 km')
    // 1.82 h is 1 h 49 min and 2.21 h is 2 h 13 min.
    expect(by.time.normal).toBe('1 h 49 min')
    expect(by.time.multiresolution).toBe('2 h 13 min')
    expect([by.battery.normal, by.battery.multiresolution]).toEqual(['100%', '100%'])
    expect([by.reached.normal, by.reached.multiresolution]).toEqual(['yes', 'yes'])
  })

  it('reads the same rows in Portuguese, with decimal commas', () => {
    const rows = footerRows(routeExample, textFor('pt'), portuguese)
    expect(rows.find((r) => r.key === 'distance')?.normal).toBe('2,29 km')
    expect(rows.find((r) => r.key === 'reached')?.normal).toBe('sim')
    expect(rows.map((r) => r.label)).toContain('Perigos atravessados')
  })

  it('says how many hazards Multiresolution avoided, with both counts, in each language', () => {
    expect(routeExample.hazards_avoided).toBe(4)
    expect(avoidedSentence(routeExample, textFor('en'), english)).toBe(
      'Multiresolution crosses 4 hazards fewer than Normal navigation: 7 against 11.',
    )
    expect(avoidedSentence(routeExample, textFor('pt'), portuguese)).toBe(
      'A Multirresolução atravessa 4 perigos a menos que a Navegação Normal: 7 contra 11.',
    )
  })

  it('does not claim an advantage when none was avoided, and says 1 in the singular', () => {
    const none = { ...routeExample, hazards_avoided: 0 }
    expect(avoidedSentence(none, textFor('en'), english)).toMatch(/no fewer hazards/)
    const one = { ...routeExample, hazards_avoided: 1 }
    expect(avoidedSentence(one, textFor('en'), english)).toMatch(/1 hazard fewer/)
    expect(avoidedSentence(one, textFor('pt'), portuguese)).toMatch(/1 perigo a menos/)
  })

  it('says the two hazard counts are our group’s estimate, with both counts from the answer and no invented range', () => {
    expect(estimateSentence(routeExample, textFor('en'), english)).toBe(
      'Our group estimated, from the planner’s assumed costs and speed and the 5 m slope of the ground, that Normal navigation crosses 11 steep waypoints and Multiresolution 7. It may contain errors. Each plan is scored on the same 5 m slope it planned with, so this shows what a planner with the finer map can avoid, not what a real drive would meet, and we have no measured range for it.',
    )
    expect(estimateSentence(routeExample, textFor('pt'), portuguese)).toContain('que a Navegação Normal atravessa 11 pontos íngremes e a Multirresolução 7. Pode conter erros.')
    expect(estimateSentence(routeExample, textFor('pt'), portuguese)).toContain('não temos uma faixa medida')
    // The counts are the plans' own: change them and the sentence follows.
    const other = { ...routeExample, plans: routeExample.plans.map((plan) => ({ ...plan, hazards_hit: plan.navigation === 'normal' ? 30 : 12 })) }
    expect(estimateSentence(other, textFor('en'), english)).toContain('Normal navigation crosses 30 steep waypoints and Multiresolution 12')
    for (const sentence of [en.estimate, pt.estimate]) expect(sentence).not.toMatch(/Eduardo|Luiz|Larissa/)
  })

  it('lists every assumed number with its value and names the Rover and the limit', () => {
    const rows = assumptionRows(routeExample, textFor('en'), english)
    expect(rows).toHaveLength(Object.keys(routeExample.assumptions).length)
    expect(rows.find((r) => r.name === 'speed_m_s')?.value).toBe('0.35')
    expect(rows.find((r) => r.name === 'multi_cost_over_limit_5m')?.value).toBe('7,500')
    expect(roverLine(routeExample, textFor('en'), english)).toBe('Rover: viper. Slope limit 15°. Sun fraction 0.5.')
    expect(roverLine(routeExample, textFor('pt'), portuguese)).toBe('Rover: viper. Limite de inclinação 15°. Fração do Sol 0,5.')
  })

  it('writes metres below a kilometre and rounds the time to the minute', () => {
    expect(distanceText(english, 612.4)).toBe('612 m')
    expect(durationText(english, 0.5)).toBe('30 min')
  })
})

describe('the request to the API', () => {
  it('asks for the swarm and the grid and sends only what the caller set', () => {
    const params = routeParams({ siteId: 'AR06', coarseM: 60 })
    expect(Object.fromEntries(params)).toEqual({ swarm: 'true', coarse_m: '60' })
  })

  it('sends the Rover numbers, the Sun, the confidence level and the points when given', () => {
    const params = routeParams({
      siteId: 'AR06',
      coarseM: 20,
      rover: { id: 'viper', slopeLimitDeg: 12, batteryWh: 5000, powerShadowW: 90, solarW: 400, rtgW: 0 },
      sunFraction: 0.4,
      sunAzimuthDeg: 120,
      confidenceLevel: 'P99',
      start: { x_m: 10, y_m: 20 },
      goal: { x_m: 1500, y_m: 900 },
    })
    expect(Object.fromEntries(params)).toEqual({
      swarm: 'true',
      coarse_m: '20',
      rover_id: 'viper',
      slope_limit_deg: '12',
      battery_wh: '5000',
      power_shadow_w: '90',
      solar_w: '400',
      rtg_w: '0',
      sun_fraction: '0.4',
      sun_azimuth_deg: '120',
      confidence_level: 'P99',
      start_x_m: '10',
      start_y_m: '20',
      goal_x_m: '1500',
      goal_y_m: '900',
    })
  })
})
