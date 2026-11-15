import { expect, test } from './classic'
import type { Page, Route } from '@playwright/test'

// the requirement: a custom Site is a latitude and a longitude typed at the foot of the Site list. The mock
// always answers for one Curated Site; these tests put the asked coordinate into the answer, the way
// the API does (every custom Site comes back as id "custom", named "Custom Site").

interface Asked {
  site_id: string | null
  latitude_deg: string | null
  longitude_deg: string | null
}

async function serve(page: Page, options: { holdCustom?: Promise<void>; outside?: boolean } = {}): Promise<Asked[]> {
  const asked: Asked[] = []
  await page.route('**/visibility?**', async (route: Route) => {
    const params = new URL(route.request().url()).searchParams
    const entry = {
      site_id: params.get('site_id'),
      latitude_deg: params.get('latitude_deg'),
      longitude_deg: params.get('longitude_deg'),
    }
    asked.push(entry)
    if (entry.latitude_deg === null) return route.fallback()
    if (options.outside) {
      return route.fulfill({
        status: 422,
        contentType: 'application/problem+json',
        json: { type: 'about:blank', title: 'Outside coverage', status: 422, code: 'outside_coverage' },
      })
    }
    await options.holdCustom
    // Prism checks the request against the contract; ask it for the Curated answer and swap the Site.
    const url = new URL(route.request().url())
    url.searchParams.delete('latitude_deg')
    url.searchParams.delete('longitude_deg')
    url.searchParams.set('site_id', '001')
    const response = await route.fetch({ url: url.toString() })
    const body = await response.json()
    body.query.site = {
      id: 'custom',
      name: 'Custom Site',
      latitude_deg: Number(entry.latitude_deg),
      longitude_deg: Number(entry.longitude_deg),
      source: 'custom',
      source_reference: 'User-provided coordinate',
      region_id: null,
      curated: false,
      has_5m_dem: false,
    }
    await route.fulfill({ response, json: body })
  })
  return asked
}

