import { expect, test, type Page, type Route } from '@playwright/test'

// the requirement: on a phone the Site list had no backdrop and no way
// to close it but Escape, it opened about 4,110 px away from the chosen Site, its citation covered
// the first row, and a bad custom point showed a grey line that did not say what was wrong.
//
// These tests serve their own list: forty Haworth Sites ahead of Connecting Ridge in /regions order,
// so the chosen Site (CR02) is far down. The mock answers /visibility for one Site; the Site asked is
// put into the answer, as in sites.spec.ts.

const site = (id: string, name: string, region_id: string | null, latitude_deg: number, longitude_deg: number) => ({
  id,
  name,
  latitude_deg,
  longitude_deg,
  source: 'wueller2026',
  source_reference: 'Wueller et al. 2026, JGR Planets',
  region_id,
  curated: true,
  has_5m_dem: false,
})

const HAWORTH = Array.from({ length: 40 }, (_, index) => {
  const code = `HW${String(index + 1).padStart(2, '0')}`
  return site(code, `Haworth ${code}`, 'HW', -87.2 + index * 0.01, -5)
})
// Catalogue order puts Connecting Ridge first; /regions puts Haworth first.
const SITES = [site('CR01', 'Connecting Ridge CR01', 'CR', -89.45, -137.3), site('CR02', 'Connecting Ridge CR02', 'CR', -89.43, -135.1), ...HAWORTH]
const REGIONS = [
  { id: 'HW', name: 'Haworth', site_count: HAWORTH.length, artemis_iii_current: true, source_reference: 'Wueller 2026' },
  { id: 'CR', name: 'Connecting Ridge', site_count: 2, artemis_iii_current: true, source_reference: 'Wueller 2026' },
]

async function serve(page: Page, options: { holdRegions?: Promise<void> } = {}) {
  await page.route('**/sites', (route: Route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(SITES) }))
  await page.route('**/regions', async (route: Route) => {
    await options.holdRegions
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(REGIONS) })
  })
  await page.route('**/visibility?**', async (route: Route) => {
    const asked = new URL(route.request().url()).searchParams.get('site_id')
    const response = await route.fetch()
    const body = await response.json()
    const chosen = SITES.find((entry) => entry.id === asked)
    if (chosen) body.query.site = chosen
    await route.fulfill({ response, json: body })
  })
}

const trigger = (page: Page) => page.getByRole('button', { name: /^(Site|Local): / })
const chosen = (page: Page) => page.getByRole('option', { name: /Connecting Ridge CR02/ })

/** The chosen Site is in view, selected, highlighted, and drawn with its check mark. */
async function expectChosenInView(page: Page) {
  await expect(chosen(page)).toBeInViewport()
  await expect(chosen(page)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('combobox')).toHaveAttribute('aria-activedescendant', /CR02$/)
  const mark = await chosen(page)
    .locator('.site-list__name')
    .evaluate((name) => getComputedStyle(name, '::before').content)
  expect(mark).toContain('✓')
}

test.describe('on a phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const [locale, title, close] of [
    ['en-GB', 'Choose a Site', 'Close'],
    ['pt-BR', 'Escolha o Local', 'Fechar'],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale })

      test(`the list is a full-screen, opaque sheet that closes with its “${close}” button`, async ({ page }) => {
        await serve(page)
        await page.goto('/?site=CR02')
        await trigger(page).click()
        const sheet = page.getByRole('dialog', { name: title })
        await expect(sheet).toBeVisible()
        expect(await sheet.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 })
        const background = await sheet.evaluate((element) => getComputedStyle(element).backgroundColor)
        expect(background).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

        const button = sheet.getByRole('button', { name: close, exact: true })
        await expect(button).toBeInViewport()
        await button.click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(trigger(page)).toBeFocused()
      })
    })
  }

  test('opens on the chosen Site and marks it', async ({ page }) => {
    await serve(page)
    await page.goto('/?site=CR02')
    await trigger(page).click()
    await expectChosenInView(page)
  })
})

test.describe('on a 1920×1080 desktop', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, locale: 'en-GB' })

  test('opens on the chosen Site and marks it, over a backdrop', async ({ page }) => {
    await serve(page)
    await page.goto('/?site=CR02')
    await trigger(page).click()
    const dialog = page.getByRole('dialog', { name: 'Choose a Site' })
    await expect(dialog).toBeVisible()
    await expectChosenInView(page)
    expect(await dialog.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')
    const backdrop = page.locator('.site-sheet__backdrop')
    await expect(backdrop).toBeVisible()
    await expect(backdrop).toHaveCSS('background-color', /^rgba\(0, 0, 0, 0\.\d+\)$/)
  })
})

