import { expect, test, type Page, type Request } from '@playwright/test'

// The Prism mock always answers with the contract's example (CR01, 20/11/2026 12:00 UTC for 10 days,
// 2 m), so these tests check what the app asks for and what the link says, not the numbers.

test.use({ locale: 'en-GB' })

const visibility = (request: Request) => request.url().includes('/visibility?')
const param = (request: Request, name: string) => new URL(request.url()).searchParams.get(name)

async function open(page: Page, path = '/') {
  const first = page.waitForRequest(visibility)
  await page.goto(path)
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
  return first
}

test('a new Observer height asks again and goes in the link, with the old answer still on screen', async ({ page }) => {
  await open(page)
  const asked = page.waitForRequest(visibility)
  const height = page.getByRole('spinbutton', { name: 'Observer height in metres' })
  await height.fill('10')
  await height.press('Enter')

  expect(param(await asked, 'observer_height_m')).toBe('10')
  await expect(page).toHaveURL(/height=10/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('a new length and start ask again and go in the link', async ({ page }) => {
  await open(page)

  let asked = page.waitForRequest(visibility)
  const days = page.getByRole('spinbutton', { name: 'Window length in days' })
  await days.fill('5')
  await days.blur()
  expect(param(await asked, 'duration_hours')).toBe('120')

  asked = page.waitForRequest(visibility)
  await page.getByLabel('Window start (UTC)').fill('2027-03-01')
  expect(param(await asked, 'start')).toBe('2027-03-01T00:00:00Z')

  await expect(page).toHaveURL(/start=2027-03-01/)
  await expect(page).toHaveURL(/hours=120/)
})

test('values outside the range are pulled back in', async ({ page }) => {
  await open(page)
  const asked = page.waitForRequest(visibility)
  const height = page.getByRole('spinbutton', { name: 'Observer height in metres' })
  await height.fill('500')
  await height.press('Enter')
  expect(param(await asked, 'observer_height_m')).toBe('50')
})

test('a copied link reopens the same Query, and "back to today" returns to the default Window', async ({ page }) => {
  const first = await open(page, '/?start=2027-03-01&hours=120&height=10')
  expect(param(first, 'start')).toBe('2027-03-01T00:00:00Z')
  expect(param(first, 'duration_hours')).toBe('120')
  expect(param(first, 'observer_height_m')).toBe('10')

  const asked = page.waitForRequest(visibility)
  await page.getByRole('button', { name: 'back to today' }).click()
  const back = await asked
  const today = new Date().toISOString().slice(0, 10)
  expect(param(back, 'start')).toBe(`${today}T00:00:00Z`)
  expect(param(back, 'observer_height_m')).not.toBe('10')
  await expect(page.getByRole('button', { name: 'back to today' })).toHaveCount(0)
  await expect(page).not.toHaveURL(/start=|hours=|height=/)
})

test('the plain address carries no Window in the link and offers no way back', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('button', { name: 'back to today' })).toHaveCount(0)
  await page.waitForTimeout(400)
  await expect(page).not.toHaveURL(/start=|hours=|height=/)
})

test('a Window the API rejects says so, in words', async ({ page }) => {
  await page.route((url: URL) => url.pathname === '/visibility', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/problem+json',
      body: JSON.stringify({ type: 'https://lunar-api.luizfbm.win/problems/window-out-of-range', title: 'Window out of range', status: 422, code: 'window_out_of_range' }),
    }),
  )
  await page.goto('/?start=2032-12-30&hours=720')
  await expect(page.getByRole('alert')).toContainText('This Window is outside the period the app covers.')
})
