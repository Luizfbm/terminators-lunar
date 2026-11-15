import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Site, VisibilityResult } from '../../../api/client'
import { I18nProvider } from '../../../i18n/I18nContext'
import type { NeighbourSite, SiteNeighbours } from '../slip/slipPlan'
import { NearbyView, type NearbyState } from './NearbyLine'
import { bearingDeg, bestNeighbour, nearbyHref, nearbyOf, nearbyRequest } from './nearby'
import { en, pt } from './strings'

// Read at run time, not imported: the web image has only frontend/ and its build
// type-checks this file (see src/buildContext.test.ts).
const example: { value: VisibilityResult } = JSON.parse(
  readFileSync(new URL('../../../../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8'),
)
// Connecting Ridge CR01 over 20 Nov 12:00 UTC + 240 h: 87.6 h with the Sun and the Earth together.
const here = example.value
const OWN_HOURS = here.metrics.sun_and_earth_hours

const DEG = Math.PI / 180

/** A Site `distance` (unit sphere) away from `from`, towards `bearing`, built by adding vectors in the tangent plane. */
function siteAt(from: Site, bearing: number, distance: number, id: string, name: string): Site {
  const lat = from.latitude_deg * DEG
  const lon = from.longitude_deg * DEG
  const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
  const east = [-Math.sin(lon), Math.cos(lon), 0]
  const north = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)]
  const v = up.map((u, i) => u + distance * (Math.sin(bearing * DEG) * east[i] + Math.cos(bearing * DEG) * north[i]))
  const norm = Math.hypot(...v)
  return {
    ...from,
    id,
    name,
    latitude_deg: Math.asin(v[2] / norm) / DEG,
    longitude_deg: Math.atan2(v[1], v[0]) / DEG,
  }
}

const metrics = (both: number): VisibilityResult['metrics'] => ({ ...here.metrics, sun_and_earth_hours: both })
const neighbour = (site: Site, distanceKm: number, both: number): NeighbourSite => ({ site, distance_km: distanceKm, metrics: metrics(both) })
const answer = (...neighbours: NeighbourSite[]): SiteNeighbours => ({ query: here.query, metrics: here.metrics, neighbours })

// 8.2 km south-west of CR01 (a tangent-plane step of 8.2 / 1737.4 of the radius), with 21 d 4 h (508 h) of both.
const SW = siteAt(here.query.site, 225, 8.2 / 1737.4, 'CR09', 'Connecting Ridge CR09')
const better = answer(neighbour(SW, 8.2, 508))
const ready = (data: SiteNeighbours): NearbyState => ({ status: 'ready', data })

function render(locale: 'en' | 'pt', state: NearbyState, result: VisibilityResult = here): string {
  return renderToStaticMarkup(
    createElement(I18nProvider, { locale, language: locale === 'pt' ? 'pt-BR' : 'en-GB', children: createElement(NearbyView, { result, state }) }),
  )
}
// A no-break space reads as a space: it is only there to keep a number with its unit.
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/[\u00a0\u202f]/g, ' ')

const custom: VisibilityResult = {
  ...here,
  query: { ...here.query, site: { ...here.query.site, id: 'custom', name: 'Custom Site', source: 'custom', curated: false } },
}

describe('the nearby Site line', () => {
  it('says, in English, which Site is near, how far, which way, and how much more it has', () => {
    expect(plain(render('en', ready(better)))).toBe(
      'Nearby, Connecting Ridge CR09 (8.2 km to the south-west) has the Sun and the Earth for 21 d 4 h in this Window, against 3 d 15 h here.',
    )
  })

  it('says it in Portuguese, with the compass direction and the app’s own word for the Window', () => {
    expect(plain(render('pt', ready(better)))).toBe(
      'Perto daqui, Connecting Ridge CR09 (a 8,2 km, para o sudoeste) tem Sol e Terra por 21 d 4 h nesta Janela, contra 3 d 15 h aqui.',
    )
  })

  it('puts the name of the neighbour in a link that makes it the chosen Site', () => {
    const html = render('en', ready(better))
    expect(html).toMatch(/<a href="\?[^"]*site=CR09[^"]*">Connecting Ridge CR09<\/a>/)
  })

  it('appears only when the best neighbour has more Sun-and-Earth time than this Site', () => {
    // The best of several is the one named, wherever the route put it, and a tie goes to the nearer one.
    const far = neighbour(siteAt(here.query.site, 90, 0.02, 'CR02', 'Connecting Ridge CR02'), 34.7, 500)
    const near = neighbour(SW, 8.2, 500)
    expect(bestNeighbour(answer(far, near))?.site.id).toBe('CR09')
    expect(bestNeighbour(answer(neighbour(SW, 8.2, 100), neighbour(far.site, 34.7, 300)))?.site.id).toBe('CR02')
    expect(nearbyOf(here, answer(far, near))?.site.id).toBe('CR09')
  })

  it('is not there when the best neighbour has less', () => {
    expect(render('en', ready(answer(neighbour(SW, 8.2, OWN_HOURS - 10))))).toBe('')
  })

  it('is not there when the best neighbour has the same, or a difference under a minute', () => {
    expect(render('en', ready(answer(neighbour(SW, 8.2, OWN_HOURS))))).toBe('')
    expect(render('en', ready(answer(neighbour(SW, 8.2, OWN_HOURS + 1 / 120))))).toBe('')
  })

  it('is not there when the Site has no neighbour', () => {
    expect(render('en', ready(answer()))).toBe('')
  })

  it('is not there while the neighbours are loading, or when the route answers with an error', () => {
    expect(render('en', { status: 'loading' })).toBe('')
    expect(render('en', null)).toBe('')
    // 422 outside_coverage, 404, 503 or no network: an extra, so no message.
    for (const code of ['outside_coverage', 'not_found', 'busy', 'network', 'unknown']) {
      expect(render('en', { status: 'error', code })).toBe('')
      expect(render('pt', { status: 'error', code })).toBe('')
    }
  })

  it('is not there for a Custom Site, even if an answer were given', () => {
    expect(render('en', ready(better), custom)).toBe('')
    expect(nearbyOf(custom, better)).toBeNull()
  })
})

