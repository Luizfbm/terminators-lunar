import { expect, test, type Page } from '@playwright/test'
import { classic } from './classic'

// the requirement: from the ground the picture is free. Over it sit only the one-line hint, the compass
// (the implementation) and the turn arrows; the rest of the caption waits behind "About this view", and under
// 900 px the hill link and the view buttons go below the picture, never on it.

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5

async function open(page: Page, path = '/?view=ground') {
  await page.goto(path)
  await expect(page.locator('.sky canvas')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.sky__dial')).toBeVisible()
}

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).boundingBox()
  expect(found, selector).not.toBeNull()
  return found!
}

/** The longest rendered line of an element's text, in characters. */
const longestLine = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => {
    const lines = new Map<number, number>()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let at = 0; at < (node.textContent ?? '').length; at++) {
        range.setStart(node, at)
        range.setEnd(node, at + 1)
        const rect = range.getClientRects()[0]
        if (!rect) continue
        const top = Math.round(rect.top)
        lines.set(top, (lines.get(top) ?? 0) + 1)
      }
    }
    return Math.max(...lines.values())
  })

for (const viewport of [
  { width: 390, height: 844, touch: true },
  { width: 800, height: 830, touch: true },
  { width: 1366, height: 768, touch: false },
]) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, locale: 'en-US' })

    test('the hill link and the view buttons cover neither the picture nor each other', async ({ page }) => {
      await open(page)
      const sky = await box(page, '.sky canvas')
      // Larissa's layout has no strip under the sky.
      await expect(page.locator('.ground-view__strip')).toHaveCount(0)
      const views = await box(page, '.views')
      const hill = await box(page, '.classroom-open')
      expect(overlaps(views, hill)).toBe(false)
      for (const control of [views, hill]) {
        expect(control.x).toBeGreaterThanOrEqual(0)
        expect(control.x + control.width).toBeLessThanOrEqual(viewport.width)
        expect(overlaps(control, sky)).toBe(false)
        // Below 900 px they go below the picture.
        if (viewport.width < 900) expect(control.y).toBeGreaterThanOrEqual(sky.y + sky.height - 0.5)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    })

    test('in the classic layout the hill link and the view buttons cover neither the picture nor each other', async ({ page }) => {
      await open(page, classic('/?view=ground'))
      const sky = await box(page, '.sky canvas')
      const strip = await box(page, '.ground-view__strip')
      const views = await box(page, '.views')
      const hill = await box(page, '.classroom-open')
      expect(overlaps(views, hill)).toBe(false)
      for (const control of [views, hill]) {
        expect(control.x).toBeGreaterThanOrEqual(0)
        expect(control.x + control.width).toBeLessThanOrEqual(viewport.width)
        expect(overlaps(control, sky)).toBe(false)
        if (viewport.width < 900) {
          // Below the picture, horizon strip included.
          expect(control.y).toBeGreaterThanOrEqual(strip.y + strip.height - 0.5)
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    })
  })
}

test.describe('on a phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US' })

  test('the picture takes half the screen, and at least 300 px of sky are free under the one-line hint', { tag: '@smoke' }, async ({ page }) => {
    await open(page)
    const stage = await box(page, '.stage')
    const sky = await box(page, '.sky canvas')
    const hint = await box(page, '.stage__caption')
    expect(stage.height).toBeGreaterThanOrEqual(844 / 2)
    expect(sky.y + sky.height - (hint.y + hint.height)).toBeGreaterThanOrEqual(300)
    // One line: the hint and its button.
    await expect(page.locator('.stage__caption > p').first()).toHaveText('Drag to look around. About this view')
    await expect(page.locator('.ground-view__note')).toBeHidden()
    // Nothing else of the page sits over the sky but the compass, the turn arrows, the Back button,
    // the arrows to the Sun and the Earth, and the landing panel with its button (Luiz, 15/11/2026: the
    // three new ones may sit over the sky, the 300 px above stay free). The panel is closed on a phone,
    // so only its button is seen; the safety circle is Level 3 only (#151) and is not on this view.
    const over = await page.evaluate(() => {
      const sky = document.querySelector('.sky canvas')!.getBoundingClientRect()
      const allowed = ['.stage__caption', '.sky__dial', '.sky__turn', '.stage__back', '.sky__body-guide', '.landing-panel']
      return [...document.querySelectorAll('.stage *')]
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null && !element.closest('.sky canvas, .ground-view__strip, dialog'))
        .filter((element) => !allowed.some((selector) => element.closest(selector)) && !element.contains(document.querySelector('.sky canvas')))
        .filter((element) => {
          const r = element.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && r.left < sky.right && sky.left < r.right && r.top < sky.bottom && sky.top < r.bottom
        })
        .map((element) => element.className)
    })
    expect(over).toEqual([])
  })

  test('the map hint names the touch gestures', async ({ page }) => {
    await page.goto('/?view=map')
    await expect(page.locator('.stage__caption')).toHaveText('The south pole from above, down to 80° S. Tap a Region to see its Sites, or double-tap any point to ask about it.')
  })
})

test.describe('at 1920×1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' })

  test('no caption line over a stage is longer than 70 characters', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'About this view' }).click()
    await expect(page.locator('.ground-view__note')).toBeVisible()
    expect(await longestLine(page, '.stage__caption')).toBeLessThanOrEqual(70)
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(page.locator('.stage__caption')).toContainText('double-click')
    expect(await longestLine(page, '.stage__caption')).toBeLessThanOrEqual(70)
  })
})

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('the hint, its button and the note are in Portuguese', async ({ page }) => {
    await open(page)
    await expect(page.locator('.stage__caption > p').first()).toHaveText('Arraste para olhar em volta. Sobre esta vista')
    await page.getByRole('button', { name: 'Sobre esta vista' }).click()
    await expect(page.locator('.ground-view__note')).toContainText('As alturas estão esticadas')
    await expect(page.getByRole('button', { name: 'Sobre esta vista' })).toHaveAttribute('aria-expanded', 'true')
  })
})
