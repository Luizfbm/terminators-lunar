import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nContext'
import type { Locale } from '../../../i18n/messages'
import type { SiteHazard } from '../../hazard/uncertainty/hazardApi'
import { usePanelText } from '../site-windows/text'
import { RunTable } from './HazardCompare'
import { runView } from './hazardLogic'
import { en, pt } from './hazardStrings'

const HERE = dirname(fileURLToPath(import.meta.url))
const AR06 = (JSON.parse(readFileSync(resolve(HERE, '../../../../../contract/examples/site-hazard-ar06.example.json'), 'utf8')) as { value: SiteHazard }).value

function draw(locale: Locale, coarse: number): string {
  const run = AR06.runs.find((candidate) => candidate.coarse_m === coarse)
  const view = run && runView(run, 'P90')
  if (!view) throw new Error('no run')
  const Table = () => createElement(RunTable, { view, level: 'P90', plan: 'Plan A', slopeLimitDeg: 15, text: usePanelText({ en, pt }) })
  const html = renderToStaticMarkup(
    createElement(I18nProvider, { locale, language: locale === 'pt' ? 'pt-BR' : 'en-GB', children: createElement(Table) }),
  )
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
}

describe('the estimate under each grid’s table (AR06 example)', () => {
  it('labels the 60 m figures as our group’s estimate, with the range at the same false alarm', () => {
    const html = draw('en', 60)
    expect(html).toContain('Our group’s estimate')
    expect(html).toContain('Our group estimated, based on 91,471 cells the laser measured')
    expect(html).toContain('the change is from −22% to −14%')
    expect(html).toContain('here the margin really covered 85.4% of the checked cells')
    // The figures it labels are still there.
    expect(html).toContain('Unvetoed hazard')
  })

  it('gives the 20 m grid its own range, which reaches past zero, in Portuguese', () => {
    const html = draw('pt', 20)
    expect(html).toContain('com base em 93.713 células que o laser mediu')
    expect(html).toContain('a variação é de −4% a +11%')
    expect(html).toContain('cobriu de fato 87,2% das células conferidas')
    expect(html).not.toMatch(/Eduardo|Luiz|Larissa/)
  })
})
