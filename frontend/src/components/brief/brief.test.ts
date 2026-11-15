import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, type Mock } from 'vitest'
import type { Meta, VisibilityResult } from '../../api/client'
import { readLink, writeLink } from '../../domain/query'
import type { UncertaintyState } from '../../hooks/useUncertainty'
import { I18nProvider } from '../../i18n/I18nContext'
import { BriefSheet, PrintButton } from './Brief'
import { buildFigure } from './figure'
import { briefLinks } from './links'
import { printWait, printWhenLoaded, type PrintHost } from './print'
import { en, pt } from './strings'

// Read at run time, not imported: the web image has only frontend/ and its build
// type-checks this file (see src/buildContext.test.ts).
const example: { value: VisibilityResult } = JSON.parse(
  readFileSync(new URL('../../../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8'),
)
const result = example.value

const meta: Meta = {
  engine_version: '0.1.0',
  kernels: [],
  dems: [],
  coverage: {
    custom_max_latitude_deg: -80,
    window_min: '2025-01-01T00:00:00Z',
    window_max: '2032-12-31T23:59:59Z',
    max_duration_hours: 1440,
  },
  defaults: { site_id: '001', duration_hours: 708.73, observer_height_m: 2 },
  short_shadow_max_hours: 6,
}

// Connecting Ridge CR01, 240 h from 20 Nov 2026 12:00 UTC. Read off the contract's example by hand:
// the first Sunset is at 16:21 on 20 Nov, behind the rim of Shackleton 4.6 km away; the Earth sets at
// 03:45 on 30 Nov behind Mons Malapert, 134 km away.
const CURSOR = Date.parse('2026-11-20T12:00:00Z')
const GENERATED = Date.parse('2026-12-01T09:30:00Z')
const BASE = 'https://lunar.example/app/'
const NO_BAND: UncertaintyState = { status: 'none' }

function render(sheetResult: VisibilityResult, locale: 'en' | 'pt', uncertainty: UncertaintyState, cursorMs: number): string {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      locale,
      language: locale === 'pt' ? 'pt-BR' : 'en-GB',
      children: createElement(BriefSheet, { result: sheetResult, meta, cursorMs, baseUrl: BASE, generatedMs: GENERATED, uncertainty }),
    }),
  )
}

function sheet(locale: 'en' | 'pt', uncertainty: UncertaintyState = NO_BAND, cursorMs = CURSOR): string {
  return render(result, locale, uncertainty, cursorMs)
}

/** The text of the page: no drawing, no tags, and no-break spaces as plain ones. */
function textOf(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[\u00A0]/g, ' ')
    .replace(/\s+/g, ' ')
}

/** A band as the route would give it: the first Sunset of the example, and the metrics. */
const BAND: UncertaintyState = {
  status: 'ready',
  data: {
    query: result.query,
    clones: 32,
    method: 'dem_error_clones',
    error_products: [],
    events: [{ type: 'sunset', t: '2026-11-20T16:21:04Z', clones_with_event: 32, earliest: '2026-11-20T16:10:00Z', latest: '2026-11-20T16:40:00Z' }],
    metrics: {
      sunlit_hours: { low: 80, high: 90 },
      earth_visible_hours: { low: 230, high: 232 },
      sun_and_earth_hours: { low: 80, high: 88 },
      lcsp_hours: { low: 120, high: 130 },
      mean_sun_fraction: { low: 0.25, high: 0.3 },
    },
  },
}

