import { expect, test } from './classic'
import type { Page } from '@playwright/test'

// One test per defect we have shipped or nearly shipped. Each says what broke and when.

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
}

test.use({ locale: 'en-US' })

test.describe('on a phone, 390 px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no two date labels of the time strip overlap', async ({ page }) => {
    // Regression: the Window's edge labels ran into the labels beside them and the
    // axis read "Nov 10 00:0Nov 11".
    await open(page)
    const boxes = await page.locator('.strip__tick').evaluateAll((labels) =>
      labels
        .map((label) => ({ text: label.textContent, box: label.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0)
        .map(({ text, box }) => ({ text, left: box.left, right: box.right })),
    )
    expect(boxes.length).toBeGreaterThanOrEqual(3)
    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        expect(a.right <= b.left || b.right <= a.left, `"${a.text}" overlaps "${b.text}"`).toBe(true)
      }
    }
  })

  test('the page does not scroll sideways', { tag: '@smoke' }, async ({ page }) => {
    await open(page)
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(scrollWidth).toBe(innerWidth)
  })

  test('a number never leaves its unit on another line', async ({ page }) => {
    // Regression: "h" sat alone on the second line under "19".
    await open(page)
    const number = page.getByRole('heading', { level: 1 }).locator('b')
    expect(await number.textContent()).toBe('4\u00a0h 21\u00a0min')
    expect(await number.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap')
  })

  test('the name beside the chosen Site on the map stays inside the stage', async ({ page }) => {
    // Seen on the live site, "Connecting Ridge (NASA site 001)" started at the dot in
    // the middle of the map and ran 10 px past the right edge, cut at "(NASA site 00".
    // A Site at the pole sits in the middle of the map, where the name fits on neither side.
    await page.route('**/visibility?**', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.query.site = { ...body.query.site, name: 'Connecting Ridge (NASA site 001)', latitude_deg: -89.99, longitude_deg: 0 }
      await route.fulfill({ response, json: body })
    })
    await page.goto('/?view=map')
    const canvas = page.getByRole('img', { name: /The Moon/ })
    await expect(canvas).toHaveAttribute('data-ready', 'true')
    const pin = page.locator('.globe__pin')
    await expect(pin).toBeVisible()
    // The camera glides to the map, so the name moves for a moment: wait until it stops.
    let last = -1
    await expect
      .poll(async () => {
        const x = (await pin.boundingBox())!.x
        const still = x === last
        last = x
        return still
      }, { intervals: [500] })
      .toBe(true)
    const stage = (await canvas.boundingBox())!
    const name = (await pin.boundingBox())!
    expect(name.x).toBeGreaterThanOrEqual(stage.x)
    expect(name.x + name.width).toBeLessThanOrEqual(stage.x + stage.width)
  })

  test('the Site list wraps its Region titles and its source line instead of cutting them', async ({ page }) => {
    // Seen on the list inherited the one-line rule of the Site name that opens it, so
    // "Haworth, in NASA’s list of nine Artemis III regions (October 2024)" was cut at "(October 20".
    await open(page)
    await page.getByRole('button', { name: /^Site:/ }).click()
    const options = page.getByRole('listbox', { name: 'Sites' })
    await expect(options).toBeVisible()
    for (const part of [options, page.locator('.site-list__source')]) {
      const { scrollWidth, clientWidth } = await part.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    }
  })
})

test.describe('on a 1366x768 laptop', () => {
  test.use({ viewport: { width: 1366, height: 768 } })

  test('the answer and the whole time strip fit above the fold', async ({ page }) => {
    // Regression: the type was sized by width only, the page was 962 px tall and the
    // bar showed without its axis or legend.
    await open(page)
    const strip = await page.locator('.strip').boundingBox()
    expect(strip!.y + strip!.height).toBeLessThanOrEqual(768)
    const earth = await page.getByRole('heading', { level: 2 }).boundingBox()
    expect(earth!.y + earth!.height).toBeLessThan(strip!.y)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(768)
  })
})

