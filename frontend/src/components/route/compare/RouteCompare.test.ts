import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../i18n/I18nContext'
import type { Locale } from '../../../i18n/messages'
import { gridExample, routeExample } from './exampleData'
import { decodeGrid } from './grid'
import { RouteStage } from './RouteCompare'
import { RoutePane } from './RoutePane'
import type { Navigation } from './types'

const grid = decodeGrid(gridExample)

function stage(locale: Locale) {
  const props = { comparison: routeExample, grid, sunAzimuthDeg: 35, onAccept: () => undefined, onCoarse: () => undefined }
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      locale,
      language: locale === 'pt' ? 'pt-BR' : 'en-GB',
      children: createElement(RouteStage, props),
    }),
  )
}

/** Every element in a tree that a component returned, without running the components inside it. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement(node)) return []
  const element = node as ReactElement<Record<string, unknown>>
  return [element, ...elements(element.props.children as ReactNode)]
}

describe('the two frames, drawn from the example route', () => {
  const html = stage('en')

  it('shows Normal navigation on the left and Multiresolution on the right', () => {
    expect(html.indexOf('route-compare__pane--normal')).toBeGreaterThan(-1)
    expect(html.indexOf('route-compare__pane--normal')).toBeLessThan(html.indexOf('route-compare__pane--multiresolution'))
    expect(html).toContain('Normal navigation')
    expect(html).toContain('Multiresolution')
    expect(html.match(/<canvas/g)).toHaveLength(2)
  })

  it('has one button per frame to accept it and no button of its own for accepting', () => {
    expect(html).toContain('aria-label="Accept Normal navigation"')
    expect(html).toContain('aria-label="Accept Multiresolution"')
    expect(html).not.toMatch(/>Accept</)
    expect(html).toContain('Click a panel to accept that plan.')
  })

  it('offers the three LOLA grids and opens on the 60 m one Normal navigation read', () => {
    for (const option of ['60 m', '20 m', '5 m']) expect(html).toContain(`>${option}<`)
    expect(html).toMatch(/aria-pressed="true"[^>]*>60 m</)
  })

  it('says the swarm is an illustration and the planner’s numbers are assumptions', () => {
    expect(html).toContain('illustration of the search, not a result')
    expect(html).toContain('assumptions, not measurements')
    // Every assumed number is listed, with its value.
    for (const value of Object.values(routeExample.assumptions)) expect(html).toContain(`>${value.toLocaleString('en-GB')}<`)
    expect(html).toContain('Show the 17 numbers assumed')
  })

  it('opens the swarm on generation 1 of 5 with 100 agents and nobody fallen', () => {
    expect(html).toContain('Generation 1 of 5. 100 agents, 0 fallen so far.')
  })

  it('ends with the footer numbers and the hazards avoided', () => {
    expect(html).toContain('Multiresolution crosses 4 hazards fewer than Normal navigation: 7 against 11.')
    expect(html).toContain('Hazards crossed')
    expect(html).toContain('Vetoes of the shield')
    expect(html).toContain('2.29 km')
  })

  it('says all of it in Portuguese, with no English left in the frame names', () => {
    const pt = stage('pt')
    expect(pt).toContain('Navegação Normal')
    expect(pt).toContain('Multirresolução')
    expect(pt).toContain('aria-label="Aceitar Multirresolução"')
    expect(pt).toContain('ilustração da busca, não é resultado')
    expect(pt).toContain('suposições, não medidas')
    expect(pt).toContain('A Multirresolução atravessa 4 perigos a menos que a Navegação Normal: 7 contra 11.')
    expect(pt).not.toContain('Normal navigation')
    expect(pt).not.toContain('Multiresolution')
  })
})

describe('accepting a plan by clicking its frame', () => {
  const pane = (navigation: Navigation, selected: boolean, onAccept: (n: Navigation) => void) =>
    RoutePane({
      navigation,
      selected,
      name: navigation,
      reads: '',
      progressLine: '',
      acceptLabel: `Accept ${navigation}`,
      acceptedLabel: 'Accepted',
      onAccept,
      children: null,
    })

  it('calls onAccept with the navigation of the frame that was clicked, once', () => {
    for (const navigation of ['normal', 'multiresolution'] as const) {
      const onAccept = vi.fn()
      const buttons = elements(pane(navigation, false, onAccept)).filter((e) => e.type === 'button')
      expect(buttons).toHaveLength(1)
      ;(buttons[0].props.onClick as () => void)()
      expect(onAccept).toHaveBeenCalledTimes(1)
      expect(onAccept).toHaveBeenCalledWith(navigation)
    }
  })

  it('marks the accepted frame as pressed and badges it, and no other', () => {
    const accepted = renderToStaticMarkup(createElement('div', null, pane('multiresolution', true, () => undefined)))
    expect(accepted).toContain('aria-pressed="true"')
    expect(accepted).toContain('route-compare__badge')
    expect(accepted).toContain('data-selected="true"')
    const other = renderToStaticMarkup(createElement('div', null, pane('normal', false, () => undefined)))
    expect(other).toContain('aria-pressed="false"')
    expect(other).not.toContain('route-compare__badge')
  })
})
