import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Request, type Route } from '@playwright/test'

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme(true, 'depends on the answer column and the header, not shown (issue #78)')

// the requirement: the day to land and the launch slip, both read from GET /sites/{site_id}/windows.
// The mock serves one slip answer for every request (Site 001 from the regression fixture, -30 to +150 days),
// so the year is built here from those same Windows, one per day of the year, and ranked the way
// the contract ranks them. Every number on screen is checked against that data.

interface ShiftedWindow {
  shift_days: number
  start: string
  end: string
  sun_and_earth_hours: number
  sunlit_hours: number
  earth_visible_hours: number
  lcsp_hours: number
}

const EXAMPLE = JSON.parse(readFileSync(new URL('../../contract/examples/site-windows-001-2026-11-14.example.json', import.meta.url), 'utf8'))
const SLIP: { windows: ShiftedWindow[]; best: ShiftedWindow; worst: ShiftedWindow } = EXAMPLE.value ?? EXAMPLE

const DAY_MS = 86_400_000
const isYear = (url: URL) => url.searchParams.get('first_shift_days') === '0'

/** The contract's ranking: most and least Sun-and-Earth time, earliest on a tie; typical is the lower median. */
function ranked(windows: ShiftedWindow[]) {
  const order = [...windows].sort((a, b) => a.sun_and_earth_hours - b.sun_and_earth_hours || a.shift_days - b.shift_days)
  const best = windows.reduce((top, w) => (w.sun_and_earth_hours > top.sun_and_earth_hours ? w : top))
  const worst = windows.reduce((low, w) => (w.sun_and_earth_hours < low.sun_and_earth_hours ? w : low))
  return { best, typical: order[Math.floor((order.length - 1) / 2)], worst }
}

/** A year of Windows for the request, each day carrying the numbers of one example Window. */
function year(url: URL, change: (w: ShiftedWindow) => ShiftedWindow = (w) => w) {
  const startMs = Date.parse(url.searchParams.get('start')!)
  const hours = Number(url.searchParams.get('duration_hours'))
  const windows: ShiftedWindow[] = []
  for (let day = 0; new Date(startMs + day * DAY_MS).getUTCFullYear() === new Date(startMs).getUTCFullYear(); day++) {
    const source = SLIP.windows[day % SLIP.windows.length]
    const start = startMs + day * DAY_MS
    windows.push(
      change({
        ...source,
        shift_days: day,
        start: new Date(start).toISOString().replace('.000', ''),
        end: new Date(start + hours * 3_600_000).toISOString().replace(/\.\d{3}/, ''),
      }),
    )
  }
  return { ...SLIP, planned_start: url.searchParams.get('start'), duration_hours: hours, windows, ...ranked(windows) }
}

const problem = (status: number, code: string) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({ type: `https://lunar-api.luizfbm.win/problems/${code}`, title: code, status, code }),
})

/**
 * The mock answers one Query whatever is asked; put the asked Window into it, as the API does, so
 * the panels hang from the Query in the link.
 */
async function echoQuery(page: Page) {
  await page.route('**/visibility?**', async (route: Route) => {
    const asked = new URL(route.request().url()).searchParams
    const body = await (await route.fetch()).json()
    const start = asked.get('start')!
    const hours = Number(asked.get('duration_hours'))
    body.query.start = start
    body.query.end = new Date(Date.parse(start) + hours * 3_600_000).toISOString().replace(/\.\d{3}/, '')
    body.query.duration_hours = hours
    await route.fulfill({ json: body })
  })
}

/** Serves the year from the example Windows; the slip comes from the mock itself. */
async function serveWindows(page: Page) {
  const asked: URL[] = []
  await page.route('**/sites/*/windows?**', (route: Route) => {
    const url = new URL(route.request().url())
    asked.push(url)
    return isYear(url) ? route.fulfill({ json: year(url) }) : route.fallback()
  })
  return asked
}