test.describe('on a 1366x768 laptop, with a panel open', () => {
  test.use({ viewport: { width: 1366, height: 768 } })

  test('a long answer scrolls inside its column and the page itself stays put', async ({ page }) => {
    // Integration of the panels, with the ladder open, a hidden table caption far down the
    // column stretched the document to 967 px, and the Moon and the time strip scrolled off screen.
    await open(page)
    // The panels are inside "Stats for nerds" since the requirement.
    await page.getByRole('button', { name: 'Stats for nerds' }).click()
    await page.getByRole('button', { name: /change this answer/ }).click()
    // The numbers, the facts under them, then the ladder's own table.
    await expect(page.getByRole('table').nth(2)).toBeVisible()
    await page.getByRole('link', { name: 'How we know these numbers' }).scrollIntoViewIfNeeded()
    const { scrollHeight, scrollTop } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      scrollTop: document.documentElement.scrollTop,
    }))
    expect(scrollHeight).toBe(768)
    expect(scrollTop).toBe(0)
    const strip = await page.locator('.strip').boundingBox()
    expect(strip!.y + strip!.height).toBeLessThanOrEqual(768)
  })
})

test.describe('default Query', () => {
  test('the Cursor bar has a dark edge, so it shows over the sunlit band', async ({ page }) => {
    // Regression: a white bar on the amber band is 1.5:1; WCAG 1.4.11 asks 3:1.
    await open(page)
    const { shadow, background } = await page.locator('.strip__cursor').evaluate((bar) => ({
      shadow: getComputedStyle(bar).boxShadow,
      background: getComputedStyle(document.body).backgroundColor,
    }))
    expect(shadow).not.toBe('none')
    expect(shadow).toContain(background)
  })

  test('the first line says where on the Moon', async ({ page }) => {
    // Regression: nothing on screen said "Moon", then "· THE MOON" read as a stray suffix.
    await open(page)
    await expect(page.getByText('Lunar Landing Site Navigator · south pole of the Moon')).toBeVisible()
  })

  test('a Window where the Sun and the Earth never overlap says so, not "together for 0 min"', async ({ page }) => {
    // First run against the real API, Site CR05 read "the Sun and the Earth together for 0 min".
    await page.route((url: URL) => url.pathname === '/visibility', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.metrics.sun_and_earth_hours = 0
      await route.fulfill({ response, json: body })
    })
    await open(page)
    await expect(page.getByText(/Across this Window the lander never has the Sun and the Earth at the same time/)).toBeVisible()
    await expect(page.getByText(/together for 0/)).toHaveCount(0)
  })

  test('a Window with no night does not report a night of zero minutes', async ({ page }) => {
    // First run against the real API, Site 001 in mid-November read "its longest night is 0 min".
    await page.route((url: URL) => url.pathname === '/visibility', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.metrics.lcsp_hours = 0
      await route.fulfill({ response, json: body })
    })
    await open(page)
    await expect(page.getByText('The Sun never sets in it.')).toBeVisible()
    await expect(page.getByText(/longest night is/)).toHaveCount(0)
  })
})

test('the open Site list sits in valid HTML, with no paragraph inside a paragraph', async ({ page }) => {
  // Found in the running app, the Query line was a <p> and the Site list inside it holds
  // <p> and <div>, so React logged "<p> cannot be a descendant of <p>" as soon as the list opened.
  await open(page)
  await page.locator('.site-pick button').first().click()
  await expect(page.getByRole('listbox')).toBeVisible()
  expect(await page.locator('p p, p div').count()).toBe(0)
})

