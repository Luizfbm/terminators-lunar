import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme(true, 'depends on the answer column and the header, not shown (issue #78)')

// the requirement. The mock answers /visibility with CR01 (longest night 5 d 2 h) and /visibility/energy
// with its example: a battery that runs empty for 89 h, first at 26/03/2025 06:27 UTC. States the
// example does not have are made by intercepting the route; the contract is not changed.

const ENERGY = '**/visibility/energy?**'
const busy = {
  status: 503,
  contentType: 'application/problem+json',
  headers: { 'Retry-After': '5' },
  body: JSON.stringify({ type: 'https://lunar-api.luizfbm.win/problems/busy', title: 'Busy', status: 503, code: 'busy' }),
}

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

const section = (page: Page) => page.locator('section.battery')
const chargeRow = (page: Page) => page.locator('.strip').getByRole('img', { name: /Charge of the battery|Carga da bateria/ })

test.describe('the simple reading', () => {
  test.use({ locale: 'en-GB' })

  test('starts empty and says there is no thermal model', async ({ page }) => {
    await open(page)
    await expect(section(page).getByRole('heading', { name: 'Does the battery last through the dark?' })).toBeVisible()
    await expect(section(page)).toContainText('Type how many hours of darkness your lander survives')
    await expect(section(page)).toContainText('it has no thermal model')
  })

  test('puts a typed tolerance against the longest night, and keeps it in the link', async ({ page }) => {
    await open(page)
    const field = page.getByRole('spinbutton', { name: 'Darkness tolerance' })
    await field.fill('200')
    await expect(section(page)).toContainText(/The longest night of this Window lasts 5\sd 2\sh\. With 8\sd 8\sh of reserve the lander gets through with 3\sd 5\sh to spare\./)
    await field.fill('24')
    await expect(section(page)).toContainText(/With 1\sd 0\sh of reserve the battery runs out 4\sd 2\sh before the Sun comes back\./)
    await expect(page).toHaveURL(/[?&]tolerance=24/)
    await page.reload()
    await expect(page.getByRole('spinbutton', { name: 'Darkness tolerance' })).toHaveValue('24')
  })

  test('offers VIPER’s 50 hours as an example, with its source', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Example: VIPER, 50 h' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Darkness tolerance' })).toHaveValue('50')
    await expect(section(page)).toContainText('NASA says VIPER survives 50 hours in low power mode (Bluethmann, NTRS 20240013903, slide 2).')
    await expect(page).toHaveURL(/[?&]tolerance=50/)
  })
})

test.describe('one Darkness tolerance for the battery and the launch slip', () => {
  test.use({ locale: 'en-GB' })

  // Merge of the implementation and the implementation, 2026-11-14: the battery kept its tolerance as `dark` and the slip read
  // `tolerance`, so the slip kept asking for a tolerance the user had just typed.
  test('the slip marks the Windows as soon as the battery gets a tolerance, and lets go when it is cleared', async ({ page }) => {
    await open(page)
    const slip = page.getByRole('region', { name: 'If the launch slips' })
    await expect(slip.getByText('Give the battery a Darkness tolerance')).toBeVisible()

    const field = page.getByRole('spinbutton', { name: 'Darkness tolerance' })
    await field.fill('48')
    await expect(slip.getByText(/^With a Darkness tolerance of 48\sh, the lander gets through every night in \d+ of these \d+ Windows\./)).toBeVisible()
    await expect(page).toHaveURL(/[?&]tolerance=48/)

    await field.fill('')
    await expect(slip.getByText('Give the battery a Darkness tolerance')).toBeVisible()
    await expect(page).not.toHaveURL(/tolerance=/)
  })

  test('a tolerance in the link reaches both panels after a reload', async ({ page }) => {
    await open(page, '/?tolerance=48')
    await expect(page.getByRole('spinbutton', { name: 'Darkness tolerance' })).toHaveValue('48')
    await expect(page.getByRole('region', { name: 'If the launch slips' }).getByText(/With a Darkness tolerance of 48\sh/)).toBeVisible()
  })
})

