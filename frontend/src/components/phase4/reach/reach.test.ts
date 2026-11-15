import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { VisibilityResult } from '../../../api/client'
import { I18nProvider } from '../../../i18n/I18nContext'
import { en, pt } from '../../../i18n/messages'
import { Reach } from './Reach'
import { HORIZON_REACH_KM, reachItems } from './logic'

// Read at run time, not imported: the web image has only frontend/ and its build
// type-checks this file (see src/buildContext.test.ts).
const example: { value: VisibilityResult } = JSON.parse(
  readFileSync(new URL('../../../../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8'),
)
const result = example.value

// Connecting Ridge CR01: the Sun sets at 20 Nov 16:21 behind high ground 4.6 km away, the Earth sets
// at 30 Nov 03:45 behind Mons Malapert, 134 km away. Read off the contract's example by hand.
const START = Date.parse('2026-11-20T12:00:00Z')
const SUN_DOWN = Date.parse('2026-11-21T00:00:00Z')
const AFTER_EARTHSET = Date.parse('2026-11-30T05:00:00Z')

function render(locale: 'en' | 'pt', cursorMs: number): string {
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider,
      { locale, language: locale === 'pt' ? 'pt-BR' : 'en-GB', children: createElement(Reach, { result, cursorMs }) },
    ),
  )
  // Tags become spaces; a no-break space stays one, since it is part of what is said.
  return html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n]+/g, ' ').trim()
}

describe('how far our horizon reaches', () => {
  // backend/app/horizon.py walks the terrain out to 300 000 m (the outer edge of the 240 m band).
  it('is the 300 km the engine walks, not the 304 km edge of the ground map', () => {
    expect(HORIZON_REACH_KM).toBe(300)
  })

  it('names the Occluder of the next Sunset and of the next Earthset at the Cursor', () => {
    expect(reachItems(result, START)).toEqual([
      { event: 'sunset', distanceM: 4564.132080078125 },
      { event: 'earthset', distanceM: 133615.22705078125 },
    ])
  })

  it('follows the Cursor: with the Sun down it names the Occluder of the Sunrise', () => {
    expect(reachItems(result, SUN_DOWN).map((item) => item.event)).toEqual(['sunrise', 'earthset'])
  })

  it('has no Occluder to name once nothing changes before the Window ends', () => {
    expect(reachItems(result, AFTER_EARTHSET)).toEqual([])
  })

  it('says it in English, with the rule of the disc', () => {
    expect(render('en', START)).toBe(
      `${'Our horizon reaches 300\u00a0km; the Sun sets behind high ground 4.6\u00a0km away and the Earth sets behind high ground 134\u00a0km away.'} ${en.rule}`,
    )
    expect(en.rule).toBe('The Sun counts as visible while any part of its disc is in view; the Earth counts by its centre.')
  })

  it('says it in Portuguese, with the rule of the disc', () => {
    expect(render('pt', START)).toBe(
      `${'O nosso horizonte vai até 300\u00a0km; o Sol se põe atrás de um relevo a 4,6\u00a0km e a Terra some atrás de um relevo a 134\u00a0km.'} ${pt.rule}`,
    )
    expect(pt.rule).toBe('O Sol conta como visível enquanto qualquer pedaço do disco estiver à vista; a Terra conta pelo centro.')
  })

  it('says the reach alone when there is no Occluder to name', () => {
    expect(render('en', AFTER_EARTHSET)).toBe(`Our horizon reaches 300\u00a0km. ${en.rule}`)
    expect(render('pt', AFTER_EARTHSET)).toBe(`O nosso horizonte vai até 300\u00a0km. ${pt.rule}`)
  })
})
