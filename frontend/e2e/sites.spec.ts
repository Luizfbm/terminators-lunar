import { expect, test, type Page, type Route } from '@playwright/test'

// the requirement: the Site picker is a searchable list grouped by Region. The mock only has a couple
// of Sites, so these tests serve their own list, and answer /visibility for whichever Site was asked.

const site = (id: string, name: string, region_id: string | null, latitude_deg: number, longitude_deg: number, source_reference = 'Wueller et al. 2026, JGR Planets') => ({
  id,
  name,
  latitude_deg,
  longitude_deg,
  source: 'wueller2026',
  source_reference,
  region_id,
  curated: true,
  has_5m_dem: false,
})

const SITES = [
  site('CR01', 'Connecting Ridge CR01', 'CR', -89.45, -137.3),
  site('CR02', 'Connecting Ridge CR02', 'CR', -89.43, -135.1),
  site('HW01', 'Haworth HW01', 'HW', -87.2, -5),
  site('APOLLO11', 'Apollo 11', null, 0.6741, 23.4733, 'NASA NSSDCA, Apollo 11 landing site'),
  site('CH3', 'Chandrayaan-3 (Shiv Shakti)', null, -69.3734, 32.3198, 'ISRO 2023'),
]
const REGIONS = [
  { id: 'CR', name: 'Connecting Ridge', site_count: 2, artemis_iii_current: true, source_reference: 'Wueller 2026' },
  { id: 'HW', name: 'Haworth', site_count: 1, artemis_iii_current: false, source_reference: 'Wueller 2026' },
]

async function serve(page: Page, options: { holdSites?: Promise<void> } = {}) {
  await page.route('**/sites', async (route: Route) => {
    await options.holdSites
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(SITES) })
  })
  await page.route('**/regions', (route: Route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(REGIONS) }))
  // The mock always answers for CR01; put the Site that was asked into the answer.
  await page.route('**/visibility?**', async (route: Route) => {
    const asked = new URL(route.request().url()).searchParams.get('site_id')
    const response = await route.fetch()
    const body = await response.json()
    const chosen = SITES.find((entry) => entry.id === asked)
    if (chosen) body.query.site = chosen
    await route.fulfill({ response, json: body })
  })
}

const trigger = (page: Page) => page.getByRole('button', { name: /^Site: / })
const search = (page: Page) => page.getByRole('combobox', { name: 'Find a Site by name or code' })
const list = (page: Page) => page.getByRole('listbox', { name: 'Sites' })

