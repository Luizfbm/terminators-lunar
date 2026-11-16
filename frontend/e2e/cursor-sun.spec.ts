import { expect, test, type Page } from '@playwright/test'

// the requirement: the Cursor says how much of the Sun's disc is in view. At the IM-2 Athena landing
// the Sun starts clipped (30% of the disc at 00:00 on 6 March 2025) and the whole disc is in view
// within the hour. The Prism mock always answers with its example, so the answer is rewritten
// here: the Site is IM2, the Window starts on 6 March 2025 for 48 h, and the Sun fraction of each
// sample is the one the real answer has in that first hour, then fully up, then hidden for a
// stretch, so the three readings are all reached.

test.use({ locale: 'en-GB' })

const START = Date.parse('2025-03-06T00:00:00Z')
const STEP_MINUTES = 10
const HOUR = 60 / STEP_MINUTES

/** The Sun fraction at sample `index`: 30% at the start, the whole disc by 01:00, hidden from 06:00 to 07:00. */
function fractionAt(index: number): number {
  if (index < HOUR) return 0.3 + (0.7 * index) / HOUR
  if (index >= 6 * HOUR && index < 7 * HOUR) return 0
  return 1
}

async function serve(page: Page) {
  await page.route('**/visibility?**', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    const count = (48 * 60) / STEP_MINUTES + 1
    body.query = {
      ...body.query,
      site: { ...body.query.site, id: 'IM2', name: 'IM-2 Athena landing point', latitude_deg: -84.7906, longitude_deg: 29.1957 },
      start: '2025-03-06T00:00:00Z',
      end: '2025-03-08T00:00:00Z',
      duration_hours: 48,
      step_minutes: STEP_MINUTES,
    }
    body.timeline = {
      ...body.timeline,
      step_minutes: STEP_MINUTES,
      samples: Array.from({ length: count }, (_, index) => ({
        t: new Date(START + index * STEP_MINUTES * 60_000).toISOString().replace('.000Z', 'Z'),
        sun: { azimuth_deg: (index * 0.5) % 360, elevation_deg: 1, fraction: fractionAt(index) },
        earth: { azimuth_deg: 100, elevation_deg: 5, visible: true },
      })),
    }
    await route.fulfill({ response, json: body })
  })
}

const link = '/?site=IM2&start=2025-03-06&hours=48'
const slider = (page: Page) => page.getByRole('slider', { name: 'Cursor' })
const reading = (page: Page) => page.locator('.strip__now .cursor-sun')
const percentOf = async (page: Page) => Number(await reading(page).getAttribute('data-sun-percent'))

test('dragging the Cursor through the first hour of the Athena Window shows the Sun coming into view', { tag: '@smoke' }, async ({ page }) => {
  await serve(page)
  await page.goto(`${link}&lang=en`)
  await expect(slider(page)).toBeVisible()

  // At 00:00 the Sun starts clipped: 30% of the disc.
  await slider(page).press('Home')
  await expect(reading(page)).toHaveText('Sun: 30% of the disc')
  await expect(reading(page)).toHaveAttribute('data-sun-disc', 'partial')

  // The Cursor on the track, a little way into the Window: more of the disc than at the start.
  const box = (await page.locator('.strip__track').boundingBox())!
  await page.mouse.click(box.x + box.width * (0.5 / 48), box.y + box.height / 2)
  await expect(reading(page)).toHaveAttribute('data-sun-disc', 'partial')
  expect(await percentOf(page)).toBeGreaterThan(30)
  expect(await percentOf(page)).toBeLessThan(100)

  // An hour in, the whole disc is in view.
  await slider(page).press('Home')
  await slider(page).press('ArrowRight')
  await expect(reading(page)).toHaveText('Sun: whole disc in view')
  await expect(reading(page)).toHaveAttribute('data-sun-disc', 'full')

  // Later in the Window the Sun goes behind the terrain: hidden.
  for (let hours = 0; hours < 5; hours++) await slider(page).press('ArrowRight')
  await expect(reading(page)).toHaveText('Sun: hidden')
  await expect(reading(page)).toHaveAttribute('data-sun-disc', 'hidden')
})

test('in Portuguese the Cursor reads the Sun in Portuguese', async ({ page }) => {
  await serve(page)
  await page.goto(`${link}&lang=pt`)
  await expect(slider(page)).toBeVisible()
  await slider(page).press('Home')
  await expect(reading(page)).toHaveText('Sol: 30% do disco')
  await slider(page).press('ArrowRight')
  await expect(reading(page)).toHaveText('Sol: disco inteiro à vista')
  for (let hours = 0; hours < 5; hours++) await slider(page).press('ArrowRight')
  await expect(reading(page)).toHaveText('Sol: escondido')
})

test('the view from the ground reads the same at the Cursor', async ({ page }) => {
  await serve(page)
  await page.goto(`${link}&lang=en&view=ground`)
  await expect(page.locator('.sky canvas')).toHaveAttribute('data-ready', 'true')
  const onGround = page.locator('.ground-view__caption .cursor-sun')
  // Regression: the reading was the first line of the caption and pushed the hint down, so the hint was
  // no longer the first line over the sky (stage-free.spec.ts, default-query.spec.ts). The hint stays
  // first, the reading sits right under it.
  await expect(page.locator('.stage__caption > p').first()).toHaveText('Drag to look around. About this view')
  await expect(page.locator('.stage__caption > p').nth(1)).toHaveText(/^Sun: /)
  await slider(page).press('Home')
  await expect(onGround).toHaveText('Sun: 30% of the disc')
  await slider(page).press('ArrowRight')
  await expect(onGround).toHaveText('Sun: whole disc in view')
  // The strip and the ground view never disagree.
  await expect(reading(page)).toHaveText('Sun: whole disc in view')
})
