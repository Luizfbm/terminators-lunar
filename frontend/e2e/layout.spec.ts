import { expect, test, type Page } from '@playwright/test'

// The two layouts: Larissa's is the default, with no header and no answer column and the globe across the
// whole width; `?layout=classic` brings both back. This spec opens the app itself, so it does not use
// './classic' (the helper the specs of the header and the column use).
test.use({ locale: 'en-US', viewport: { width: 1280, height: 720 } })

const header = (page: Page) => page.locator('header.bar')
const column = (page: Page) => page.locator('main.answer')
const stage = (page: Page) => page.locator('section.stage')

test('without the parameter the header and the answer column are not shown and the globe takes the screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.screen')).not.toHaveAttribute('data-layout', 'classic')
  await expect(header(page)).toBeHidden()
  await expect(column(page)).toBeHidden()
  // They stay in the page, only not shown.
  await expect(header(page)).toHaveCount(1)
  await expect(column(page)).toHaveCount(1)
  const box = (await stage(page).boundingBox())!
  expect(box.x).toBeCloseTo(0, 0)
  expect(box.width).toBeCloseTo(1280, 0)
})

test('with layout=classic the header and the answer column are shown, and the globe leaves room for the column', async ({ page }) => {
  await page.goto('/?layout=classic')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.screen')).toHaveAttribute('data-layout', 'classic')
  await expect(header(page)).toBeVisible()
  await expect(header(page).getByRole('button', { name: 'Guide' })).toBeVisible()
  await expect(column(page)).toBeVisible()
  const box = (await stage(page).boundingBox())!
  const answer = (await column(page).boundingBox())!
  expect(box.width).toBeLessThan(1280 - 300)
  expect(answer.x).toBeGreaterThanOrEqual(box.x + box.width)
})

test('the layout stays in the link when the app rewrites it, so a reload is on the same layout', async ({ page }) => {
  await page.goto('/?layout=classic&site=CR01')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  // The app writes the link back with its own parameters first and the layout last.
  await expect(page).toHaveURL(/\?site=CR01&layout=classic$/)
  await page.reload()
  await expect(page.locator('.screen')).toHaveAttribute('data-layout', 'classic')
  await expect(column(page)).toBeVisible()
})
