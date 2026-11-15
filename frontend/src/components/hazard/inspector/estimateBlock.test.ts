import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { decodeGrid } from './decode'
import { gridExample, hazardExample } from './examples'
import { HazardInspectorView } from './HazardInspector'
import type { InspectorLocale } from './strings'

const data = { hazard: hazardExample(), grid: decodeGrid(gridExample()) }
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const draw = (locale: InspectorLocale, initial?: { coarse?: 60 | 20; level?: 'P50' | 'P90' | 'P99' }) =>
  text(renderToStaticMarkup(createElement(HazardInspectorView, { data, locale, initial })))

describe('the inspector’s estimate block (AR06 example)', () => {
  it('says the 60 m figure is our group’s estimate, with its cells, its false alarms and its range', () => {
    const html = draw('en', { coarse: 60, level: 'P90' })
    expect(html).toContain('Our group’s estimate')
    expect(html).toContain('Our group estimated, based on 91,471 cells the laser measured')
    expect(html).toContain('changes the unvetoed hazard by −79% against Normal navigation')
    expect(html).toContain('(5.9% against 18.0%)')
    expect(html).toContain('between 5% and 30%, the change is from −22% to −14%')
    expect(html).toContain('38.5% in the median, and 12% when the coarse grid is 20 m')
  })

  it('follows the grid and the level the reader picks: 20 m reaches past zero, and the Shield names its level', () => {
    const html = draw('en', { coarse: 20, level: 'P99' })
    expect(html).toContain('based on 93,713 cells')
    expect(html).toContain('the change is from −4% to +11%')
    expect(html).toContain('P99 is the z we used, a label and not a promise')
    expect(html).toContain('P99 was exceeded 0.7% to 1.5% of the time, against 1% promised')
  })

  it('says it all in Portuguese too, with the margins of the Shield and no person named', () => {
    const html = draw('pt', { coarse: 60, level: 'P90' })
    expect(html).toContain('Estimativa do nosso grupo')
    expect(html).toContain('Nosso grupo estimou, com base em 91.471 células que o laser mediu')
    expect(html).toContain('(5,9% contra 18,0%)')
    expect(html).toContain('a variação é de −22% a −14%')
    expect(html).toContain('1° mais z vezes 0,8° perto de disparos do laser ou 2,0° longe deles')
    expect(html).toContain('Só o ramo de 2,0° foi conferido')
    // The block names no one. (The "Source" line under it is the API's own `source_reference`, not this block's.)
    const block = html.slice(html.indexOf('Estimativa do nosso grupo'), html.indexOf('O terreno desta grade'))
    expect(block.length).toBeGreaterThan(500)
    expect(block).not.toMatch(/Eduardo|Luiz|Larissa/)
  })
})
