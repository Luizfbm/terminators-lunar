import { expect, test, type Page } from '@playwright/test'

// the requirement: the page opens on an Earthrise written into index.html, ticks real steps, and hands
// over to the globe once the Moon is dressed.

const held = () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  return { gate, release }
}

// Each line is written in both languages and the page shows one: read what is shown.
const scene = (page: Page) => page.locator('#earthrise')
const step = (page: Page, name: 'terrain' | 'sun' | 'earth') => scene(page).locator(`[data-step="${name}"]`)

test.describe('with JavaScript blocked', () => {
  test.use({ javaScriptEnabled: false, locale: 'en-GB' })

  test('the Earthrise is on screen at first paint, in English', async ({ page }) => {
    await page.goto('/')
    await expect(scene(page)).toBeVisible()
    await expect(scene(page).locator('.earthrise__ridge')).toBeVisible()
    await expect(scene(page).locator('.earthrise__earth')).toBeVisible()
    await expect(scene(page).locator('.earthrise__title')).toHaveText('Loading the Moon…', { useInnerText: true })
    await expect(scene(page).getByText('The terrain')).toBeVisible()
    await expect(scene(page).getByText(/IM-2 Athena tipped over/)).toBeVisible()
    await expect(scene(page).getByText('O relevo')).toBeHidden()
    await expect(scene(page).locator('[data-state="waiting"]')).toHaveCount(3)
  })
})

test.describe('while the code is slow', () => {
  test.use({ locale: 'pt-BR' })

  test('the Earthrise already speaks the browser language', async ({ page }) => {
    await page.route('**/assets/*.js', () => {
      // Never answered: the app's code does not arrive.
    })
    await page.goto('/', { waitUntil: 'commit' })
    await expect(scene(page).locator('.earthrise__title')).toHaveText('Carregando a Lua…', { useInnerText: true })
    await expect(scene(page).getByText('O caminho do Sol')).toBeVisible()
    await expect(scene(page).getByText(/Athena tombou/)).toBeVisible()
    await expect(scene(page).getByText("The Sun's path")).toBeHidden()
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  })

  test('a link that names the language wins over the browser', async ({ page }) => {
    await page.route('**/assets/*.js', () => {})
    await page.goto('/?lang=en', { waitUntil: 'commit' })
    await expect(scene(page).locator('.earthrise__title')).toHaveText('Loading the Moon…', { useInnerText: true })
  })
})

test.describe('the hand over', () => {
  test.use({ locale: 'en-GB' })

  test('the steps tick with what really arrived, and the loading is announced once', async ({ page }) => {
    const answer = held()
    const images = held()
    await page.route((url: URL) => url.pathname === '/visibility', async (route) => {
      await answer.gate
      await route.continue()
    })
    await page.route('**/moon/**', async (route) => {
      await images.gate
      await route.continue()
    })
    await page.goto('/')

    // The code runs and the answer is on its way; the terrain waits for the 3D code.
    await expect(step(page, 'sun')).toHaveAttribute('data-state', 'loading')
    await expect(step(page, 'earth')).toHaveAttribute('data-state', 'loading')
    await expect(step(page, 'terrain')).toHaveAttribute('data-state', 'waiting')
    await expect(scene(page)).toHaveAttribute('aria-hidden', 'true')
    await expect(page.getByRole('status')).toHaveCount(1)
    await expect(page.getByRole('status')).toHaveText('Loading the answer…')

    answer.release()
    await expect(step(page, 'sun')).toHaveAttribute('data-state', 'done')
    await expect(step(page, 'earth')).toHaveAttribute('data-state', 'done')
    // The globe is on the page and waits for its images: the Earthrise stays.
    await expect(step(page, 'terrain')).toHaveAttribute('data-state', 'loading')
    await expect(scene(page)).toBeVisible()

    images.release()
    await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true')
    await expect(scene(page)).toHaveCount(0)
  })

  test('the Moon is dressed under the picture before it fades, and nothing waits after that', async ({ page }) => {
    await page.addInitScript(() => {
      const seen: Record<string, unknown> = {}
      ;(window as unknown as { earthrise: typeof seen }).earthrise = seen
      new MutationObserver(() => {
        const element = document.getElementById('earthrise')
        if (!seen.dressedAt && document.querySelector('.globe[data-dressed="true"]')) seen.dressedAt = performance.now()
        if (element?.dataset.state === 'leaving' && !seen.leaving) {
          seen.leaving = {
            opacity: getComputedStyle(element).opacity,
            dressed: document.querySelector('.globe')?.getAttribute('data-dressed') ?? null,
          }
        }
        if (seen.leaving && !element && !seen.goneAt) seen.goneAt = performance.now()
      }).observe(document, { attributes: true, childList: true, subtree: true })
    })
    const read = () => page.evaluate(() => (window as unknown as { earthrise: Record<string, unknown> }).earthrise)

    // The first visit fills the cache; the second is the one a returning visitor gets.
    await page.goto('/')
    await expect(scene(page)).toHaveCount(0)
    await page.reload()
    await expect(scene(page)).toHaveCount(0)

    const seen = await read()
    // The fade starts from the full picture, over a Moon that is already fading in: no black frame.
    expect(seen.leaving).toEqual({ opacity: '1', dressed: 'true' })
    // No artificial wait: the picture is gone within its own fade of the Moon being ready.
    expect(Number(seen.goneAt) - Number(seen.dressedAt)).toBeLessThan(2_000)
  })

  test('the Proof page does not wait for the Moon', async ({ page }) => {
    await page.route('**/moon/**', () => {})
    await page.goto('/?page=proof')
    await expect(scene(page)).toHaveCount(0)
  })

  // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
  test.fixme('an answer that fails hands over to the error', async ({ page }) => {
    await page.route((url: URL) => url.pathname === '/visibility', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({ type: 'https://lunar-api.luizfbm.win/problems/busy', title: 'busy', status: 503, code: 'busy' }),
      }),
    )
    await page.goto('/')
    await expect(scene(page)).toHaveCount(0)
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('a browser that cannot draw the Moon gets the answer, not the picture for ever', async ({ page }) => {
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        if (kind.startsWith('webgl')) return null
        return (real as (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) => unknown).call(this, kind, ...rest)
      } as typeof real
    })
    await page.goto('/')
    await expect(page.getByText('This browser cannot draw the 3D Moon. The answer beside it is complete.')).toBeVisible()
    await expect(scene(page)).toHaveCount(0)
  })
})

