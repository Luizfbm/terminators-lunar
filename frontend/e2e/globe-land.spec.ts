import { expect, test, type Page, type Route } from '@playwright/test'

// "Land": an orange dot under the cursor on the Moon and a bubble beside it. A click that is not a drag
// gives one place, the Site whose dot it snapped to or the point of the ground, to the same Query the
// map's double click asks; once the answer for that place is in, the stage goes down to the ground there.
// Regression (2026-11-15): the click only wrote `[land] {...}` to the console and said "Not wired yet",
// and the same click also picked the nearest Site, two destinations for one click.

// The words of the bubble, the status and Back follow the language (English here; one test in Portuguese).
test.use({ locale: 'en-US' })

const canvas = (page: Page) => page.locator('.globe canvas')
const layer = (page: Page) => page.locator('.globe-land')
const status = (page: Page) => page.locator('.stage-status')

interface Asked {
  site_id: string | null
  latitude_deg: string | null
  longitude_deg: string | null
}

/**
 * Every request for an answer, as asked. The mock answers for one Curated Site, so a coordinate is
 * answered as the API does: the Curated answer with the asked point as its custom Site. `outside` answers
 * a coordinate with the 422 the backend gives today north of its polar limit.
 */
async function serve(page: Page, options: { outside?: boolean; hold?: Promise<void> } = {}): Promise<Asked[]> {
  const asked: Asked[] = []
  await page.route('**/visibility?**', async (route: Route) => {
    const params = new URL(route.request().url()).searchParams
    const entry = { site_id: params.get('site_id'), latitude_deg: params.get('latitude_deg'), longitude_deg: params.get('longitude_deg') }
    asked.push(entry)
    if (entry.latitude_deg === null) return route.fallback()
    await options.hold
    if (options.outside) {
      return route.fulfill({
        status: 422,
        contentType: 'application/problem+json',
        json: { type: 'about:blank', title: 'Outside coverage', status: 422, code: 'outside_coverage' },
      })
    }
    const url = new URL(route.request().url())
    url.searchParams.delete('latitude_deg')
    url.searchParams.delete('longitude_deg')
    url.searchParams.set('site_id', '001')
    const response = await route.fetch({ url: url.toString() })
    const body = await response.json()
    body.query.site = {
      id: 'custom',
      name: 'Custom Site',
      latitude_deg: Number(entry.latitude_deg),
      longitude_deg: Number(entry.longitude_deg),
      source: 'custom',
      source_reference: 'User-provided coordinate',
      region_id: null,
      curated: false,
      has_5m_dem: false,
    }
    await route.fulfill({ response, json: body })
  })
  return asked
}

