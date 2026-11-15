import { expect, test, type Route } from '@playwright/test'

// The mock answers with the contract's examples: the ladder of CR05 (Sunset 5 h 44 min later at
// 240 m than at 20 m) and the year 2027 at Site 001.
const busy = {
  status: 503,
  contentType: 'application/problem+json',
  headers: { 'Retry-After': '5' },
  body: JSON.stringify({ type: 'https://lunar-api.luizfbm.win/problems/busy', title: 'Busy', status: 503, code: 'busy' }),
}

test.use({ locale: 'en-GB' })

// The panels live inside "Stats for nerds" (the requirement), so every test here starts with it open.
test.beforeEach(async ({ page }) => {
  await page.goto('/?stats=1')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test.describe('Resolution ladder', () => {
  test('asks nothing until opened, then says what the coarse map changes', async ({ page }) => {
    let asked = 0
    page.on('request', (request) => {
      if (request.url().includes('/visibility/ladder')) asked += 1
    })
    const open = page.getByRole('button', { name: 'How much does the map’s detail change this answer?' })
    await expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(asked).toBe(0)

    await open.click()

    await expect(open).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText(/With the terrain at 240\sm the Sun would set 5\sh 44\smin later than at 20\sm\./)).toBeVisible()
    const table = page.getByRole('table', { name: 'This Query on maps of three resolutions' })
    await expect(table.getByRole('row')).toHaveCount(5)
    await expect(table.getByRole('rowheader').nth(0)).toHaveText(/240\sm/)
    await expect(table.getByRole('rowheader').nth(2)).toHaveText(/20\sm/)
    await expect(table.getByRole('row', { name: /Range/ })).toContainText(/from 18\sd 4\sh to 18\sd 10\sh/)
    await expect(page.getByText(/It is not a confidence level/)).toBeVisible()
    expect(asked).toBe(1)
  })

  test('says it is computing, then the server is busy, and tries again', async ({ page }) => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/visibility/ladder**', async (route: Route) => {
      calls += 1
      if (calls === 1) {
        await gate
        await route.fulfill(busy)
      } else {
        await route.continue()
      }
    })

    await page.getByRole('button', { name: 'How much does the map’s detail change this answer?' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Computing this Query three times' })).toBeVisible()
    release()

    const alert = page.getByRole('alert')
    await expect(alert.getByText('The server is busy right now. Try again in a few seconds.')).toBeVisible()
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText(/the Sun would set 5\sh 44\smin later/)).toBeVisible()
  })
})

test.describe('the year at the Site', () => {
  test('opens on request with a sentence, two rows of months and the best Windows', async ({ page }) => {
    await page.getByRole('button', { name: /^The year \d{4} at this Site$/ }).click()

    await expect(page.getByText(/In 2027 this Site has 285\sdays of Sun\. December has the most Sun and Earth together: 16\sd 7\sh\./)).toBeVisible()
    const sun = page.getByRole('table', { name: 'Sun visible, hours' })
    const both = page.getByRole('table', { name: 'Sun and Earth together, hours' })
    await expect(sun.getByRole('columnheader')).toHaveCount(12)
    await expect(sun.getByRole('cell').first()).toHaveText('744')
    await expect(both.getByRole('cell').last()).toHaveText('391')
    const best = page.getByRole('list').filter({ hasText: 'of Sun and Earth together' })
    await expect(best.getByRole('listitem')).toHaveCount(3)
    await expect(best.getByRole('listitem').first()).toContainText(/12 Sept 2027 to 11 Oct 2027/)
  })

  test('says the server is busy when the year cannot be computed now', async ({ page }) => {
    await page.route('**/sites/*/year**', (route: Route) => route.fulfill(busy))

    await page.getByRole('button', { name: /^The year \d{4} at this Site$/ }).click()

    await expect(page.getByRole('alert').getByText('The server is busy right now. Try again in a few seconds.')).toBeVisible()
  })
})

test('the panels fit a 390 px phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'How much does the map’s detail change this answer?' }).click()
  await page.getByRole('button', { name: /^The year \d{4} at this Site$/ }).click()
  await expect(page.getByRole('table', { name: 'Sun visible, hours' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'This Query on maps of three resolutions' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
