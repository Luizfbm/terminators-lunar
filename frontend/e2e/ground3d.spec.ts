import { deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'

// the requirement: the view from the ground in 3D. The camera stands at the Observer and turns in
// place; the unrolled horizon stays as a strip under it. The canvas says where it is looking in
// `data-yaw`, the azimuth at the middle of the view, so a test can read it.

test.use({ locale: 'en-US' })

const sky = (page: Page) => page.locator('.sky canvas')
const yaw = async (page: Page) => Number(await sky(page).getAttribute('data-yaw'))
/** How far apart two azimuths are, the short way round. */
const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

async function open(page: Page, path = '/?view=ground') {
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === '/visibility')
  await page.goto(path)
  const body = await (await answered).json()
  await expect(sky(page)).toHaveAttribute('data-ready', 'true')
  return body
}

test('opens looking at the Sun, where the API says it is, with the unrolled horizon as a strip under the sky', async ({ page }) => {
  const body = await open(page)
  // The Cursor sits between two samples of the timeline: the view looks at the Sun of one of them.
  const azimuths: number[] = body.timeline.samples.map((sample: { sun: { azimuth_deg: number } }) => sample.sun.azimuth_deg)
  await expect
    .poll(async () => {
      const looking = await yaw(page)
      return Math.min(...azimuths.map((azimuth) => apart(azimuth, looking)))
    })
    .toBeLessThan(0.2)

  await expect(page.locator('.stage__caption')).toContainText('Drag to look around')
  const strip = page.locator('.ground-view__strip .ground svg')
  await expect(strip).toBeVisible()
  // The strip is under the sky, not over it.
  const skyBox = (await sky(page).boundingBox())!
  const stripBox = (await strip.boundingBox())!
  expect(stripBox.y).toBeGreaterThanOrEqual(skyBox.y + skyBox.height - 1)
  expect(skyBox.height).toBeGreaterThan(stripBox.height)
})

test('the two arrows turn the view 30 degrees each way, without a mouse on the sky', async ({ page }) => {
  await open(page)
  await expect.poll(() => yaw(page)).not.toBeNaN()
  const start = await yaw(page)
  await page.getByRole('button', { name: 'Look right' }).click()
  await expect.poll(async () => apart(await yaw(page), (start + 30) % 360)).toBeLessThan(0.3)
  await page.getByRole('button', { name: 'Look left' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect.poll(async () => apart(await yaw(page), (start + 330) % 360)).toBeLessThan(0.3)
})

test('dragging the sky to the left brings what is on the right into view', async ({ page }) => {
  await open(page)
  const start = await yaw(page)
  const box = (await sky(page).boundingBox())!
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4, { steps: 8 })
  await page.mouse.up()
  // Turned towards the east of where it was: the azimuth went up, by more than a few degrees.
  await expect.poll(async () => ((await yaw(page)) - start + 360) % 360).toBeGreaterThan(5)
  expect(((await yaw(page)) - start + 360) % 360).toBeLessThan(180)
})

test('marking what hides the Earth turns the view to it', async ({ page }) => {
  await page.goto('/')
  await page.locator('.why__show').first().click()
  await expect(page).toHaveURL(/view=ground/)
  await expect(sky(page)).toHaveAttribute('data-ready', 'true')
  const mark = page.locator('.ground__mark')
  await expect(mark).toBeVisible()
  const azimuth = Number(await mark.getAttribute('data-azimuth'))
  await expect.poll(async () => apart(await yaw(page), azimuth)).toBeLessThan(0.3)
})

test.describe('on a phone, 390 px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the sky, the strip and the view buttons each have their room, and nothing runs off the side', async ({ page }) => {
    await open(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    const skyBox = (await sky(page).boundingBox())!
    const strip = (await page.locator('.ground-view__strip').boundingBox())!
    const views = (await page.locator('.views').boundingBox())!
    expect(skyBox.height).toBeGreaterThan(120)
    expect(strip.y).toBeGreaterThanOrEqual(skyBox.y + skyBox.height - 1)
    expect(views.y).toBeGreaterThanOrEqual(strip.y + strip.height - 1)
  })
})

