import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createI18n } from '../../../i18n/i18n'
import type { SiteHazard } from '../../hazard/uncertainty/hazardApi'
import { changeText, degrees, intervalText, relativeChange, runSentence, runView, siteView, type Level, type Say } from './hazardLogic'
import { en, pt, type HazardKey } from './hazardStrings'

// The real answer for AR06 (grid DM1, Eduardo's Monte Carlo): the contract's own example. It is read
// at run time, not imported, because the web image copies frontend/ only.
const HERE = dirname(fileURLToPath(import.meta.url))
const AR06 = (JSON.parse(readFileSync(resolve(HERE, '../../../../../contract/examples/site-hazard-ar06.example.json'), 'utf8')) as { value: SiteHazard }).value

const english = createI18n('en', 'en-GB')
const portuguese = createI18n('pt', 'pt-BR')

function sayIn(catalogue: Record<HazardKey, string>, formatPercent: (fraction: number) => string): Say {
  return {
    t: (key, params) => catalogue[key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match),
    formatPercent,
  }
}
const sayEn = sayIn(en, english.formatPercent)
const sayPt = sayIn(pt, portuguese.formatPercent)

const view = (coarse: number, level: Level) => {
  const run = AR06.runs.find((candidate) => candidate.coarse_m === coarse)
  if (!run) throw new Error(`no ${coarse} m run in the example`)
  const result = runView(run, level)
  if (!result) throw new Error(`no ${level} in the ${coarse} m run`)
  return result
}

describe('the AR06 example, as the API returns it', () => {
  it('has a block with the grid and both runs, 60 m then 20 m', () => {
    const site = siteView(AR06, 'P90')
    expect(site.kind).toBe('grid')
    if (site.kind !== 'grid') return
    expect(site.gridId).toBe('DM1')
    expect(site.distanceKm).toBe(1.31)
    expect(site.slopeLimitDeg).toBe(15)
    expect(site.runs.map((run) => run.coarseM)).toEqual([60, 20])
  })

  it('reads Normal navigation and the chosen Multiresolution level, with their 95% intervals untouched', () => {
    const run = view(60, 'P90')
    expect(run.normal.missed_hazard).toEqual({ mean: 0.128587, low: 0.126104, high: 0.130803 })
    expect(run.multiresolution.confidence_level).toBe('P90')
    expect(run.multiresolution.missed_hazard).toEqual({ mean: 0.026959, low: 0.025374, high: 0.02864 })
    expect(run.multiresolution.false_alarm.mean).toBe(0.179929)
    expect(run.medianError).toEqual({ normal: 0.777, multiresolution: 0.4782 })
  })

  it('takes the fair comparison at the false alarm nearest the chosen level, from the API pairs', () => {
    // P90 false alarm is 18.0%: the nearest listed point is 20%.
    expect(view(60, 'P90').fair).toEqual({ falseAlarm: 0.2, normal: 0.028065, multiresolution: 0.022333 })
    // P50 is 9.3%: 10%. P99 is 26.8%: 25%.
    expect(view(60, 'P50').fair).toEqual({ falseAlarm: 0.1, normal: 0.075871, multiresolution: 0.061711 })
    expect(view(60, 'P99').fair).toEqual({ falseAlarm: 0.25, normal: 0.018474, multiresolution: 0.0147 })
    expect(view(20, 'P90').fair).toEqual({ falseAlarm: 0.2, normal: 0.016772, multiresolution: 0.017105 })
  })

  it('has no fair comparison when the API has no Normal point at that false alarm', () => {
    const run = structuredClone(AR06.runs[0])
    run.trade_off.normal = run.trade_off.normal.filter((point) => point.false_alarm !== 0.2)
    expect(runView(run, 'P90')?.fair).toBeNull()
  })

  it('has no view of a level the run does not carry', () => {
    const run = structuredClone(AR06.runs[0])
    run.methods = run.methods.filter((method) => method.confidence_level !== 'P90')
    expect(runView(run, 'P90')).toBeNull()
  })
})