const trigger = (page: Page) => page.getByRole('button', { name: /^(Site|Local): / })
const form = (page: Page) => page.getByRole('form', { name: /south of 80/ })

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('a typed coordinate is asked, named on screen and carried by the link', async ({ page }) => {
    const asked = await serve(page)
    await page.goto('/')
    await expect(trigger(page)).toHaveAccessibleName(/^Site: Connecting Ridge/)

    // From the keyboard: the search, then Tab on to the coordinate fields; the list stays open.
    // The list's scroller is a Tab stop between them (the requirement: a keyboard can scroll the list
    // and reach its citation), so it takes two.
    await trigger(page).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('combobox', { name: 'Find a Site by name or code' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('.site-list__scroll')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(form(page).getByRole('textbox', { name: 'Latitude' })).toBeFocused()
    await page.keyboard.type('89.5 S')
    await page.keyboard.press('Tab')
    await page.keyboard.type('10.25')
    await page.keyboard.press('Enter')

    await expect(trigger(page)).toHaveAccessibleName('Site: Your Site at 89.5° S, 10.25° E')
    await expect(trigger(page)).toBeFocused()
    // This spec opens the classic layout, so the link also carries layout=classic.
    await expect(page).toHaveURL(/\?lat=-89\.5&lon=10\.25&layout=classic$/)
    expect(asked.at(-1)).toEqual({ site_id: null, latitude_deg: '-89.5', longitude_deg: '10.25' })

    // Open again: the fields hold the point, and the list no longer marks a Curated Site as chosen.
    await trigger(page).click()
    await expect(form(page).getByRole('textbox', { name: 'Latitude' })).toHaveValue('-89.5')
    await expect(form(page).getByRole('textbox', { name: 'Longitude' })).toHaveValue('10.25')
    await expect(page.getByRole('option', { selected: true })).toHaveCount(0)
    await expect(page.getByText('A coordinate you typed')).toBeVisible()

    // A Curated Site from the list goes back to `site` in the link.
    await page.getByRole('option').first().click()
    await expect(page).toHaveURL(/\?site=/)
    expect(asked.at(-1)?.latitude_deg).toBe(null)
  })

  test('a copied link reopens the same custom Site', async ({ page }) => {
    const asked = await serve(page)
    await page.goto('/?lat=-88.125&lon=-120.5')
    await expect(trigger(page)).toHaveAccessibleName('Site: Your Site at 88.13° S, 120.5° W')
    expect(asked[0]).toEqual({ site_id: null, latitude_deg: '-88.125', longitude_deg: '-120.5' })
  })

  test('a point north of 80° S is refused in the list, before anything is asked', async ({ page }) => {
    const asked = await serve(page)
    await page.goto('/')
    await trigger(page).click()
    await form(page).getByRole('textbox', { name: 'Latitude' }).fill('-75')
    await form(page).getByRole('textbox', { name: 'Longitude' }).fill('10')
    await form(page).getByRole('button', { name: 'Check' }).click()
    await expect(form(page).getByRole('alert')).toHaveText(/The latitude must be south of 80°\u00a0S/)
    await expect(form(page).getByRole('textbox', { name: 'Latitude' })).toHaveAttribute('aria-invalid', 'true')
    await expect(form(page).getByRole('textbox', { name: 'Longitude' })).toHaveAttribute('aria-invalid', 'false')

    await form(page).getByRole('textbox', { name: 'Latitude' }).fill('south')
    await form(page).getByRole('button', { name: 'Check' }).click()
    await expect(form(page).getByRole('alert')).toHaveText(/The latitude must be in degrees/)
    expect(asked.every((entry) => entry.latitude_deg === null)).toBe(true)
  })

  test('the Resolution ladder asks for the same coordinate, never for a Site code', async ({ page }) => {
    await serve(page)
    const ladder: URLSearchParams[] = []
    await page.route('**/visibility/ladder?**', (route: Route) => {
      ladder.push(new URL(route.request().url()).searchParams)
      return route.fallback()
    })
    // The ladder is inside "Stats for nerds" (the requirement).
    await page.goto('/?lat=-89.5&lon=10&stats=1')
    await expect(trigger(page)).toHaveAccessibleName('Site: Your Site at 89.5° S, 10° E')
    await page.getByRole('button', { name: 'How much does the map’s detail change this answer?' }).click()
    await expect.poll(() => ladder.length).toBe(1)
    expect(ladder[0].get('site_id')).toBe(null)
    expect(ladder[0].get('latitude_deg')).toBe('-89.5')
    expect(ladder[0].get('longitude_deg')).toBe('10')
  })

  test('says the horizon is being computed while a custom Site loads', async ({ page }) => {
    let release!: () => void
    const holdCustom = new Promise<void>((resolve) => {
      release = resolve
    })
    await serve(page, { holdCustom })
    await page.goto('/?lat=-89.5&lon=10')
    await expect(page.getByRole('status').filter({ hasText: 'Computing the horizon at this point' })).toBeVisible()
    release()
    await expect(trigger(page)).toHaveAccessibleName('Site: Your Site at 89.5° S, 10° E')
  })
})

test.describe('em português', () => {
  test.use({ locale: 'pt-BR' })

  test('um link com um ponto ao norte de 80° S explica e oferece a volta', async ({ page }) => {
    await serve(page, { outside: true })
    await page.goto('/?lat=-70&lon=10')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Esse ponto fica ao norte de 80° S')
    await alert.getByRole('button', { name: 'Voltar ao Local padrão' }).click()
    await expect(trigger(page)).toHaveAccessibleName(/^Local: Connecting Ridge/)
    await expect(page).not.toHaveURL(/lat=/)
  })
})

test.describe('on a phone', () => {
  test.use({ locale: 'en-GB', viewport: { width: 390, height: 844 } })

  test('the coordinate fields fit on the screen', async ({ page }) => {
    // the requirement: the list is now a full-screen sheet over the time strip, so the fields only need the screen.
    await serve(page)
    await page.goto('/')
    await trigger(page).click()
    const ask = await form(page).getByRole('button', { name: 'Check' }).boundingBox()
    expect(ask).not.toBeNull()
    expect(ask!.x + ask!.width).toBeLessThanOrEqual(390)
    expect(ask!.y + ask!.height).toBeLessThanOrEqual(844)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})
