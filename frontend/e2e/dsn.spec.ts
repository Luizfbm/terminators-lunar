import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Read at run time, not imported: the web image has only frontend/ and its build type-checks
// this file (the requirement).
const example = JSON.parse(
  readFileSync(new URL('../../contract/examples/visibility-dsn-001.example.json', import.meta.url), 'utf8'),
)

// The DSN link (the requirement). The Prism mock answers /visibility/dsn with the contract's example:
// Site 001, where the link hours equal the Earth-visible hours, as on the server for the default
// Query. The gap, the empty Window and the error come from intercepting the route.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const base = example.value

// Over the mock's Window (20/11 12:00 to 30/11 12:00 UTC): a day of Earth up with no dish in view.
const GAP = {
  ...base,
  link_periods: [
    { start: '2026-11-20T12:00:00Z', end: '2026-11-24T00:00:00Z', duration_hours: 84 },
    { start: '2026-11-25T00:00:00Z', end: '2026-11-30T03:45:00Z', duration_hours: 123.75 },
  ],
  earth_visible_hours: 231.75,
  link_hours: 207.75,
  earth_without_station_hours: 24,
}

async function openPanel(page: Page, path = '/?stats=1', name = 'Can a dish on Earth hear this Site?') {
  await page.goto(path)
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
  const open = page.getByRole('button', { name })
  await expect(open).toHaveAttribute('aria-expanded', 'false')
  await open.click()
  await expect(open).toHaveAttribute('aria-expanded', 'true')
  return open
}

async function violations(page: Page) {
  const { violations: found } = await new AxeBuilder({ page }).withTags(WCAG).analyze()
  return found.map((rule) => `${rule.id}: ${rule.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

test.describe('DSN link, English', () => {
  test.use({ locale: 'en-GB' })

  test('asks nothing until opened; when the link equals Earth visible, one line says so', async ({ page }) => {
    let asked = 0
    page.on('request', (request) => {
      if (request.url().includes('/visibility/dsn')) asked += 1
    })
    await page.goto('/?stats=1')
    await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
    expect(asked).toBe(0)
    await page.getByRole('button', { name: 'Can a dish on Earth hear this Site?' }).click()

    await expect(page.getByText(/^The DSN link is the same as Earth visible here/)).toBeVisible()
    const totals = page.getByRole('table', { name: 'Earth visible and the DSN link in this Window' })
    await expect(totals.getByRole('row', { name: /Earth visible, no dish/ })).toContainText(/0\smin/)
    // The stations stay folded, and the timeline gets no row.
    const dishes = page.getByRole('button', { name: 'When each dish sees the Moon' })
    await expect(dishes).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('Goldstone · DSS-14')).toHaveCount(0)
    await expect(page.locator('.dsn-row')).toHaveCount(0)
    await expect(page.getByText(/^This is geometry only\./)).toBeVisible()
    await expect(page.getByText(/does not know the antennas’ schedule, the link budget/)).toBeVisible()
    expect(asked).toBe(1)

    await dishes.click()
    await expect(page.getByText('Goldstone · DSS-14')).toBeVisible()
    await expect(page.getByText('Canberra · DSS-43')).toBeVisible()
    await expect(page.getByText('Madrid · DSS-63')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('with a gap: a row on the timeline with its notches, and every dish in view', async ({ page }) => {
    await page.route('**/visibility/dsn**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GAP) }))
    await openPanel(page)

    await expect(page.getByText(/For the other 1\sd 0\sh, the Earth is up but none of the three dishes can see the Moon\./)).toBeVisible()
    await expect(page.getByText(/^On the timeline, the DSN row/)).toBeVisible()
    const row = page.locator('.strip__track .dsn-row')
    await expect(row).toHaveCount(1)
    await expect(row.locator('.dsn-row__link')).toHaveCount(2)
    await expect(row.locator('.dsn-row__gap').first()).toBeVisible()
    await expect(page.getByText('Goldstone · DSS-14')).toBeVisible()

    // A dish's passes, on request.
    await page.getByRole('button', { name: 'Every pass' }).first().click()
    await expect(page.getByRole('table', { name: 'Passes of Goldstone · DSS-14' }).getByRole('row')).toHaveCount(4)
    expect(await violations(page)).toEqual([])

    // The row goes with the panel.
    await page.getByRole('button', { name: 'Can a dish on Earth hear this Site?' }).click()
    await expect(row).toHaveCount(0)
  })

  test('the Earth never up: says no dish can hear the Site', async ({ page }) => {
    const none = { ...base, link_periods: [], earth_visible_hours: 0, link_hours: 0, earth_without_station_hours: 0 }
    await page.route('**/visibility/dsn**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(none) }))
    await openPanel(page)
    await expect(page.getByText(/^The Earth stays below the horizon for the whole Window/)).toBeVisible()
    await expect(page.getByText(/^This is geometry only\./)).toBeVisible()
  })

  test('says it is computing, then the error, and tries again', async ({ page }) => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/visibility/dsn**', async (route) => {
      calls += 1
      if (calls === 1) {
        await gate
        await route.fulfill({
          status: 503,
          contentType: 'application/problem+json',
          headers: { 'Retry-After': '5' },
          body: JSON.stringify({ type: 'https://lunar-api.luizfbm.win/problems/busy', title: 'Busy', status: 503, code: 'busy' }),
        })
      } else await route.continue()
    })
    await openPanel(page)
    await expect(page.getByRole('status').filter({ hasText: 'Working out when the dishes on Earth can see the Moon…' })).toBeVisible()
    release()
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText(/^The DSN link is the same as Earth visible here/)).toBeVisible()
    expect(calls).toBe(2)
  })
})

test.describe('DSN link, Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('the same answer in Portuguese, with the gap', async ({ page }) => {
    await page.route('**/visibility/dsn**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GAP) }))
    await openPanel(page, '/?stats=1', 'Alguma antena na Terra escuta este Local?')
    await expect(page.getByText(/^A Terra fica visível por/)).toBeVisible()
    await expect(page.getByRole('table', { name: 'Terra visível e link DSN nesta Janela' })).toBeVisible()
    await expect(page.getByText('Madri · DSS-63')).toBeVisible()
    await expect(page.getByText(/^Isto é só geometria\./)).toBeVisible()
    await expect(page.locator('.strip__track .dsn-row')).toHaveCount(1)
    expect(await violations(page)).toEqual([])
  })
})

test.describe('DSN link on a phone', () => {
  test.use({ locale: 'en-GB', viewport: { width: 390, height: 844 } })

  test('fits 390 px and keeps the row on the timeline', async ({ page }) => {
    await page.route('**/visibility/dsn**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GAP) }))
    await openPanel(page)
    await expect(page.locator('.strip__track .dsn-row')).toHaveCount(1)
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
    expect(await violations(page)).toEqual([])
  })
})
