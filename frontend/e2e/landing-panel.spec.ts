import { expect, test, type Locator, type Page } from '@playwright/test'

// Issue #151: in Larissa's layout (the default) the landing panel is the one presentation of the answer at
// Levels 1 and 2. There is no floating answer card and no drawer of details (they came with #134 and are
// gone), there are never two panels on screen, and the safety circle with its notes about hazard
// percentages is Level 3 only. `?layout=classic` keeps the answer column and has no panel before a landing.
//
// The Prism mock answers every Query with the contract's example: Connecting Ridge CR01, a Window from
// 20/11/2026 12:00 UTC to 30/11/2026 12:00 UTC, the first Sunset behind the rim of Shackleton, the
// Earthset behind Mons Malapert. This spec opens the app itself, on the default layout, so it does not use
// './classic' except to open the classic layout in one test.

const panel = (page: Page) => page.locator('.landing-panel')
const body = (page: Page) => page.locator('.landing-panel__body')
const toggle = (page: Page) => page.locator('.landing-panel__toggle')

type Box = { x: number; y: number; width: number; height: number }
const box = async (locator: Locator): Promise<Box> => {
  const found = await locator.boundingBox()
  expect(found).not.toBeNull()
  return found!
}

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(panel(page)).toHaveCount(1)
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
}

/** What must not be on screen at Levels 1 and 2: the card, its drawer and the hazard circle with its notes. */
async function expectNoCardAndNoHazard(page: Page) {
  await expect(page.locator('.answer-card')).toHaveCount(0)
  await expect(page.locator('.details')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0)
  await expect(page.locator('.safety')).toHaveCount(0)
  await expect(page.getByText(/No hazard percentage here|Hazard not vetoed/)).toHaveCount(0)
}

