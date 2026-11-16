import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nContext'
import type { Locale } from '../../../i18n/messages'
import { changeOf, formatChange, formatShare, sealOf, showsCircle, viewOf, type View } from './logic'
import { SafetyView } from './SafetyCircle'
import { en, pt } from './strings'
import type { HazardAround, SiteHazard } from './types'

// Read at run time, not imported: the web image has only frontend/ (see src/buildContext.test.ts).
function example<T>(name: string): T {
  const file = new URL(`../../../../../contract/examples/${name}`, import.meta.url)
  return (JSON.parse(readFileSync(file, 'utf8')) as { value: T }).value
}

const hazard = example<SiteHazard>('site-hazard-ar06.example.json')
const around = example<HazardAround>('hazard-around-ar06.example.json')

function draw(view: View, locale: Locale): string {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      locale,
      language: locale === 'pt' ? 'pt-BR' : 'en-GB',
      children: createElement(SafetyView, { view }),
    }),
  )
}

const ready = <T>(data: T) => ({ status: 'ready', data }) as const
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('the seal on the contract example for AR06', () => {
  it('reads Normal navigation and Multiresolution P90 on the 60 m grid, as the API returns them', () => {
    const seal = sealOf(hazard)
    expect(seal).not.toBeNull()
    expect(seal?.normal).toBe(0.128587)
    expect(seal?.multiresolution).toBe(0.026959)
    expect(seal?.gridId).toBe('DM1')
    expect(seal?.distanceKm).toBe(1.31)
  })

  it('says 12,86% → 2,70% · −79% in Portuguese', () => {
    const view = viewOf(false, ready(hazard), ready(around))
    const html = text(draw(view, 'pt'))
    expect(html).toContain('Perigo não vetado')
    expect(html).toContain('Navegação Normal 12,86%')
    expect(html).toContain('Multirresolução P90 2,70%')
    expect(html).toContain('−79% em relação à Navegação Normal')
  })

  it('says 12.86% → 2.70% · −79% in English', () => {
    const html = text(draw(viewOf(false, ready(hazard), ready(around)), 'en'))
    expect(html).toContain('Hazard not vetoed')
    expect(html).toContain('Normal navigation 12.86%')
    expect(html).toContain('Multiresolution P90 2.70%')
    expect(html).toContain('−79% against Normal navigation')
  })

  it('counts the cells over the limit within 250 m at 5 m against 60 m', () => {
    const pt250 = text(draw(viewOf(false, ready(hazard), ready(around)), 'pt'))
    expect(pt250).toContain('Num raio de 250 m: 0 de 81 células passam de 15° a 5 m; 0 a 60 m.')
    const en250 = text(draw(viewOf(false, ready(hazard), ready(around)), 'en'))
    expect(en250).toContain('Within 250 m: 0 of 81 cells are over 15° at 5 m; 0 at 60 m.')
  })

  it('says the percentages belong to the grid nearest the Site, in both languages', () => {
    const view = viewOf(false, ready(hazard), ready(around))
    expect(text(draw(view, 'en'))).toContain('belong to the grid nearest the Site (DM1, 1.31 km away)')
    expect(text(draw(view, 'pt'))).toContain('da grade mais próxima do Local (DM1, a 1,31 km)')
  })

  it('keeps the seal when the count around the Site is not there', () => {
    const view = viewOf(false, ready(hazard), { status: 'error', code: 'invalid_parameter' })
    expect(view.kind).toBe('seal')
    const html = text(draw(view, 'en'))
    expect(html).toContain('12.86%')
    expect(html).not.toContain('Within 250')
  })

  it('names only the two variations and never an AI or the old names', () => {
    const copy = [...Object.values(en), ...Object.values(pt)].join(' ')
    expect(copy).not.toMatch(/\bAI\b|\bIA\b|artificial|Marcato|Com Tese|Sem Tese|With Thesis|Without Thesis/i)
  })
})

describe('the reduction', () => {
  it('is the relative change between the two returned values', () => {
    expect(changeOf(0.128587, 0.026959)).toBeCloseTo(-0.7903, 3)
    expect(formatChange(-0.7903)).toBe('−79%')
  })

  it('has nothing to compare against when Normal navigation misses nothing', () => {
    expect(changeOf(0, 0)).toBeNull()
  })

  it('shows a rise as a rise and no change as 0%', () => {
    expect(formatChange(0.124)).toBe('+12%')
    expect(formatChange(0.001)).toBe('0%')
  })

  it('leaves the reduction out of the seal when there is none to show', () => {
    const none: SiteHazard = structuredClone(hazard)
    const run = none.runs.find((candidate) => candidate.coarse_m === 60)
    const normal = run?.methods.find((candidate) => candidate.navigation === 'normal')
    if (normal) normal.missed_hazard = { mean: 0, low: 0, high: 0 }
    const html = text(draw(viewOf(false, ready(none), ready(around)), 'en'))
    expect(html).toContain('Normal navigation 0.00%')
    expect(html).not.toContain('against Normal navigation')
  })
})

describe('the percentages', () => {
  it('have two decimals and the decimal sign of the language', () => {
    expect(formatShare(0.027, 'en')).toBe('2.70%')
    expect(formatShare(0.027, 'pt')).toBe('2,70%')
  })
})

describe('a Site without a grid', () => {
  const noGrid: SiteHazard = { ...hazard, grid: null, stats: null, runs: [] }

  it('loses the seal and says why, in both languages', () => {
    const view = viewOf(false, ready(noGrid), { status: 'idle' })
    expect(view).toEqual({ kind: 'absent', reason: 'no_grid' })
    const en250 = text(draw(view, 'en'))
    expect(en250).toContain('there is no 5 m grid within 15 km of this Site')
    expect(en250).not.toContain('Hazard not vetoed')
    expect(text(draw(view, 'pt'))).toContain('não há grade de 5 m a menos de 15 km deste Local')
  })

  it('is what a custom Site gets too, without asking for anything', () => {
    const view = viewOf(true, { status: 'idle' }, { status: 'idle' })
    expect(view).toEqual({ kind: 'absent', reason: 'custom' })
    expect(text(draw(view, 'en'))).toContain('not for a point you chose')
  })

  it('says so when the answer does not come', () => {
    const view = viewOf(false, { status: 'error', code: 'network' }, { status: 'idle' })
    expect(text(draw(view, 'pt'))).toContain('não está disponível agora')
  })

  it('shows only the ring while the answer is on its way', () => {
    const html = draw(viewOf(false, { status: 'loading' }, { status: 'idle' }), 'en')
    expect(html).toContain('safety__ring')
    expect(html).not.toContain('safety__seal')
  })
})

describe('when the circle is drawn at all (Level 3, issue #151)', () => {
  const noGrid: SiteHazard = { ...hazard, grid: null, stats: null, runs: [] }

  it('is with a seal only: real numbers for a Site with a grid', () => {
    expect(showsCircle(viewOf(false, ready(hazard), { status: 'idle' }))).toBe(true)
  })

  it('is never for a custom point, a Site without a grid, a failed request or one still loading', () => {
    expect(showsCircle(viewOf(true, { status: 'idle' }, { status: 'idle' }))).toBe(false)
    expect(showsCircle(viewOf(false, ready(noGrid), { status: 'idle' }))).toBe(false)
    expect(showsCircle(viewOf(false, { status: 'error', code: 'network' }, { status: 'idle' }))).toBe(false)
    expect(showsCircle(viewOf(false, { status: 'loading' }, { status: 'idle' }))).toBe(false)
  })
})