// the requirement: the real ground. The site serves a 16-bit height map of the pole; here a small one is
// made by hand and served in its place, so the test does not depend on the real 5 MB file.

/** A 16-bit greyscale PNG, every row written without a filter. */
function heightPng(size: number, value: (column: number, row: number) => number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'latin1')
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0)
    return Buffer.concat([head, body, tail])
  }
  const raw = Buffer.alloc(size * (size * 2 + 1))
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) raw.writeUInt16BE(value(column, row), row * (size * 2 + 1) + 1 + column * 2)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([16, 0, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/**
 * Serves one level of the published ground as a square height map of `size` pixels of
 * `metresPerPixel`, centred on the pole: 'south_pole_fine' is the map of the pole, 'south_cap' the
 * wider one of the whole cap. A level that is not served is answered as missing.
 */
async function serveHeights(page: Page, levels: Partial<Record<'south_pole_fine' | 'south_cap', { size: number; metresPerPixel: number }>>) {
  for (const name of ['south_pole_fine', 'south_cap'] as const) {
    const level = levels[name]
    if (!level) {
      await page.route(`**/moon/${name}.json**`, (route) => route.fulfill({ status: 404, body: '' }))
      continue
    }
    const { size, metresPerPixel } = level
    const half = (size * metresPerPixel) / 2
    await page.route(`**/moon/${name}.json**`, (route) =>
      route.fulfill({
        json: {
          sphere_radius_m: 1737400,
          size_px: size * 4,
          x_min_m: -half,
          y_max_m: half,
          metres_per_pixel: metresPerPixel / 4,
          height_png: { file: `${name}_height.png`, size_px: size, metres_per_pixel: metresPerPixel, metres_above_1737400_m: { at_0: -4000, at_65535: 4000 } },
        },
      }),
    )
    // Rolling ground: a few hundred metres up and down over tens of kilometres.
    const png = heightPng(size, (column, row) => Math.round(32768 + 2500 * Math.sin(column / 7) + 2000 * Math.cos(row / 5)))
    await page.route(`**/moon/${name}_height.png**`, (route) => route.fulfill({ contentType: 'image/png', body: png }))
  }
}

test('where the height map covers the Site the ground is the real one, and the caption says where it comes from', async ({ page }) => {
  // 128 pixels of 1.6 km: about 100 km to each side of the pole. The mock's Site is 14 km from it.
  await serveHeights(page, { south_pole_fine: { size: 128, metresPerPixel: 1600 } })
  await open(page)
  await expect(sky(page)).toHaveAttribute('data-ground', 'real')
  await expect(page.locator('.ground-view__note')).toHaveText(
    /^The ground is the Moon’s own, measured by NASA’s LOLA every 1,600\sm\. The fine grain on it is only texture: nothing smaller than that is measured\. Heights are stretched [\d.]+×, and the Sun and the Earth with them, so the hills show\.$/,
  )
  // The view still opens on the Sun and still turns: the ground is scenery, the camera is the same.
  const start = await yaw(page)
  await page.getByRole('button', { name: 'Look right' }).click()
  await expect.poll(async () => apart(await yaw(page), (start + 30) % 360)).toBeLessThan(0.3)
})

test('where the height map does not reach the Site the horizon stays a silhouette, and the caption does not claim the ground', async ({ page }) => {
  // 10 pixels of 1 km: 5 km to each side of the pole, short of the Site.
  await serveHeights(page, { south_pole_fine: { size: 10, metresPerPixel: 1000 } })
  await open(page)
  await expect(sky(page)).toHaveAttribute('data-ground', 'silhouette')
  await expect(page.locator('.ground-view__note')).toHaveText(/^Heights are stretched [\d.]+×, and the Sun and the Earth with them, so the hills show\.$/)
})

test('without a height map the view from the ground still works, as a silhouette', async ({ page }) => {
  await serveHeights(page, {})
  await open(page)
  await expect(sky(page)).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.stage__caption')).not.toContainText('LOLA')
  expect(await sky(page).getAttribute('data-ground')).not.toBe('real')
})

// the requirement: the Earth has a map on it, turned to show the face the Moon sees.

test('the Earth is drawn with its map, which the site itself serves, and with a lean worked out from the answer', async ({ page, request }) => {
  await open(page)
  await expect(sky(page)).toHaveAttribute('data-earth', 'mapped')
  // How far north leans on the sky: a number of degrees, and from the south pole of the Moon the
  // Earth is seen nearly upside down.
  await expect.poll(async () => Math.abs(Number(await sky(page).getAttribute('data-earth-lean')))).toBeGreaterThan(120)
  const map = await request.get('/earth_2k.jpg')
  expect(map.ok()).toBe(true)
  expect(map.headers()['content-type']).toBe('image/jpeg')
  // A JPEG says its size in its start-of-frame segment: 2048 x 1024, twice as wide as tall, as the ball expects.
  const bytes = await map.body()
  let at = 2
  while (at < bytes.length && !(bytes[at] === 0xff && (bytes[at + 1] === 0xc0 || bytes[at + 1] === 0xc2))) at += 2 + bytes.readUInt16BE(at + 2)
  expect([bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)]).toEqual([2048, 1024])
})

test('without the map the Earth is still there, in its plain blue', async ({ page }) => {
  await page.route('**/earth_2k.jpg', (route) => route.fulfill({ status: 404, body: '' }))
  await open(page)
  await expect.poll(async () => Number(await sky(page).getAttribute('data-earth-lean'))).not.toBeNaN()
  expect(await sky(page).getAttribute('data-earth')).toBeNull()
})

// the requirement: the wider map of the polar cap carries the ground on, and is the ground of the Sites
// the map of the pole does not reach.

test('where only the wider map reaches the Site, the ground is real all the same, and the caption gives that map\'s spacing', async ({ page }) => {
  // The map of the pole is 5 km to each side, short of the Site; the wider one is 160 pixels of 2 km.
  await serveHeights(page, { south_pole_fine: { size: 10, metresPerPixel: 1000 }, south_cap: { size: 160, metresPerPixel: 2000 } })
  await open(page)
  await expect(sky(page)).toHaveAttribute('data-ground', 'real')
  await expect(sky(page)).toHaveAttribute('data-far', 'real')
  await expect(page.locator('.ground-view__note')).toContainText('measured by NASA’s LOLA every 2,000')
})

test('with both maps the near ground comes from the finer one and the far ground from the wider one', async ({ page }) => {
  await serveHeights(page, { south_pole_fine: { size: 128, metresPerPixel: 800 }, south_cap: { size: 160, metresPerPixel: 2000 } })
  await open(page)
  await expect(sky(page)).toHaveAttribute('data-far', 'real')
  await expect(sky(page)).toHaveAttribute('data-ground', 'real')
  // The spacing the caption states is the finer map's, the one under the Observer's feet.
  await expect(page.locator('.ground-view__note')).toContainText('measured by NASA’s LOLA every 800')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the wider map, a 22 MB file, is not asked for', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/moon/south_cap')) asked.push(request.url())
    })
    await serveHeights(page, { south_pole_fine: { size: 128, metresPerPixel: 1600 }, south_cap: { size: 160, metresPerPixel: 2000 } })
    await open(page)
    await expect(sky(page)).toHaveAttribute('data-ground', 'real')
    await expect(sky(page)).toHaveAttribute('data-far', 'silhouette')
    expect(asked).toEqual([])
  })
})


// The real ground is lit by a Lunar-Lambert shader patched into three's Lambert one.
// The unit tests hold the sum and the patch, but only a browser compiles GLSL: a typo in it, or a
// three upgrade that moves the line, shows as a shader error in the console and a black ground.
test('the ground\'s regolith shader compiles: no shader error is logged and the view still opens', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /WebGLProgram|Shader Error|THREE\./.test(message.text())) problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))
  await serveHeights(page, { south_pole_fine: { size: 128, metresPerPixel: 1600 } })
  await open(page)
  await expect(sky(page)).toHaveAttribute('data-ground', 'real')
  // Looking round draws the ground again from another side, so every material has been used.
  await page.getByRole('button', { name: 'Look right' }).click()
  await expect.poll(async () => Number(await sky(page).getAttribute('data-yaw'))).not.toBeNaN()
  expect(problems).toEqual([])
})
