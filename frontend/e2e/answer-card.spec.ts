import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

// Issue #55: in Larissa's layout (the default) the globe takes the screen and the answer is a card over it
// (the sentence about the Sun and the one about the Earth, the Occluder behind each, the DEM Uncertainty
// band) with a Details button. Details opens a drawer over the globe with the rest of the answer column:
// from the right on a wide screen, from the bottom on a phone. Its open state is `details=1` in the link.
// `?layout=classic` keeps the column and has neither the card nor the drawer.
//
// The Prism mock answers every Query with the contract's example: Connecting Ridge CR01, a Window from
// 20/11/2026 12:00 UTC to 30/11/2026 12:00 UTC, the first Sunset behind the rim of Shackleton, the
// Earthset behind Mons Malapert. This spec opens the app itself, on the default layout, so it does not
// use './classic' except to open the classic layout in one test.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5

const card = (page: Page) => page.getByRole('complementary', { name: 'The answer' })
const drawer = (page: Page) => page.getByRole('dialog', { name: 'Details of the answer' })
const detailsButton = (page: Page) => page.getByRole('button', { name: 'Details', exact: true })

const box = async (locator: Locator) => {
  const found = await locator.boundingBox()
  expect(found).not.toBeNull()
  return found!
}

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(card(page)).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
}

