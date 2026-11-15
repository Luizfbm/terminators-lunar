import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './classic'
import type { Locator, Page, Request, Route } from '@playwright/test'

// Plan A x Plan B: the Query on screen against a second one, from the same /visibility. The Prism mock
// answers every request with the contract's example, so the two plans would always tie. Plan B is the
// request that starts on 2027-03-01: its answer is the mock's with the numbers moved, so the table, the
// marks and the sentence have something to say. Everything else is what the app asks for and the link.

const B_START = '2027-03-01'
const visibility = (request: Request) => new URL(request.url()).pathname === '/visibility'
const isB = (request: Request) => visibility(request) && new URL(request.url()).searchParams.get('start') === `${B_START}T00:00:00Z`

/** Plan B answers like the mock, with 12 h more Sun and Earth together and a 50 h longer night. */
async function movePlanB(page: Page, patch: (metrics: Record<string, number>) => void) {
  await page.route('**/visibility?**', async (route: Route) => {
    const response = await route.fetch()
    const body = await response.json()
    if (isB(route.request())) patch(body.metrics)
    await route.fulfill({ response, json: body })
  })
}

const moreEarthLongerNight = (metrics: Record<string, number>) => {
  metrics.sun_and_earth_hours += 12
  metrics.lcsp_hours += 50
}

const panel = (page: Page, name: string) => page.getByRole('region', { name })
// The comparison of the two plans. Eduardo's hazard comparison (HazardCompare) sits in the same
// panel with tables of its own, so the plans' table is the one outside it.
const plansTable = (region: Locator) => region.locator('table:not(.hazard-compare__table)')