describe('what the line asks', () => {
  it('asks the neighbours of the Site over the same Window and Observer height', () => {
    const request = nearbyRequest(here)
    expect(request.siteId).toBe('CR01')
    expect(Object.fromEntries(request.params)).toEqual({ start: '2026-11-20T12:00:00Z', duration_hours: '240', observer_height_m: '2' })
  })
})

describe('the direction of the neighbour', () => {
  it('is the great-circle bearing: north 0, east 90, south 180, west 270 on the equator', () => {
    const origin = { latitude_deg: 0, longitude_deg: 0 }
    expect(bearingDeg(origin, { latitude_deg: 1, longitude_deg: 0 })).toBeCloseTo(0, 6)
    expect(bearingDeg(origin, { latitude_deg: 0, longitude_deg: 1 })).toBeCloseTo(90, 6)
    expect(bearingDeg(origin, { latitude_deg: -1, longitude_deg: 0 })).toBeCloseTo(180, 6)
    expect(bearingDeg(origin, { latitude_deg: 0, longitude_deg: -1 })).toBeCloseTo(270, 6)
  })

  it('agrees, near the pole, with a point built by stepping in the tangent plane', () => {
    // Where the 360° wrap and the shrinking meridians would break a flat lat/lon difference.
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const site = siteAt(here.query.site, bearing, 0.005, 'x', 'x')
      const said = bearingDeg(here.query.site, site)
      const apart = Math.abs(((said - bearing + 540) % 360) - 180)
      expect(apart).toBeLessThan(0.5)
    }
  })

  it('names the compass point the bearing falls in, in both languages', () => {
    const to = (bearing: number) => answer(neighbour(siteAt(here.query.site, bearing, 0.005, 'N1', 'Ridge N1'), 8.7, 500))
    expect(plain(render('en', ready(to(0))))).toContain('to the north)')
    expect(plain(render('en', ready(to(92))))).toContain('to the east)')
    expect(plain(render('en', ready(to(315))))).toContain('to the north-west)')
    expect(plain(render('pt', ready(to(0))))).toContain('para o norte)')
    expect(plain(render('pt', ready(to(92))))).toContain('para o leste)')
    expect(plain(render('pt', ready(to(315))))).toContain('para o noroeste)')
  })
})

describe('the link on the neighbour', () => {
  const params = (href: string) => new URLSearchParams(href.slice(href.indexOf('?')))

  it('makes the neighbour the Site, on the same Window and Observer height', () => {
    const href = nearbyHref('', here, 'CR09')
    expect(Object.fromEntries(params(href))).toEqual({ site: 'CR09', start: '2026-11-20', hours: '240', height: '2' })
  })

  it('keeps the rest of the link (language, page settings) and starts the Cursor over', () => {
    const href = nearbyHref('?site=CR01&start=2026-11-20&hours=240&lang=pt&t=2026-11-22T00:00:00Z&view=ground&radius=60&compare=1&bsite=CR03', here, 'CR09')
    const kept = params(href)
    expect(kept.get('site')).toBe('CR09')
    expect(kept.get('lang')).toBe('pt')
    expect(kept.get('view')).toBe('ground')
    expect(kept.get('radius')).toBe('60')
    expect(kept.get('bsite')).toBe('CR03')
    expect(kept.has('t')).toBe(false)
  })

  it('is on the rendered link, so a click on the name goes to the Query of that Site', () => {
    const html = render('pt', ready(better))
    expect(html).toContain('href="?site=CR09&amp;start=2026-11-20&amp;hours=240&amp;height=2"')
  })
})

describe('the strings', () => {
  it('have the same keys in Portuguese and English, with the same placeholders', () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(pt[key].match(/\{\w+\}/g)?.sort()).toEqual(en[key].match(/\{\w+\}/g)?.sort())
    }
  })
})