test.describe('the full reading', () => {
  test.use({ locale: 'en-GB' })

  test('waits for three numbers, then follows the Charge with VIPER, on the strip too', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Describe the lander and follow its battery' }).click()
    await expect(section(page)).toContainText('Type the three numbers to see the Charge across the Window.')
    await expect(chargeRow(page)).toHaveCount(0)

    const asked = page.waitForRequest((request) => request.url().includes('/visibility/energy?'))
    await page.getByRole('button', { name: 'VIPER, NASA’s polar rover' }).click()
    const url = new URL((await asked).url())
    expect(url.searchParams.get('panel_power_w')).toBe('450')
    expect(url.searchParams.get('load_w')).toBe('108.4')
    expect(url.searchParams.get('battery_wh')).toBe('5420')
    expect(url.searchParams.get('site_id')).toBe('CR01')

    await expect(section(page)).toContainText('The 108.4 W load is our own figure, 5,420 Wh ÷ 50 h. NASA does not publish one.')
    await expect(section(page)).toContainText(/The battery runs out and the lander goes 3\sd 17\sh without power in this Window\. It first hits empty on 26 Mar 2025, 06:27 UTC\./)
    await expect(section(page).getByRole('row', { name: /Lowest Charge/ })).toContainText('0%')
    await expect(section(page)).toContainText('This has no thermal model.')
    await expect(section(page)).toContainText('Hatched: battery empty')
    await expect(chargeRow(page)).toHaveAttribute('aria-label', 'Charge of the battery across the Window. Lowest 0%.')
    await expect(page).toHaveURL(/[?&]charge=1/)
    await expect(page).toHaveURL(/[?&]lander=450%2C108\.4%2C5420/)

    await page.reload()
    await expect(page.getByRole('button', { name: 'Describe the lander and follow its battery' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('spinbutton', { name: 'Load' })).toHaveValue('108.4')
    await expect(chargeRow(page)).toBeVisible()
  })

  test('says it is working, then that it failed, and tries again', async ({ page }) => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(ENERGY, async (route: Route) => {
      calls += 1
      if (calls === 1) {
        await gate
        await route.fulfill(busy)
      } else {
        await route.continue()
      }
    })
    await open(page, '/?charge=1&lander=400,100,2000')
    await expect(section(page).getByRole('status')).toHaveText('Following the battery across the Window…')
    release()
    const alert = section(page).getByRole('alert')
    await expect(alert).toContainText('The server is busy right now.')
    await expect(chargeRow(page)).toHaveCount(0)
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(chargeRow(page)).toBeVisible()
  })

  test('says so in words when the battery never runs out', async ({ page }) => {
    await page.route(ENERGY, async (route: Route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.charge_fraction = body.charge_fraction.map((value: number) => 0.4 + 0.6 * value)
      body.min_charge_fraction = 0.4
      body.unmet_hours = 0
      body.load_always_met = true
      await route.fulfill({ response, json: body })
    })
    await open(page, '/?charge=1&lander=400,100,2000')
    await expect(section(page)).toContainText(/The battery never runs out\. Its lowest point is 40%, on 26 Mar 2025, 06:27 UTC\./)
    await expect(section(page).getByRole('row', { name: /Hours the load was not met/ })).toContainText('none')
    await expect(section(page)).not.toContainText('Hatched: battery empty')
  })
})

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('says both readings in Portuguese', async ({ page }) => {
    await open(page, '/?tolerance=50&charge=1&lander=450,108.4,5420')
    await expect(section(page).getByRole('heading', { name: 'A bateria aguenta o escuro?' })).toBeVisible()
    await expect(section(page)).toContainText(/A maior noite desta Janela dura 5\sd 2\sh\. Com 2\sd 2\sh de reserva, a bateria acaba 3\sd 0\sh antes de o Sol voltar\./)
    await expect(section(page)).toContainText('O consumo de 108,4 W é conta nossa')
    await expect(section(page)).toContainText(/A bateria se esgota e o módulo passa 3\sd 17\sh sem energia nesta Janela\./)
    await expect(chargeRow(page)).toHaveAttribute('aria-label', 'Carga da bateria ao longo da Janela. Mínima de 0%.')
  })
})

