import { readFileSync } from 'node:fs'
import { expect, test } from './classic'
import type { Page, Route } from '@playwright/test'

const scatterExample = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-scatter-001.example.json', import.meta.url), 'utf8'))

// The knife-edge warning: a short sentence under the answer when a small miss flips it. The mock
// answers /visibility/scatter with the contract's example, where 250 m to the south the Sun is
// up for 250 h of the 709 h Window the Site has whole. A stable Site is the same example with the
// Site's numbers at every point.

const json = (value: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })

const warning = (page: Page) => page.locator('.knife-edge')

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** The example with every point given the Site's own metrics, so a miss changes nothing. */
function stable() {
  const value = scatterExample.value
  const site = value.points[0].metrics
  const points = value.points.map((point: object) => ({ ...point, metrics: site }))
  const band = Object.fromEntries(
    Object.entries(site as Record<string, number>).map(([key, metric]) => [key, { min: metric, max: metric, min_point: 0, max_point: 0 }]),
  )
  return { ...value, points, band }
}

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('warns that the Site is sensitive and takes the reader to the miss panel', async ({ page }) => {
    await open(page)
    await expect(warning(page)).toContainText(/This Site is sensitive: 250\sm to the south, the Sun is hidden for 19\sd \d+\sh more than at the Site\./)
    await expect(page.getByRole('region', { name: 'If the lander misses' })).toBeVisible()

    await warning(page).getByRole('button', { name: 'See what happens if the lander misses' }).click()
    await expect(page.getByRole('region', { name: 'If the lander misses' })).toBeFocused()
    await expect(page.getByRole('heading', { name: 'If the lander misses' })).toBeInViewport()
  })

  test('shows nothing while the scatter is still being computed', async ({ page }) => {
    await page.route('**/visibility/scatter**', () => new Promise<void>(() => undefined))
    await open(page)
    await expect(page.getByRole('status').filter({ hasText: 'A new answer takes about a minute' })).toBeVisible()
    await expect(warning(page)).toHaveCount(0)
  })

  test('says nothing for a Site where a miss changes nothing', async ({ page }) => {
    await page.route('**/visibility/scatter**', (route: Route) => route.fulfill(json(stable())))
    await open(page)
    await expect(page.getByText(/Missing by 250\sm changes nothing here/)).toBeVisible()
    await expect(warning(page)).toHaveCount(0)
  })
})

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('warns in Portuguese, and not for a stable Site', async ({ page }) => {
    await open(page)
    await expect(warning(page)).toContainText(/Este Local é sensível: a 250\sm a sul, o Sol some por 19\sd \d+\sh a mais que no Local\./)
    await expect(warning(page).getByRole('button', { name: 'Ver o que acontece se o módulo errar' })).toBeVisible()

    await page.route('**/visibility/scatter**', (route: Route) => route.fulfill(json(stable())))
    await page.reload()
    await expect(page.getByText(/Errar por 250\sm não muda nada aqui/)).toBeVisible()
    await expect(warning(page)).toHaveCount(0)
  })
})
