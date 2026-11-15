import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { components } from '../../../api/schema'
import {
  countText,
  degreeText,
  estimateOf,
  plainPercent,
  sameAlarmRange,
  shareText,
  signedPercent,
  wholePercent,
} from './estimate'
import {
  gainsSentence,
  rangeText,
  runSentences,
  sealSentence,
  shieldCheckSentence,
  shieldCoverageSentence,
} from './sentences'
import { en, estimateText, pt, type EstimateKey } from './strings'

type SiteHazard = components['schemas']['SiteHazard']

// Read at run time, not imported: the web image has only frontend/ (see src/buildContext.test.ts).
const AR06 = (
  JSON.parse(readFileSync(new URL('../../../../../contract/examples/site-hazard-ar06.example.json', import.meta.url), 'utf8')) as {
    value: SiteHazard
  }
).value
const run = (coarse: number) => {
  const found = AR06.runs.find((candidate) => candidate.coarse_m === coarse)
  if (!found) throw new Error(`no ${coarse} m run`)
  return found
}

describe('the range at the same false alarm', () => {
  it('is the lowest and the highest change over the false alarms both curves share (60 m)', () => {
    // Worked out by hand from the example's trade_off: at 5% (0.124991 - 0.145254) / 0.145254 = -13.95%,
    // at 30% (0.009949 - 0.012819) / 0.012819 = -22.39%; the points between lie inside.
    const range = sameAlarmRange(run(60))
    expect(range?.low).toBeCloseTo(-0.2239, 4)
    expect(range?.high).toBeCloseTo(-0.1395, 4)
    expect(range?.fromFalseAlarm).toBe(0.05)
    expect(range?.toFalseAlarm).toBe(0.3)
  })

  it('crosses zero on the 20 m grid, where Multiresolution is not better everywhere', () => {
    // At 5% (0.112048 - 0.116321) / 0.116321 = -3.67%; at 30% (0.006632 - 0.005981) / 0.005981 = +10.88%.
    const range = sameAlarmRange(run(20))
    expect(range?.low).toBeCloseTo(-0.0367, 4)
    expect(range?.high).toBeCloseTo(0.1088, 4)
  })

  it('uses only the false alarms both curves have, and never a zero base', () => {
    const range = sameAlarmRange({
      trade_off: {
        normal: [
          { false_alarm: 0.05, missed_hazard: 0.1 },
          { false_alarm: 0.1, missed_hazard: 0.05 },
          { false_alarm: 0.15, missed_hazard: 0 },
        ],
        multiresolution: [
          { false_alarm: 0.1, missed_hazard: 0.04 },
          { false_alarm: 0.15, missed_hazard: 0.01 },
        ],
      },
    })
    expect(range?.low).toBeCloseTo(-0.2, 10)
    expect(range?.high).toBeCloseTo(-0.2, 10)
    expect([range?.fromFalseAlarm, range?.toFalseAlarm]).toEqual([0.1, 0.1])
  })

  it('is null when the curves share no point', () => {
    expect(sameAlarmRange({ trade_off: { normal: [], multiresolution: [] } })).toBeNull()
    expect(
      sameAlarmRange({
        trade_off: { normal: [{ false_alarm: 0.05, missed_hazard: 0.1 }], multiresolution: [{ false_alarm: 0.1, missed_hazard: 0.1 }] },
      }),
    ).toBeNull()
  })
})