describe('Site with no grid', () => {
  it('is "no grid" when the API says grid null, with no runs', () => {
    expect(siteView({ ...AR06, grid: null, stats: null, runs: [] }, 'P90')).toEqual({ kind: 'noGrid' })
  })

  it('is also "no grid" when there is a grid but no run to show', () => {
    expect(siteView({ ...AR06, runs: [] }, 'P90')).toEqual({ kind: 'noGrid' })
  })

  it('says in both languages that there is no 5 m data near the Site', () => {
    expect(en.noGrid.replace('{site}', 'AR06')).toBe('There is no 5 m data near AR06: no grid lies within 15 km, so there are no hazard numbers for it.')
    expect(pt.noGrid.replace('{site}', 'AR06')).toBe('Não há dado de 5 m perto de AR06: nenhuma grade fica a menos de 15 km, então não há números de perigo para ele.')
  })
})

describe('the change from one returned value to the other', () => {
  it('is the relative change, negative when Multiresolution is lower', () => {
    const run = view(60, 'P90')
    expect(relativeChange(run.normal.missed_hazard.mean, run.multiresolution.missed_hazard.mean)).toBeCloseTo(-0.7903, 4)
    expect(relativeChange(run.medianError.normal, run.medianError.multiresolution)).toBeCloseTo(-0.38456, 4)
  })

  it('shows a rise as a rise: the 20 m median error goes up a little, and the screen says so', () => {
    const run = view(20, 'P90')
    expect(changeText(relativeChange(run.medianError.normal, run.medianError.multiresolution), english.formatPercent)).toBe('+9%')
  })

  it('has no change over a zero base', () => {
    expect(relativeChange(0, 0.2)).toBeNull()
    expect(changeText(null, english.formatPercent)).toBeNull()
  })

  it('is written with a sign, at the whole percentages of the rest of the app', () => {
    expect(changeText(-0.7903, english.formatPercent)).toBe('-79%')
    expect(changeText(0.16, portuguese.formatPercent)).toBe('+16%')
    expect(changeText(0, english.formatPercent)).toBe('0%')
  })
})

describe('numbers on screen', () => {
  const english0 = (fraction: number) => english.formatPercent(fraction)

  it('writes a mean and its interval, and leaves the interval out when its ends read the same', () => {
    expect(intervalText({ mean: 0.128587, low: 0.126104, high: 0.130803 }, english0)).toEqual({ value: '13%', range: null })
    expect(intervalText({ mean: 0.128587, low: 0.12, high: 0.14 }, english0)).toEqual({ value: '13%', range: '12%–14%' })
  })

  it('writes degrees with two decimals, with the comma in Portuguese', () => {
    expect(degrees(0.777, english.formatNumber)).toBe('0.78°')
    expect(degrees(0.4782, portuguese.formatNumber)).toBe('0,48°')
  })
})

describe('the sentence over a grid', () => {
  it('says the nominal reading, then the fair one, in English', () => {
    expect(runSentence(view(60, 'P90'), 'P90', 15, sayEn)).toBe(
      'From the 60 m grid, Normal navigation leaves 13% of the ground steeper than 15° unvetoed; Multiresolution (P90) leaves 3%. At the same false alarm (20%) it is 3% against 2%.',
    )
  })

  it('says it in Portuguese with the app terms', () => {
    expect(runSentence(view(60, 'P90'), 'P90', 15, sayPt)).toBe(
      'Da grade de 60 m, a Navegação Normal deixa 13% do chão mais íngreme que 15° sem veto; a Multirresolução (P90) deixa 3%. Com o mesmo falso alarme (20%) são 3% contra 2%.',
    )
  })

  it('stops after the nominal reading when there is no fair one', () => {
    const run = { ...view(60, 'P99'), fair: null }
    expect(runSentence(run, 'P99', 15, sayEn)).toBe(
      'From the 60 m grid, Normal navigation leaves 13% of the ground steeper than 15° unvetoed; Multiresolution (P99) leaves 1%.',
    )
  })
})

describe('the strings', () => {
  const keys = Object.keys(en) as HazardKey[]

  it('have the same keys, and the same placeholders, in English and Portuguese', () => {
    expect(Object.keys(pt).sort()).toEqual([...keys].sort())
    const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const key of keys) expect(holes(pt[key]), key).toEqual(holes(en[key]))
  })

  it('name only the two variants, and never mention AI', () => {
    const all = [...Object.values(en), ...Object.values(pt)].join(' ')
    expect(all).toContain('Normal navigation')
    expect(all).toContain('Multiresolution')
    expect(all).toContain('Navegação Normal')
    expect(all).toContain('Multirresolução')
    expect(all).not.toMatch(/\bAI\b|\bIA\b|artificial|neural|Marcato|Sem Tese|Com Tese|\bTese\b/i)
  })
})
