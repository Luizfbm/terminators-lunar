import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n/i18n'
import { earthRows } from './earthRules'

const en = createI18n('en', 'en-GB')
const pt = createI18n('pt', 'pt-BR')

// Site 001, 1 December 2026, the default Window (708.73 h): what the engine answered.
const SITE_001 = { earth_visible_hours: 331.39194444444445, earth_visible_hours_any_part: 359.6669444444444 }

describe('the Earth visible hours by its two rules', () => {
  it('gives the centre first and any part of the disc second, each with its share of the Window', () => {
    const rows = earthRows(SITE_001, 708.73, en)
    expect(rows.map(([key]) => key)).toEqual(['nerds.earthCentre', 'nerds.earthAnyPart'])
    // 331.39 h is 13 d 19 h, 47 % of the Window; 359.67 h is 14 d 23 h, 51 %.
    expect(rows[0][1]).toContain(en.formatSpan(331.39194444444445 * 3_600_000))
    expect(rows[0][1]).toContain(en.formatPercent(331.39194444444445 / 708.73))
    expect(rows[1][1]).toContain(en.formatSpan(359.6669444444444 * 3_600_000))
    expect(rows[1][1]).toContain(en.formatPercent(359.6669444444444 / 708.73))
    expect(rows[1][1]).not.toBe(rows[0][1])
  })

  it('says the rule in both languages', () => {
    expect(en.t('nerds.earthCentre')).toBe('Earth visible, by its centre')
    expect(en.t('nerds.earthAnyPart')).toBe('Earth visible, with any part of its disc')
    expect(pt.t('nerds.earthCentre')).toBe('Terra visível, pelo centro')
    expect(pt.t('nerds.earthAnyPart')).toBe('Terra visível, com qualquer pedaço do disco')
  })

  it('shows the same text twice when the Earth is wholly up or wholly down', () => {
    const [centre, anyPart] = earthRows({ earth_visible_hours: 240, earth_visible_hours_any_part: 240 }, 240, pt)
    expect(anyPart[1]).toBe(centre[1])
  })
})