describe('what an estimate is made from (AR06, 60 m, P90)', () => {
  const estimate = estimateOf(run(60), 'P90')

  it('takes every number from the answer', () => {
    expect(estimate?.cellsChecked).toBe(91471)
    expect(estimate?.normalMissed).toBe(0.128587)
    expect(estimate?.multiMissed).toBe(0.026959)
    expect(estimate?.normalFalseAlarm).toBe(0.058829)
    expect(estimate?.multiFalseAlarm).toBe(0.179929)
    expect(estimate?.coverage).toBe(0.853669)
    expect(estimate?.change).toBeCloseTo(-0.7903, 3)
  })

  it('has no change to give when Normal navigation misses nothing', () => {
    const clone = structuredClone(run(60))
    const normal = clone.methods.find((method) => method.navigation === 'normal')
    if (normal) normal.missed_hazard = { mean: 0, low: 0, high: 0 }
    expect(estimateOf(clone, 'P90')?.change).toBeNull()
  })

  it('is null for a level the run has no row for', () => {
    expect(estimateOf({ ...run(60), methods: run(60).methods.filter((method) => method.confidence_level !== 'P99') }, 'P99')).toBeNull()
  })
})

describe('the formats', () => {
  it('writes a change with a true minus sign, and a flat one as 0%', () => {
    expect(signedPercent(-0.7903)).toBe('−79%')
    expect(signedPercent(0.124)).toBe('+12%')
    expect(signedPercent(0.001)).toBe('0%')
  })

  it('writes a share with one decimal and the decimal sign of the language', () => {
    expect(shareText(0.058829, 'en')).toBe('5.9%')
    expect(shareText(0.058829, 'pt')).toBe('5,9%')
    expect(shareText(0.853669, 'pt')).toBe('85,4%')
  })

  it('writes a whole percent, a count and a margin in degrees', () => {
    expect(wholePercent(0.3)).toBe('30%')
    expect(plainPercent(0.385, 'en')).toBe('38.5%')
    expect(plainPercent(0.385, 'pt')).toBe('38,5%')
    expect(plainPercent(0.12, 'en')).toBe('12%')
    expect(countText(91471, 'en')).toBe('91,471')
    expect(countText(91471, 'pt')).toBe('91.471')
    expect(degreeText(2, 'en')).toBe('2.0')
    expect(degreeText(0.8, 'pt')).toBe('0,8')
  })

  it('reads a range as "from … to …", or "about …" when both ends read the same', () => {
    expect(rangeText('en', { low: -0.2239, high: -0.1395, fromFalseAlarm: 0.05, toFalseAlarm: 0.3 })).toBe('from −22% to −14%')
    expect(rangeText('pt', { low: -0.2239, high: -0.1395, fromFalseAlarm: 0.05, toFalseAlarm: 0.3 })).toBe('de −22% a −14%')
    expect(rangeText('en', { low: -0.201, high: -0.199, fromFalseAlarm: 0.1, toFalseAlarm: 0.1 })).toBe('about −20%')
    expect(rangeText('pt', { low: -0.201, high: -0.199, fromFalseAlarm: 0.1, toFalseAlarm: 0.1 })).toBe('cerca de −20%')
  })
})

