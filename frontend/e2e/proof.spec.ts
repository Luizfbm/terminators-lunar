import { expect, test, type Page } from '@playwright/test'

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

    const names = page.getByRole('heading', { level: 2 })
    await expect(names).toHaveText([
      'Sun days against Wueller · Fails',
      'Chandrayaan-3 landing · Pending',
      'Sun against Horizons · Passes',
      'Earth against Horizons · Passes',
    ])
    const first = page.getByRole('listitem').first()
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
    await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('Sun days against Wueller (pt) · Falha')
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
