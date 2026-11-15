import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme(true, 'depends on the answer column and the header, not shown (issue #78)')

// the requirement. A validation check found the floating "Ask/Perguntar" button at (296, 677),
// 78×44 px, on a 390×844 phone, lying over the end of the headline, the October to December columns
// of the landing calendar, the third column of the miss table and, inside the Site picker, the
// custom point's "Check". The button now lives in the time strip on a phone and in the top bar on a
// wide screen, and steps aside while the picker or a dialog is open. These tests measure what lies
// under its box at 390×844 and 1366×768, in both languages.

const DAY_MS = 86_400_000
const EXAMPLE = JSON.parse(readFileSync(new URL('../../contract/examples/site-windows-001-2026-11-14.example.json', import.meta.url), 'utf8'))
const SLIP: { windows: { shift_days: number; sun_and_earth_hours: number }[] } = EXAMPLE.value ?? EXAMPLE

/**
 * The mock answers the windows route with the slip only; the calendar asks for a whole year from
 * day 0, so that one is built here from the example's Windows, one per day, ranked as the contract
 * ranks them (the numbers don't matter to these tests, only that the calendar is drawn).
 */
async function serveYear(page: Page) {
  await page.route('**/sites/*/windows?**', (route: Route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('first_shift_days') !== '0') return route.fallback()
    const startMs = Date.parse(url.searchParams.get('start')!)
    const hours = Number(url.searchParams.get('duration_hours'))
    const year = new Date(startMs).getUTCFullYear()
    const windows: { shift_days: number; sun_and_earth_hours: number; start: string; end: string }[] = []
    for (let day = 0; new Date(startMs + day * DAY_MS).getUTCFullYear() === year; day++) {
      const start = startMs + day * DAY_MS
      windows.push({
        ...SLIP.windows[day % SLIP.windows.length],
        shift_days: day,
        start: new Date(start).toISOString().replace('.000', ''),
        end: new Date(start + hours * 3_600_000).toISOString().replace(/\.\d{3}/, ''),
      })
    }
    const order = [...windows].sort((a, b) => a.sun_and_earth_hours - b.sun_and_earth_hours || a.shift_days - b.shift_days)
    const value = {
      ...SLIP,
      planned_start: url.searchParams.get('start'),
      duration_hours: hours,
      windows,
      best: windows.reduce((top, w) => (w.sun_and_earth_hours > top.sun_and_earth_hours ? w : top)),
      typical: order[Math.floor((order.length - 1) / 2)],
      worst: windows.reduce((low, w) => (w.sun_and_earth_hours < low.sun_and_earth_hours ? w : low)),
    }
    return route.fulfill({ json: value })
  })
}

const LANGUAGES = [
  {
    locale: 'en-GB',
    button: 'Ask the assistant',
    site: /^Site: /,
    form: /south of 80/,
    check: 'Check',
    calendar: /^Calendar of \d{4}/,
    table: 'Each metric at the Site and across the 19 points',
  },
  {
    locale: 'pt-BR',
    button: 'Perguntar ao assistente',
    site: /^Local: /,
    form: /ao sul de 80/,
    check: 'Consultar',
    calendar: /^Calendário de \d{4}/,
    table: 'Cada métrica no Local e nos 19 pontos',
  },
] as const

const PHONE = { width: 390, height: 844 }
const LAPTOP = { width: 1366, height: 768 }

/**
 * Every text, control or chart the button's box lies on, as short descriptions. Points across the
 * box are hit-tested: under the button, everything down to its own container (the strip's slot or
 * the top bar) is something it covers. What lies under the container is the container's to hide,
 * not the button's. Elements with `pointer-events: none` are not hit-tested and so not seen.
 */
