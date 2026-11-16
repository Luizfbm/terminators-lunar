import { expect, test, type Page, type Route } from '@playwright/test'

// The two switches of the globe menu: "Sites" shows the Artemis Sites (source wueller2026) and "Lunar Missions"
// the landings of missions that flew (every other curated source). The canvas says how many dots it draws in
// `data-dots`. The chosen Site is no dot: it has a ring of its own, which does not make a released layer look
// pressed. On the polar map (level 2) the same switches show only what lies south of the map's edge. The mock
// only has a couple of Sites, so these tests serve their own list.
//
// Regression (2026-11-15): Sites and Lunar Missions showed nothing to the eye (dots about 0.7 px across,
// grey on the grey Moon), the missions had no names, and the map ignored both switches.

test.use({ locale: 'en-US' })

const site = (id: string, name: string, source: string, region_id: string | null, latitude_deg: number, longitude_deg: number) => ({
  id,
  name,
  latitude_deg,
  longitude_deg,
  source,
  source_reference: 'a test',
  region_id,
  curated: true,
  has_5m_dem: false,
})

// 001 is the Site the mock answers for, so it is the chosen one when the page opens.
const SITES = [
  site('001', 'Connecting Ridge (NASA site 001)', 'wueller2026', 'CR', -89.4661, -136.949),
  site('CR02', 'Connecting Ridge CR02', 'wueller2026', 'CR', -89.43, -125.1),
  site('HW01', 'Haworth HW01', 'wueller2026', 'HW', -87.2, -20),
  site('APOLLO11', 'Apollo 11', 'apollo', null, 0.6741, 23.4733),
  site('SURVEYOR7', 'Surveyor 7', 'lroc2016', null, -40.98, -11.47),
  // A mission inside the polar cap, with no Region: on the map it is a Site button of its own.
  site('IM2', 'IM-2 Athena landing point', 'clps', null, -84.7906, 29.1957),
]
const REGIONS = [
  { id: 'CR', name: 'Connecting Ridge', site_count: 2, artemis_iii_current: false, source_reference: 'Wueller 2026' },
  { id: 'HW', name: 'Haworth', site_count: 1, artemis_iii_current: true, source_reference: 'Wueller 2026' },
]

async function open(page: Page, link = '/') {
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
  await page.goto(link)
  await expect(canvas(page)).toHaveAttribute('data-ready', 'true')
}

const canvas = (page: Page) => page.locator('.globe canvas')
const dots = (page: Page, count: number) => expect(canvas(page)).toHaveAttribute('data-dots', String(count))
const press = (page: Page, name: 'Sites' | 'Lunar Missions') => page.getByRole('button', { name, exact: true }).click()
const pressed = (page: Page, name: 'Sites' | 'Lunar Missions', yes: boolean) =>
  expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', String(yes))
const level = (page: Page, name: 'Explore the Moon' | 'South Pole in detail') => page.getByRole('button', { name, exact: true }).click()

test('opens with the three Artemis Sites drawn and the three missions not', { tag: '@smoke' }, async ({ page }) => {
  await open(page)
  await dots(page, 3)
  await pressed(page, 'Sites', true)
  await pressed(page, 'Lunar Missions', false)
  await expect(page.locator('.globe-mark:visible')).toHaveCount(0)
})

test('Lunar Missions shows the landings of missions, and releasing it hides them again', async ({ page }) => {
  await open(page)
  await dots(page, 3)
  await press(page, 'Lunar Missions')
  await dots(page, 6)
  await press(page, 'Lunar Missions')
  await dots(page, 3)
})

test('Sites hides the Artemis Sites, the chosen one too: it keeps only its ring and its name', async ({ page }) => {
  await open(page)
  await dots(page, 3)
  await press(page, 'Sites')
  // 001 is chosen: no dot of its own, its ring and its name stay.
  await dots(page, 0)
  await expect(page.locator('.globe__pin')).toHaveText('Connecting Ridge (NASA site 001)')
  await expect(page.locator('.globe__chosen')).toHaveCount(1)
  await press(page, 'Sites')
  await dots(page, 3)
})

test('the two switches are independent', async ({ page }) => {
  await open(page)
  await press(page, 'Lunar Missions')
  await press(page, 'Sites')
  // The three missions only.
  await dots(page, 3)
  await press(page, 'Sites')
  await dots(page, 6)
  await press(page, 'Lunar Missions')
  await press(page, 'Sites')
  // Neither: no dot at all.
  await dots(page, 0)
})

test('the chosen Site of a mission is no dot with Lunar Missions released', async ({ page }) => {
  await open(page, '/?site=APOLLO11')
  // The three Artemis Sites; Apollo 11 is chosen and has its ring, not a dot.
  await dots(page, 3)
  await press(page, 'Sites')
  await dots(page, 0)
  await expect(page.locator('.globe__pin')).toHaveText('Apollo 11')
  await expect(page.locator('.globe__chosen')).toHaveCount(1)
  await press(page, 'Lunar Missions')
  await dots(page, 3)
})

test.describe('the polar map (South Pole in detail)', () => {
  test('keeps the switches in its menu, in the state they had in orbit, and draws no dots of its own', async ({ page }) => {
    await open(page)
    await press(page, 'Lunar Missions')
    await dots(page, 6)
    await level(page, 'South Pole in detail')
    await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
    await pressed(page, 'Lunar Missions', true)
    await pressed(page, 'Sites', true)
    // The map has its Region markers and Site buttons instead of dots.
    await dots(page, 0)
    await level(page, 'Explore the Moon')
    await dots(page, 6)
    await pressed(page, 'Lunar Missions', true)
  })

  test('back on the whole Moon the whole set is back, as the switches say', async ({ page }) => {
    await open(page, '/?view=map')
    await press(page, 'Lunar Missions')
    await level(page, 'Explore the Moon')
    await dots(page, 6)
  })
})