test.describe('in English', () => {
  test.use({ locale: 'en-GB' })

  test('opens two plans, marks the better value in each row, and the link reopens both', async ({ page }) => {
    await movePlanB(page, moreEarthLongerNight)
    const first = page.waitForResponse((response) => visibility(response.request()))
    await page.goto('/')
    await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
    // Plan A as the answer echoes it: that is the Site Plan B inherits (the mock echoes CR01 whatever is asked).
    const echoed = (await (await first).json()).query as { site: { id: string }; duration_hours: number; observer_height_m: number }

    const compare = panel(page, 'Plan A × Plan B')
    await compare.getByRole('button', { name: 'Compare this plan with another one' }).click()
    // Plan B starts as Plan A: the same Query, so there is nothing to compare and nothing asked.
    await expect(compare.getByText(/Plan B asks the same Query as Plan A/)).toBeVisible()
    await expect(plansTable(compare)).toHaveCount(0)
    await expect(page).toHaveURL(/compare=1/)

    const asked = page.waitForRequest(isB)
    await compare.getByLabel('Plan B start day (UTC)').fill(B_START)
    const planB = new URL((await asked).url()).searchParams
    expect(planB.get('site_id')).toBe(echoed.site.id)
    expect(Number(planB.get('duration_hours'))).toBe(echoed.duration_hours)
    expect(Number(planB.get('observer_height_m'))).toBe(echoed.observer_height_m)

    // One sentence first: Plan B leads on the number that matters, Plan A has the shorter night.
    await expect(compare.getByText(/^Plan B has more Sun and Earth together, by 12\sh.*, but Plan A has a shorter longest night \(LCSP\)\.$/)).toBeVisible()

    const table = compare.getByRole('table', { name: 'Plan A and Plan B, number by number' })
    await expect(table.getByRole('columnheader', { name: /^Plan A/ })).toBeVisible()
    await expect(table.getByRole('columnheader', { name: /^Plan B/ })).toBeVisible()
    await expect(table.getByRole('row')).toHaveCount(7)
    const both = table.getByRole('row', { name: /Sun and Earth together/ })
    await expect(both.getByRole('cell').nth(1)).toContainText('better')
    await expect(both.getByRole('cell').nth(0)).not.toContainText('better')
    const night = table.getByRole('row', { name: /Longest night/ })
    await expect(night.getByRole('cell').nth(0)).toContainText('better')
    await expect(night.getByRole('cell').nth(1)).not.toContainText('better')
    // Numbers the two plans share are ties, and no one is named better there.
    const sun = table.getByRole('row', { name: /Sun visible/ })
    await expect(sun.getByRole('cell').nth(0)).toContainText('tie')
    await expect(sun.getByRole('cell').nth(0)).not.toContainText('better')
    await expect(sun.getByRole('cell').nth(1)).toContainText('tie')

    // Plan A's own parameters stay out of the link; Plan B's go in.
    await expect(page).toHaveURL(/compare=1/)
    await expect(page).toHaveURL(/bstart=2027-03-01/)
    expect(new URL(page.url()).searchParams.has('start')).toBe(false)

    // The copied link opens both plans again.
    const again = page.waitForRequest(isB)
    await page.reload()
    await again
    const reopened = panel(page, 'Plan A × Plan B')
    await expect(reopened.getByLabel('Plan B start day (UTC)')).toHaveValue(B_START)
    await expect(reopened.getByRole('table', { name: 'Plan A and Plan B, number by number' })).toBeVisible()
    await expect(reopened.getByText(/^Plan B has more Sun and Earth together/)).toBeVisible()
  })

  test('says the two plans cannot be separated when nothing differs, and names no winner', async ({ page }) => {
    await page.goto(`/?compare=1&bstart=${B_START}`)
    const compare = panel(page, 'Plan A × Plan B')
    await expect(compare.getByText(/^Plan A and Plan B cannot be separated/)).toBeVisible()
    await expect(compare.getByText('better', { exact: true })).toHaveCount(0)
    await expect(compare.getByText(/comes out ahead/)).toHaveCount(0)
  })

  test('names the plan that is ahead when the other is better in nothing', async ({ page }) => {
    await movePlanB(page, (metrics) => {
      metrics.sun_and_earth_hours += 12
    })
    await page.goto(`/?compare=1&bstart=${B_START}`)
    await expect(panel(page, 'Plan A × Plan B').getByText(/^Plan B comes out ahead: it is better on 1 of the 6 numbers and worse on none\./)).toBeVisible()
  })

  test('a failed Plan B says why and asks again on Try again', async ({ page }) => {
    let calls = 0
    await page.route('**/visibility?**', (route: Route) => {
      if (!isB(route.request())) return route.fallback()
      calls += 1
      return calls === 1 ? route.fulfill({ status: 503, json: { code: 'busy', title: 'Busy', status: 503, type: 'about:blank' } }) : route.fallback()
    })
    await page.goto(`/?compare=1&bstart=${B_START}`)
    const compare = panel(page, 'Plan A × Plan B')
    await expect(compare.getByRole('alert')).toBeVisible()
    await compare.getByRole('button', { name: 'Try again' }).click()
    await expect(plansTable(compare)).toBeVisible()
  })

  test('closing the comparison takes Plan B out of the link', async ({ page }) => {
    await page.goto(`/?compare=1&bstart=${B_START}`)
    const compare = panel(page, 'Plan A × Plan B')
    await compare.getByRole('button', { name: 'Compare this plan with another one' }).click()
    await expect(plansTable(compare)).toHaveCount(0)
    await expect(page).not.toHaveURL(/compare=|bstart=/)
  })

  test('the open comparison passes WCAG AA on a desktop and on a phone', async ({ page }) => {
    await movePlanB(page, moreEarthLongerNight)
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(`/?compare=1&bstart=${B_START}`)
      await expect(plansTable(panel(page, 'Plan A × Plan B'))).toBeVisible()
      const { violations } = await new AxeBuilder({ page }).include('.plan-compare').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(violations.map((rule) => `${rule.id}: ${rule.nodes.map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([])
    }
  })

  test('fits a phone: no sideways scroll with the table open', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/?compare=1&bstart=${B_START}`)
    const table = plansTable(panel(page, 'Plan A × Plan B'))
    await expect(table).toBeVisible()
    await table.scrollIntoViewIfNeeded()
    const box = await table.boundingBox()
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
})

test.describe('em português', () => {
  test.use({ locale: 'pt-BR' })

  test('o painel, a tabela e a frase vêm em português, e o link reabre os dois planos', async ({ page }) => {
    await movePlanB(page, moreEarthLongerNight)
    await page.goto(`/?compare=1&bstart=${B_START}`)
    const compare = panel(page, 'Plano A × Plano B')
    await expect(compare.getByRole('heading', { name: 'Plano A × Plano B' })).toBeVisible()
    await expect(compare.getByLabel('Dia de início do Plano B (UTC)')).toHaveValue(B_START)
    await expect(compare.getByText(/^O Plano B tem mais Sol e Terra juntos, por 12\sh.*, mas o Plano A tem a maior noite \(LCSP\) mais curta\.$/)).toBeVisible()
    const table = compare.getByRole('table', { name: 'Plano A e Plano B, número por número' })
    await expect(table.getByRole('row', { name: /Maior noite/ }).getByRole('cell').nth(0)).toContainText('melhor')
  })

  test('sem diferença, diz que não dá para separar', async ({ page }) => {
    await page.goto(`/?compare=1&bstart=${B_START}`)
    await expect(panel(page, 'Plano A × Plano B').getByText(/^O Plano A e o Plano B não dá para separar/)).toBeVisible()
  })
})
