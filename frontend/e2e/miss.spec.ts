import { readFileSync } from 'node:fs'
import { expect, test } from './classic'
import type { Page, Route } from '@playwright/test'

const example = (name: string) => JSON.parse(readFileSync(new URL(`../../contract/examples/${name}`, import.meta.url), 'utf8'))
const scatterExample = example('visibility-scatter-001.example.json')
const terrainExample = example('terrain-001.example.json')

// "If the lander misses" (the implementation). The mock answers with the contract's examples: the Landing scatter
// of Site 001 at 250 m (the Sun and the Earth together drop to nothing 250 m to the west) and the
// Slope within 100 m with no permanent_shadow field. States the examples lack are intercepted.

const problem = (status: number, code: string): Parameters<Route['fulfill']>[0] => ({
  status,
  contentType: 'application/problem+json',
  headers: status === 503 ? { 'Retry-After': '5' } : undefined,
  body: JSON.stringify({ type: `https://lunar-api.luizfbm.win/problems/${code}`, title: code, status, code }),
})

const json = (value: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })

const panel = (page: Page) => page.getByRole('region', { name: /^(If the lander misses|Se o módulo errar o alvo)$/ })

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('names the worst direction, the range of each metric and the Slope against NASA’s limit', async ({ page }) => {
    const asked: URL[] = []
    page.on('request', (request) => {
      if (request.url().includes('/visibility/scatter')) asked.push(new URL(request.url()))
    })
    const answered = page.waitForResponse((response) => new URL(response.url()).pathname === '/visibility')
    await open(page)
    const { query } = await (await answered).json()
    const miss = panel(page)
    await expect(miss.getByText(/Land 250\sm to the west and the lander never has the Sun and the Earth at the same time\./)).toBeVisible()
    await expect(miss.getByText(/250\sm to the north-west the longest night lasts 16\sd 14\sh\. At the Site the Sun never sets\./)).toBeVisible()
    await expect(miss.getByRole('button', { name: '250 m' })).toHaveAttribute('aria-pressed', 'true')
    await expect(miss.getByText(/250\sm is how far IM-2 Athena came down from its target/)).toBeVisible()

    const table = miss.getByRole('table', { name: 'Each metric at the Site and across the 19 points' })
    await expect(table.getByRole('row')).toHaveCount(7)
    await expect(table.getByRole('row', { name: /Sun and Earth together/ })).toContainText(/0\smin to 13\sd 17\sh/)

    await expect(miss.getByText(/This is landing error/)).toBeVisible()
    await expect(miss.getByRole('heading', { name: /The ground within 100\sm/ })).toBeVisible()
    await expect(miss.getByText(/half the ground is flatter than 2\.6° and 95\s?%\sis flatter than 5°\. The steepest cell is 5\.4°\./)).toBeVisible()
    await expect(miss.getByText(/Here 100\s?%\sof the cells are under it\./)).toBeVisible()
    await expect(miss.getByRole('link', { name: /NTRS 20250009323/ })).toHaveAttribute('href', 'https://ntrs.nasa.gov/citations/20250009323')
    await expect(miss.getByText(/A 20\sm map can’t see boulders/)).toBeVisible()
    // The example carries no permanent_shadow, so no line about it.
    await expect(miss.getByText(/permanently shadowed/)).toHaveCount(0)

    // The scatter asks the very Query of the answer on screen, plus the radius.
    expect(asked).toHaveLength(1)
    const params = asked[0].searchParams
    expect(params.get('radius_m')).toBe('250')
    expect(params.get('site_id')).toBe(query.site.id)
    expect(params.get('start')).toBe(query.start)
    expect(Number(params.get('duration_hours'))).toBe(query.duration_hours)
    expect(Number(params.get('observer_height_m'))).toBe(query.observer_height_m)
  })

  test('says a cold answer takes about a minute, and holds nothing else back', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/visibility/scatter**', async (route: Route) => {
      await gate
      await route.continue()
    })
    await open(page)
    const miss = panel(page)
    await expect(miss.getByRole('status').filter({ hasText: 'A new answer takes about a minute' })).toBeVisible()
    await expect(miss.getByText(/\d+\ss so far/)).toBeVisible()
    // The answer and the Slope are already on screen while the scatter computes.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(miss.getByText(/The steepest cell is 5\.4°/)).toBeVisible()
    release()
    await expect(miss.getByText(/Land 250\sm to the west/)).toBeVisible()
  })

  test('shows a busy server as a wait with a way on, then answers', async ({ page }) => {
    let calls = 0
    await page.route('**/visibility/scatter**', async (route: Route) => {
      calls += 1
      if (calls === 1) await route.fulfill(problem(503, 'busy'))
      else await route.continue()
    })
    await open(page)
    const miss = panel(page)
    const wait = miss.getByRole('status').filter({ hasText: 'The server is busy working out other answers.' })
    await expect(wait).toBeVisible()
    await expect(miss.getByRole('alert')).toHaveCount(0)
    await wait.getByRole('button', { name: 'Try again' }).click()
    await expect(miss.getByText(/Land 250\sm to the west/)).toBeVisible()
  })

  test('says when it could not compute, and tries again', async ({ page }) => {
    let calls = 0
    await page.route('**/visibility/scatter**', async (route: Route) => {
      calls += 1
      if (calls === 1) await route.abort('connectionrefused')
      else await route.continue()
    })
    await page.route('**/terrain**', (route: Route) => route.fulfill(problem(500, 'internal')))
    await open(page)
    const miss = panel(page)
    await expect(miss.getByRole('alert')).toHaveCount(2)
    const scatterAlert = miss.getByRole('alert').filter({ hasText: 'The server did not answer.' })
    await expect(scatterAlert).toBeVisible()
    await scatterAlert.getByRole('button', { name: 'Try again' }).click()
    await expect(miss.getByText(/Land 250\sm to the west/)).toBeVisible()
  })

  test('says a miss changes nothing when the 19 points agree', async ({ page }) => {
    const value = scatterExample.value
    const site = value.points[0].metrics
    const points = value.points.map((point: object) => ({ ...point, metrics: site }))
    const band = Object.fromEntries(
      Object.entries(site as Record<string, number>).map(([key, metric]) => [key, { min: metric, max: metric, min_point: 0, max_point: 0 }]),
    )
    await page.route('**/visibility/scatter**', (route: Route) => route.fulfill(json({ ...value, points, band })))
    await open(page)
    const miss = panel(page)
    await expect(miss.getByText(/Missing by 250\sm changes nothing here/)).toBeVisible()
    await expect(miss.getByText(/longest night lasts/)).toHaveCount(0)
  })

  test('says the panel is not for a Site the 20 m map does not reach', async ({ page }) => {
    await page.route('**/visibility/scatter**', (route: Route) => route.fulfill(problem(422, 'outside_coverage')))
    await page.route('**/terrain**', (route: Route) => route.fulfill(problem(422, 'outside_coverage')))
    await open(page)
    const miss = panel(page)
    await expect(miss.getByText(/The 20\sm map ends too close to this Site/)).toBeVisible()
    await expect(miss.getByText(/No 20\sm map covers this Site/)).toBeVisible()
    await expect(miss.getByRole('button', { name: '250 m' })).toHaveCount(0)
    await expect(miss.getByRole('alert')).toHaveCount(0)
  })

  test('names the nearest permanently shadowed region only when there is one', async ({ page }) => {
    let shadow: unknown = { distance_m: 234, azimuth_deg: 117, latitude_deg: -89.47, longitude_deg: -136.5, product: 'PGDA 69' }
    await page.route('**/terrain**', (route: Route) => route.fulfill(json({ ...terrainExample.value, permanent_shadow: shadow })))
    await open(page)
    const miss = panel(page)
    await expect(miss.getByText(/The nearest permanently shadowed region is 234\sm to the south-east \(PGDA 69\)\./)).toBeVisible()

    shadow = null
    await page.reload()
    await expect(miss.getByText(/The steepest cell is 5\.4°/)).toBeVisible()
    await expect(miss.getByText(/permanently shadowed/)).toHaveCount(0)
  })

  test('at the IM-2 landing point reads the route’s own numbers into one sentence', async ({ page }) => {
    const site = { ...terrainExample.value.site, id: 'IM2', name: 'IM-2 Athena landing' }
    const slope = { ...terrainExample.value.slope, max_deg: 4.4 }
    await page.route('**/terrain**', (route: Route) => route.fulfill(json({ ...terrainExample.value, site, slope })))
    await open(page)
    const miss = panel(page)
    await expect(
      miss.getByText(/At the IM-2 landing point no cell within 100\sm is steeper than 4\.4° on this map\. Athena still tipped over/),
    ).toBeVisible()
    // The general caveat no longer repeats the Athena sentence there.
    await expect(miss.getByText(/which a map like this one misses/)).toHaveCount(0)
  })

  test('keeps the radius in the link, asks again for it, and opens on it after a reload', async ({ page }) => {
    const radii: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/visibility/scatter') radii.push(url.searchParams.get('radius_m') ?? '')
    })
    await open(page, '/?site=001')
    const miss = panel(page)
    await expect(miss.getByText(/Land 250\sm to the west/)).toBeVisible()

    await miss.getByRole('button', { name: '500 m' }).click()
    await expect(page).toHaveURL(/[?&]radius=500(&|$)/)
    await expect.poll(() => radii.at(-1)).toBe('500')
    await expect(miss.getByText(/500\sm is twice the IM-2 miss\./)).toBeVisible()

    // The App rewrites the link when its own state changes; the radius stays.
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(page).toHaveURL(/view=map/)
    await expect(page).toHaveURL(/[?&]radius=500(&|$)/)

    await page.reload()
    await expect(panel(page).getByRole('button', { name: '500 m' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => radii.at(-1)).toBe('500')

    await panel(page).getByRole('button', { name: '250 m' }).click()
    await expect(page).not.toHaveURL(/radius=/)
    await expect.poll(() => radii.at(-1)).toBe('250')
  })

  test('opens the Resolution ladder from the landing-error note', async ({ page }) => {
    await open(page)
    await panel(page).getByRole('button', { name: 'Open the Resolution ladder' }).click()
    await expect(page.getByRole('button', { name: 'Stats for nerds' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: 'How much does the map’s detail change this answer?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(page).toHaveURL(/stats=1/)
  })
})

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('says the same in Portuguese', async ({ page }) => {
    await open(page)
    const miss = panel(page)
    await expect(miss.getByRole('heading', { name: 'Se o módulo errar o alvo' })).toBeVisible()
    await expect(miss.getByText(/Pouse 250\sm a oeste e o módulo nunca tem Sol e Terra ao mesmo tempo\./)).toBeVisible()
    await expect(miss.getByRole('heading', { name: /O chão num raio de 100\sm/ })).toBeVisible()
    await expect(miss.getByText(/A NASA pede menos de 10° em 100\sm para o Artemis III\./)).toBeVisible()
  })

  test('says a cold answer takes about a minute in Portuguese too', async ({ page }) => {
    await page.route('**/visibility/scatter**', () => new Promise<void>(() => undefined))
    await open(page)
    await expect(panel(page).getByRole('status').filter({ hasText: 'Uma resposta nova leva cerca de um minuto' })).toBeVisible()
  })
})

test.describe('at 390 px', () => {
  test.use({ locale: 'en-GB', viewport: { width: 390, height: 844 } })

  test('fits the phone without a sideways scroll', async ({ page }) => {
    await open(page)
    const miss = panel(page)
    await miss.scrollIntoViewIfNeeded()
    await expect(miss.getByText(/Land 250\sm to the west/)).toBeVisible()
    await expect(miss.getByRole('table')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const box = await miss.boundingBox()
    expect(box && box.x + box.width).toBeLessThanOrEqual(390)
  })
})
