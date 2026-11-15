import { expect, test, type Page } from '@playwright/test'

// the requirement. A validation check found the floating "Ask/Perguntar" button at (296, 677),
// 78×44 px, on a 390×844 phone, lying over the end of the headline, the October to December columns
// of the landing calendar, the third column of the miss table and, inside the Site picker, the
// custom point's "Check". The button is an item of the globe's menu now ("Ask", between Guide and
// About), which folds behind a button on a phone. These tests measure what lies under its box at
// 390×844 and 1366×768, in both languages, and that it is reachable on every screen.

const LANGUAGES = ['en-GB', 'pt-BR'] as const
const PHONE = { width: 390, height: 844 }
const LAPTOP = { width: 1366, height: 768 }

/**
 * Every text, control or chart the button's box lies on, as short descriptions. Points across the
 * box are hit-tested: under the button, everything down to its own container (the menu) is something
 * it covers. What lies under the menu is the menu's to hide, not the button's.
 */
async function underButton(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((element) => element.textContent?.trim() === 'Ask')
    if (!button) return ['(no Ask button on the page)']
    const box = button.getBoundingClientRect()
    if (box.width === 0 || box.height === 0 || getComputedStyle(button).visibility === 'hidden') return ['(the Ask button is not shown)']
    const ancestors = new Set<Element>()
    for (let element = button.parentElement; element; element = element.parentElement) ancestors.add(element)
    const CONTENT = 'button, a[href], input, select, textarea, summary, label, svg, canvas, img, video, table, th, td, [role=slider], [role=img]'
    const hasText = (element: Element) =>
      [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '')
    const found = new Set<string>()
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 4; j++) {
        const x = box.left + 1 + (i / 8) * (box.width - 2)
        const y = box.top + 1 + (j / 4) * (box.height - 2)
        const stack = document.elementsFromPoint(x, y)
        const at = stack.findIndex((element) => element === button || button.contains(element))
        if (at < 0) continue
        for (const element of stack.slice(at)) {
          if (element === button || button.contains(element)) continue
          if (ancestors.has(element)) break
          if (element.matches(CONTENT) || hasText(element)) found.add(`${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`)
        }
      }
    }
    return [...found]
  })
}

/** On a phone the menu is folded behind its button: this opens it. */
async function showMenu(page: Page, phone: boolean) {
  if (phone) await page.getByRole('button', { name: 'Menu', exact: true }).click()
}

for (const locale of LANGUAGES) {
  test.describe(`the Ask button in ${locale}`, () => {
    test.use({ locale })

    for (const viewport of [PHONE, LAPTOP]) {
      const phone = viewport === PHONE

      test.describe(`at ${viewport.width}×${viewport.height}`, () => {
        test.use({ viewport })

        test('is one item of the menu, in view, and covers nothing', async ({ page }) => {
          await page.goto('/')
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
          await showMenu(page, phone)
          const button = page.getByRole('button', { name: 'Ask', exact: true })
          await expect(button).toHaveCount(1)
          await expect(page.locator('.globe-menu').getByRole('button', { name: 'Ask', exact: true })).toBeVisible()
          await expect(button).toBeInViewport()
          expect(await underButton(page)).toEqual([])
          const box = await button.boundingBox()
          expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true)
        })

        test('is still there with the drawer of details open, as the page behind it', async ({ page }) => {
          // The drawer is modal: the menu waits behind it, and Esc brings the page back with the button.
          await page.goto('/?details=1')
          await expect(page.getByRole('dialog', { name: /^(Details|Detalhes)$/ })).toBeVisible()
          await page.keyboard.press('Escape')
          await expect(page.getByRole('dialog', { name: /^(Details|Detalhes)$/ })).toBeHidden()
          await showMenu(page, phone)
          await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible()
          expect(await underButton(page)).toEqual([])
        })
      })
    }

    test('on a phone, on the Proof page, the button is in the menu in the corner and covers nothing', async ({ page }) => {
      await page.setViewportSize(PHONE)
      await page.goto('/?page=proof')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await showMenu(page, true)
      const button = page.getByRole('button', { name: 'Ask', exact: true })
      await expect(button).toBeVisible()
      expect(await underButton(page)).toEqual([])
      const box = await button.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= PHONE.width).toBe(true)
      // Nothing on the page runs past the screen.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE.width)
    })
  })
}
