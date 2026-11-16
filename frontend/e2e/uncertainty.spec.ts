import { expect, test } from './classic'
import type { Page, Route } from '@playwright/test'

// The DEM Uncertainty band (ADR 0003). /visibility/uncertainty runs in the background: it answers
// 202 with the progress, then 200 with the band. The mock only knows the 200, so the test serves
// both itself, from the Events the mock gave /visibility, and checks the Countdown and "Stats for
// nerds" say them in both languages.

type Event = { type: string; t: string }
type Visibility = { query: { start: string; end: string }; events: Event[] }

const MINUTE_MS = 60_000
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const instant = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

/** The first Event of the type after the Window start: the one the Countdown is counting to. */
function nextOf(visibility: Visibility, type: string): Event {
  const start = Date.parse(visibility.query.start)
  const found = visibility.events.filter((event) => event.type === type && Date.parse(event.t) > start).sort((a, b) => Date.parse(a.t) - Date.parse(b.t))[0]
  if (!found) throw new Error(`the mock has no ${type} after the Window start`)
  return found
}

/**
 * Serves 202 first, holds the second ask until `release()`, then serves 200: the next Sunset
 * between 40 min before and 40 min after, the next Earthset in 9 of 32 clones only, the rest as is.
 */
async function serveBand(page: Page, sunsetSpreadMs = 40 * MINUTE_MS) {
  const seen = new Promise<Visibility>((resolve) => {
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/visibility') void response.json().then(resolve)
    })
  })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls = { total: 0, inFlight: 0, mostInFlight: 0 }
  await page.route('**/visibility/uncertainty**', async (route: Route) => {
    calls.total += 1
    calls.inFlight += 1
    calls.mostInFlight = Math.max(calls.mostInFlight, calls.inFlight)
    const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Retry-After' }
    try {
      if (calls.total === 1) {
        await route.fulfill({ status: 202, contentType: 'application/json', headers: { ...headers, 'retry-after': '1' }, body: JSON.stringify({ status: 'computing', clones_done: 12, clones: 32 }) })
        return
      }
      await gate
      const visibility = await seen
      const sunset = nextOf(visibility, 'sunset')
      const earthset = nextOf(visibility, 'earthset')
      const is = (event: Event, other: Event) => event.type === other.type && event.t === other.t
      const events = visibility.events.map((event) => {
        const ms = Date.parse(event.t)
        if (is(event, sunset)) {
          return { type: event.type, t: event.t, earliest: instant(ms - sunsetSpreadMs), latest: instant(ms + sunsetSpreadMs), clones_with_event: 32 }
        }
        if (is(event, earthset)) return { type: event.type, t: event.t, clones_with_event: 9 }
        return { type: event.type, t: event.t, earliest: event.t, latest: event.t, clones_with_event: 32 }
      })
      const metric = { low: 100, high: 110 }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          query: visibility.query,
          clones: 32,
          method: 'dem_error_clones',
          error_products: [],
          events,
          metrics: { sunlit_hours: metric, earth_visible_hours: { low: 324.8, high: 324.8 }, sun_and_earth_hours: metric, lcsp_hours: { low: 0, high: 2.25 }, mean_sun_fraction: { low: 0.996, high: 1 } },
        }),
      })
    } finally {
      calls.inFlight -= 1
    }
  })
  return { release, calls, seen }
}

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('says it is working out the band, then gives the window next to the Sunset and that the Earthset may not happen', { tag: '@smoke' }, async ({ page }) => {
    const band = await serveBand(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // 202: the progress, and the answer already on screen.
    await expect(page.getByText('working out the band… 12 of 32').first()).toBeVisible()
    band.release()

    const visibility = await band.seen
    const sunset = Date.parse(nextOf(visibility, 'sunset').t)
    await expect(page.getByText(`between ${hhmm(sunset - 40 * MINUTE_MS)} and ${hhmm(sunset + 40 * MINUTE_MS)} with the map’s height error`)).toBeVisible()
    await expect(page.getByText('with the map’s height error it may not happen at all: only in 9 of 32 versions of the terrain')).toBeVisible()
    await expect(page.getByText(/working out the band/)).toHaveCount(0)
    // Asked twice, never two at once.
    expect(band.calls.total).toBe(2)
    expect(band.calls.mostInFlight).toBe(1)
  })

  test('puts the range next to the metrics in "Stats for nerds"', async ({ page }) => {
    const band = await serveBand(page)
    band.release()
    await page.goto('/?stats=1')
    const numbers = page.getByRole('table', { name: 'The numbers for this Window' })
    await expect(numbers.getByRole('row', { name: /Longest night \(LCSP\)/ })).toContainText('with the map’s height error: 0 min to 2 h 15 min')
    await expect(numbers.getByRole('row', { name: /Mean Sun fraction/ })).toContainText('with the map’s height error: 99.6% to 100%')
    // Low and high the same: no range, just that the error does not move the number.
    await expect(numbers.getByRole('row', { name: /^Earth visible, by its centre/ })).toContainText('the map’s height error does not change this number')
    // The band covers the Earth by its centre only: the contract has no band for "with any part".
    await expect(numbers.getByRole('row', { name: /^Earth visible, with any part of its disc/ })).not.toContainText('map’s height error')
    // The LCIP is not in the band.
    await expect(numbers.getByRole('row', { name: /Longest sunlight/ })).not.toContainText('with the map’s height error')
  })

  test('says the error does not change the time when the window is narrower than a minute', async ({ page }) => {
    // 14 s wide, as the backend measures Site 001's Earthrise band.
    const band = await serveBand(page, 7_000)
    band.release()
    await page.goto('/')
    await expect(page.getByText('the map’s height error does not change this time')).toBeVisible()
    await expect(page.getByText(/between \d\d:\d\d and \d\d:\d\d with the map’s height error/)).toHaveCount(0)
  })

  test('shows nothing, and keeps the answer, when the route says it cannot', async ({ page }) => {
    await page.route('**/visibility/uncertainty**', (route: Route) =>
      route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ title: 'busy', status: 503, code: 'busy' }) }),
    )
    await page.goto('/?stats=1')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('table', { name: 'The numbers for this Window' })).toBeVisible()
    await expect(page.getByText(/map’s height error/)).toHaveCount(0)
    await expect(page.getByText(/working out the band/)).toHaveCount(0)
  })
})

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('diz que está calculando a faixa, depois a janela do Pôr do Sol e que o sumiço da Terra pode nem acontecer', async ({ page }) => {
    const band = await serveBand(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await expect(page.getByText('calculando a faixa… 12 de 32').first()).toBeVisible()
    band.release()

    const visibility = await band.seen
    const sunset = Date.parse(nextOf(visibility, 'sunset').t)
    await expect(page.getByText(`entre ${hhmm(sunset - 40 * MINUTE_MS)} e ${hhmm(sunset + 40 * MINUTE_MS)} com o erro de altura do mapa`)).toBeVisible()
    await expect(page.getByText('com o erro de altura do mapa, pode nem acontecer: só em 9 de 32 versões do relevo')).toBeVisible()
    await expect(page.getByText(/calculando a faixa/)).toHaveCount(0)
  })

  test('põe a faixa ao lado das métricas nas Estatísticas para nerds', async ({ page }) => {
    const band = await serveBand(page)
    band.release()
    await page.goto('/?stats=1')
    const numbers = page.getByRole('table', { name: 'Os números desta Janela' })
    await expect(numbers.getByRole('row', { name: /Fração média do Sol/ })).toContainText('com o erro de altura do mapa: 99,6% a 100%')
    await expect(numbers.getByRole('row', { name: /^Terra visível, pelo centro/ })).toContainText('o erro de altura do mapa não muda este número')
    // A faixa cobre a Terra pelo centro; o contrato não tem faixa para "com qualquer pedaço".
    await expect(numbers.getByRole('row', { name: /^Terra visível, com qualquer pedaço do disco/ })).not.toContainText('erro de altura do mapa')
  })

  test('diz que o erro não muda o horário quando a janela é mais estreita que um minuto', async ({ page }) => {
    const band = await serveBand(page, 7_000)
    band.release()
    await page.goto('/')
    await expect(page.getByText('o erro de altura do mapa não muda este horário')).toBeVisible()
    await expect(page.getByText(/entre \d\d:\d\d e \d\d:\d\d com o erro de altura do mapa/)).toHaveCount(0)
  })
})