async function violations(page: Page, part: string) {
  const { violations: found } = await new AxeBuilder({ page }).include(part).withTags(WCAG).analyze()
  return found.map((rule) => `${rule.id}: ${rule.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

test.describe('on a wide screen, 1366×768', () => {
  test.use({ viewport: { width: 1366, height: 768 }, locale: 'en-GB' })

  test('the card says the Sun and the Earth, each with the Occluder behind it, and the column is not there', async ({ page }) => {
    await open(page)
    await expect(card(page).getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
    await expect(card(page).getByText(/^20 Nov, 16:21 UTC, behind the rim of Shackleton, 4\.6\skm to the [a-z-]+\.$/)).toBeVisible()
    await expect(card(page).getByRole('heading', { level: 2 })).toHaveText('The Earth sets in 9 d 15 h.')
    await expect(card(page).getByText(/^30 Nov, 03:45 UTC, behind Mons Malapert, 134\skm to the [a-z-]+\.$/)).toBeVisible()
    // The column and the header stay out of sight, and the card does not repeat what the drawer holds.
    await expect(page.locator('main.answer')).toBeHidden()
    await expect(page.locator('header.bar')).toBeHidden()
    await expect(card(page).getByRole('table')).toHaveCount(0)
    await expect(detailsButton(page)).toBeVisible()
    // The drawer is not built until it is asked for.
    await expect(page.locator('#details-drawer')).toHaveCount(0)
  })

  test('the card sits in the top right corner of the stage, clear of the globe menu, the view buttons and the time strip', async ({ page }) => {
    await open(page)
    await expect(page.locator('.globe-menu')).toBeVisible()
    const stage = await box(page.locator('section.stage'))
    const cardBox = await box(card(page))
    expect(cardBox.x).toBeGreaterThanOrEqual(stage.x)
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5)
    expect(cardBox.y).toBeGreaterThanOrEqual(stage.y)
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5)
    // Right of the middle, top half.
    expect(cardBox.x).toBeGreaterThan(stage.x + stage.width / 2)
    expect(cardBox.y).toBeLessThan(stage.y + stage.height / 2)
    for (const other of ['.globe-menu', '.stage__foot .views', 'footer.strip']) {
      const against = page.locator(other).first()
      if (await against.isVisible()) expect(overlaps(cardBox, await box(against)), `the card over ${other}`).toBe(false)
    }
  })

  test('the band is under the Countdown in the card', async ({ page }) => {
    // The route answers 202 and keeps answering it: the line that says the band is being worked out.
    await page.route('**/visibility/uncertainty**', (route: Route) =>
      route.fulfill({
        status: 202,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Retry-After', 'retry-after': '120' },
        body: JSON.stringify({ status: 'computing', clones_done: 12, clones: 32 }),
      }),
    )
    await open(page)
    await expect(card(page).getByText('working out the band… 12 of 32')).toHaveCount(2)
  })

  test('the DEM Uncertainty band is asked once, with the drawer open or not', async ({ page }) => {
    let asked = 0
    await page.route('**/visibility/uncertainty**', (route: Route) => {
      asked += 1
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Retry-After', 'retry-after': '120' },
        body: JSON.stringify({ status: 'computing', clones_done: 12, clones: 32 }),
      })
    })
    await open(page, '/?stats=1&details=1')
    await expect(drawer(page)).toBeVisible()
    await expect(card(page).getByText('working out the band… 12 of 32')).toHaveCount(2)
    expect(asked).toBe(1)
  })

  test('Details opens the drawer, which has the metrics, the summary, the Query line and the Proof link', async ({ page }) => {
    await open(page)
    await detailsButton(page).click()
    await expect(drawer(page)).toBeVisible()
    await expect(detailsButton(page)).toHaveAttribute('aria-expanded', 'true')
    // The focus is in the drawer, and the drawer is over the globe on the right.
    await expect(drawer(page).getByRole('button', { name: 'Close' })).toBeFocused()
    const stage = await box(page.locator('section.stage'))
    const drawerBox = await box(drawer(page))
    expect(drawerBox.x + drawerBox.width).toBeCloseTo(stage.x + stage.width, 0)
    expect(drawerBox.width).toBeLessThan(stage.width / 2)
    // The card is behind it, out of the Tab order.
    await expect(card(page)).toHaveAttribute('inert', '')

    // The summary, the Query line and the panels that were in the column.
    await expect(drawer(page).getByText(/^Across this Window the lander has the Sun and the Earth together for /)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: /^Site: / })).toHaveText(/CR01/)
    await expect(drawer(page).getByLabel('Window start (UTC)')).toHaveValue('2026-11-20')
    // The metrics are inside "Stats for nerds".
    await drawer(page).getByRole('button', { name: 'Stats for nerds' }).click()
    const numbers = drawer(page).getByRole('table', { name: 'The numbers for this Window' })
    await expect(numbers.getByRole('row', { name: /Sun and Earth together/ })).toContainText('3 d 15 h · 37%')
    await expect(numbers.getByRole('row', { name: /Longest night \(LCSP\)/ })).toContainText('5 d 2 h')
    await expect(numbers.getByRole('row', { name: /Longest sunlight \(LCIP\)/ })).toBeVisible()
    await expect(numbers.getByRole('row', { name: /Mean Sun fraction/ })).toBeVisible()
    // The Proof link and the printable brief, at the foot.
    await expect(drawer(page).getByRole('link', { name: 'How we know these numbers' })).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: 'Printable brief' })).toBeVisible()
  })

  test('the Proof link in the drawer goes to the Proof page', async ({ page }) => {
    await open(page, '/?details=1')
    await drawer(page).getByRole('link', { name: 'How we know these numbers' }).click()
    await expect(page).toHaveURL(/page=proof/)
    await expect(drawer(page)).toBeHidden()
  })

  test('Esc closes the drawer and the focus goes back to Details', async ({ page }) => {
    await open(page)
    await detailsButton(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
    await expect(detailsButton(page)).toBeFocused()
    await expect(detailsButton(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(card(page)).not.toHaveAttribute('inert', '')
  })

  test('a click outside closes the drawer and the focus goes back to Details', async ({ page }) => {
    await open(page)
    await detailsButton(page).click()
    await expect(drawer(page)).toBeVisible()
    // On the globe, left of the drawer and below the menu.
    await page.mouse.click(700, 500)
    await expect(drawer(page)).toBeHidden()
    await expect(detailsButton(page)).toBeFocused()
  })

  test('the Close button closes the drawer and the focus goes back to Details', async ({ page }) => {
    await open(page)
    await detailsButton(page).click()
    await drawer(page).getByRole('button', { name: 'Close' }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(detailsButton(page)).toBeFocused()
  })

  test('Tab stays inside the open drawer', async ({ page }) => {
    await open(page)
    await detailsButton(page).click()
    await expect(drawer(page)).toBeVisible()
    for (let press = 0; press < 40; press++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.closest('#details-drawer') !== null), `after ${press + 1} Tabs`).toBe(true)
    }
    for (let press = 0; press < 40; press++) {
      await page.keyboard.press('Shift+Tab')
      expect(await page.evaluate(() => document.activeElement?.closest('#details-drawer') !== null), `after ${press + 1} Shift+Tabs backwards`).toBe(true)
    }
  })

  test('Esc closes the Site list first and leaves the drawer open', async ({ page }) => {
    await open(page, '/?details=1')
    await drawer(page).locator('.site-pick button').first().click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
  })

  test('the open state is in the link: opening writes details=1, closing takes it out', async ({ page }) => {
    await open(page)
    await expect(page).not.toHaveURL(/details=/)
    await detailsButton(page).click()
    await expect(page).toHaveURL(/[?&]details=1/)
    await page.keyboard.press('Escape')
    await expect(page).not.toHaveURL(/details=/)
  })

  test('details=1 in the link opens the drawer, on load and on reload', async ({ page }) => {
    await open(page, '/?details=1')
    await expect(drawer(page)).toBeVisible()
    await expect(drawer(page).getByRole('button', { name: 'Close' })).toBeFocused()
    await expect(page).toHaveURL(/[?&]details=1/)
    await page.reload()
    await expect(drawer(page)).toBeVisible()
  })

  test('the reason under a sentence in the card marks the Occluder and turns the view to the ground', async ({ page }) => {
    await open(page)
    const reason = card(page).locator('.why__show').first()
    await reason.click()
    await expect(reason).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'From the ground' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('the card and the open drawer have no WCAG A or AA violation of their own', async ({ page }) => {
    await open(page)
    expect(await violations(page, '.answer-card')).toEqual([])
    await detailsButton(page).click()
    await expect(drawer(page)).toBeVisible()
    expect(await violations(page, '#details-drawer')).toEqual([])
  })

  test('the classic layout is unchanged: the column and the header are there, and there is no card and no drawer', async ({ page }) => {
    await page.goto('/?layout=classic')
    await expect(page.locator('main.answer')).toBeVisible()
    await expect(page.locator('main.answer').getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('header.bar')).toBeVisible()
    await expect(card(page)).toHaveCount(0)
    await expect(page.locator('.answer-card')).toHaveCount(0)
    await expect(detailsButton(page)).toHaveCount(0)
    await expect(page.locator('#details-drawer')).toHaveCount(0)
  })

  test('details=1 means nothing in the classic layout, and the link drops it', async ({ page }) => {
    await page.goto('/?layout=classic&details=1')
    await expect(page.locator('main.answer')).toBeVisible()
    await expect(drawer(page)).toHaveCount(0)
    await expect(page).toHaveURL(/layout=classic$/)
  })
})

test.describe('on a phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB' })

  const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth)

  test('the card sits under the picture, so the whole sky is free, and nothing scrolls sideways', async ({ page }) => {
    await open(page)
    await expect(page.locator('.globe canvas')).toBeVisible()
    const picture = await box(page.locator('.stage__globe'))
    const cardBox = await box(card(page))
    // The picture keeps at least half of the screen, and the card starts where it ends.
    expect(picture.height).toBeGreaterThanOrEqual(844 / 2)
    expect(cardBox.y).toBeGreaterThanOrEqual(picture.y + picture.height - 0.5)
    expect(overlaps(cardBox, picture)).toBe(false)
    expect(cardBox.x).toBeGreaterThanOrEqual(0)
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(390)
    expect(await noSidewaysScroll(page)).toBe(390)
    // The sentence is in the card, with its Occluder.
    await expect(card(page).getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
    await expect(card(page).getByText(/behind the rim of Shackleton/)).toBeVisible()
  })

  test('from the ground the card leaves the sky free', async ({ page }) => {
    await open(page, '/?view=ground')
    await expect(page.locator('.sky canvas')).toHaveAttribute('data-ready', 'true')
    const sky = await box(page.locator('.sky canvas'))
    const cardBox = await box(card(page))
    expect(overlaps(cardBox, sky)).toBe(false)
    expect(await noSidewaysScroll(page)).toBe(390)
  })

  test('the drawer takes the screen from the bottom, with no sideways scroll', async ({ page }) => {
    await open(page)
    await detailsButton(page).click()
    await expect(drawer(page)).toBeVisible()
    const sheet = await box(drawer(page))
    expect(sheet.x).toBeCloseTo(0, 0)
    expect(sheet.width).toBeCloseTo(390, 0)
    expect(sheet.y + sheet.height).toBeCloseTo(844, 0)
    expect(sheet.height).toBeGreaterThanOrEqual(844 * 0.85)
    expect(await noSidewaysScroll(page)).toBe(390)
    // What is in it fits the width.
    await drawer(page).getByRole('button', { name: 'Stats for nerds' }).click()
    await expect(drawer(page).getByRole('table', { name: 'The numbers for this Window' })).toBeVisible()
    const wide = await drawer(page).evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(wide).toBeLessThanOrEqual(0)
    expect(await noSidewaysScroll(page)).toBe(390)
  })

  test('the Close button and Esc close the drawer on a phone too, and the focus goes back to Details', async ({ page }) => {
    await open(page, '/?details=1')
    await expect(drawer(page)).toBeVisible()
    await drawer(page).getByRole('button', { name: 'Close' }).click()
    await expect(drawer(page)).toBeHidden()
    await expect(detailsButton(page)).toBeFocused()
    await detailsButton(page).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toBeHidden()
  })

  test('the card and the open drawer have no WCAG A or AA violation of their own', async ({ page }) => {
    await open(page)
    expect(await violations(page, '.answer-card')).toEqual([])
    await detailsButton(page).click()
    await expect(drawer(page)).toBeVisible()
    expect(await violations(page, '#details-drawer')).toEqual([])
  })
})

test.describe('in Portuguese', () => {
  test.use({ viewport: { width: 1366, height: 768 }, locale: 'pt-BR' })

  test('the card, the button and the drawer are in Portuguese', async ({ page }) => {
    await page.goto('/')
    const cardPt = page.getByRole('complementary', { name: 'A resposta' })
    await expect(cardPt).toBeVisible()
    await cardPt.getByRole('button', { name: 'Detalhes', exact: true }).click()
    const drawerPt = page.getByRole('dialog', { name: 'Detalhes da resposta' })
    await expect(drawerPt).toBeVisible()
    await expect(drawerPt.getByRole('button', { name: 'Fechar' })).toBeFocused()
    await expect(drawerPt.getByRole('link', { name: 'Como sabemos estes números' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawerPt).toBeHidden()
  })
})
