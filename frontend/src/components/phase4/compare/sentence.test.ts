import { describe, expect, it } from 'vitest'
import { comparePlans, type Plan, type PlanMetrics, type Row } from '../../../domain/planCompare'
import { planSentence, type Say } from './sentence'
import { en, pt, type CompareKey } from './strings'

const metrics = (patch: Partial<PlanMetrics> = {}): PlanMetrics => ({
  sun_and_earth_hours: 300,
  sunlit_hours: 500,
  earth_visible_hours: 400,
  lcip_hours: 120,
  lcsp_hours: 40,
  mean_sun_fraction: 0.6,
  ...patch,
})
const plan = (patch: Partial<PlanMetrics> = {}, durationHours = 708.73): Plan => ({ metrics: metrics(patch), durationHours })

function sayIn(catalogue: Record<CompareKey, string>): Say {
  return {
    t: (key, params) => catalogue[key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match),
    gap: (row: Row) => (row.unit === 'hours' ? `${row.gap} h` : `${Math.round(row.gap * 1000) / 10} points`),
  }
}

const sentence = (a: Plan, b: Plan, catalogue: Record<CompareKey, string> = en) => planSentence(comparePlans(a, b).summary, sayIn(catalogue))

describe('the summary sentence', () => {
  it('says the plans cannot be separated, and names no winner, when every number ties', () => {
    const said = sentence(plan(), plan({ sun_and_earth_hours: 300.2, lcsp_hours: 40.3, mean_sun_fraction: 0.602 }))
    expect(said).toBe('Plan A and Plan B cannot be separated: no number differs by enough to call one of them better, so there is no winner.')
    expect(said).not.toMatch(/ahead|better on/)
  })

  it('says the same for two plans with identical numbers', () => {
    expect(sentence(plan(), plan())).toMatch(/cannot be separated/)
  })

  it('names the plan ahead, with its biggest lead in the first row it wins', () => {
    expect(sentence(plan(), plan({ sun_and_earth_hours: 312.5, lcsp_hours: 10 }))).toBe(
      'Plan B comes out ahead: it is better on 2 of the 6 numbers and worse on none. It has more Sun and Earth together, by 12.5 h.',
    )
  })

  it('names plan A when it is the one ahead', () => {
    expect(sentence(plan({ lcsp_hours: 5 }), plan())).toBe(
      'Plan A comes out ahead: it is better on 1 of the 6 numbers and worse on none. It has a shorter longest night (LCSP), by 35 h.',
    )
  })

  it('gives both sides when each plan wins something, as "but" and not as a verdict', () => {
    expect(sentence(plan(), plan({ sun_and_earth_hours: 330, lcsp_hours: 90 }))).toBe(
      'Plan B has more Sun and Earth together, by 30 h, but Plan A has a shorter longest night (LCSP).',
    )
  })

  it('does not mention a tied number in the sentence', () => {
    // Sun and Earth together ties; the two plans win one number each.
    const said = sentence(plan(), plan({ sun_and_earth_hours: 300.1, lcip_hours: 200, mean_sun_fraction: 0.5 }))
    expect(said).toBe('Plan B has a longer stretch of sunlight (LCIP), by 80 h, but Plan A has a higher mean Sun fraction.')
  })

  it('says a share gap in percentage points when the Windows differ in length', () => {
    expect(sentence(plan({ sun_and_earth_hours: 180 }, 360), plan({ sun_and_earth_hours: 432 }, 720))).toContain('by 10 points')
  })

  it('has the same placeholders in both languages, so no sentence comes out with a hole', () => {
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(en) as CompareKey[]) expect(holes(pt[key]), key).toEqual(holes(en[key]))
  })

  it('reads in Portuguese too, with the same case split', () => {
    expect(sentence(plan(), plan({ sun_and_earth_hours: 330, lcsp_hours: 90 }), pt)).toBe(
      'O Plano B tem mais Sol e Terra juntos, por 30 h, mas o Plano A tem a maior noite (LCSP) mais curta.',
    )
    expect(sentence(plan(), plan(), pt)).toMatch(/não dá para separar/)
  })
})
