import { expect, test, type Page, type Route } from '@playwright/test'

// the requirement: plan B for a launch that slips, read from GET /sites/{site_id}/neighbours.
// The mock serves one slip answer (Site 001 from the regression fixture) and one neighbours answer (Site 001
// slipped a week, with the other Sites of Connecting Ridge) whatever is asked. Every number on
// screen is checked against what the mock sent, read here from the responses themselves.

interface ShiftedWindow {
  shift_days: number
  start: string
  sun_and_earth_hours: number
}
interface Neighbour {
  site: { id: string; name: string }
  distance_km: number
  metrics: { sun_and_earth_hours: number; lcsp_hours: number }
}
interface Neighbours {
  query: { start: string; site: { name: string } }
  metrics: { sun_and_earth_hours: number }
  neighbours: Neighbour[]
}

const slipPanel = (page: Page) => page.getByRole('region', { name: /^(If the launch slips|Se o lançamento atrasar)$/ })
const planB = (page: Page) =>
  page.getByRole('region', { name: /^(If it slips, these nearby Sites still work|Se atrasar, estes Locais vizinhos ainda servem)$/ })

/** The slip as the mock sends it, and every neighbours request the page makes. */
async function watch(page: Page) {
  const slip: { windows: ShiftedWindow[] } = { windows: [] }
  const asked: URL[] = []
  const answers: Neighbours[] = []
  await page.route('**/sites/*/windows?**', async (route: Route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch()
    const body = await response.json()
    if (url.searchParams.get('first_shift_days') !== '0') slip.windows = body.windows
    await route.fulfill({ response, json: body })
  })
  await page.route('**/sites/*/neighbours?**', async (route: Route) => {
    asked.push(new URL(route.request().url()))
    const response = await route.fetch()
    const body = (await response.json()) as Neighbours
    answers.push(body)
    await route.fulfill({ response, json: body })
  })
  return { slip, asked, answers }
}

/** The late start with the least Sun-and-Earth time, the earlier on a tie. */
function worstLate(windows: ShiftedWindow[]): ShiftedWindow {
  return windows
    .filter((w) => w.shift_days > 0)
    .reduce((low, w) => (w.sun_and_earth_hours < low.sun_and_earth_hours ? w : low))
}

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('a slip that costs nothing says so and asks for no nearby Site', async ({ page }) => {
    const { slip, asked } = await watch(page)
    await page.goto('/?site=001&start=2026-11-14&hours=708.73')
    const panel = planB(page)
    await expect(panel).toBeVisible()
    const week = slip.windows.find((w) => w.shift_days === 7)!
    const planned = slip.windows.find((w) => w.shift_days === 0)!
    // In the mock, a week late is better than planned at Site 001.
    expect(week.sun_and_earth_hours).toBeGreaterThan(planned.sun_and_earth_hours)
    await expect(panel.getByRole('button', { name: '7 days late' })).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.getByText(/That slip costs nothing here\.$/)).toBeVisible()
    await expect(panel.getByRole('link')).toHaveCount(0)
    expect(asked).toHaveLength(0)
  })

  test('the worst late start lists the top three nearby Sites in the route order, with their numbers', async ({ page }) => {
    const { slip, asked, answers } = await watch(page)
    await page.goto('/?site=001&start=2026-11-14&hours=708.73')
    const panel = planB(page)
    await expect(panel).toBeVisible()
    const worst = worstLate(slip.windows)
    await panel.getByRole('button', { name: `Worst late start (${worst.shift_days} days)` }).click()

    const links = panel.getByRole('link')
    await expect(links).toHaveCount(3)
    expect(asked).toHaveLength(1)
    expect(asked[0].pathname).toBe('/sites/001/neighbours')
    expect(Object.fromEntries(asked[0].searchParams)).toEqual({ start: worst.start, duration_hours: '708.73', observer_height_m: '2' })

    const answer = answers[0]
    const top = answer.neighbours.slice(0, 3)
    for (const [i, row] of top.entries()) {
      const link = links.nth(i)
      await expect(link).toContainText(row.site.name)
      await expect(link).toContainText(`${Math.round(row.distance_km * 10) / 10} km away`)
      await expect(link).toContainText(row.metrics.lcsp_hours === 0 ? 'the Sun never sets' : 'longest night')
      const gap = row.metrics.sun_and_earth_hours - answer.metrics.sun_and_earth_hours
      await expect(link).toContainText(Math.abs(gap) < 1 / 60 ? `as much as ${answer.query.site.name}` : gap > 0 ? 'more than' : 'less than')
    }
    // Ranked as the route sent them: most Sun-and-Earth time first.
    const hours = top.map((r) => r.metrics.sun_and_earth_hours)
    expect([...hours].sort((a, b) => b - a)).toEqual(hours)
  })

  test('a click makes the nearby Site the chosen Site on the slipped date, and the link keeps it', async ({ page }) => {
    const { slip, answers } = await watch(page)
    await page.goto('/?site=001&start=2026-11-14&hours=708.73&height=2')
    const panel = planB(page)
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: `Worst late start (${worstLate(slip.windows).shift_days} days)` }).click()
    await expect(panel.getByRole('link')).toHaveCount(3)

    const first = answers[0].neighbours[0]
    const day = answers[0].query.start.slice(0, 10)
    const asked = page.waitForRequest((request) => new URL(request.url()).pathname === '/visibility')
    await panel.getByRole('link').first().click()
    const visibility = new URL((await asked).url()).searchParams
    expect(visibility.get('site_id')).toBe(first.site.id)
    expect(visibility.get('start')).toBe(`${day}T00:00:00Z`)
    await expect(page).toHaveURL(new RegExp(`site=${first.site.id}`))
    await expect(page).toHaveURL(new RegExp(`start=${day}`))
    await expect(page).toHaveURL(/hours=708.73/)

    const again = page.waitForRequest((request) => new URL(request.url()).pathname === '/visibility')
    await page.reload()
    expect(new URL((await again).url()).searchParams.get('site_id')).toBe(first.site.id)
  })

  test('a failed neighbours route says why, and Try again asks again', async ({ page }) => {
    const { slip } = await watch(page)
    let calls = 0
    await page.route('**/sites/*/neighbours?**', (route: Route) => {
      calls += 1
      return calls === 1
        ? route.fulfill({ status: 503, json: { code: 'busy', title: 'Busy', status: 503, type: 'about:blank' } })
        : route.fallback()
    })
    await page.goto('/?site=001&start=2026-11-14&hours=708.73')
    const panel = planB(page)
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: `Worst late start (${worstLate(slip.windows).shift_days} days)` }).click()
    await expect(panel.getByRole('alert')).toBeVisible()
    await panel.getByRole('button', { name: 'Try again' }).click()
    await expect(panel.getByRole('link')).toHaveCount(3)
    await expect(slipPanel(page).getByRole('slider')).toBeVisible()
  })
})

test.describe('em português', () => {
  test.use({ locale: 'pt-BR' })

  test('o título e o atraso padrão vêm em português', async ({ page }) => {
    await watch(page)
    await page.goto('/?site=001&start=2026-11-14&hours=708.73')
    const panel = planB(page)
    await expect(panel.getByRole('heading', { name: 'Se atrasar, estes Locais vizinhos ainda servem' })).toBeVisible()
    await expect(panel.getByRole('button', { name: '7 dias de atraso' })).toHaveAttribute('aria-pressed', 'true')
  })
})
