import { describe, expect, it } from 'vitest'
import { hazardExample } from './examples'
import { clampPercent, coarseGridsOf, fairSentence, formatterFor, intervalText, levelsOf, multiMethod, readRun, runFor, sliderRange } from './logic'

const hazard = hazardExample()
const run60 = runFor(hazard, 60)
const run20 = runFor(hazard, 20)

describe('reading the contract’s example for AR06 (grid DM1)', () => {
  it('has the 60 m run and the 20 m run, with three confidence levels each', () => {
    expect(coarseGridsOf(hazard)).toEqual([60, 20])
    expect(run60 && levelsOf(run60)).toEqual(['P50', 'P90', 'P99'])
    expect(run20 && levelsOf(run20)).toEqual(['P50', 'P90', 'P99'])
  })

  it('reads the unvetoed hazard of both navigations at the same false alarm', () => {
    const reading = readRun(run60!, 'P90', 15)!
    expect(reading.fair?.normal).toBe(0.044408)
    expect(reading.fair?.multi).toBe(0.035903)
    expect(reading.fair?.reductionPercent).toBeCloseTo(19.15, 2)
    expect(reading.medianError.normal).toBe(0.777)
    expect(reading.medianError.multi).toBe(0.4782)
    expect(reading.medianError.reductionPercent).toBeCloseTo(38.46, 1)
  })

  it('keeps each navigation’s own run as the API sent it, at the level asked', () => {
    const reading = readRun(run60!, 'P90', 15)!
    expect(reading.normal.navigation).toBe('normal')
    expect(reading.normal.missed_hazard.mean).toBe(0.128587)
    expect(reading.multi.confidence_level).toBe('P90')
    expect(reading.multi.missed_hazard.mean).toBe(0.026959)
    expect(reading.multi.false_alarm.mean).toBe(0.179929)
    expect(multiMethod(run60!, 'P99')?.false_alarm.mean).toBe(0.268163)
  })

  it('has no fair reading outside the curve, but still the numbers of the run', () => {
    const reading = readRun(run60!, 'P50', 2)!
    expect(reading.fair).toBeNull()
    expect(reading.normal.false_alarm.mean).toBe(0.058829)
  })

  it('has no reading for a level the run lacks', () => {
    expect(readRun({ ...run60!, methods: run60!.methods.slice(0, 2) }, 'P99', 15)).toBeNull()
  })

  it('offers the slider 5 to 30 percent and keeps a value inside it', () => {
    const range = sliderRange(run60!)!
    expect(range).toEqual({ min: 5, max: 30 })
    expect(clampPercent(2, range)).toBe(5)
    expect(clampPercent(99, range)).toBe(30)
    expect(clampPercent(14.6, range)).toBe(15)
  })
})

describe('the sentence under the false-alarm slider', () => {
  const reading = readRun(run60!, 'P90', 15)!

  it('says it in English', () => {
    expect(fairSentence('en', formatterFor('en'), reading)).toBe(
      'With 15 % of the safe ground blocked, Normal navigation leaves 4.4 % of the steep ground unvetoed and Multiresolution 3.6 %: 19 % less.',
    )
  })

  it('says it in Portuguese, with a decimal comma', () => {
    expect(fairSentence('pt', formatterFor('pt'), reading)).toBe(
      'Com 15 % do terreno seguro bloqueado, a Navegação Normal deixa 4,4 % do terreno íngreme sem veto e a Multirresolução 3,6 %: 19 % a menos.',
    )
  })

  it('says when the curves do not reach the false alarm', () => {
    const none = readRun(run60!, 'P90', 2)!
    expect(fairSentence('en', formatterFor('en'), none)).toContain('we do not extend it')
    expect(fairSentence('pt', formatterFor('pt'), none)).toContain('não a estendemos')
  })

  it('says it when Multiresolution is no better, or worse', () => {
    const base = readRun(run60!, 'P90', 15)!
    const same = { ...base, fair: { ...base.fair!, multi: base.fair!.normal, reductionPercent: 0 } }
    expect(fairSentence('en', formatterFor('en'), same)).toContain('leave the same share')
    const worse = { ...base, fair: { ...base.fair!, multi: 0.06, reductionPercent: -35.1 } }
    expect(fairSentence('en', formatterFor('en'), worse)).toContain('35 % more')
    expect(fairSentence('pt', formatterFor('pt'), worse)).toContain('35 % a mais')
  })

  it('says there is nothing to reduce when Normal navigation leaves none', () => {
    const base = readRun(run60!, 'P90', 15)!
    const nothing = { ...base, fair: { ...base.fair!, normal: 0, multi: 0, reductionPercent: null } }
    expect(fairSentence('en', formatterFor('en'), nothing)).toContain('nothing to reduce')
  })
})

describe('numbers on screen', () => {
  it('keeps two decimals under 1% and one above, in each language', () => {
    expect(formatterFor('en').percent(0.009949)).toBe('0.99 %')
    expect(formatterFor('pt').percent(0.009949)).toBe('0,99 %')
    expect(formatterFor('en').percent(0.128587)).toBe('12.9 %')
    expect(formatterFor('pt').percent(0.128587)).toBe('12,9 %')
  })

  it('writes a Monte Carlo mean with its 95% interval', () => {
    expect(intervalText('en', formatterFor('en'), reading().normal.missed_hazard)).toBe('12.9 % (95% interval 12.6 % to 13.1 %)')
    expect(intervalText('pt', formatterFor('pt'), reading().normal.missed_hazard)).toBe('12,9 % (intervalo de 95% de 12,6 % a 13,1 %)')
  })
})

function reading() {
  return readRun(run60!, 'P90', 15)!
}
