import { expect, test, type Page } from '@playwright/test'
import { discRadius, EARTH_DISTANCE, EARTH_RADIUS, projectedRadiusPx, SUN_ANGULAR_RADIUS_DEG, SUN_DISPLAY_DISTANCE } from '../src/domain/spaceScale'
import { findOnStage, readGlobe, settle, tipTo, turn, zoomOutTo } from './orbit'

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

test.describe('from orbit the Sun and the Earth are out there, at their real scale', () => {
  // Each test turns the camera with the mouse, and waits for its glide to end after every move.
  test.describe.configure({ timeout: 240_000 })
  // Luiz, regression: "I don't see the Sun and the Earth when I am in 'From orbit'", and then: they
  // must not be icons pinned to the Moon's rim but bodies in space. The Earth is 221 Moon radii away
  // and the Sun is drawn as wide as it is in the Moon's sky, so from near the Moon neither is in the
  // picture until the camera goes round and looks past it. The globe says where each is on the stage
  // in data-sun-x/y/r/distance and data-earth-x/y/r/distance, empty while it is off the stage or
  // behind the Moon.
  for (const size of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    test(`the Earth and the Sun come into view when the camera goes round the Moon, at ${size.width} px`, async ({ page }) => {
      await page.setViewportSize(size)
      await page.goto('/')
      await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
      await settle(page)
      const opening = await readGlobe(page)
      // The opening framing is the Moon filling the picture, a few radii away.
      expect(opening.distance).toBeGreaterThan(2.5)
      expect(opening.distance).toBeLessThan(5)
      // The Earth has its Blue Marble, not just its plain blue.
      await expect(page.locator('.globe canvas')).toHaveAttribute('data-earth', 'mapped', { timeout: 20_000 })

      // Out where the Earth and the Moon can be framed together: the Moon is always at the middle.
      await zoomOutTo(page, 300)
      const height = (await page.locator('.globe').evaluate((element) => element.clientHeight))
      const width = (await page.locator('.globe').evaluate((element) => element.clientWidth))

      const earth = await findOnStage(page, 'earth')
      // Seen from the Moon the Earth is 221 radii away; from the camera, as far as the camera is from the Moon more or less.
      expect(earth.found.distance).toBeGreaterThan(0)
      expect(earth.found.distance).toBeLessThan(EARTH_DISTANCE + earth.distance + 1)
      const earthExpected = projectedRadiusPx(EARTH_RADIUS, earth.found.distance, 32, height)
      // The radius is measured on the screen from the camera's own projection; the formula is for a body straight ahead.
      expect(earth.found.r).toBeGreaterThan(earthExpected * 0.9)
      expect(earth.found.r).toBeLessThan(earthExpected * 1.1)
      expect(earth.found.x).toBeGreaterThanOrEqual(0)
      expect(earth.found.x).toBeLessThanOrEqual(width)
      expect(earth.found.y).toBeGreaterThanOrEqual(0)
      expect(earth.found.y).toBeLessThanOrEqual(height)

      const sun = await findOnStage(page, 'sun')
      // The Sun is drawn 12,000 radii away, as wide as the 0.53° it spans in the Moon's sky.
      expect(sun.found.distance).toBeGreaterThan(SUN_DISPLAY_DISTANCE - sun.distance - 1)
      expect(sun.found.distance).toBeLessThan(SUN_DISPLAY_DISTANCE + sun.distance + 1)
      const sunExpected = projectedRadiusPx(discRadius(SUN_DISPLAY_DISTANCE, SUN_ANGULAR_RADIUS_DEG), sun.found.distance, 32, height)
      expect(sun.found.r).toBeGreaterThan(sunExpected * 0.9)
      expect(sun.found.r).toBeLessThan(sunExpected * 1.1)
      // And the Earth is the bigger of the two, as it is in the sky of the Moon.
      expect(earth.found.r).toBeGreaterThan(sun.found.r)
    })
  }

  test('the camera goes all the way round the Moon, from pole to pole, and out as far as the Earth', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
    await settle(page)
    // Turned a step at a time, it keeps going the same way, over the azimuth where a limit would stop it.
    let previous = (await readGlobe(page)).azimuth
    const wrap = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180
    const steps: number[] = []
    for (let step = 0; step < 10; step++) {
      await turn(page, 45)
      const now = (await readGlobe(page)).azimuth
      steps.push(wrap(now - previous))
      previous = now
    }
    expect(steps.every((step) => Math.abs(step) > 10)).toBe(true)
    expect(new Set(steps.map(Math.sign)).size).toBe(1)
    // From the north pole to the south pole.
    await tipTo(page, 12)
    expect((await readGlobe(page)).polar).toBeLessThan(16)
    await tipTo(page, 168)
    expect((await readGlobe(page)).polar).toBeGreaterThan(164)
    // Out far enough to frame the Earth and the Moon together, and no further than that.
    await zoomOutTo(page, 690)
    const far = await readGlobe(page)
    expect(far.distance).toBeGreaterThan(600)
    expect(far.distance).toBeLessThanOrEqual(700.01)
  })
})