test.describe('on a wide screen, 1366×768', () => {
  test.use({ viewport: { width: 1366, height: 768 }, locale: 'en-GB' })

  test('from orbit (Level 1) the panel says the Site, the Sun and the Earth with their Occluders, and has no vehicle or battery', async ({ page }) => {
    await open(page)
    await expect(body(page)).toBeVisible()
    await expect(body(page).getByRole('heading', { level: 2 })).toContainText('Connecting Ridge CR01')
    await expect(body(page).getByRole('heading', { level: 3, name: 'The Sun sets in 4 h 21 min.' })).toBeVisible()
    await expect(body(page).getByText(/^20 Nov, 16:21 UTC, behind the rim of Shackleton, 4\.6\skm to the [a-z-]+\.$/)).toBeVisible()
    await expect(body(page).getByRole('heading', { level: 3, name: 'The Earth sets in 9 d 15 h.' })).toBeVisible()
    await expect(body(page).getByText(/^30 Nov, 03:45 UTC, behind Mons Malapert, 134\skm to the [a-z-]+\.$/)).toBeVisible()
    for (const label of ['Sun', 'Earth', 'Both', 'Longest night', 'Longest without the Earth']) {
      await expect(body(page).locator('dt', { hasText: label }).first()).toBeVisible()
    }
    await expect(body(page)).not.toContainText(/Vehicle:|Battery|Solar charge|Energy periods/)
    await expect(body(page).locator('.landing-panel__periods')).toHaveCount(0)
    await expect(page.locator('main.answer')).toBeHidden()
    await expectNoCardAndNoHazard(page)
  })

  test('the panel sits in the top right of the stage, clear of the globe menu and the view buttons', async ({ page }) => {
    await open(page)
    await expect(page.locator('.globe-menu')).toBeVisible()
    const stage = await box(page.locator('section.stage'))
    const found = await box(body(page))
    expect(found.x).toBeGreaterThan(stage.x + stage.width / 2)
    expect(found.x + found.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5)
    expect(found.y).toBeGreaterThanOrEqual(stage.y)
    expect(found.y).toBeLessThan(stage.y + stage.height / 2)
    for (const other of ['.globe-menu', '.stage__foot .views']) {
      const against = await box(page.locator(other).first())
      const overlaps = found.x < against.x + against.width && against.x < found.x + found.width && found.y < against.y + against.height && against.y < found.y + found.height
      expect(overlaps, `the panel over ${other}`).toBe(false)
    }
  })

  test('the reason under a Countdown marks the Occluder and turns the view to the ground', async ({ page }) => {
    await open(page)
    const reason = body(page).locator('.why__show').first()
    await reason.click()
    await expect(page.getByRole('button', { name: 'From the ground' })).toHaveAttribute('aria-pressed', 'true')
    // Still one panel, and still the one for Level 1: the ground of a landing from orbit has no vehicle.
    await expect(panel(page)).toHaveCount(1)
    await expect(body(page)).not.toContainText(/Battery|Vehicle:/)
    await expectNoCardAndNoHazard(page)
  })

  test('on the ground at Level 1 there is one panel, no card, no circle and no balloon about hazard', async ({ page }) => {
    await open(page, '/?view=ground')
    await expect(page.locator('.sky canvas')).toHaveAttribute('data-ready', 'true')
    await expect(panel(page)).toHaveCount(1)
    await expectNoCardAndNoHazard(page)
  })

  test('the polar map (Level 2) has the same one panel, and nothing of Level 3 comes with it', async ({ page }) => {
    await open(page, '/?view=map')
    await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
    await expect(panel(page)).toHaveCount(1)
    await expectNoCardAndNoHazard(page)
    await expect(page.locator('.exploration-select')).toHaveCount(0)
  })

  test('N1, N2, N3 and Back leave nothing of the level before on screen', async ({ page }) => {
    await open(page, '/?view=orbit&graphics=low')
    const level3 = page.getByRole('button', { name: 'Level 3 · Explore', exact: true })
    const level2 = page.getByRole('button', { name: 'South Pole in detail', exact: true })
    await level2.click()
    await expect(level2).toHaveAttribute('aria-pressed', 'true')
    await expect(panel(page)).toHaveCount(1)
    await level3.click()
    await expect(page.getByRole('heading', { name: 'Choose your landing area' })).toBeVisible()
    // Level 3 has its own panels: the landing panel is not there, nor any hazard element.
    await expect(panel(page)).toHaveCount(0)
    await expectNoCardAndNoHazard(page)
    await page.getByRole('button', { name: 'Back to Level 2' }).click()
    await expect(level2).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.exploration-select')).toHaveCount(0)
    await expect(panel(page)).toHaveCount(1)
    await page.getByRole('button', { name: 'Explore the Moon', exact: true }).click()
    await expect(panel(page)).toHaveCount(1)
    await expectNoCardAndNoHazard(page)
  })

  test('the panel can be closed and opened again from its button', async ({ page }) => {
    await open(page)
    await toggle(page).click()
    await expect(body(page)).toBeHidden()
    await toggle(page).click()
    await expect(body(page)).toBeVisible()
  })

  test('an old link with details=1 opens like any other, and the app takes the parameter out of the address', async ({ page }) => {
    await page.goto('/?details=1')
    await expect(panel(page)).toHaveCount(1)
    await expectNoCardAndNoHazard(page)
    await expect(page).not.toHaveURL(/details/)
  })

  test('the classic layout is unchanged: the column and the header are there, and there is no panel before a landing', async ({ page }) => {
    await page.goto('/?layout=classic')
    await expect(page.locator('main.answer')).toBeVisible()
    await expect(page.locator('header.bar')).toBeVisible()
    await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
    await expect(panel(page)).toHaveCount(0)
    await expectNoCardAndNoHazard(page)
  })
})

test.describe('on a phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB' })

  test('the panel starts closed, opens from its button, and nothing scrolls sideways', async ({ page }) => {
    await open(page)
    await expect(toggle(page)).toBeVisible()
    await expect(body(page)).toBeHidden()
    await toggle(page).click()
    await expect(body(page)).toBeVisible()
    await expect(body(page).getByRole('heading', { level: 3, name: 'The Sun sets in 4 h 21 min.' })).toBeVisible()
    const found = await box(body(page))
    expect(found.x).toBeGreaterThanOrEqual(0)
    expect(found.x + found.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    await expectNoCardAndNoHazard(page)
  })

  test('from the ground there is one panel and no hazard element, and the sky is not scrolled sideways', async ({ page }) => {
    await open(page, '/?view=ground')
    await expect(page.locator('.sky canvas')).toHaveAttribute('data-ready', 'true')
    await expect(panel(page)).toHaveCount(1)
    await expectNoCardAndNoHazard(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})

test.describe('in Portuguese', () => {
  test.use({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR' })

  test('the panel is in Portuguese, with the same one panel and no card', async ({ page }) => {
    await open(page)
    await expect(body(page).getByRole('heading', { level: 3 }).first()).toContainText('O Sol se põe em')
    await expect(body(page).locator('dt', { hasText: 'Maior noite' })).toBeVisible()
    await expect(body(page)).not.toContainText(/Veículo:|Bateria|Carga solar/)
    await expect(page.locator('.answer-card')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Detalhes', exact: true })).toHaveCount(0)
    await expect(page.locator('.safety')).toHaveCount(0)
  })
})