test.describe('on a desktop at the default size', () => {
  test.use({ locale: 'en-GB' })

  // Validation check: as a modal dialog, the list caught every click outside it on its backdrop, so
  // a click on the page no longer closed it (sites.spec.ts, "a click outside closes the list").
  test('Escape, the Close button and a click outside each close it and give the focus back', async ({ page }) => {
    await serve(page)
    await page.goto('/?site=CR02')

    await trigger(page).click()
    await expect(page.getByRole('combobox')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()

    await trigger(page).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()

    await trigger(page).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('heading', { level: 1 }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()
  })

  test('keeps the Tab key inside the open list', async ({ page }) => {
    await serve(page)
    await page.goto('/?site=CR02')
    await trigger(page).click()
    const dialog = page.getByRole('dialog')
    await expect(page.getByRole('combobox')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Check' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  })
})

// regression: the list's scroller had tabIndex -1, so with the options driven by
// aria-activedescendant nothing in a long list could be scrolled by keyboard, and axe flagged
// scrollable-region-focusable on the open list in the WCAG check.
test('the list scroller is reachable by keyboard, so a long list can be scrolled without a mouse', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 600 })
  await serve(page)
  await page.goto('/?site=CR02')
  await trigger(page).click()
  await expect(page.getByRole('combobox')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('.site-list__scroll')).toBeFocused()
})

test.describe('on a 1920×1080 desktop, the list', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, locale: 'en-GB' })

  test('keeps its citation at the foot, not over its first row', async ({ page }) => {
    await serve(page)
    await page.goto('/?site=CR02')
    await trigger(page).click()
    const search = (await page.getByRole('combobox').boundingBox())!
    const options = page.getByRole('option')
    await options.first().scrollIntoViewIfNeeded()
    const first = (await options.first().boundingBox())!
    expect(first.y).toBeGreaterThanOrEqual(search.y + search.height)
    const source = page.locator('.site-list__source')
    await source.scrollIntoViewIfNeeded()
    const last = (await options.last().boundingBox())!
    const foot = (await source.boundingBox())!
    expect(foot.y).toBeGreaterThanOrEqual(last.y + last.height)
  })

  // Validation check: with Connecting Ridge chosen, the list opened on "Haworth HW06" and the
  // chosen Site was 4,110 px further down. The list had opened before the Regions arrived; when they
  // did, the groups reordered and the highlight, kept as a position, landed on a Haworth Site.
  test('stays on the chosen Site when the Regions arrive after the list opened', async ({ page }) => {
    let release!: () => void
    const holdRegions = new Promise<void>((resolve) => {
      release = resolve
    })
    await serve(page, { holdRegions })
    await page.goto('/?site=CR02')
    await trigger(page).click()
    await expectChosenInView(page)
    release()
    // The first group of the list, not of the page: at 1920 the form's "Window length" group comes first.
    await expect(page.getByRole('dialog').getByRole('group').first()).toHaveAccessibleName(/^Haworth/)
    await expectChosenInView(page)
  })
})

test.describe('a bad custom point says its cause and marks its field', () => {
  for (const [locale, latitude, longitude, ask, north, missing, latitudeExample, longitudeExample] of [
    ['en-GB', 'Latitude', 'Longitude', 'Check', /The latitude must be south of 80°\s?S/, 'The longitude is missing', 'e.g. 89.45 S', 'e.g. 137.3 W'],
    ['pt-BR', 'Latitude', 'Longitude', 'Consultar', /A latitude precisa ficar ao sul de 80°\s?S/, 'Falta a longitude', 'ex.: 89,45 S', 'ex.: 137,3 O'],
  ] as const) {
    test(locale, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await serve(page)
      await page.goto(`/?lang=${locale.slice(0, 2)}`)
      await trigger(page).click()
      const form = page.getByRole('dialog').locator('form')
      const latitudeField = form.getByRole('textbox', { name: latitude })
      const longitudeField = form.getByRole('textbox', { name: longitude })
      await expect(latitudeField).toHaveAttribute('placeholder', latitudeExample)
      await expect(longitudeField).toHaveAttribute('placeholder', longitudeExample)

      await latitudeField.fill('50 S')
      await form.getByRole('button', { name: ask }).click()
      const alert = form.getByRole('alert')
      await expect(alert).toContainText(north)
      await expect(alert).toContainText(missing)
      await expect(alert).toBeInViewport()
      for (const field of [latitudeField, longitudeField]) {
        await expect(field).toHaveAttribute('aria-invalid', 'true')
        // The error colour, --error, on the field's edge and on the message.
        await expect(field).toHaveCSS('border-bottom-color', 'rgb(255, 123, 114)')
      }
      await expect(alert).toHaveCSS('color', 'rgb(255, 123, 114)')
      await expect(latitudeField).toHaveAccessibleDescription(north)
      await expect(longitudeField).toHaveAccessibleDescription(missing)
      await expect(latitudeField).toBeFocused()

      // Fixing one field clears its mark and its line; the other stays.
      await latitudeField.fill('89.5 S')
      await expect(latitudeField).toHaveAttribute('aria-invalid', 'false')
      await expect(alert).not.toContainText(north)
      await expect(alert).toContainText(missing)
    })
  }
})
