import { expect, test } from './classic'
import type { Page } from '@playwright/test'
import { EARTH_ANGULAR_RADIUS_DEG, projectedRadiusPx, SUN_ANGULAR_RADIUS_DEG } from '../src/domain/spaceScale'
import { findOnStage, readGlobe, settle, tipTo, turn, zoomAllTheWay } from './orbit'

// The Prism mock answers every Query with the contract's example: Connecting Ridge CR01, a Window from
// 20/11/2026 12:00 UTC to 30/11/2026 12:00 UTC, with Sunsets behind the rim of Shackleton, two Short
// shadows and an Earthset behind Mons Malapert. The Cursor starts at the Window start.

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
}

test.describe('default Query, English browser', () => {
  test.use({ locale: 'en-GB' })

  test('opens already answering, and says what hides the Sun and the Earth', async ({ page }) => {
    await open(page)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
    await expect(page.getByText(/^20 Nov, 16:21 UTC, behind the rim of Shackleton, 4\.6\skm to the [a-z-]+\.$/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('The Earth sets in 9 d 15 h.')
    await expect(page.getByText(/^30 Nov, 03:45 UTC, behind Mons Malapert, 134\skm to the [a-z-]+\.$/)).toBeVisible()
  })

  test('names the Site and the Window, and gives the numbers', async ({ page }) => {
    // The numbers are inside "Stats for nerds" (the requirement).
    await open(page, '/?stats=1')

    await expect(page.getByRole('button', { name: /^Site: / })).toHaveText(/CR01/)
    await expect(page.getByLabel('Window start (UTC)')).toHaveValue('2026-11-20')
    await expect(page.getByRole('spinbutton', { name: 'Window length in days' })).toHaveValue('10')
    await expect(page.getByText(/days, to 30 Nov/)).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Observer height in metres' })).toHaveValue('2')
    const numbers = page.getByRole('table', { name: 'The numbers for this Window' })
    await expect(numbers.getByRole('row', { name: /Sun and Earth together/ })).toContainText('3 d 15 h · 37%')
    await expect(numbers.getByRole('row', { name: /Longest night \(LCSP\)/ })).toContainText('5 d 2 h')
  })

  test('draws the Moon and tells a screen reader whether the Site is lit', async ({ page }) => {
    await open(page)

    const moon = page.getByRole('img', { name: 'The Moon, seen from below its south pole. Connecting Ridge CR01 is in sunlight.' })
    await expect(moon).toBeVisible()
    await expect(moon).toHaveAttribute('data-ready', 'true')
  })

  test('shows the Window as a strip, with the Short shadows hatched and explained', async ({ page }) => {
    await open(page)

    const strip = page.getByRole('slider', { name: 'Cursor' })
    await expect(strip.locator('[data-kind="sun"]').first()).toBeVisible()
    await expect(strip.locator('[data-kind="shortShadow"]')).toHaveCount(2)
    await expect(strip.locator('[data-kind="earth"]')).toHaveCount(1)
    await expect(page.getByText('Hatched: Short shadow (under 12 h)')).toBeVisible()
    await expect(page.getByText('Cursor 20 Nov 2026, 12:00 UTC')).toBeVisible()
  })

  test('moving the Cursor past the Sunset changes the answer and the label of the Moon', async ({ page }) => {
    await open(page)

    const strip = page.getByRole('slider', { name: 'Cursor' })
    await strip.focus()
    for (let hour = 0; hour < 5; hour++) await strip.press('ArrowRight')

    await expect(page.getByText('Cursor 20 Nov 2026, 17:00 UTC')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('At the Cursor the Sun is down. It rises in 20 h 51 min.')
    await expect(page.getByText(/^21 Nov, 13:51 UTC, over the rim of Shackleton, /)).toBeVisible()
    await expect(page.getByRole('img', { name: /Connecting Ridge CR01 is in shadow\.$/ })).toBeVisible()
  })

  test('the link carries the Cursor, the view and the language, and reopens the same screen', async ({ page }) => {
    await open(page)

    const strip = page.getByRole('slider', { name: 'Cursor' })
    await strip.focus()
    await strip.press('Shift+ArrowRight')
    await page.getByRole('button', { name: 'From the ground' }).click()
    await page.getByRole('button', { name: 'Português' }).click()
    await expect(page).toHaveURL(/t=2026-11-21T12%3A00%3A00Z/)
    await expect(page).toHaveURL(/lang=pt/)
    await expect(page).toHaveURL(/view=ground/)

    await page.reload()

    await expect(page.getByText('Cursor 21 de nov. de 2026, 12:00 UTC')).toBeVisible()
    await expect(page.getByRole('img', { name: /^O horizonte em volta de Connecting Ridge CR01/ })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No Cursor, o Sol está oculto. Ele nasce em 1 h 51 min.')
  })

  test('the view from the ground unrolls the horizon', async ({ page }) => {
    await open(page, '/?view=ground')

    await expect(page.getByRole('img', { name: 'The horizon all around Connecting Ridge CR01, unrolled, with the Sun and the Earth over it.' })).toBeVisible()
    // Under the 3D sky (the requirement) the strip leaves the note about stretched heights to the caption
    // above it; since the requirement that note waits behind "About this view", under a one-line hint.
    await expect(page.locator('.stage__caption > p').first()).toHaveText('Drag to look around. About this view')
    await page.getByRole('button', { name: 'About this view' }).click()
    await expect(page.getByText(/^Heights are stretched [\d.]+×, and the Sun and the Earth with them, so the hills show\.$/)).toBeVisible()
  })
})

test.describe('default Query, Portuguese browser', () => {
  test.use({ locale: 'pt-BR' })

  test('gives the same answer in Portuguese', async ({ page }) => {
    await open(page)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('O Sol se põe em 4 h 21 min.')
    await expect(page.getByText(/^20 de nov\., 16:21 UTC, atrás da borda de Shackleton, a 4,6\skm a [a-z]+\.$/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('A Terra some em 9 d 15 h.')
    await expect(page.getByText('horários em UTC')).toBeVisible()
  })

  test('the switch changes every string on screen', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'English' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
    await expect(page.getByRole('button', { name: 'From orbit' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB')
  })
})

test('the reason under a statement marks its Occluder on the horizon', async ({ page }) => {
  const answered = page.waitForResponse((response) => response.url().includes('/visibility?'))
  await page.goto('/')
  const result = (await (await answered).json()) as { events: { type: string; t: string; occluder: { azimuth_deg: number } }[] }
  const reason = page.locator('.why__show').first()
  await expect(reason).toBeVisible()
  await reason.click()

  await expect(page.getByRole('button', { name: 'From the ground' })).toHaveAttribute('aria-pressed', 'true')
  await expect(reason).toHaveAttribute('aria-pressed', 'true')
  const mark = page.locator('.ground__mark')
  await expect(mark).toBeVisible()
  // The mark stands at an azimuth one of the answer's own events carries, across the unrolled horizon.
  const azimuth = Number(await mark.getAttribute('data-azimuth'))
  expect(result.events.map((event) => event.occluder.azimuth_deg)).toContain(azimuth)
  const { x, width } = await page.evaluate(() => {
    const svg = document.querySelector('.ground svg')!.getBoundingClientRect()
    const line = document.querySelector('.ground__mark line')!.getBoundingClientRect()
    return { x: line.left + line.width / 2 - svg.left, width: svg.width }
  })
  expect(x / width).toBeCloseTo(azimuth / 360, 2)

  await reason.click()
  await expect(mark).toHaveCount(0)
})

test('a shared link has a preview image and the tab has an icon, both served by the site', async ({ page, request }) => {
  // the requirement: the link is how the app travels, and it showed as bare text with a blank tab icon.
  await page.goto('/')
  const content = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute('content')
  expect(await content('og:title')).toBe('Lunar Landing Site Navigator')
  expect(await content('og:description')).toBeTruthy()
  expect(await content('og:type')).toBe('website')
  expect(await content('og:url')).toBe('https://lunar.luizfbm.win/')
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image')

  // Previews are fetched by other servers, so the image address is absolute. Here it is read
  // from the app under test, by its path.
  const image = await content('og:image')
  expect(image).toBe('https://lunar.luizfbm.win/og.png')
  expect(await content('og:image:width')).toBe('1200')
  expect(await content('og:image:height')).toBe('630')
  const picture = await request.get(new URL(image!).pathname)
  expect(picture.ok()).toBe(true)
  expect(picture.headers()['content-type']).toBe('image/png')
  const bytes = await picture.body()
  // A PNG says its size in its header: width at byte 16, height at byte 20.
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630])

  const icon = await page.locator('link[rel="icon"]').getAttribute('href')
  expect(icon).toBe('/favicon.svg')
  const drawn = await request.get(icon!)
  expect(drawn.ok()).toBe(true)
  expect(drawn.headers()['content-type']).toContain('image/svg+xml')
})

test.describe('from orbit the Sun and the Earth pass in the sky behind the Moon', () => {
  // Luiz, regression: "I don't see the Sun and the Earth when I am in 'From orbit'". They are not
  // markers on the Moon's rim but bodies in the sky behind it, at the angle they span in the Moon's
  // sky; the Moon is as it always was. Dragging the orbit takes the camera round the Moon, and the
  // Earth and the Sun come out from behind it. The globe says where each is on the stage in
  // data-sun-x/y/r and data-earth-x/y/r, empty while it is off the stage or behind the Moon.
  // Each test turns the camera with the mouse and waits for its glide to end after every move.
  test.describe.configure({ timeout: 600_000 })

  for (const size of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    test(`the Earth and the Sun come into view when the orbit is dragged round, at ${size.width} px`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.goto('/')
      await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
      await settle(page)
      // The Earth has its Blue Marble, not just its plain blue.
      await expect(page.locator('.globe canvas')).toHaveAttribute('data-earth', 'mapped', { timeout: 20_000 })
      // As far from the Moon as the orbit lets the camera go: the most room round the Moon's disc.
      await zoomAllTheWay(page, 'out')
      const stage = await page.locator('.globe').evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))

      const earth = await findOnStage(page, 'earth')
      expect(earth.found.x).toBeGreaterThanOrEqual(0)
      expect(earth.found.x).toBeLessThanOrEqual(stage.width)
      expect(earth.found.y).toBeGreaterThanOrEqual(0)
      expect(earth.found.y).toBeLessThanOrEqual(stage.height)
      // The Earth spans 0.95° of radius in the Moon's sky; the radius is measured on the screen from
      // the camera's own projection, a little off the formula for a body straight ahead.
      const earthExpected = projectedRadiusPx(EARTH_ANGULAR_RADIUS_DEG, 32, stage.height)
      expect(earth.found.r).toBeGreaterThan(earthExpected * 0.9)
      expect(earth.found.r).toBeLessThan(earthExpected * 1.1)

      const sun = await findOnStage(page, 'sun')
      expect(sun.found.x).toBeGreaterThanOrEqual(0)
      expect(sun.found.x).toBeLessThanOrEqual(stage.width)
      expect(sun.found.y).toBeGreaterThanOrEqual(0)
      expect(sun.found.y).toBeLessThanOrEqual(stage.height)
      const sunExpected = projectedRadiusPx(SUN_ANGULAR_RADIUS_DEG, 32, stage.height)
      expect(sun.found.r).toBeGreaterThan(sunExpected * 0.9)
      expect(sun.found.r).toBeLessThan(sunExpected * 1.1)
      // And the Earth is the bigger of the two, as it is in the sky of the Moon.
      expect(earth.found.r).toBeGreaterThan(sun.found.r)
    })
  }

  // ADR 0007: the planets are points of light in the same sky, named beside the point, and a name never
  // covers the Site's name or the view buttons. Which planets are on the stage depends on the Cursor and
  // the turn of the camera, so the test goes round the Moon until one is named.
  test.describe('the planets', () => {
    test.use({ locale: 'pt-BR' })

    test('are named in the language of the page, clear of the Site and of the view buttons', async ({ page }) => {
      await page.goto('/')
      await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
      await settle(page)
      await zoomAllTheWay(page, 'out')
      const named = async () => (await page.locator('.globe').getAttribute('data-planet-names')) ?? ''
      search: for (const polar of [90, 70, 110, 50, 130]) {
        await tipTo(page, polar)
        for (let step = 0; step < 24; step++) {
          if ((await named()) !== '') break search
          await turn(page, 15)
        }
      }
      const ids = (await named()).split(',')
      expect(ids.length).toBeGreaterThan(0)
      const portuguese: Record<string, string> = {
        mercury: 'Mercúrio',
        venus: 'Vênus',
        mars: 'Marte',
        jupiter: 'Júpiter',
        saturn: 'Saturno',
        uranus: 'Urano',
        neptune: 'Netuno',
      }
      const labels = page.locator('.globe__planets span:not([hidden])')
      expect(await labels.allTextContents()).toEqual(expect.arrayContaining(ids.map((id) => portuguese[id])))
      for (const box of await labels.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()))) {
        for (const other of ['.stage__foot', '.globe__pin']) {
          const against = await page.locator(other).first().boundingBox()
          if (!against) continue
          const apart = box.right <= against.x || against.x + against.width <= box.left || box.bottom <= against.y || against.y + against.height <= box.top
          expect(apart, `a planet's name over ${other}`).toBe(true)
        }
      }
    })
  })

  test("the orbit keeps the camera's limits: no closer than 1.04 Moon radii and no further than 6", async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
    await settle(page)
    await zoomAllTheWay(page, 'out')
    const far = (await readGlobe(page)).distance
    expect(far).toBeGreaterThan(5.9)
    expect(far).toBeLessThanOrEqual(6.01)
    await zoomAllTheWay(page, 'in')
    const near = (await readGlobe(page)).distance
    expect(near).toBeGreaterThanOrEqual(1.03)
    expect(near).toBeLessThan(1.15)
  })
})
