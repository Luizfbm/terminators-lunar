import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { VisibilityResult } from '../../api/client'
import { I18nProvider } from '../../i18n/I18nContext'
import type { Locale } from '../../i18n/messages'
import { VEHICLES } from '../vehiclePicker/vehicles'
import { LandingPanel } from './LandingPanel'
import type { PanelVariant } from './panelData'

// Read at run time, not imported: the web image has only frontend/ (see src/buildContext.test.ts).
const file = new URL('../../../../contract/examples/visibility-cr01.example.json', import.meta.url)
const result = (JSON.parse(readFileSync(file, 'utf8')) as { value: VisibilityResult }).value

function draw(variant: PanelVariant, locale: Locale = 'en'): string {
  const startMs = Date.parse(result.query.start)
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      locale,
      language: locale === 'pt' ? 'pt-BR' : 'en-GB',
      children: createElement(LandingPanel, {
        result,
        siteName: result.query.site.name,
        variant,
        vehicle: variant === 'vehicle' ? VEHICLES[0] : null,
        cursorMs: startMs,
        onCursor: () => undefined,
      }),
    }),
  )
}

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('the landing panel at Level 1 (the one without a vehicle)', () => {
  const html = draw('site')

  it('has the Site, the Window, the Sun, the Earth, both, the outages and the Countdowns with their Occluders', () => {
    const copy = text(html)
    expect(copy).toContain(result.query.site.name)
    expect(copy).toContain('UTC')
    for (const label of ['Sun', 'Earth', 'Both', 'Longest night', 'Longest without the Earth']) expect(copy).toContain(label)
    expect(copy).toContain('The Sun sets in')
    expect(copy).toContain('behind the rim of Shackleton')
    expect(copy).toContain('Across this Window')
  })

  it('has no vehicle, no battery and no energy periods, and invents no data', () => {
    const copy = text(html)
    for (const word of ['Vehicle:', 'Battery', 'Solar charge', 'Energy periods']) expect(copy).not.toContain(word)
    expect(html).not.toContain('landing-panel__periods')
  })

  it('has nothing about hazard percentages or the laser, which belong to Level 3', () => {
    expect(text(html)).not.toMatch(/hazard|laser|measured/i)
  })

  it('is in Portuguese too, without the vehicle fields', () => {
    const copy = text(draw('site', 'pt'))
    expect(copy).toContain('O Sol se põe em')
    for (const word of ['Veículo:', 'Bateria', 'Carga solar']) expect(copy).not.toContain(word)
  })
})

describe('the landing panel of Level 2 (with a vehicle)', () => {
  const html = draw('vehicle')

  it('stays as Larissa made it: the vehicle, the summary and the energy and communication periods', () => {
    const copy = text(html)
    expect(copy).toContain(`Vehicle: ${VEHICLES[0].name}`)
    for (const word of ['In the chosen Window', 'Energy periods', 'Battery', 'Earth communication']) expect(copy).toContain(word)
  })

  it('does not repeat the Countdowns: the time strip has them', () => {
    expect(text(html)).not.toContain('The Sun sets in')
  })
})
