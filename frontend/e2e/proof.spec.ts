import { expect, test, type Page } from '@playwright/test'
import { ERROR_SOURCES, NOT_CHECKED } from '../src/domain/proofCaveats'

test.use({ locale: 'en-GB' })

const text = (en: string, pt: string) => ({ en, pt })
const check = (id: string, status: 'passed' | 'failed' | 'pending', title: string) => ({
  id,
  title: text(title, `${title} (pt)`),
  reference: `Reference for ${title}`,
  tolerance: text('0.02°', '0,02°'),
  result: text(`Result of ${title}`, `Resultado de ${title}`),
  status,
  not_covered: text(`What ${title} misses`, `O que ${title} não cobre`),
  script_path: `validation/${id}.py`,
  run_at: '2026-11-15T13:02:11Z',
})

const LIST = [
  check('horizons-sun', 'passed', 'Sun against Horizons'),
  check('wueller', 'failed', 'Sun days against Wueller'),
  check('chandrayaan', 'pending', 'Chandrayaan-3 landing'),
  check('horizons-earth', 'passed', 'Earth against Horizons'),
]

const serve = (page: Page, body: unknown) =>
  page.route('**/validations', (route) => route.fulfill({ json: body }))

test.describe('the Proof page', () => {
  test('opens from the answer, says the score first, puts failures first, and goes back', async ({ page }) => {
    await serve(page, LIST)
    await page.goto('/')
    await page.getByRole('link', { name: 'How we know these numbers' }).click()

    await expect(page).toHaveURL(/page=proof/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How we know these numbers')
    await expect(page.getByText('Of 4 checks: passing 2, failing 1, pending 1.')).toBeVisible()
    await expect(page.getByText('Failing checks come first, then pending ones, then the ones that pass.')).toBeVisible()

    const names = page.locator('.proof__name')
    await expect(names).toHaveText([
      'Sun days against Wueller · Fails',
      'Chandrayaan-3 landing · Pending',
      'Sun against Horizons · Passes',
      'Earth against Horizons · Passes',
    ])
    const first = page.locator('.proof__check').first()
    await expect(first.getByText('Reference for Sun days against Wueller')).toBeVisible()
    await expect(first.getByText('What Sun days against Wueller misses')).toBeVisible()
    await expect(first.getByText('validation/wueller.py')).toBeVisible()
    await expect(first.getByRole('link')).toHaveCount(0)

    await page.getByRole('link', { name: /Back to the answer/ }).click()
    await expect(page).not.toHaveURL(/page=proof/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Sun sets in 4 h 21 min.')
  })

  test('opens straight from the link, in Portuguese when the link says so', async ({ page }) => {
    await serve(page, LIST)
    await page.goto('/?page=proof&lang=pt')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Como sabemos estes números')
    await expect(page.getByText('De 4 checagens: passam 2, falham 1, pendentes 1.')).toBeVisible()
    await expect(page.locator('.proof__name').first()).toHaveText('Sun days against Wueller (pt) · Falha')
  })

  test('opens with where a number can be wrong, each row with its source', async ({ page }) => {
    await serve(page, LIST)
    await page.goto('/?page=proof')

    const errors = page.getByTestId('proof-errors')
    await expect(errors.getByRole('heading', { level: 2 })).toHaveText('Where a number can be wrong')
    await expect(errors.getByRole('columnheader')).toHaveText([
      'Source of error',
      'Size',
      'Effect on the answer',
      'Where the size comes from',
    ])
    const rows = errors.locator('tbody tr')
    await expect(rows).toHaveCount(ERROR_SOURCES.length)
    // every row names where its size comes from
    for (const row of await rows.all()) await expect(row.locator('td').last().locator('li')).not.toHaveCount(0)

    const dem = rows.filter({ hasText: 'Resolution of the terrain map' })
    await expect(dem).toContainText('20 m out to 5 km')
    await expect(dem).toContainText('240 m out to 300 km')
    await expect(dem).toContainText('backend/app/horizon.py')
    await expect(dem).toContainText('ADR 0003')
    await expect(rows.filter({ hasText: 'Horizon reach' })).toContainText('300 km')
    await expect(rows.filter({ hasText: 'The Earth by its centre' })).toContainText('pgda-earth-visibility')
    await expect(rows.filter({ hasText: 'Relief smaller than the finest cell' })).toContainText('landing-im2-athena')

    // it comes before the list of checks
    const above = await errors.boundingBox()
    const checks = await page.locator('.proof__list').boundingBox()
    expect(above && checks && above.y < checks.y).toBe(true)
  })

  test('says what has not been checked yet, for the whole page, each item with its source', async ({ page }) => {
    await serve(page, LIST)
    await page.goto('/?page=proof')

    const todo = page.getByTestId('proof-not-checked')
    await expect(todo.getByRole('heading', { level: 2 })).toHaveText('What we have not checked yet')
    const items = todo.locator('.proof-summary__todo > li')
    await expect(items).toHaveCount(NOT_CHECKED.length)
    for (const item of await items.all()) await expect(item.locator('ul li')).not.toHaveCount(0)

    const ladder = items.first()
    await expect(ladder).toContainText('The Resolution ladder stops at 20 m')
    await expect(ladder).toContainText('A 5 m LOLA map exists')
    await expect(ladder).toContainText('does not use it')
    await expect(ladder).toContainText('backend/app/horizon.py')
  })

  test('shows both summaries in Portuguese', async ({ page }) => {
    await serve(page, LIST)
    await page.goto('/?page=proof&lang=pt')

    const errors = page.getByTestId('proof-errors')
    await expect(errors.getByRole('heading', { level: 2 })).toHaveText('Onde um número pode errar')
    await expect(errors.locator('tbody tr')).toHaveCount(ERROR_SOURCES.length)
    await expect(errors.locator('tbody tr').first()).toContainText('Mapas de 20 m até 5 km')
    const todo = page.getByTestId('proof-not-checked')
    await expect(todo.getByRole('heading', { level: 2 })).toHaveText('O que ainda não conferimos')
    await expect(todo.locator('.proof-summary__todo > li').first()).toContainText('A escada de resolução para em 20 m')
  })

  test('keeps both summaries when the checks cannot be loaded', async ({ page }) => {
    await page.route('**/validations', (route) => route.abort('connectionrefused'))
    await page.goto('/?page=proof')
    await expect(page.getByRole('alert')).toContainText('Could not load the checks.')
    await expect(page.getByTestId('proof-errors')).toBeVisible()
    await expect(page.getByTestId('proof-not-checked')).toBeVisible()
  })

  test('fits a phone: the table stacks and the page does not scroll sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await serve(page, LIST)
    await page.goto('/?page=proof')
    const first = page.getByTestId('proof-errors').locator('tbody tr').first()
    await expect(first).toBeVisible()
    await expect(first.locator('td').first()).toHaveAttribute('data-label', 'Size')
    await expect(first.locator('td').first()).toHaveCSS('display', 'block')
    const overflow = await page.locator('.proof').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('shows the provenance line from /meta', async ({ page }) => {
    await serve(page, LIST)
    await page.goto('/?page=proof')
    await expect(page.getByText(/^Engine .+\. Kernels: .+\. Terrain: .+ at \d/)).toBeVisible()
  })

  test('says so when no check has run', async ({ page }) => {
    await serve(page, [])
    await page.goto('/?page=proof')
    await expect(page.getByText(/No check has run yet/)).toBeVisible()
  })

  test('says it is loading, then shows an error with a way to try again', async ({ page }) => {
    let calls = 0
    await page.route('**/validations', async (route) => {
      calls += 1
      if (calls === 1) return route.abort('connectionrefused')
      return route.fulfill({ json: LIST })
    })
    await page.goto('/?page=proof')

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Could not load the checks. The server did not answer.')
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('Of 4 checks: passing 2, failing 1, pending 1.')).toBeVisible()
  })

  test('says it is loading while the checks are on their way', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/validations', async (route) => {
      await gate
      await route.fulfill({ json: LIST })
    })
    await page.goto('/?page=proof')
    await expect(page.getByRole('status')).toHaveText('Loading the checks…')
    release()
    await expect(page.getByRole('status')).toHaveCount(0)
  })
})