describe('the sentences for the AR06 example', () => {
  const sixty = estimateOf(run(60), 'P90')
  const twenty = estimateOf(run(20), 'P90')
  if (!sixty || !twenty) throw new Error('the example has no P90 rows')

  it('puts the short line under the seal, with the range beside the −79%', () => {
    expect(sealSentence('en', sixty)).toBe(
      'Our group’s estimate, from the cells the laser measured. It may contain errors: at the same false alarm the change is from −22% to −14%, not −79%.',
    )
    expect(sealSentence('pt', sixty)).toBe(
      'Estimativa do nosso grupo, a partir das células que o laser mediu. Pode conter erros: com o mesmo falso alarme a variação é de −22% a −14%, não −79%.',
    )
  })

  it('leaves the −79% out of the seal line when there is none, and says so when there is no curve', () => {
    expect(sealSentence('en', { ...sixty, change: null })).not.toContain('not')
    expect(sealSentence('en', { ...sixty, sameAlarm: null })).toContain('no same-false-alarm curve')
    expect(sealSentence('pt', { ...sixty, sameAlarm: null })).toContain('não tem curva de mesmo falso alarme')
  })

  it('says what the 60 m figure is based on and the error it may have, with the numbers of the answer', () => {
    const [lead, detail] = runSentences('en', sixty)
    expect(lead).toBe(
      'Our group estimated, based on 91,471 cells the laser measured (each hidden from the method and then used to test it), that Multiresolution P90 changes the unvetoed hazard by −79% against Normal navigation.',
    )
    expect(detail).toBe(
      'It may contain errors, and the possible error is the false alarm: the two navigations block different shares of the safe ground (5.9% against 18.0%), and at the same false alarm, between 5% and 30%, the change is from −22% to −14%.',
    )
  })

  it('says the 20 m range crosses zero', () => {
    const [, detail] = runSentences('pt', twenty)
    expect(detail).toContain('entre 5% e 30%, a variação é de −4% a +11%')
    const [lead] = runSentences('pt', twenty)
    expect(lead).toContain(`${countText(run(20).cells_checked, 'pt')} células que o laser mediu`)
  })

  it('gives the 26-grid medians of the ADR and the Shield margins with what was checked', () => {
    expect(gainsSentence('en')).toBe(
      'Across our group’s 26 grids, Multiresolution’s own gain at the same false alarm was 38.5% in the median, and 12% when the coarse grid is 20 m.',
    )
    expect(shieldCoverageSentence('en', sixty)).toBe(
      'The Shield, the margin on every cell, is 1° plus z times 0.8° near laser shots or 2.0° far from them. P90 is the z we used, a label and not a promise: here the margin really covered 85.4% of the checked cells.',
    )
    expect(shieldCheckSentence('en', 'P90')).toBe(
      'Only the 2.0° branch was checked against a separate terrain model (SfS), in 3 regions: P90 was exceeded 3.3% to 6.0% of the time, against 10% promised. The 0.8° branch has no check, and the figures may contain errors.',
    )
    expect(shieldCheckSentence('pt', 'P99')).toContain('o P99 foi excedido de 0,7% a 1,5% das vezes, contra 1% prometidos')
    // P50 has no figure in the check.
    expect(shieldCheckSentence('en', 'P50')).not.toContain('exceeded')
  })
})

describe('the words', () => {
  const keys = Object.keys(en) as EstimateKey[]
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  const everything = [...keys.map((key) => en[key]), ...keys.map((key) => pt[key])]

  it('has every key in both languages, with the same slots and none empty', () => {
    expect(Object.keys(pt).sort()).toEqual([...keys].sort())
    for (const key of keys) {
      expect(en[key].trim(), key).not.toBe('')
      expect(pt[key].trim(), key).not.toBe('')
      expect(placeholders(pt[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('never names a person: the figures are our group’s', () => {
    for (const sentence of everything) expect(sentence).not.toMatch(/Eduardo|Luiz|Larissa|Wueller|Barker/i)
  })

  it('says every figure is our group’s estimate, and that it may contain errors, in both languages', () => {
    for (const key of ['estimate.seal', 'estimate.sealNoChange', 'estimate.lead', 'estimate.leadNoChange'] as const) {
      expect(en[key], key).toMatch(/our group/i)
      expect(pt[key], key).toMatch(/nosso grupo/i)
    }
    for (const key of ['estimate.seal', 'estimate.sealNoChange', 'estimate.sealNoRange', 'estimate.rangeDetail', 'estimate.rangeNone'] as const) {
      expect(en[key], key).toMatch(/may contain errors/)
      expect(pt[key], key).toMatch(/pode conter erros/i)
    }
  })

  it('does not mention AI and uses the glossary names', () => {
    for (const sentence of everything) expect(sentence).not.toMatch(/\bAI\b|\bIA\b|artificial|neural|Marcato|Tese/i)
    expect(en['estimate.shield']).toContain('Shield')
    expect(pt['estimate.shield']).toContain('Escudo')
  })

  it('leaves a slot with no value as written', () => {
    expect(estimateText('en', 'estimate.rangeSame')).toBe('about {value}')
  })
})