async function open(page: Page, options: { outside?: boolean; hold?: Promise<void>; link?: string } = {}) {
  const asked = await serve(page, options)
  await page.goto(options.link ?? '/')
  await expect(canvas(page)).toHaveAttribute('data-ready', 'true')
  const box = (await canvas(page).boundingBox())!
  // The first answer is in; from here on only the landing asks.
  const before = asked.length
  return { asked, before, box, middle: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
}

test('the dot and the bubble appear under the mouse over the Moon, and go when it leaves for space', async ({ page }) => {
  const { box, middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await expect(layer(page)).toBeVisible()
  await expect(page.locator('.globe-land__dot')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Land here' })).toContainText('Land')
  // Far left of the stage there is only space.
  await page.mouse.move(box.x + 6, middle.y)
  await expect(layer(page)).toBeHidden()
})

test('they go while the Moon is dragged and come back when the mouse is let go', async ({ page }) => {
  const { middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await expect(layer(page)).toBeVisible()
  await page.mouse.down()
  await page.mouse.move(middle.x + 60, middle.y + 10, { steps: 6 })
  await expect(layer(page)).toBeHidden()
  await page.mouse.up()
  await page.mouse.move(middle.x + 62, middle.y + 12)
  await expect(layer(page)).toBeVisible()
})

test('a click without dragging asks once about that point and goes down to the ground there', async ({ page }) => {
  const { asked, before, middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await expect(layer(page)).toBeVisible()
  const request = page.waitForRequest((r) => r.url().includes('/visibility?') && r.url().includes('latitude_deg='))
  await page.mouse.down()
  await page.mouse.up()
  const url = new URL((await request).url())
  const lat = Number(url.searchParams.get('latitude_deg'))
  const lon = Number(url.searchParams.get('longitude_deg'))
  expect(Math.abs(lat)).toBeLessThanOrEqual(90)
  expect(Math.abs(lon)).toBeLessThanOrEqual(180)
  expect(url.searchParams.get('site_id')).toBeNull()
  // The view from the ground, of the point landed on.
  await expect(page.locator('.views').getByRole('button', { name: 'From the ground', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.stage__ground')).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/lat=/)
  // One click, one request.
  await page.waitForTimeout(500)
  expect(asked.slice(before)).toHaveLength(1)
})

test('the Window and the Observer height stay as they were', async ({ page }) => {
  const { middle } = await open(page, { link: '/?start=2026-12-01&hours=48&height=5' })
  const request = page.waitForRequest((r) => r.url().includes('/visibility?') && r.url().includes('latitude_deg='))
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.up()
  const url = new URL((await request).url())
  expect(url.searchParams.get('start')).toMatch(/^2026-12-01/)
  expect(url.searchParams.get('duration_hours')).toBe('48')
  expect(url.searchParams.get('observer_height_m')).toBe('5')
})

test('a click that ends a drag does not land', async ({ page }) => {
  const { asked, before, middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 50, middle.y + 5, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  expect(asked.slice(before)).toHaveLength(0)
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'orbit')
})

test('near the chosen Site the dot snaps to it, the bubble gives its name, and the click asks for that Site', async ({ page }) => {
  const { middle } = await open(page)
  // Over the south pole the chosen Site, Connecting Ridge, is on the near side.
  await page.getByRole('button', { name: 'Southern Hemisphere', exact: true }).click()
  await page.waitForTimeout(2400)
  const ring = page.locator('.globe__chosen')
  await expect(ring).toBeVisible()
  const spot = (await ring.boundingBox())!
  const x = spot.x + spot.width / 2 + 3
  const y = spot.y + spot.height / 2 + 2
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.move(x, y)
  await expect(page.locator('.globe-land__site')).toContainText('Connecting Ridge')
  const request = page.waitForRequest((r) => r.url().includes('/visibility?'))
  await page.mouse.down()
  await page.mouse.up()
  const url = new URL((await request).url())
  // A Site of the catalogue by its code (001, or a Connecting Ridge neighbour drawn on the same pixels), not a free point.
  expect(url.searchParams.get('site_id')).toMatch(/\S/)
  expect(url.searchParams.get('latitude_deg')).toBeNull()
  await expect(page.locator('.stage__ground')).toBeVisible({ timeout: 15_000 })
})

test('while the answer is on its way the stage says where it is landing, and Cancel stays where it was', async ({ page }) => {
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  const { middle } = await open(page, { hold })
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(status(page)).toHaveAttribute('data-state', 'landing')
  await expect(status(page)).toContainText(/Landing at \d+\.?\d*° [NS], \d+\.?\d*° [EW]…/)
  await status(page).getByRole('button', { name: 'Cancel' }).click()
  release()
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'orbit')
  await expect(page).not.toHaveURL(/lat=/)
  await page.waitForTimeout(500)
  await expect(page.locator('.stage__ground')).toHaveCount(0)
})

// Until the backend answers the whole Moon (phase B), a free point north of its polar limit gets a 422.
test('a point the server does not cover shows the real error on the stage, with Try again and Cancel', async ({ page }) => {
  const { asked, before, middle } = await open(page, { outside: true })
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.up()
  const alert = status(page)
  await expect(alert).toHaveAttribute('data-state', 'error')
  await expect(alert).toHaveAttribute('role', 'alert')
  await expect(alert).toContainText('Could not land at')
  // The limit is the one /meta gives, not a number of the frontend's own.
  await expect(alert).toContainText(/only south of \d+(\.\d+)?°\s[NS]/)
  // The stage did not go down to the ground of the point before.
  await expect(page.locator('.stage__ground')).toHaveCount(0)
  await alert.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(() => asked.slice(before).length).toBe(2)
  await expect(status(page)).toHaveAttribute('data-state', 'error')
  await status(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(status(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/lat=/)
})

test('Back goes up from the ground to the orbit it came from', async ({ page }) => {
  const { middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.locator('.stage__ground')).toBeVisible({ timeout: 15_000 })
  // Back is on the ground and nowhere else.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('.views').getByRole('button', { name: 'From orbit', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.stage__ground')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'orbit')
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0)
})

test('in Portuguese the bubble, the status and Back are in Portuguese', async ({ page }) => {
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  const { middle } = await open(page, { hold, link: '/?lang=pt' })
  await page.mouse.move(middle.x, middle.y)
  await expect(page.getByRole('button', { name: 'Pousar aqui' })).toContainText('Pousar')
  await page.mouse.down()
  await page.mouse.up()
  await expect(status(page)).toContainText(/Pousando em \d+\.?\d*° [NS], \d+\.?\d*° [LO]…/)
  release()
  await expect(page.locator('.stage__ground')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Voltar', exact: true })).toBeVisible()
})

test.describe('on the polar map', () => {
  async function openMap(page: Page) {
    const opened = await open(page, { link: '/?view=map' })
    await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
    // The grid names its meridians once the camera has settled over the pole.
    await expect(page.locator('.globe__grid span').first()).toBeVisible({ timeout: 10_000 })
    return opened
  }

  test('a click on the ground of the cap lands there, once', async ({ page }) => {
    const { asked, before, box } = await openMap(page)
    // Below the pole is 180° of longitude, where none of the mock's Regions lies.
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2 + box.height * 0.2
    await page.mouse.move(x, y)
    await expect(layer(page)).toBeVisible()
    const request = page.waitForRequest((r) => r.url().includes('/visibility?') && r.url().includes('latitude_deg='))
    await page.mouse.click(x, y)
    const url = new URL((await request).url())
    expect(Number(url.searchParams.get('latitude_deg'))).toBeLessThanOrEqual(-80)
    await expect(page.locator('.stage__ground')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(500)
    expect(asked.slice(before)).toHaveLength(1)
  })

  test('Back from the ground of a landing on the map returns to the map', async ({ page }) => {
    const { box } = await openMap(page)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2 + box.height * 0.2
    await page.mouse.move(x, y)
    await expect(layer(page)).toBeVisible()
    await page.mouse.click(x, y)
    await expect(page.locator('.stage__ground')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.locator('.views').getByRole('button', { name: 'Map', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.stage__ground')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
  })

  test('a double click still asks about the point once and stays on the map', async ({ page }) => {
    const { asked, before, box } = await openMap(page)
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2 + box.height * 0.2
    await page.mouse.move(x, y)
    await page.mouse.dblclick(x, y)
    await expect.poll(() => asked.slice(before).length).toBe(1)
    // Longer than the wait of a single click: no landing follows the double click.
    await page.waitForTimeout(800)
    expect(asked.slice(before)).toHaveLength(1)
    await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
    await expect(page.locator('.stage__ground')).toHaveCount(0)
  })

  test('north of the edge of the map there is no bubble and no landing', async ({ page }) => {
    const { asked, before, box } = await openMap(page)
    // The top left corner of the stage is far outside the 80° S circle.
    const x = box.x + box.width - 12
    const y = box.y + 60
    await page.mouse.move(x, y)
    await expect(layer(page)).toBeHidden()
    await page.mouse.click(x, y)
    await page.waitForTimeout(600)
    expect(asked.slice(before)).toHaveLength(0)
  })
})
