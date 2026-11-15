import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openDetails, withDetails } from './details'

// the requirement: everyone can use the answer. axe checks WCAG 2.1 A and AA on each state of the screen;
// the rest checks what axe cannot: the keyboard, the phone and what a screen reader is told.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function open(page: Page, path = '/') {
  await page.goto(path)
  // By CSS, not by role: a link with details=1 opens with the drawer, and the strip is inert behind it.
  await expect(page.locator('footer.strip [role="slider"]')).toBeVisible()
}

async function violations(page: Page) {
  const { violations: found } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  return found.map((rule) => `${rule.id}: ${rule.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

test.use({ locale: 'en-US' })

for (const [name, viewport] of [
  ['a desktop', { width: 1440, height: 900 }],
  ['a phone', { width: 390, height: 844 }],
] as const) {
  test.describe(`WCAG AA on ${name}`, () => {
    test.use({ viewport })

    test('the main screen, from orbit', async ({ page }) => {
      await open(page)
      expect(await violations(page)).toEqual([])
    })

    test('the main screen, from the ground, with an Occluder marked', async ({ page }) => {
      await open(page)
      await page.locator('.why__show').first().click()
      await expect(page.locator('.ground__mark')).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('the drawer of details', async ({ page }) => {
      await open(page)
      await openDetails(page)
      expect(await violations(page)).toEqual([])
    })

    test('the open Site list', async ({ page }) => {
      // The Site picker is in the drawer of details.
      await open(page, withDetails())
      await page.locator('.site-pick button').first().click()
      await expect(page.getByRole('listbox')).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('the Proof page', async ({ page }) => {
      await page.goto('/?page=proof')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('the screen in Portuguese', async ({ page }) => {
      await open(page, '/?lang=pt')
      expect(await violations(page)).toEqual([])
      await openDetails(page)
      expect(await violations(page)).toEqual([])
    })
  })
}

test('the Cursor moves with the arrow keys', async ({ page }) => {
  await open(page)
  const cursor = page.getByRole('slider', { name: 'Cursor' })
  await cursor.focus()
  const before = Number(await cursor.getAttribute('aria-valuenow'))
  await page.keyboard.press('ArrowRight')
  const after = Number(await cursor.getAttribute('aria-valuenow'))
  expect(after).toBeGreaterThan(before)
  await page.keyboard.press('ArrowLeft')
  expect(Number(await cursor.getAttribute('aria-valuenow'))).toBe(before)
})

/** Presses Tab through the controls inside `scope` and checks that each one shows where the focus is. */
async function tabThrough(page: Page, scope: string) {
  const wanted = await page
    .locator(`${scope} :is(button, input, a[href], [role="slider"], summary):visible`)
    // A control with tabindex -1 sits inside a widget Tab enters once (the calendar of the day to
    // land, the requirement); the arrow keys move inside it.
    .evaluateAll((controls) => controls.filter((control) => !(control as HTMLButtonElement).disabled && control.getAttribute('tabindex') !== '-1').length)
  const reached = new Set<string>()
  for (let step = 0; step < wanted + 6; step++) {
    await page.keyboard.press('Tab')
    const focus = await page.evaluate(() => {
      const element = document.activeElement
      if (!element || element === document.body) return null
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return {
        key: `${element.tagName}:${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40)}:${Math.round(box.x)},${Math.round(box.y)}`,
        outlined: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
      }
    })
    if (!focus) continue
    expect(focus.outlined, `no focus ring on ${focus.key}`).toBe(true)
    reached.add(focus.key)
  }
  expect(reached.size).toBeGreaterThanOrEqual(wanted)
}

test('Tab reaches every control on the main screen, and each shows where the focus is', async ({ page }) => {
  await open(page)
  // The globe's menu, the card, the views and the time strip: everything on the page outside the drawer, which is closed.
  await tabThrough(page, 'body')
})

test('Tab reaches every control of the drawer of details, and each shows where the focus is', async ({ page }) => {
  await open(page)
  await openDetails(page)
  // The drawer is modal: Tab stays inside it and the page behind is inert.
  await tabThrough(page, '.drawer')
})

test('a screen reader hears the Countdown and the metrics as text', async ({ page }) => {
  // The metrics are inside "Stats for nerds" (the requirement), in the drawer of details.
  await open(page, '/?stats=1')
  // The Countdown is a heading with the whole sentence in it, number and unit included.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/The Sun .*\d+\s(d|h|min)/)
  // The time strip's bands are said in words, not only in colour.
  await expect(page.getByRole('slider', { name: 'Cursor' })).toHaveAttribute('aria-valuetext', /UTC/)
  await openDetails(page)
  // The metrics are a table with a caption, each row named by its header cell.
  const table = page.getByRole('table', { name: 'The numbers for this Window' })
  await expect(table).toBeVisible()
  await expect(table.getByRole('rowheader', { name: 'Sun and Earth together' })).toBeVisible()
})

test.describe('on a phone, 390 px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('nothing is cut off at the side: every text of the stage and the answer fits the screen', async ({ page }) => {
    // Seen in the running app, the panorama's caption ran past the right edge and was cut.
    await open(page, '/?view=ground')
    const cutOff = (selector: string) =>
      page.evaluate((all) => {
        const found: string[] = []
        for (const element of document.querySelectorAll(all)) {
          const box = element.getBoundingClientRect()
          if (box.width > 0 && (box.right > window.innerWidth + 0.5 || box.left < -0.5)) found.push(element.textContent ?? '')
        }
        return found
      }, selector)
    // The stage and the card over it, then the drawer of details.
    expect(await cutOff('.stage text, .stage p, .card p, .card h1, .card h2')).toEqual([])
    await openDetails(page)
    expect(await cutOff('.drawer p, .drawer h1, .drawer h2')).toEqual([])
  })

  test('every section is reachable by scrolling, down to the Proof link', async ({ page }) => {
    // Everything below the card is in the drawer of details, which scrolls inside itself.
    await open(page, withDetails())
    const proof = page.locator('.extras__proof a')
    await proof.scrollIntoViewIfNeeded()
    await expect(proof).toBeInViewport()
  })
})