test('every globe image is asked for under a versioned address', async ({ page }) => {
  // Live site, for a few minutes /moon/*.webp answered with the app's page, cacheable for
  // four hours. Browsers that came by then kept a grey globe, and a hard reload did not refetch.
  const asked: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/moon/')) asked.push(request.url())
  })
  await open(page)
  // At the least the whole Moon's colour and relief and the two projection files; more when those exist.
  await expect.poll(() => asked.length).toBeGreaterThanOrEqual(4)
  for (const url of asked) expect(new URL(url).searchParams.get('v'), url).toMatch(/^\d+$/)
})

test('the Moon shows with its 4096 px colour while the 8192 px one is still on its way', async ({ page }) => {
  // Live site, regression: with a cold cache the 8192 px colour took 28 s to arrive. The stage
  // waited 6 s for it on "Loading the Moon…", then showed a plain beige ball until it came.
  // A 1 px PNG stands in for each 4096 px image; the 8192 px ones are held until the end.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
  await page.route('**/moon/moon_*_4k.webp**', (route) => route.fulfill({ contentType: 'image/png', body: pixel }))
  const held: (() => Promise<void>)[] = []
  const asked8k: string[] = []
  page.on('request', (request) => {
    if (/\/moon\/moon_\w+_8k\.webp$/.test(new URL(request.url()).pathname)) asked8k.push(request.url())
  })
  await page.route('**/moon/moon_*_8k.webp**', (route) => {
    held.push(() => route.fulfill({ contentType: 'image/png', body: pixel }))
  })
  await open(page)
  const globe = page.locator('.globe')
  const canvas = page.locator('.globe canvas')
  // Well inside the 6 s the stage would otherwise wait.
  await expect(globe).toHaveAttribute('data-dressed', 'true', { timeout: 3000 })
  await expect(canvas).toHaveAttribute('data-moon', '4k', { timeout: 3000 })
  await expect(page.locator('.stage__loading')).toHaveCount(0)
  // Only a strong device takes the 8192 px images: a fine pointer, a texture limit of 8192 and hardware
  // rendering. The test asks the browser itself, apart from the app, so it holds on both kinds of machine.
  const strong = await page.evaluate(() => {
    const options: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true }
    const probe = document.createElement('canvas')
    const gl = (probe.getContext('webgl2', options) ?? probe.getContext('webgl', options)) as WebGL2RenderingContext | null
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    return gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 8192 && !/swiftshader|llvmpipe|software/i.test(renderer) && !matchMedia('(pointer: coarse)').matches
  })
  if (!strong) {
    // A software renderer (CI draws the globe in SwiftShader), a phone or a small GPU stays on the 4096 px
    // pair: the 8192 px images are never asked for, and decoding them is not what the test waits on.
    await page.waitForLoadState('networkidle')
    expect(asked8k).toEqual([])
    expect(held).toHaveLength(0)
    await expect(canvas).toHaveAttribute('data-moon', '4k')
    return
  }
  // A strong device asks for the finer pair only after, and swaps it in.
  await expect.poll(() => held.length).toBe(2)
  for (const release of held) await release()
  await expect(canvas).toHaveAttribute('data-moon', '8k')
})

/** Serves the projection files of the polar cap and the fine pole, and a 1 px image for each of their images. */
async function serveMoonPatches(page: Page) {
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')
  await page.route('**/moon/south_cap.json**', (route) =>
    route.fulfill({
      json: { sphere_radius_m: 1737400, size_px: 4096, x_min_m: -304000, y_max_m: 304000, metres_per_pixel: 148.4375 },
    }),
  )
  await page.route('**/moon/south_pole_fine.json**', (route) =>
    route.fulfill({
      json: {
        sphere_radius_m: 1737400,
        size_px: 8192,
        x_min_m: -92160,
        y_max_m: 92160,
        metres_per_pixel: 22.5,
        files: { normal: 'south_pole_fine_normal.webp', normal_small: 'south_pole_fine_normal_4k.webp', albedo: 'south_pole_fine_albedo.webp' },
      },
    }),
  )
  await page.route(/\/moon\/south_(cap|pole_fine)_[^/]*\.webp/, (route) => route.fulfill({ contentType: 'image/png', body: pixel }))
}