const dayPanel = (page: Page) => page.getByRole('region', { name: /^(When to land in|Quando pousar em) \d{4}$/ })
const slipPanel = (page: Page) => page.getByRole('region', { name: /^(If the launch slips|Se o lançamento atrasar)$/ })
const visibilityAsked = (page: Page) =>
  page.waitForRequest((request: Request) => new URL(request.url()).pathname === '/visibility')

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('the day to land says the best, typical and worst day of the year, as the route ranked them', async ({ page }) => {
    await echoQuery(page)
    const asked = await serveWindows(page)
    await page.goto('/?site=001&start=2027-03-12&hours=336')

    const panel = dayPanel(page)
    await expect(panel.getByRole('heading', { name: 'When to land in 2027' })).toBeVisible()
    const yearAsk = asked.find(isYear)!
    expect(Object.fromEntries(yearAsk.searchParams)).toMatchObject({
      start: '2027-01-01T00:00:00Z',
      duration_hours: '336',
      first_shift_days: '0',
      last_shift_days: '365',
    })
    // The Site the answer on screen is about: the mock answers every Query for CR01.
    expect(yearAsk.pathname).toBe('/sites/CR01/windows')

    const served = year(yearAsk)
    const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(iso))
    for (const [kind, label] of [
      ['best', 'The best day to land in 2027'],
      ['typical', 'A typical day to land in 2027'],
      ['worst', 'The worst day to land in 2027'],
    ] as const) {
      const card = panel.getByRole('button', { name: new RegExp(label) })
      await expect(card).toContainText(day(served[kind].start))
      await expect(card).toContainText(`Sun-and-Earth time ${Math.round(served[kind].sun_and_earth_hours)}\u00a0h`)
    }
    // The 14-day shortcut is the Query's own Window length.
    await expect(panel.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'true')
    // Every day of 2027 is a square, and the Query's day is the one marked.
    const calendar = panel.getByRole('group', { name: /Calendar of 2027/ })
    await expect(calendar.getByRole('button')).toHaveCount(365)
    await expect(calendar.locator('[aria-current="date"]')).toHaveCount(1)
    await expect(calendar.locator('[aria-current="date"]')).toHaveAccessibleName(/^12 Mar 2027/)
  })

  test('the slip draws the Query Window started 30 days early to 150 late, and names the best and worst start', async ({ page }) => {
    await echoQuery(page)
    const asked = await serveWindows(page)
    await page.goto('/?site=001&start=2026-11-14&hours=708.73')

    const panel = slipPanel(page)
    await expect(panel.getByRole('slider', { name: /Start of the Window/ })).toBeVisible()
    const slipAsk = asked.find((url) => !isYear(url))!
    expect(Object.fromEntries(slipAsk.searchParams)).toEqual({ start: '2026-11-14T00:00:00Z', duration_hours: '708.73', observer_height_m: '2' })
    await expect(panel.getByRole('button', { name: `Ask about the best start (${-SLIP.best.shift_days} days early)` })).toBeVisible()
    await expect(panel.getByRole('button', { name: `Ask about the worst start (${SLIP.worst.shift_days} days late)` })).toBeVisible()
    // No Darkness tolerance in the link: no marks, and the way to get them.
    await expect(panel.getByText('Give the battery a Darkness tolerance')).toBeVisible()
  })

  test('a Darkness tolerance in the link marks the Windows whose longest night fits, and goes when the link drops it', async ({ page }) => {
    await serveWindows(page)
    // The App writes the link once after it opens, from its own state, which has no tolerance yet:
    // a default the App leaves out tells when that write is done.
    await page.goto('/?view=orbit')
    await expect(page).not.toHaveURL(/view=/)
    const panel = slipPanel(page)
    await expect(panel.getByRole('slider')).toBeVisible()

    // The battery panel keeps its Darkness tolerance in the link; here the link gets one by hand.
    await page.evaluate(() => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${window.location.search ? '&' : '?'}tolerance=48`))
    const fit = SLIP.windows.filter((w) => w.lcsp_hours <= 48).length
    await expect(panel.getByText(`With a Darkness tolerance of 48\u00a0h, the lander gets through every night in ${fit} of these ${SLIP.windows.length} Windows.`)).toBeVisible()
    await expect(panel.getByText('fits', { exact: true })).toBeVisible()

    await page.evaluate(() => {
      const params = new URLSearchParams(window.location.search)
      params.delete('tolerance')
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
    })
    await expect(panel.getByText('Give the battery a Darkness tolerance')).toBeVisible()
  })

  test('clicking a slip makes that Window the Query, and the link keeps it through a reload', async ({ page }) => {
    await echoQuery(page)
    await serveWindows(page)
    await page.goto('/?site=001&start=2026-11-14&hours=708.73')
    const best = SLIP.best.start.slice(0, 10)
    await expect(slipPanel(page).getByRole('slider')).toBeVisible()

    const next = visibilityAsked(page)
    await slipPanel(page).getByRole('button', { name: /Ask about the best start/ }).click()
    expect(new URL((await next).url()).searchParams.get('start')).toBe(`${best}T00:00:00Z`)
    await expect(page).toHaveURL(new RegExp(`start=${best}`))
    await expect(page).toHaveURL(/hours=708.73/)

    const again = visibilityAsked(page)
    await page.reload()
    expect(new URL((await again).url()).searchParams.get('start')).toBe(`${best}T00:00:00Z`)
    await expect(dayPanel(page).getByRole('heading', { name: 'When to land in 2026' })).toBeVisible()
  })

  test('a day of the calendar and a Window length shortcut change the Query, and the link keeps both', async ({ page }) => {
    await echoQuery(page)
    await serveWindows(page)
    await page.goto('/?site=001&start=2027-03-12&hours=336')
    const panel = dayPanel(page)
    await expect(panel.getByRole('group', { name: /Calendar of 2027/ })).toBeVisible()

    let next = visibilityAsked(page)
    await panel.getByRole('button', { name: '7 days' }).click()
    expect(new URL((await next).url()).searchParams.get('duration_hours')).toBe('168')
    await expect(panel.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/hours=168/)

    next = visibilityAsked(page)
    await panel.getByRole('group', { name: /Calendar of 2027/ }).getByRole('button', { name: /^5 Aug 2027/ }).click()
    expect(new URL((await next).url()).searchParams.get('start')).toBe('2027-08-05T00:00:00Z')
    await expect(page).toHaveURL(/start=2027-08-05/)

    await page.reload()
    await expect(panel.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.locator('[aria-current="date"]').first()).toBeVisible()
    await expect(panel.getByRole('group', { name: /Calendar of 2027/ }).locator('[aria-current="date"]')).toHaveAccessibleName(/^5 Aug 2027/)
  })

  test('both panels say they are working while the route computes, and the answer above does not wait', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/sites/*/windows?**', async (route: Route) => {
      await gate
      const url = new URL(route.request().url())
      return isYear(url) ? route.fulfill({ json: year(url) }) : route.fallback()
    })
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(dayPanel(page).getByRole('status')).toHaveText(/^Working out every day of \d{4}\. This can take a minute…$/)
    await expect(slipPanel(page).getByRole('status')).toHaveText('Working out the same Window on 181 start days. This can take a minute…')

    release()
    await expect(dayPanel(page).getByRole('status')).toHaveCount(0)
    await expect(slipPanel(page).getByRole('slider')).toBeVisible()
  })

  test('a year and a slip with no Sun-and-Earth time at all say so in words', async ({ page }) => {
    const none = (w: ShiftedWindow) => ({ ...w, sun_and_earth_hours: 0 })
    await page.route('**/sites/*/windows?**', async (route: Route) => {
      const url = new URL(route.request().url())
      if (isYear(url)) return route.fulfill({ json: year(url, none) })
      const slip = await (await route.fetch()).json()
      const windows = slip.windows.map(none)
      return route.fulfill({ json: { ...slip, windows, best: windows[0], typical: windows[0], worst: windows[0] } })
    })
    await page.goto('/')

    await expect(dayPanel(page).getByText(/^In \d{4} no Window of .+ here has the Sun and the Earth up together/)).toBeVisible()
    await expect(slipPanel(page).getByText(/^From 30 days early to 150 days late, no start day gives this Window/)).toBeVisible()
    await expect(slipPanel(page).getByRole('slider')).toHaveCount(0)
  })

  test('a failed route says why in each panel, and Try again asks again', async ({ page }) => {
    let calls = 0
    await page.route('**/sites/*/windows?**', (route: Route) => {
      calls += 1
      if (calls <= 2) return route.fulfill(problem(503, 'busy'))
      const url = new URL(route.request().url())
      return isYear(url) ? route.fulfill({ json: year(url) }) : route.fallback()
    })
    await page.goto('/')

    for (const panel of [dayPanel(page), slipPanel(page)]) {
      await expect(panel.getByRole('alert')).toContainText('The server is busy right now. Try again in a few seconds.')
    }
    await dayPanel(page).getByRole('button', { name: 'Try again' }).click()
    await slipPanel(page).getByRole('button', { name: 'Try again' }).click()
    await expect(dayPanel(page).getByRole('alert')).toHaveCount(0)
    await expect(slipPanel(page).getByRole('slider')).toBeVisible()
    expect(calls).toBe(4)
  })

  test('a custom Site gets "Curated Sites only" in both panels, and the route is never asked', async ({ page }) => {
    const asked = await serveWindows(page)
    await page.route('**/visibility?**', async (route: Route) => {
      const params = new URL(route.request().url()).searchParams
      if (params.get('latitude_deg') === null) return route.fallback()
      const url = new URL(route.request().url())
      url.searchParams.delete('latitude_deg')
      url.searchParams.delete('longitude_deg')
      url.searchParams.set('site_id', '001')
      const body = await (await route.fetch({ url: url.toString() })).json()
      body.query.site = {
        id: 'custom',
        name: 'Custom Site',
        latitude_deg: Number(params.get('latitude_deg')),
        longitude_deg: Number(params.get('longitude_deg')),
        source: 'custom',
        source_reference: 'User-provided coordinate',
        region_id: null,
        curated: false,
        has_5m_dem: false,
      }
      await route.fulfill({ json: body })
    })
    await page.goto('/?lat=-89.3&lon=120')

    for (const panel of [dayPanel(page), slipPanel(page)]) {
      await expect(panel.getByText('Curated Sites only')).toBeVisible()
    }
    await expect(dayPanel(page).getByText(/pick a Site from the list to see its year/)).toBeVisible()
    await expect(dayPanel(page).getByRole('button', { name: '7 days' })).toHaveCount(0)
    expect(asked).toHaveLength(0)
  })

  test('at 390 px the calendar turns on its side, and nothing scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await serveWindows(page)
    await page.goto('/')
    const grid = dayPanel(page).getByRole('group', { name: /Calendar of/ })
    await expect(grid.getByRole('button').first()).toBeVisible()
    // Months become the columns: a label column plus twelve.
    const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
    expect(columns).toBe(13)
    // Each day is tall enough to tap at this width.
    const box = (await grid.getByRole('button').first().boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(16)
    await expect(slipPanel(page).getByRole('slider')).toBeVisible()
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(sideways).toBeLessThanOrEqual(0)
  })

  test('regression, regression: at 390 px the slip never draws wider than the screen, not even on its first frame', async ({ page }) => {
    // The chart was drawn at a 440 px guess and measured only after the first paint, so on a phone
    // its readout stuck out past the right edge until the measure came in. The first box the
    // readout ever has is recorded the moment it enters the page.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
      const seen = new MutationObserver(() => {
        const readout = document.querySelector('.p4slip__readout')
        if (!readout) return
        ;(window as unknown as { firstReadoutRight: number }).firstReadoutRight = readout.getBoundingClientRect().right
        seen.disconnect()
      })
      seen.observe(document, { childList: true, subtree: true })
    })
    await serveWindows(page)
    await page.goto('/')
    await expect(slipPanel(page).getByRole('slider')).toBeVisible()
    const right = await page.evaluate(() => (window as unknown as { firstReadoutRight: number }).firstReadoutRight)
    expect(right).toBeLessThanOrEqual(390)
  })
})

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('both panels speak Portuguese, with the glossary terms', async ({ page }) => {
    await echoQuery(page)
    await serveWindows(page)
    await page.goto('/?site=001&start=2027-03-12&hours=336&lang=pt')

    await expect(dayPanel(page).getByRole('heading', { name: 'Quando pousar em 2027' })).toBeVisible()
    await expect(dayPanel(page).getByRole('button', { name: /O melhor dia para pousar em 2027/ })).toBeVisible()
    await expect(dayPanel(page).getByRole('group', { name: 'Duração da Janela' })).toBeVisible()
    await expect(slipPanel(page).getByRole('heading', { name: 'Se o lançamento atrasar' })).toBeVisible()
    await expect(slipPanel(page).getByText(/^Como planejada, esta Janela tem o Sol e a Terra no céu ao mesmo tempo/)).toBeVisible()
    await expect(slipPanel(page).getByText(/^Dê à bateria uma tolerância à escuridão/)).toBeVisible()
  })
})