test.describe('at 390 px wide', () => {
  test.use({ locale: 'en-GB', viewport: { width: 390, height: 844 } })

  test('both readings and the Charge row fit without scrolling sideways', async ({ page }) => {
    await open(page, '/?tolerance=50&charge=1&lander=450,108.4,5420')
    await expect(chargeRow(page)).toBeVisible()
    await section(page).scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    expect(await page.locator('main.answer').evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0)
  })
})

// the requirement: where the panels face, after Eduardo's panel-geometry model. The mock answers the energy
// route with its first example, which has no pointing, so these answer with the contract's example
// for upright panels facing east (lit for 85 h of the Window).
const FIXED_EAST = JSON.parse(
  readFileSync(new URL('../../contract/examples/visibility-energy-001-fixed-east.example.json', import.meta.url), 'utf8'),
).value as { lander: Record<string, unknown> } & Record<string, unknown>

async function answerPointed(page: Page) {
  const asked: URL[] = []
  await page.route(ENERGY, async (route: Route) => {
    const url = new URL(route.request().url())
    asked.push(url)
    const pointing = url.searchParams.get('panel_pointing')
    const azimuth = url.searchParams.get('panel_azimuth_deg')
    const lander = { ...FIXED_EAST.lander, panel_pointing: pointing } as Record<string, unknown>
    if (azimuth === null) delete lander.panel_azimuth_deg
    else lander.panel_azimuth_deg = Number(azimuth)
    await route.fulfill({ json: { ...FIXED_EAST, lander } })
  })
  return asked
}

