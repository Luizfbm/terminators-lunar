import { expect, test, type Route } from '@playwright/test'

const problem = (status: number, code: string) => ({
  status,
  contentType: 'application/problem+json',
  body: JSON.stringify({ type: `https://lunar-api.luizfbm.win/problems/${code}`, title: code, status, code }),
})

test.use({ locale: 'en-GB' })

test.describe('loading state', () => {
  test('says it is loading until the answer arrives', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route((url: URL) => url.pathname === '/visibility', async (route) => {
      await gate
      await route.continue()
    })

    await page.goto('/')

    await expect(page.getByRole('status')).toHaveText('Loading the answer…')
    await expect(page.getByText('Lunar Landing Site Navigator')).toBeVisible()

    release()

    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
  })
})

test.describe('error states', () => {
  test('shows the translated sentence for a problem+json code', async ({ page }) => {
    await page.route((url: URL) => url.pathname === '/visibility', (route: Route) => route.fulfill(problem(422, 'outside_coverage')))

    await page.goto('/')

    const alert = page.getByRole('alert')
    await expect(alert.getByText('Could not answer this Query')).toBeVisible()
    await expect(alert.getByText('This Site or Window is outside the period the app covers.')).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('says the server is busy on a 503, without blaming the Query', async ({ page }) => {
    await page.route((url: URL) => url.pathname === '/visibility', (route: Route) => route.fulfill(problem(503, 'busy')))

    await page.goto('/')

    await expect(page.getByRole('alert').getByText('The server is busy right now. Try again in a few seconds.')).toBeVisible()
  })

  test('shows the network sentence when the server cannot be reached', async ({ page }) => {
    await page.route((url: URL) => url.pathname === '/visibility', (route: Route) => route.abort('connectionrefused'))

    await page.goto('/')

    const alert = page.getByRole('alert')
    await expect(alert.getByText('The server did not answer. Check the connection, then try again.')).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('Try again re-runs the request and shows the answer', async ({ page }) => {
    let calls = 0
    await page.route((url: URL) => url.pathname === '/visibility', async (route: Route) => {
      calls += 1
      if (calls === 1) {
        await route.fulfill(problem(422, 'outside_coverage'))
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
    expect(calls).toBe(2)
  })

  test('keeps the last answer on screen when the next Site fails', async ({ page }) => {
    let calls = 0
    await page.route((url: URL) => url.pathname === '/visibility', async (route: Route) => {
      calls += 1
      if (calls === 2) {
        await route.fulfill(problem(404, 'missing_site'))
        return
      }
      await route.continue()
    })
    await page.route('**/sites', (route: Route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'CR01', name: 'Connecting Ridge CR01', latitude_deg: -89.45, longitude_deg: -137.3, source: 'wueller2026', source_reference: 'x', region_id: 'CR', curated: true, has_5m_dem: false },
          { id: 'HW01', name: 'Haworth HW01', latitude_deg: -87.2, longitude_deg: -5, source: 'wueller2026', source_reference: 'x', region_id: 'HW', curated: true, has_5m_dem: false },
        ]),
      }),
    )

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
    await page.getByRole('button', { name: /^Site: / }).click()
    await page.getByRole('option', { name: /Haworth HW01/ }).click()

    await expect(page.getByRole('alert').getByText('This Query has no Site, or the Site it names does not exist.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
  })
})
