import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Route } from '@playwright/test'

// the requirement: seen from the pole the map shows one marker per Region; a click flies in and its
// Sites can each be asked about; "all regions" and Esc fly back out; hover shows hand, growth and
// the name. The mock only has a couple of Sites, so these tests serve their own list.

const site = (id: string, name: string, region_id: string | null, latitude_deg: number, longitude_deg: number) => ({
  id,
  name,
  latitude_deg,
  longitude_deg,
  source: 'wueller2026',
  source_reference: 'Wueller et al. 2026, JGR Planets',
  region_id,
  curated: true,
  has_5m_dem: false,
})

// 001 is the Site the mock answers for, so it is the chosen one when the page opens.
const SITES = [
  site('001', 'Connecting Ridge (NASA site 001)', 'CR', -89.4661, -136.949),
  site('CR02', 'Connecting Ridge CR02', 'CR', -89.43, -125.1),
  site('CR03', 'Connecting Ridge CR03', 'CR', -89.6, -150.2),
  site('HW01', 'Haworth HW01', 'HW', -87.2, -20),
  site('HW02', 'Haworth HW02', 'HW', -86.8, -25),
  site('MMO01', 'Mons Mouton MMO01', 'MMO', -85.416, 31.8506),
  site('APOLLO11', 'Apollo 11', null, 0.6741, 23.4733),
]
const REGIONS = [
  { id: 'CR', name: 'Connecting Ridge', site_count: 3, artemis_iii_current: false, source_reference: 'Wueller 2026' },
  { id: 'HW', name: 'Haworth', site_count: 2, artemis_iii_current: true, source_reference: 'Wueller 2026' },
  { id: 'MMO', name: 'Mons Mouton', site_count: 1, artemis_iii_current: true, source_reference: 'Wueller 2026' },
]

async function serve(page: Page) {
  await page.route('**/sites', (route: Route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(SITES) }))
  await page.route('**/regions', (route: Route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(REGIONS) }))
  await page.route('**/visibility?**', async (route: Route) => {
    const asked = new URL(route.request().url()).searchParams.get('site_id')
    const response = await route.fetch()
    const body = await response.json()
    const chosen = SITES.find((entry) => entry.id === asked)
    if (chosen) body.query.site = chosen
    await route.fulfill({ response, json: body })
  })
}

const ridge = (page: Page) => page.getByRole('button', { name: 'Connecting Ridge, 3 Sites' })
const haworth = (page: Page) => page.getByRole('button', { name: 'Haworth, 2 Sites' })
const allRegions = (page: Page) => page.getByRole('button', { name: 'All regions' })

async function openMap(page: Page) {
  await serve(page)
  await page.goto('/?view=map')
  // The camera glides down to the pole first; the markers show once it is there.
  await expect(ridge(page)).toBeVisible({ timeout: 10_000 })
}

test.use({ locale: 'en-GB' })