describe('the printable brief', () => {
  it('has every field of the issue, in English', () => {
    const html = sheet('en')
    const text = textOf(html)
    // The Query: Site, coordinates, Window, Observer height.
    expect(text).toContain('Printable brief')
    expect(text).toContain('Connecting Ridge CR01')
    expect(text).toContain('89.53° S, 154.59° W')
    expect(text).toContain('20 Nov 2026, 12:00 to 30 Nov 2026, 12:00 UTC (10 d 0 h)')
    expect(text).toContain('Observer height 2 m above the ground')
    // The sentence, as on the screen: 16:21 minus 12:00 is 4 h 21 min; the Earthset is 9 d 15 h on.
    expect(text).toContain('The Sun sets in 4 h 21 min.')
    expect(text).toContain('The Earth sets in 9 d 15 h.')
    // The metrics, with the labels of the screen (87.62 h is 3 d 15 h, LCIP 73.82 h, LCSP 122.29 h, mean 0.2918).
    expect(text).toContain('Sun and Earth together 3 d 15 h')
    expect(text).toContain('Sun visible 3 d 15 h')
    expect(text).toContain('Earth visible, by its centre 9 d 15 h')
    expect(text).toContain('Longest sunlight (LCIP) 3 d 1 h')
    expect(text).toContain('Longest night (LCSP) 5 d 2 h')
    expect(text).toContain('Mean Sun fraction 29%')
    // The Countdown, each event with its Occluder.
    expect(text).toContain('Next Sunset')
    expect(text).toContain('20 Nov, 16:21 UTC, behind the rim of Shackleton, 4.6 km to the south.')
    expect(text).toContain('Next Earthset')
    expect(text).toContain('30 Nov, 03:45 UTC, behind Mons Malapert, 134 km to the south.')
    // The Horizon mask, drawn, with its two paths.
    expect(html).toContain('<svg')
    expect(html).toContain('brief__sun-path')
    expect(html).toContain('brief__earth-path')
    // The links, the engine version and the date it was made.
    expect(html).toContain(
      'href="https://lunar.example/app/?site=CR01&amp;t=2026-11-20T12%3A00%3A00Z&amp;lang=en&amp;start=2026-11-20&amp;hours=240&amp;height=2"',
    )
    expect(html).toContain('page=proof')
    expect(text).toContain('Engine version 0.1.0')
    expect(text).toContain('Generated 1 Dec 2026, 09:30 UTC')
  })

  it('has the same fields in Portuguese, with the glossary terms', () => {
    const html = sheet('pt')
    const text = textOf(html)
    expect(text).toContain('Resumo para imprimir')
    expect(text).toContain('Local Connecting Ridge CR01')
    expect(text).toContain('89,53° S, 154,59° O')
    expect(text).toContain('Janela 20 de nov. de 2026, 12:00 a 30 de nov. de 2026, 12:00 UTC (10 d 0 h)')
    expect(text).toContain('Altura do observador 2 m do chão')
    expect(text).toContain('O Sol se põe em 4 h 21 min.')
    expect(text).toContain('A Terra some em 9 d 15 h.')
    expect(text).toContain('Sol e Terra juntos 3 d 15 h')
    expect(text).toContain('Maior período de sol (LCIP) 3 d 1 h')
    expect(text).toContain('Maior noite (LCSP) 5 d 2 h')
    expect(text).toContain('Fração média do Sol 29%')
    expect(text).toContain('Contagem regressiva')
    expect(text).toContain('20 de nov., 16:21 UTC, atrás da borda de Shackleton, a 4,6 km a sul.')
    expect(text).toContain('30 de nov., 03:45 UTC, atrás de Mons Malapert, a 134 km a sul.')
    expect(html).toContain('lang=pt')
    expect(text).toContain('Versão do engine 0.1.0')
    expect(text).toContain('Gerado em 1 de dez. de 2026, 09:30 UTC')
  })

  it('shows the Uncertainty band on the numbers and on the Sunset when the answer has one', () => {
    const text = textOf(sheet('en', BAND))
    // 80 h and 88 h, written like the table writes them.
    expect(text).toContain('with the map’s height error: 3 d 8 h to 3 d 16 h')
    expect(text).toContain('between 16:10 and 16:40 with the map’s height error')
    expect(textOf(sheet('en'))).not.toContain('height error')
  })

  it('says a body that does not set again does not, with no instant invented', () => {
    // After the Earthset of the example nothing is left to count down to.
    const text = textOf(sheet('en', NO_BAND, Date.parse('2026-11-30T05:00:00Z')))
    expect(text).toContain('The Earth does not set again in this Window.')
    expect(text).not.toContain('Next Earthset In')
  })

  it('draws the Horizon mask all round and the two paths, with no Cursor', () => {
    const figure = buildFigure(result)
    // 720 samples of 0.5°, one point each, from north round to north.
    expect(figure.ridge.split(' ')).toHaveLength(720)
    expect(figure.sunPath.length).toBeGreaterThan(100)
    expect(figure.earthPath.length).toBeGreaterThan(0)
    for (const point of [...figure.sunPath, ...figure.earthPath]) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(720)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(220)
    }
    // No Sun or Earth disc of the view from the ground on the sheet: that is the Cursor.
    const html = sheet('en')
    expect(html).not.toContain('ground__sun')
    expect(html).not.toContain('ground__earth')
  })

  it('flags demonstration data', () => {
    const synthetic = { ...result, provenance: { ...result.provenance, synthetic: true } }
    expect(textOf(render(synthetic, 'en', NO_BAND, CURSOR))).toContain('Demonstration data, not a real answer.')
    expect(textOf(sheet('en'))).not.toContain('Demonstration data')
  })
})