test('the finest pole images are asked for only when the view reaches the polar level', async ({ page }) => {
  // Live site, on a laptop: the 8192² normal of the pole and its albedo (about 425 MiB of video memory)
  // were loaded when the page opened, for everyone, though the orbit view never shows them, and a weak
  // GPU ran out of memory. They belong to the polar level ("South Pole in detail", the Map): opening the
  // page must not ask for any south_pole_fine image, and the Map must. The projection file and the images
  // are served here, so the globe has something to ask for.
  await serveMoonPatches(page)
  const images: string[] = []
  const capAsked: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (/\/moon\/south_pole_fine_[^/]*\.(webp|png)$/.test(pathname)) images.push(pathname)
    if (/\/moon\/south_cap_(normal|albedo)\.webp$/.test(pathname)) capAsked.push(pathname)
  })
  await open(page)
  await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true')
  // Everything the page asks for on its own has been asked for by now.
  await page.waitForLoadState('networkidle')
  expect(images).toEqual([])
  // The 148 m cap is level 1's (the budget in moonBudget.ts): the orbit asks for it when the page opens.
  expect(capAsked).not.toEqual([])

  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
  // The normal (8192 px on a strong device, 4096 px on any other) and the albedo.
  await expect.poll(() => images.some((path) => /south_pole_fine_normal(_4k)?\.webp$/.test(path))).toBe(true)
  await expect.poll(() => images.some((path) => path.endsWith('/south_pole_fine_albedo.webp'))).toBe(true)
})

test('with graphics=low the cap and the fine pole both wait for the polar level', async ({ page }) => {
  // The low tier fits every image to 1024 px and loads nothing of the pole while the view is in orbit.
  await serveMoonPatches(page)
  const asked: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    // The images only: the ground view reads the same projection files and the height maps on its own.
    if (/\/moon\/south_(cap|pole_fine)_(normal|albedo)/.test(pathname)) asked.push(pathname)
  })
  await page.goto('/?graphics=low')
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
  await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true')
  await page.waitForLoadState('networkidle')
  expect(asked).toEqual([])

  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
  await expect.poll(() => asked.some((path) => /south_cap_normal\.webp$/.test(path))).toBe(true)
  await expect.poll(() => asked.some((path) => /south_pole_fine_normal(_4k)?\.webp$/.test(path))).toBe(true)
})

test.describe('a browser that says it can draw 3D and then cannot', () => {
  // When the test machine was overloaded: the check for WebGL passed, the real
  // context then failed, and the stage stayed on "Loading the Moon…" for ever, because the wait
  // that ends the loading was only started after the context. The same hole was in the view from
  // the ground, which stayed empty.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const real = HTMLCanvasElement.prototype.getContext
      let asked = 0
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        // The first request is the app's check, on a canvas of its own; let it through. Every
        // later request for a 3D context fails, as it does when the graphics process is out of room.
        if (kind.startsWith('webgl') && asked++ > 0) return null
        return (real as (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) => unknown).call(this, kind, ...rest)
      } as typeof real
    })
  })

  test('says the Moon cannot be drawn, instead of loading for ever', async ({ page }) => {
    await open(page)
    await expect(page.getByText('The 3D Moon could not start. Try again or reload the page.')).toBeVisible()
    await expect(page.locator('.stage__loading')).toHaveCount(0)
    // The answer is all there.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('shows the unrolled horizon from the ground, instead of an empty sky', async ({ page }) => {
    await page.goto('/?view=ground')
    await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
    await expect(page.getByRole('img', { name: /The horizon all around .+, unrolled/ })).toBeVisible()
    await expect(page.getByText('Terrain around the Site. Heights are stretched so the hills show.')).toBeVisible()
    await expect(page.locator('.sky')).toHaveCount(0)
    await expect(page.locator('.stage__loading')).toHaveCount(0)
  })
})