test('from the pole there is one marker per Region, with its name and count, and no pile of dots', async ({ page }) => {
  await openMap(page)
  await expect(page.getByRole('group', { name: 'Regions on the map' }).locator('.globe__region')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Mons Mouton, 1 Site' })).toBeVisible()
  await expect(haworth(page).locator('.globe__count')).toHaveText('2')
  // The Sites themselves wait for their Region to be flown into; the landers away from the pole are not on the map.
  await expect(page.getByRole('button', { name: 'Connecting Ridge CR02' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Apollo 11' })).toHaveCount(0)
  // The chosen Site has its ring and its name.
  await expect(page.locator('.globe__chosen')).toBeVisible()
  await expect(page.locator('.globe__pin')).toHaveText('Connecting Ridge (NASA site 001)')
})

test('a click on a Region flies in, a click on one of its Sites asks about it, and Esc flies back out', async ({ page }) => {
  await openMap(page)
  await ridge(page).click()
  await expect(allRegions(page)).toBeVisible()
  const other = page.getByRole('button', { name: 'Connecting Ridge CR02' })
  await expect(other).toBeVisible()
  await expect(ridge(page)).toHaveCount(0)
  // The chosen Site keeps its ring and its label down here too.
  await expect(page.locator('.globe__chosen')).toBeVisible()
  await expect(page.locator('.globe__pin')).toBeVisible()

  const asked = page.waitForRequest((request) => request.url().includes('/visibility?') && request.url().includes('site_id=CR02'))
  await other.click()
  await asked
  await expect(page).toHaveURL(/site=CR02/)
  // No card in between, and the camera stays in the Region.
  await expect(allRegions(page)).toBeVisible()
  await expect(page.locator('.globe__pin')).toHaveText('Connecting Ridge CR02')

  await page.keyboard.press('Escape')
  await expect(allRegions(page)).toHaveCount(0)
  await expect(ridge(page)).toBeVisible()
})

// regression: down in Haworth the name "Connecting Ridge (NASA site 001)" floated in the bottom-right
// corner, by "All regions", with its Site far off the stage: the name was placed for any Site on the
// near side of the Moon, in the picture or not.
test('down in another Region the chosen Site is off the stage, and so is its name', async ({ page }) => {
  await openMap(page)
  await expect(page.locator('.globe__pin')).toBeVisible()
  await haworth(page).click()
  await expect(page.getByRole('button', { name: 'Haworth HW01' })).toBeVisible()
  await expect(page.locator('.globe__pin')).toBeHidden({ timeout: 5_000 })
  await allRegions(page).click()
  await expect(page.locator('.globe__pin')).toBeVisible()
})

test('"All regions" flies back out to the pole', async ({ page }) => {
  await openMap(page)
  await haworth(page).click()
  await expect(page.getByRole('button', { name: 'Haworth HW01' })).toBeVisible()
  await allRegions(page).click()
  await expect(haworth(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Haworth HW01' })).toHaveCount(0)
})

test('hover shows the hand, a larger marker and the name, with no number', async ({ page }) => {
  await openMap(page)
  const count = haworth(page).locator('.globe__count')
  expect(await haworth(page).evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer')
  await haworth(page).hover()
  await expect(haworth(page).locator('.globe__name')).toBeVisible()
  await expect(haworth(page).locator('.globe__name')).toHaveText('Haworth')
  await expect.poll(() => count.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(24)

  await haworth(page).click()
  const one = page.getByRole('button', { name: 'Haworth HW02' })
  await expect(one).toBeVisible()
  const name = one.locator('.globe__name')
  await expect(name).toBeHidden()
  await one.hover()
  await expect(name).toBeVisible()
  await expect(name).toHaveText('Haworth HW02')
  expect(await one.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer')
})

test('the keyboard reaches the Regions and the Sites, and the focus follows the flight', async ({ page }) => {
  await openMap(page)
  await haworth(page).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Haworth HW01' })).toBeFocused()
  // The focused Site shows its name, as a hover does.
  await expect(page.getByRole('button', { name: 'Haworth HW01' }).locator('.globe__name')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(haworth(page)).toBeFocused()
})

test('the point under the pointer is shown, and a double click asks about it', async ({ page }) => {
  await openMap(page)
  const box = (await page.locator('.globe canvas').boundingBox())!
  // Below the pole is 180° of longitude, where none of these Regions lies.
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2 + box.height * 0.2
  await page.mouse.move(x, y)
  const readout = page.locator('.globe__readout')
  await expect(readout).toBeVisible()
  await expect(readout).toHaveText(/^8\d\.\d\d° S, \d+\.\d\d° [EW] · double-click to ask about this point$/)
  const asked = page.waitForRequest((request) => request.url().includes('/visibility?') && request.url().includes('latitude_deg='))
  await page.mouse.dblclick(x, y)
  const url = new URL((await asked).url())
  const shown = (await readout.textContent())!.match(/^(\d+\.\d\d)° S/)![1]
  expect(Number(url.searchParams.get('latitude_deg'))).toBeCloseTo(-Number(shown), 1)
  await page.mouse.move(box.x + 2, box.y + box.height / 2)
  await page.mouse.move(box.x - 20, box.y - 20)
  await expect(readout).toBeHidden()
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a Region is reached by a short fade, not a flight', async ({ page }) => {
    await openMap(page)
    // The Moon itself fades in once it is dressed; wait for that before watching for the fade.
    const canvas = page.locator('.globe canvas')
    await expect.poll(() => canvas.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
    await page.evaluate(() => {
      const canvas = document.querySelector('.globe canvas')!
      const w = window as unknown as { lowest: number }
      w.lowest = 1
      const sample = () => {
        w.lowest = Math.min(w.lowest, Number(getComputedStyle(canvas).opacity))
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    await ridge(page).click()
    const other = page.getByRole('button', { name: 'Connecting Ridge CR02' })
    await expect(other).toBeVisible()
    await page.waitForTimeout(400)
    const settled = await other.boundingBox()
    await page.waitForTimeout(600)
    // The camera jumped once, in the middle of the fade: nothing moves after it.
    expect(await other.boundingBox()).toEqual(settled)
    expect(await page.evaluate(() => (window as unknown as { lowest: number }).lowest)).toBeLessThan(0.5)
    expect(await canvas.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  })
})

test.describe('on a phone, by touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a tap does what a click does', async ({ page }) => {
    await openMap(page)
    await haworth(page).tap()
    const one = page.getByRole('button', { name: 'Haworth HW02' })
    await expect(one).toBeVisible()
    const asked = page.waitForRequest((request) => request.url().includes('/visibility?') && request.url().includes('site_id=HW02'))
    await one.tap()
    await asked
    await allRegions(page).tap()
    await expect(haworth(page)).toBeVisible()
  })
})

// Validation check: with the default Query, the markers "9", "6" and "8"
// sat on the name "Connecting Ridge (NASA site 001)" at 1366×768, and four markers covered it on a
// 390 px phone. These serve the whole catalogue the backend serves, read from its data files.
function catalogue() {
  const read = (name: string) => {
    const [head, ...rows] = readFileSync(new URL(`../../backend/app/data/${name}`, import.meta.url), 'utf8').trim().split('\n')
    const columns = head!.split(',')
    return rows.map((row) => {
      const cells = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((cell) => cell.replace(/,$/, '').replace(/^"|"$/g, ''))
      return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? '']))
    })
  }
  const sites = read('sites.csv').map((row) =>
    site(row.id!, row.name!, row.region_id || null, Number(row.latitude_deg), Number(row.longitude_deg)),
  )
  const regions = read('regions.csv').map((row) => ({
    id: row.id!,
    name: row.name!,
    site_count: Number(row.site_count),
    artemis_iii_current: row.artemis_iii_current === 'True',
    source_reference: row.source_reference!,
  }))
  return { sites, regions }
}

async function serveCatalogue(page: Page) {
  const { sites, regions } = catalogue()
  await page.route('**/sites', (route: Route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(sites) }))
  await page.route('**/regions', (route: Route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(regions) }))
  await page.route('**/visibility?**', async (route: Route) => {
    const asked = new URL(route.request().url()).searchParams.get('site_id')
    const response = await route.fetch()
    const body = await response.json()
    const chosen = sites.find((entry) => entry.id === asked)
    if (chosen) body.query.site = chosen
    await route.fulfill({ response, json: body })
  })
}

type Rect = { name: string; x: number; y: number; width: number; height: number }

/** Every marker, the ring and the chosen Site's name, once the camera has stopped. */
async function mapBoxes(page: Page): Promise<{ pin: Rect; ring: Rect; markers: Rect[] }> {
  const pin = page.locator('.globe__pin')
  await expect(pin).toBeVisible({ timeout: 15_000 })
  let last = ''
  await expect
    .poll(async () => {
      const box = JSON.stringify(await pin.boundingBox())
      const still = box === last
      last = box
      return still
    }, { intervals: [500] })
    .toBe(true)
  return page.evaluate(() => {
    const rect = (element: Element, name: string) => {
      const box = element.getBoundingClientRect()
      return { name, x: box.x, y: box.y, width: box.width, height: box.height }
    }
    return {
      pin: rect(document.querySelector('.globe__pin')!, 'name'),
      ring: rect(document.querySelector('.globe__chosen')!, 'ring'),
      markers: [...document.querySelectorAll('.globe__region:not([hidden]) .globe__count')].map((count) =>
        rect(count, count.closest('button')!.getAttribute('aria-label')!),
      ),
    }
  })
}

const overlap = (a: Rect, b: Rect) => {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  // Half a pixel of rounding is not a marker sitting on a name.
  return width > 0.5 && height > 0.5
}

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['1366×768', { width: 1366, height: 768 }],
  ['a 390 px phone', { width: 390, height: 844 }],
] as const) {
  test.describe(`on ${label}`, () => {
    test.use({ viewport })

    for (const chosen of ['001', 'MMO05']) {
      test(`no Region marker covers the name or the ring of ${chosen}, or another marker`, async ({ page }) => {
        await serveCatalogue(page)
        await page.goto(chosen === '001' ? '/?view=map' : `/?view=map&site=${chosen}`)
        await expect(page.getByRole('button', { name: /^Connecting Ridge, \d+ Sites$/ })).toBeVisible({ timeout: 15_000 })
        const { pin, ring, markers } = await mapBoxes(page)
        expect(markers.length).toBe(16)
        const found: string[] = []
        for (const [index, marker] of markers.entries()) {
          if (overlap(marker, pin)) found.push(`${marker.name} covers the name`)
          if (overlap(marker, ring)) found.push(`${marker.name} covers the ring`)
          for (const other of markers.slice(index + 1)) if (overlap(marker, other)) found.push(`${marker.name} covers ${other.name}`)
        }
        expect(found).toEqual([])
        // The name is whole inside the stage.
        const stage = (await page.locator('.globe canvas').boundingBox())!
        expect(pin.x).toBeGreaterThanOrEqual(stage.x)
        expect(pin.x + pin.width).toBeLessThanOrEqual(stage.x + stage.width)
      })
    }
  })
}