test.describe('reduced motion', () => {
  test.use({ locale: 'en-GB', reducedMotion: 'reduce' })

  test('gets the still picture, the Earth already up', async ({ page }) => {
    await page.route((url: URL) => url.pathname === '/visibility', () => {})
    await page.goto('/')
    const earth = scene(page).locator('.earthrise__earth')
    await expect(earth).toHaveCSS('animation-name', 'none')
    await expect(earth).toHaveCSS('transform', 'none')
  })
})

test.describe('the small waits', () => {
  test.use({ locale: 'en-GB' })

  test('show a small Earth in orbit', async ({ page }) => {
    await page.route('**/moon/**', () => {})
    await page.goto('/')
    const orbit = page.locator('.globe .stage__loading .stage__orbit')
    await expect(orbit).toHaveCount(1)
    const earth = await orbit.evaluate((element) => {
      const style = getComputedStyle(element, '::after')
      return { background: style.backgroundImage, animation: style.animationName }
    })
    expect(earth.background).toMatch(/^radial-gradient/)
    expect(earth.animation).toBe('stage-orbit')
  })
})

// Validation check: the ridge was a 720 px box in the middle of the page, with hard
// left, right and bottom edges, at 1366x768, 1920x1080 and 390 px. It must run edge to edge along the
// bottom of the page, with the Earth whole above it and the words inside the gutter.
for (const [width, height] of [
  [390, 844],
  [1366, 768],
  [1920, 1080],
] as const) {
  test.describe(`the Earthrise at ${width}x${height}`, () => {
    test.use({ javaScriptEnabled: false, locale: 'en-GB', reducedMotion: 'reduce', viewport: { width, height } })

    test('the ridge runs edge to edge along the bottom, the Earth whole above it', async ({ page }) => {
      await page.goto('/')
      const ridge = await scene(page).locator('.earthrise__ridge').boundingBox()
      const earth = await scene(page).locator('.earthrise__earth').boundingBox()
      const text = await scene(page).locator('.earthrise__text').boundingBox()
      expect(ridge && earth && text).toBeTruthy()
      if (!ridge || !earth || !text) return

      expect(ridge.x).toBeLessThanOrEqual(0)
      expect(ridge.x + ridge.width).toBeGreaterThanOrEqual(width)
      expect(ridge.y + ridge.height).toBeGreaterThanOrEqual(height - 0.5)
      // The ridge is a band along the bottom, not the whole page.
      expect(ridge.y).toBeGreaterThan(height * 0.3)

      // The Earth is never cut by the page and sits at the crest, above the words.
      expect(earth.x).toBeGreaterThanOrEqual(0)
      expect(earth.x + earth.width).toBeLessThanOrEqual(width)
      expect(earth.y).toBeGreaterThanOrEqual(0)
      expect(earth.y + earth.height).toBeLessThan(ridge.y + ridge.height * 0.2)
      expect(text.y).toBeGreaterThan(earth.y + earth.height)

      // The words stay inside the 16 px gutter, and nothing scrolls sideways.
      expect(text.x).toBeGreaterThanOrEqual(16)
      expect(text.x + text.width).toBeLessThanOrEqual(width - 16)
      expect(text.y + text.height).toBeLessThanOrEqual(height)
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(scroll).toBeLessThanOrEqual(width)
    })
  })
}