test.describe('where the panels face', () => {
  test.use({ locale: 'en-GB' })

  test('offers three pointings, facing the Sun by default, and asks with it', async ({ page }) => {
    const asked = await answerPointed(page)
    await open(page, '/?charge=1&lander=400,100,2000')
    const panels = section(page).getByRole('group', { name: 'Panels' })
    await expect(panels.getByRole('radio', { name: 'Always facing the Sun' })).toBeChecked()
    await expect(panels.getByRole('radio', { name: 'Upright, fixed, facing' })).not.toBeChecked()
    await expect(panels.getByRole('radio', { name: 'Lying flat on top' })).not.toBeChecked()
    await expect(panels).toContainText('0° is north and 90° is east, counting clockwise.')
    await expect(chargeRow(page)).toBeVisible()
    expect(asked.at(-1)?.searchParams.get('panel_pointing')).toBe('sun')
    expect(asked.at(-1)?.searchParams.has('panel_azimuth_deg')).toBe(false)
    await expect(section(page)).not.toContainText('reaches the panels for only')
    await expect(section(page)).toContainText('Eduardo’s panel-geometry model')
    await expect(section(page)).toContainText('with no tracking error')
    await expect(section(page)).not.toContainText('always face the Sun')
  })

  test('upright panels facing east: the request, the effect sentence and the link', async ({ page }) => {
    const asked = await answerPointed(page)
    await open(page, '/?charge=1&lander=400,100,2000')
    const panels = section(page).getByRole('group', { name: 'Panels' })
    await panels.getByRole('radio', { name: 'Upright, fixed, facing' }).check()
    const azimuth = panels.getByRole('spinbutton', { name: 'Which way the panels face, in degrees' })
    await azimuth.fill('90')
    await expect(section(page)).toContainText(/The Sun is up for 3\sd 1\d\sh in this Window, but reaches the panels for only 3\sd 1\d\sh of it\./)
    await expect(page).toHaveURL(/[?&]panels=fixed%3A90(&|$)/)
    const last = asked.at(-1)
    expect(last?.searchParams.get('panel_pointing')).toBe('fixed')
    expect(last?.searchParams.get('panel_azimuth_deg')).toBe('90')
    await expect(chargeRow(page)).toBeVisible()

    await page.reload()
    await expect(section(page).getByRole('radio', { name: 'Upright, fixed, facing' })).toBeChecked()
    await expect(section(page).getByRole('spinbutton', { name: 'Which way the panels face, in degrees' })).toHaveValue('90')
    await expect(section(page)).toContainText('but reaches the panels for only')
  })

  test('waits for an azimuth before asking, and says so', async ({ page }) => {
    const asked = await answerPointed(page)
    await open(page, '/?charge=1&lander=400,100,2000&panels=fixed:')
    await expect(section(page)).toContainText('Type which way the panels face, from 0 to 359°, to see the Charge across the Window.')
    await expect(chargeRow(page)).toHaveCount(0)
    expect(asked).toHaveLength(0)
  })

  // Luiz, regression: with panels that do not face the Sun, the tolerance is read against the longest
  // stretch with no light on them (6 d 10 h in the example), not against the longest night.
  test('reads the Darkness tolerance against the longest stretch with no light on the panels', async ({ page }) => {
    await answerPointed(page)
    await open(page, '/?tolerance=200&charge=1&lander=400,100,2000&panels=fixed:90')
    await expect(section(page)).toContainText(
      /With the panels as you set them, the longest stretch with no light on them in this Window lasts 6\sd 1\d\sh, Sun up or not\. With 8\sd 8\sh of reserve the lander gets through with 1\sd \d+\sh to spare\./,
    )
    await expect(section(page).getByRole('row', { name: /Longest stretch with no light on the panels/ })).toContainText(/6\sd 1\d\sh/)

    await section(page).getByRole('radio', { name: 'Always facing the Sun' }).check()
    await expect(section(page)).toContainText(/The longest night of this Window lasts 5\sd 2\sh\./)
    await expect(section(page)).not.toContainText('no light on them')
  })

  test('flat panels from the link, and back to facing the Sun drops it from the link', async ({ page }) => {
    const asked = await answerPointed(page)
    await open(page, '/?charge=1&lander=400,100,2000&panels=flat')
    await expect(section(page).getByRole('radio', { name: 'Lying flat on top' })).toBeChecked()
    await expect(section(page)).toContainText('but reaches the panels for only')
    expect(asked.at(-1)?.searchParams.get('panel_pointing')).toBe('flat')

    await section(page).getByRole('radio', { name: 'Always facing the Sun' }).check()
    await expect(page).not.toHaveURL(/panels=/)
    await expect(section(page)).not.toContainText('reaches the panels for only')
  })
})

test.describe('where the panels face, in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('says the choice and the effect in Portuguese', async ({ page }) => {
    await answerPointed(page)
    await open(page, '/?charge=1&lander=400,100,2000&panels=fixed:90')
    const panels = section(page).getByRole('group', { name: 'Painéis' })
    await expect(panels.getByRole('radio', { name: 'Sempre de frente para o Sol' })).not.toBeChecked()
    await expect(panels.getByRole('radio', { name: 'Em pé, fixos, virados para' })).toBeChecked()
    await expect(panels.getByRole('radio', { name: 'Deitados no topo' })).not.toBeChecked()
    await expect(panels).toContainText('0° é o norte e 90° é o leste, no sentido horário.')
    await expect(section(page)).toContainText(/O Sol fica acima do horizonte por 3\sd 1\d\sh nesta Janela, mas bate nos painéis só em 3\sd 1\d\sh disso\./)
    await expect(section(page)).toContainText('modelo de geometria de painéis do Eduardo')
  })

  test('says the Darkness tolerance against the panels in Portuguese', async ({ page }) => {
    await answerPointed(page)
    await open(page, '/?tolerance=100&charge=1&lander=400,100,2000&panels=fixed:90')
    await expect(section(page)).toContainText(
      /Com os painéis como você os pôs, o trecho mais longo sem luz neles nesta Janela dura 6\sd 1\d\sh, com Sol ou sem Sol\. Com 4\sd 4\sh de reserva, a bateria acaba 2\sd \d+\sh antes de a luz voltar aos painéis\./,
    )
  })
})