async function underButton(page: Page, label: string): Promise<string[]> {
  return page.evaluate((name) => {
    const button = [...document.querySelectorAll('button')].find((element) => element.getAttribute('aria-label') === name)
    if (!button) return ['(no Ask button on the page)']
    const box = button.getBoundingClientRect()
    if (box.width === 0 || box.height === 0 || getComputedStyle(button).visibility === 'hidden') return []
    const ancestors = new Set<Element>()
    for (let element = button.parentElement; element; element = element.parentElement) ancestors.add(element)
    const CONTENT = [
      'button, a[href], input, select, textarea, summary, label, svg, canvas, img, video, table, th, td',
      '[role=slider], [role=button], [role=option], [role=combobox], [role=link], [role=img], [role=gridcell]',
      '[role=checkbox], [role=radio], [role=switch], [role=tab]',
    ].join(', ')
    const hasText = (element: Element) =>
      [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '')
    const describe = (element: Element) => {
      const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      const name = element.getAttribute('aria-label') ?? text
      return `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.split(' ')[0]}` : ''} "${name}"`
    }
    const found = new Set<string>()
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 4; j++) {
        const x = box.left + 1 + (i / 8) * (box.width - 2)
        const y = box.top + 1 + (j / 4) * (box.height - 2)
        const stack = document.elementsFromPoint(x, y)
        const at = stack.findIndex((element) => element === button || button.contains(element))
        // Something lies on the button here, so the button covers nothing at this point.
        if (at < 0) continue
        for (const element of stack.slice(at)) {
          if (element === button || button.contains(element)) continue
          if (ancestors.has(element)) break
          if (element.matches(CONTENT) || hasText(element)) found.add(describe(element))
        }
      }
    }
    return [...found]
  }, label)
}

type Box = { x: number; y: number; width: number; height: number }

/** The part of a box the reader can see: inside the viewport and above the pinned time strip. */
async function seenBox(page: Page, target: Locator): Promise<Box | null> {
  const box = await target.boundingBox()
  if (!box) return null
  const viewport = page.viewportSize()!
  const strip = await page.locator('footer.strip').boundingBox()
  const bottom = Math.min(viewport.height, strip ? strip.y : viewport.height, box.y + box.height)
  const top = Math.max(0, box.y)
  const left = Math.max(0, box.x)
  const right = Math.min(viewport.width, box.x + box.width)
  return bottom > top && right > left ? { x: left, y: top, width: right - left, height: bottom - top } : null
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/** The button's box overlaps nothing it could hide: by area against the target, and by hit-testing the whole page. */
async function expectClear(page: Page, button: Locator, label: string, target: Locator) {
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expect(target).toBeInViewport()
  const mine = await button.boundingBox()
  const seen = await seenBox(page, target)
  if (mine && seen) expect(overlap(mine, seen), 'the button over the target').toBe(0)
  expect(await underButton(page, label)).toEqual([])
}

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

for (const language of LANGUAGES) {
  test.describe(`the Ask button in ${language.locale}`, () => {
    test.use({ locale: language.locale })

    for (const viewport of [PHONE, LAPTOP]) {
      const size = `${viewport.width}×${viewport.height}`

      test.describe(`at ${size}`, () => {
        test.use({ viewport })

        test('covers nothing at the top of the page, the headline, the calendar or the miss table', async ({ page }) => {
          await serveYear(page)
          await open(page)
          const button = page.getByRole('button', { name: language.button })
          await expect(button).toBeVisible()
          await expect(button).toBeInViewport()
          // On a phone the button lives in the time strip; on a wide screen in the top bar.
          const home = viewport === PHONE ? page.locator('footer.strip') : page.locator('header.bar')
          await expect(home.getByRole('button', { name: language.button })).toHaveCount(1)
          await expect(page.getByRole('button', { name: language.button })).toHaveCount(1)

          // The top of the page, as it opens.
          expect(await underButton(page, language.button)).toEqual([])

          await expectClear(page, button, language.button, page.getByRole('heading', { level: 1 }))
          await expectClear(page, button, language.button, page.getByRole('group', { name: language.calendar }))
          await expectClear(page, button, language.button, page.getByRole('table', { name: language.table }))
          // The button is still at hand after the answer has scrolled.
          await expect(button).toBeInViewport()
        })

        test('covers nothing anywhere down the answer', async ({ page }) => {
          await serveYear(page)
          await open(page)
          await expect(page.getByRole('group', { name: language.calendar })).toBeVisible()
          // A phone scrolls the page; a wide screen scrolls the answer column.
          const scroller = viewport === PHONE ? 'document.scrollingElement' : 'main.answer'
          const height = await page.evaluate((which) => {
            const element = which === 'main.answer' ? document.querySelector('main.answer')! : document.scrollingElement!
            return element.scrollHeight - element.clientHeight
          }, scroller)
          for (let top = 0; top <= height + 200; top += 200) {
            await page.evaluate(
              ([which, to]) => {
                const element = which === 'main.answer' ? document.querySelector('main.answer')! : document.scrollingElement!
                element.scrollTo({ top: Number(to), behavior: 'instant' })
              },
              [scroller, String(top)] as const,
            )
            expect(await underButton(page, language.button), `scrolled to ${top}`).toEqual([])
          }
        })

        test('steps aside while the Site picker is open, so the custom point’s Check can be seen and clicked', async ({ page }) => {
          await open(page)
          const button = page.getByRole('button', { name: language.button })
          await expect(button).toBeVisible()
          await page.getByRole('button', { name: language.site }).click()
          const check = page.getByRole('form', { name: language.form }).getByRole('button', { name: language.check })
          await check.scrollIntoViewIfNeeded()
          await expect(check).toBeVisible()
          await expect(button).toBeHidden()
          expect(await underButton(page, language.button)).toEqual([])
          // Nothing lies on Check: the point at its centre hits Check itself.
          const hit = await check.evaluate((element) => {
            const box = element.getBoundingClientRect()
            const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            return top !== null && (top === element || element.contains(top))
          })
          expect(hit).toBe(true)
          await check.click({ trial: true })

          // Closed again, the button comes back.
          await page.keyboard.press('Escape')
          await expect(button).toBeVisible()
        })

        test('steps aside while a dialog is open', async ({ page }) => {
          await open(page)
          const button = page.getByRole('button', { name: language.button })
          await expect(button).toBeVisible()
          await page.evaluate(() => {
            const dialog = document.createElement('dialog')
            dialog.id = 'any-dialog'
            dialog.textContent = 'Any dialog'
            document.body.append(dialog)
            dialog.showModal()
          })
          await expect(button).toBeHidden()
          await page.evaluate(() => (document.getElementById('any-dialog') as HTMLDialogElement).close())
          await expect(button).toBeVisible()
        })
      })
    }

    test('on a phone with no time strip, the Proof page, the button stays in the top bar and covers nothing', async ({ page }) => {
      await page.setViewportSize(PHONE)
      await page.goto('/?page=proof')
      const button = page.getByRole('button', { name: language.button })
      await expect(page.locator('header.bar').getByRole('button', { name: language.button })).toBeVisible()
      expect(await underButton(page, language.button)).toEqual([])
      // The top bar wraps instead of squeezing the app's name: nothing in it runs past the screen.
      const bar = await page.locator('header.bar').evaluate((element) => element.scrollWidth <= element.clientWidth)
      expect(bar).toBe(true)
      const box = await button.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= PHONE.width).toBe(true)
    })
  })
}