describe('the brief in the link', () => {
  it('opens from ?page=brief and writes itself back', () => {
    expect(readLink('?page=brief').page).toBe('brief')
    expect(readLink('?page=brief&site=CR01').site).toBe('CR01')
    expect(writeLink(readLink('?page=brief&site=CR01'))).toBe('?site=CR01&page=brief')
  })

  it('leaves the Proof page and the plain address as they were', () => {
    expect(readLink('?page=proof').page).toBe('proof')
    expect(writeLink(readLink('?page=proof'))).toBe('?page=proof')
    expect(readLink('').page).toBe('answer')
    expect(readLink('?page=nonsense').page).toBe('answer')
    expect(writeLink(readLink(''))).toBe('')
  })

  it('prints the Query link in full, so a sheet kept for a week opens the same answer', () => {
    const links = briefLinks(BASE, result, 'pt', CURSOR)
    const query = new URL(links.query)
    expect(query.searchParams.get('site')).toBe('CR01')
    expect(query.searchParams.get('start')).toBe('2026-11-20')
    expect(query.searchParams.get('hours')).toBe('240')
    expect(query.searchParams.get('height')).toBe('2')
    expect(query.searchParams.get('lang')).toBe('pt')
    expect(query.searchParams.get('page')).toBeNull()
    expect(new URL(links.proof).searchParams.get('page')).toBe('proof')
  })

  it('writes a custom Site as its coordinate', () => {
    const custom = { ...result, query: { ...result.query, site: { ...result.query.site, id: 'custom', source: 'custom' as const } } }
    const query = new URL(briefLinks(BASE, custom, 'en', CURSOR).query)
    expect(query.searchParams.get('lat')).toBe(String(result.query.site.latitude_deg))
    expect(query.searchParams.get('lon')).toBe(String(result.query.site.longitude_deg))
    expect(query.searchParams.get('site')).toBeNull()
  })
})

describe('the Print button', () => {
  function host(fonts: Promise<unknown> | undefined): PrintHost & { print: Mock<() => void> } {
    return { print: vi.fn<() => void>(), document: fonts ? { fonts: { ready: fonts } } : undefined }
  }

  it('calls window.print when clicked, once the fonts are in', async () => {
    let loaded: () => void = () => undefined
    const win = host(new Promise<void>((resolve) => (loaded = resolve)))
    const button = PrintButton({ label: 'Print', disabled: false, onPrint: () => void printWhenLoaded(win) })
    expect(button.props.onClick).toBeTypeOf('function')
    button.props.onClick()
    await Promise.resolve()
    expect(win.print).not.toHaveBeenCalled()
    loaded()
    await vi.waitFor(() => expect(win.print).toHaveBeenCalledTimes(1))
  })

  it('prints at once when the browser has no font loading to wait for', async () => {
    const win = host(undefined)
    await printWhenLoaded(win)
    expect(win.print).toHaveBeenCalledTimes(1)
  })

  it('prints even when a font failed to load', async () => {
    const win = host(Promise.reject(new Error('font')))
    await printWhenLoaded(win)
    expect(win.print).toHaveBeenCalledTimes(1)
  })

  it('waits for the answer and for the Uncertainty band, and for nothing else', () => {
    expect(printWait(true, NO_BAND)).toBe('loading')
    expect(printWait(false, { status: 'computing', clonesDone: 3, clones: 32 })).toBe('band')
    expect(printWait(false, NO_BAND)).toBeNull()
    expect(printWait(false, BAND)).toBeNull()
    const button = PrintButton({ label: 'Print', disabled: true, onPrint: () => undefined })
    expect(button.props.disabled).toBe(true)
  })
})

describe('the brief copy', () => {
  it('has the same placeholders in both languages and never shows an "id"', () => {
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(holes(pt[key]), key).toEqual(holes(en[key]))
      expect(pt[key], key).not.toMatch(/\bids?\b/i)
      expect(en[key], key).not.toMatch(/\bids?\b/i)
    }
  })
})
