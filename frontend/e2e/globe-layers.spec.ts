import { expect, test, type Page, type Route } from '@playwright/test'

// The two switches of the globe menu: "Sites" shows the Artemis Sites (source wueller2026) and "Lunar Missions"
// the landings of missions that flew (every other curated source). The canvas says how many dots it draws in
// `data-dots`. The Site that is chosen is always drawn, with either switch released. The mock only has a couple of
// Sites, so these tests serve their own list.

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

test('opens with the three Artemis Sites drawn and the two missions not', async ({ page }) => {
  await open(page)
  await dots(page, 3)
  await expect(page.getByRole('button', { name: 'Sites', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Lunar Missions', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('Lunar Missions shows the two landings of missions, and releasing it hides them again', async ({ page }) => {
  await open(page)
  await dots(page, 3)
  await press(page, 'Lunar Missions')
  await dots(page, 5)
  await press(page, 'Lunar Missions')
  await dots(page, 3)
})

test('Sites hides the Artemis Sites but not the chosen one, and pressing it shows them again', async ({ page }) => {
  await open(page)
  await dots(page, 3)
  await press(page, 'Sites')
  // 001 is chosen: its dot stays, with its ring and its name.
  await dots(page, 1)
  await expect(page.locator('.globe__pin')).toHaveText('Connecting Ridge (NASA site 001)')
  await press(page, 'Sites')
  await dots(page, 3)
})

test('the two switches are independent', async ({ page }) => {
  await open(page)
  await press(page, 'Lunar Missions')
  await press(page, 'Sites')
  // Both missions and the chosen Site.
  await dots(page, 3)
  await press(page, 'Sites')
  await dots(page, 5)
  await press(page, 'Lunar Missions')
  await press(page, 'Sites')
  // Neither: only the chosen Site is left.
  await dots(page, 1)
})

test('the chosen Site of a mission is drawn with Lunar Missions released', async ({ page }) => {
  await open(page, '/?site=APOLLO11')
  // The three Artemis Sites and Apollo 11, which is chosen.
  await dots(page, 4)
  await press(page, 'Sites')
  await dots(page, 1)
  await expect(page.locator('.globe__pin')).toHaveText('Apollo 11')
  await expect(page.locator('.globe__chosen')).toHaveCount(1)
  await press(page, 'Lunar Missions')
  await dots(page, 2)
})

test('the switches keep their state across the map and back, and the map draws no dots of its own', async ({ page }) => {
  await open(page)
  await press(page, 'Lunar Missions')
  await dots(page, 5)
  await page.getByRole('button', { name: 'South Pole in detail', exact: true }).click()
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
  // The map has its Region markers instead of dots.
  await dots(page, 0)
  await page.getByRole('button', { name: 'Explore the Moon', exact: true }).click()
  await dots(page, 5)
  await expect(page.getByRole('button', { name: 'Lunar Missions', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
