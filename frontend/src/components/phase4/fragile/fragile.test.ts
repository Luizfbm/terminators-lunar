import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FragileInput } from '../../../domain/fragile'
import { I18nProvider } from '../../../i18n/I18nContext'
import type { Locale } from '../../../i18n/messages'
import { FragileLine } from './FragileLine'

const T0 = Date.parse('2026-11-20T00:00:00Z')
const HOUR = 3_600_000
const horizon = Array.from({ length: 720 }, (_, i) => ({ azimuth_deg: i * 0.5, elevation_deg: 0 }))

/** An hourly Window of 6 samples (5 hours) over a flat mask at 0°, with the Sun and the Earth at the given elevations. */
function answer(sun: number[], earth: number[]): FragileInput {
  const stamp = (i: number) => new Date(T0 + i * HOUR).toISOString()
  return {
    query: { end: stamp(sun.length - 1) },
    timeline: {
      step_minutes: 60,
      samples: sun.map((s, i) => ({
        t: stamp(i),
        sun: { azimuth_deg: 90, elevation_deg: s },
        earth: { azimuth_deg: 180, elevation_deg: earth[i]! },
      })),
    },
    horizon: { samples: horizon },
  }
}

function html(locale: Locale, result: FragileInput, onOpenStats?: () => void): string {
  const language = locale === 'pt' ? 'pt-BR' : 'en-GB'
  // The app glues numbers to their units with a no-break space; the expected sentences are written with plain ones.
  return renderToStaticMarkup(
    createElement(I18nProvider, { locale, language, children: createElement(FragileLine, { result, onOpenStats }) }),
  ).replaceAll(' ', ' ')
}

const far = [4, 4, 4, 4, 4, 4]

describe('the Fragile result line', () => {
  it('is gone when no body has hours within the limit', () => {
    expect(html('en', answer(far, far))).toBe('')
    expect(html('pt', answer(far, far))).toBe('')
  })

  it('says only the Sun when only the Sun has hours', () => {
    // The Sun grazes the mask for 2 steps of an hour.
    const text = html('en', answer([4, 0.1, 0.2, 4, 4, 4], far), () => {})
    expect(text).toContain('Fragile result: for 2 h 0 min of this Window the Sun passes less than 0.5° from the terrain.')
    expect(text).not.toContain('the Earth')
    expect(text).toContain('In those hours a small error in the terrain changes the answer.')
  })

  it('says only the Earth when only the Earth has hours', () => {
    const text = html('en', answer(far, [4, 4, 4, -0.2, 4, 4]))
    expect(text).toContain('Fragile result: for 1 h 0 min of this Window the Earth passes less than 0.5° from the terrain.')
    expect(text).not.toContain('the Sun')
  })

  it('says both, the Sun first, when both have hours', () => {
    const text = html('en', answer([0.1, 0.1, 0.1, 4, 4, 4], [4, 4, 4, 4, 0.3, 4]))
    expect(text).toContain(
      'Fragile result: for 3 h 0 min of this Window the Sun passes less than 0.5° from the terrain, and for 1 h 0 min the Earth.',
    )
  })

  it('speaks Portuguese, with the decimal comma, for one body and for both', () => {
    const both = html('pt', answer([0.1, 0.1, 0.1, 4, 4, 4], [4, 4, 4, 4, 0.3, 4]))
    expect(both).toContain(
      'Resultado frágil: por 3 h 0 min desta Janela o Sol passa a menos de 0,5° do relevo, e por 1 h 0 min a Terra. Nessas horas um erro pequeno no relevo muda a resposta.',
    )
    const earth = html('pt', answer(far, [4, 4, 4, -0.2, 4, 4]))
    expect(earth).toContain('Resultado frágil: por 1 h 0 min desta Janela a Terra passa a menos de 0,5° do relevo.')
    expect(earth).not.toContain('o Sol')
  })

  it('offers "why?" only when it has somewhere to go, in each language', () => {
    const result = answer([0.1, 4, 4, 4, 4, 4], far)
    expect(html('en', result, () => {})).toContain('>why?</button>')
    expect(html('pt', result, () => {})).toContain('>por quê?</button>')
    expect(html('en', result)).not.toContain('<button')
  })
})