test.use({ locale: 'en-GB' })

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme('groups the Sites by Region, marks NASA’s nine, and keeps off-pole landers apart', async ({ page }) => {
  await serve(page)
  await page.goto('/')
  await trigger(page).click()

  const groups = list(page).getByRole('group')
  await expect(groups).toHaveCount(3)
  await expect(groups.nth(0)).toHaveAccessibleName('Connecting Ridge, in NASA’s list of nine Artemis III regions (October 2024)')
  await expect(groups.nth(1)).toHaveAccessibleName('Haworth')
  await expect(groups.nth(2)).toHaveAccessibleName('Away from the pole: landers we check the app against')
  await expect(groups.nth(2).getByRole('option')).toHaveText([/^Apollo 11/, /^Chandrayaan-3/])
  await expect(list(page).getByRole('option', { name: /Haworth HW01/ })).toContainText('87.2° S, 5° W')
  await expect(page.getByText('Coordinate from Wueller et al. 2026, JGR Planets')).toBeVisible()
})

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme('search filters by name or code, and says so when nothing matches', async ({ page }) => {
  await serve(page)
  await page.goto('/')
  await trigger(page).click()

  await search(page).fill('hw01')
  await expect(list(page).getByRole('option')).toHaveText([/^Haworth HW01/])

  await search(page).fill('zzz')
  await expect(list(page).getByRole('option')).toHaveCount(0)
  await expect(page.getByText('No Site has that name or code.', { exact: false })).toBeVisible()
})

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme('works from the keyboard: arrow opens, arrows move, Enter picks, Escape closes', async ({ page }) => {
  await serve(page)
  await page.goto('/')
  await expect(trigger(page)).toHaveAccessibleName('Site: Connecting Ridge CR01')

  await trigger(page).focus()
  await page.keyboard.press('ArrowDown')
  await expect(search(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(list(page)).toHaveCount(0)
  await expect(trigger(page)).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(search(page)).toBeFocused()
  // CR01 is chosen and active; two steps down is Haworth HW01.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(search(page)).toHaveAttribute('aria-activedescendant', /HW01$/)
  await page.keyboard.press('Enter')

  await expect(list(page)).toHaveCount(0)
  await expect(trigger(page)).toBeFocused()
  await expect(trigger(page)).toHaveAccessibleName('Site: Haworth HW01')
  await expect(page).toHaveURL(/site=HW01/)
})

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme('a click outside closes the list', async ({ page }) => {
  await serve(page)
  await page.goto('/')
  await trigger(page).click()
  await expect(list(page)).toBeVisible()
  await page.getByRole('heading', { level: 1 }).click()
  await expect(list(page)).toHaveCount(0)
})

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme('shows the chosen Site while the list of Sites is still on its way', async ({ page }) => {
  let release!: () => void
  const holdSites = new Promise<void>((resolve) => {
    release = resolve
  })
  await serve(page, { holdSites })
  await page.goto('/')
  await trigger(page).click()
  await expect(list(page).getByRole('option')).toHaveText([/^Connecting Ridge CR01/])
  await expect(page.getByText('Loading the other Sites…')).toBeVisible()
  release()
  await expect(list(page).getByRole('option')).toHaveCount(SITES.length)
})

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme('follows a Site chosen elsewhere, as the globe and the link do', async ({ page }) => {
  // The globe calls the same setter as the link; a click on the 3D canvas has no stable target.
  await serve(page)
  await page.goto('/?site=CH3')
  await expect(trigger(page)).toHaveAccessibleName('Site: Chandrayaan-3 (Shiv Shakti)')
  await trigger(page).click()
  await expect(list(page).getByRole('option', { selected: true })).toHaveText(/^Chandrayaan-3/)
  await expect(page.getByText('Coordinate from ISRO 2023')).toBeVisible()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
  test.fixme('the open list covers the whole screen, with no sideways scroll', async ({ page }) => {
    // the requirement: it used to be a box above the time strip, with the page showing around it.
    await serve(page)
    await page.goto('/')
    await trigger(page).click()
    const box = await page.locator('.site-list').boundingBox()
    expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 })
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(390)
  })
})

test.describe('the polar map', () => {
  test('is a view of its own, in the link, with every Site on it', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/view=map/)
    await expect(page.locator('.stage__caption')).toContainText('80°')
    // The grid names its four meridians once the camera has settled over the pole.
    await expect(page.locator('.globe__grid span').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.globe__grid span')).toHaveText(['0°', '90° E', '180°', '90° W', '85° S', '80° S'])
  })

  test('a copied link reopens the map, in Portuguese too', async ({ page }) => {
    await page.goto('/?view=map&lang=pt')
    await expect(page.getByRole('button', { name: 'Mapa', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.globe__grid span').nth(1)).toHaveText('90° L')
  })

  test('a double click on the pole asks about that point', async ({ page }) => {
    await page.goto('/?view=map')
    await expect(page.locator('.globe__grid span').first()).toBeVisible({ timeout: 10_000 })
    const box = (await page.locator('.globe canvas').boundingBox())!
    const asked = page.waitForRequest((request) => request.url().includes('/visibility?') && request.url().includes('latitude_deg='))
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    const url = new URL((await asked).url())
    // The middle of the map is the pole: the point asked about lies within a degree of it.
    expect(Number(url.searchParams.get('latitude_deg'))).toBeLessThan(-89)
    expect(url.searchParams.get('site_id')).toBeNull()
    await expect(page).toHaveURL(/lat=-89/)
  })
})
