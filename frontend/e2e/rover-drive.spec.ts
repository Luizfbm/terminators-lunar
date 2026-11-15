import { expect, test, type Page } from '@playwright/test'
import { classic } from './classic'

// Issue #100: Eduardo's screens reached from the app. One button, "Rover and drive" (Rover e travessia), in the
// foot of the stage opens a sheet with the Rover choice, the Hazard inspector, the Normal navigation x
// Multiresolution simulation and the walk. It is there in the default layout (no header, no answer column) and
// in `?layout=classic`, and what is open, the Rover, the mission and the plan accepted are in the link.
//
// The Prism mock answers /rovers, /sites/{id}/hazard, /hazard/grid and /route with the contract's examples
// (AR06, VIPER, 60 m, P90) whatever Site is asked for, so the screens load for the default Site CR01.
test.use({ locale: 'en-US', viewport: { width: 1280, height: 720 } })

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Rover and drive' })
const entry = (page: Page) => page.locator('.stage__foot').getByRole('button', { name: 'Rover and drive', exact: true })
const tab = (page: Page, name: string) => sheet(page).getByRole('tab', { name, exact: true })

/** The screen each tab opens, by the heading Eduardo's component gives it. */
const SCREENS = [
  { tab: 'Rover', drive: 'rover', heading: 'Which rover, and for how long?' },
  { tab: 'Hazard inspector', drive: 'hazard', heading: 'Local inspector, 10 × 10 km' },
  { tab: 'Simulation', drive: 'simulation', heading: 'Normal navigation × Multiresolution' },
  { tab: 'Walk', drive: 'walk', heading: 'Walk the surface' },
] as const

/** What shows a screen has its data in, not only its title (the mock's examples are all there). */
async function expectLoaded(page: Page, screen: (typeof SCREENS)[number]['drive']) {
  const body = sheet(page)
  if (screen === 'rover') await expect(body.getByRole('radio', { name: /VIPER/ })).toHaveAttribute('aria-checked', 'true')
  if (screen === 'hazard') {
    await expect(body.locator('.hazard__status')).toHaveCount(0)
    await expect(body.getByText('At the same false alarm of').first()).toBeVisible()
  }
  if (screen === 'simulation') {
    await expect(body.getByRole('button', { name: 'Accept Normal navigation' })).toBeVisible()
    await expect(body.getByRole('button', { name: 'Accept Multiresolution' })).toBeVisible()
  }
  if (screen === 'walk') await expect(body.getByRole('group', { name: 'Plan', exact: true })).toBeVisible()
}

const LAYOUTS = [
  { name: 'the default layout', path: (query: string) => `/${query}` },
  { name: 'the classic layout', path: (query: string) => classic(`/${query}`) },
]

for (const layout of LAYOUTS) {
  test.describe(`in ${layout.name}`, () => {
    test('the entry sits in the foot of the stage, beside the views, and opens the Rover choice', async ({ page }) => {
      await page.goto(layout.path(''))
      await expect(entry(page)).toBeVisible()
      await expect(entry(page)).toHaveAttribute('aria-haspopup', 'dialog')
      if (layout.name === 'the default layout') {
        // Larissa's layout has no header and no answer column: the entry does not depend on either.
        await expect(page.locator('header.bar')).toBeHidden()
        await expect(page.locator('main.answer')).toBeHidden()
      } else {
        await expect(page.locator('header.bar')).toBeVisible()
      }
      // It does not cover the views.
      const views = (await page.locator('.views').boundingBox())!
      const button = (await entry(page).boundingBox())!
      expect(button.x >= views.x + views.width || views.x >= button.x + button.width).toBe(true)

      await entry(page).click()
      await expect(sheet(page)).toBeVisible()
      await expect(tab(page, 'Rover')).toHaveAttribute('aria-selected', 'true')
      await expect(sheet(page).getByRole('heading', { name: 'Which rover, and for how long?' })).toBeVisible()
      await expect(page).toHaveURL(/[?&]drive=rover(&|$)/)
    })

    for (const screen of SCREENS) {
      test(`opens ${screen.tab} from its tab and puts it in the link`, async ({ page }) => {
        await page.goto(layout.path(''))
        await entry(page).click()
        await tab(page, screen.tab).click()
        await expect(tab(page, screen.tab)).toHaveAttribute('aria-selected', 'true')
        await expect(sheet(page).getByRole('heading', { name: screen.heading })).toBeVisible()
        await expectLoaded(page, screen.drive)
        await expect(page).toHaveURL(new RegExp(`[?&]drive=${screen.drive}(&|$)`))
        // Only the screen open is on screen.
        for (const other of SCREENS.filter((candidate) => candidate !== screen)) {
          await expect(sheet(page).getByRole('heading', { name: other.heading })).toHaveCount(0)
        }
      })

      test(`a link with drive=${screen.drive} opens ${screen.tab} straight away`, async ({ page }) => {
        await page.goto(layout.path(`?drive=${screen.drive}`))
        await expect(sheet(page)).toBeVisible()
        await expect(tab(page, screen.tab)).toHaveAttribute('aria-selected', 'true')
        await expect(sheet(page).getByRole('heading', { name: screen.heading })).toBeVisible()
        await expectLoaded(page, screen.drive)
      })
    }

    test('the Rover, the mission and the plan are kept in the link and come back on a reload', async ({ page }) => {
      await page.goto(layout.path(''))
      await entry(page).click()
      const body = sheet(page)
      await body.getByRole('radio', { name: /Lunar Terrain Vehicle/ }).click()
      await body.getByRole('group', { name: 'Year of the trip' }).getByRole('button', { name: '2029', exact: true }).click()
      await body.getByRole('group', { name: 'Days on the Moon' }).getByRole('button', { name: '14', exact: true }).click()
      await body.getByRole('checkbox', { name: 'Needs to see the Earth (DTE)' }).uncheck()
      await expect(page).toHaveURL(/[?&]rover=ltv(&|$)/)
      await expect(page).toHaveURL(/[?&]myear=2029(&|$)/)
      await expect(page).toHaveURL(/[?&]mdays=14(&|$)/)
      await expect(page).toHaveURL(/[?&]mdte=0(&|$)/)

      await page.reload()
      await expect(sheet(page)).toBeVisible()
      const again = sheet(page)
      await expect(again.getByRole('radio', { name: /Lunar Terrain Vehicle/ })).toHaveAttribute('aria-checked', 'true')
      await expect(again.getByRole('group', { name: 'Year of the trip' }).getByRole('button', { name: '2029', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(again.getByRole('group', { name: 'Days on the Moon' }).getByRole('button', { name: '14', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(again.getByRole('checkbox', { name: 'Needs to see the Earth (DTE)' })).not.toBeChecked()
    })

    test('the simulation plans the drive for the Rover in the link and for the Sun at the Cursor', async ({ page }) => {
      const asked = page.waitForRequest((request) => {
        const url = new URL(request.url())
        return url.pathname.endsWith('/route') && url.searchParams.get('rover_id') === 'ltv'
      })
      await page.goto(layout.path('?drive=simulation&rover=ltv'))
      const url = new URL((await asked).url())
      expect(url.pathname).toBe('/sites/CR01/route')
      expect(url.searchParams.get('sun_fraction')).not.toBeNull()
      expect(url.searchParams.get('sun_azimuth_deg')).not.toBeNull()
    })

    test('accepting a plan goes in the link, and the walk follows the plan accepted', async ({ page }) => {
      await page.goto(layout.path('?drive=simulation'))
      const body = sheet(page)
      await body.getByRole('button', { name: 'Accept Normal navigation' }).click()
      await expect(body.getByText('Plan accepted: Normal navigation.')).toBeVisible()
      await expect(page).toHaveURL(/[?&]plan=normal(&|$)/)

      await page.reload()
      await expect(sheet(page).getByText('Plan accepted: Normal navigation.')).toBeVisible()

      await sheet(page).getByRole('button', { name: 'Walk the surface' }).click()
      await expect(tab(page, 'Walk')).toHaveAttribute('aria-selected', 'true')
      await expect(page).toHaveURL(/[?&]drive=walk(&|$)/)
      await expect(page).toHaveURL(/[?&]plan=normal(&|$)/)
      await expect(sheet(page).getByRole('group', { name: 'Plan', exact: true }).getByRole('button', { name: 'Normal navigation' })).toHaveAttribute('aria-pressed', 'true')

      await page.reload()
      await expect(tab(page, 'Walk')).toHaveAttribute('aria-selected', 'true')
      await expect(sheet(page).getByRole('group', { name: 'Plan', exact: true }).getByRole('button', { name: 'Normal navigation' })).toHaveAttribute('aria-pressed', 'true')
    })

    test('the Query keeps its own parameters beside the sheet’s, after the app rewrites the link', async ({ page }) => {
      await page.goto(layout.path('?site=CR01&drive=hazard'))
      await expect(sheet(page)).toBeVisible()
      // The app writes the link back 300 ms after it settles.
      await page.waitForTimeout(700)
      const params = new URL(page.url()).searchParams
      expect(params.get('site')).toBe('CR01')
      expect(params.get('drive')).toBe('hazard')
      if (layout.name === 'the classic layout') expect(params.get('layout')).toBe('classic')
      await page.reload()
      await expect(tab(page, 'Hazard inspector')).toHaveAttribute('aria-selected', 'true')
    })

    test('Escape closes the sheet and takes its parameters out of the link; opening it again finds the Rover as it was', async ({ page }) => {
      await page.goto(layout.path('?drive=rover'))
      await sheet(page).getByRole('radio', { name: /Lunar Terrain Vehicle/ }).click()
      await expect(page).toHaveURL(/[?&]rover=ltv(&|$)/)
      await page.keyboard.press('Escape')
      await expect(sheet(page)).toBeHidden()
      for (const name of ['drive', 'rover', 'myear', 'mdays', 'mdte', 'plan']) expect(new URL(page.url()).searchParams.has(name), name).toBe(false)

      await entry(page).click()
      await expect(sheet(page).getByRole('radio', { name: /Lunar Terrain Vehicle/ })).toHaveAttribute('aria-checked', 'true')
      await expect(page).toHaveURL(/[?&]drive=rover(&|$)/)
      await expect(page).toHaveURL(/[?&]rover=ltv(&|$)/)
    })

    test('the Close button closes the sheet and takes the screen out of the link', async ({ page }) => {
      await page.goto(layout.path(''))
      await entry(page).click()
      await tab(page, 'Hazard inspector').click()
      await sheet(page).getByRole('button', { name: 'Close', exact: true }).click()
      await expect(sheet(page)).toBeHidden()
      expect(new URL(page.url()).searchParams.has('drive')).toBe(false)
    })

    test('the arrow keys move between the tabs', async ({ page }) => {
      await page.goto(layout.path('?drive=rover'))
      await tab(page, 'Rover').focus()
      await page.keyboard.press('ArrowRight')
      await expect(tab(page, 'Hazard inspector')).toHaveAttribute('aria-selected', 'true')
      await expect(tab(page, 'Hazard inspector')).toBeFocused()
      await page.keyboard.press('ArrowLeft')
      await expect(tab(page, 'Rover')).toHaveAttribute('aria-selected', 'true')
      await page.keyboard.press('ArrowLeft')
      await expect(tab(page, 'Walk')).toHaveAttribute('aria-selected', 'true')
    })

    test('a typed coordinate gets the Rover choice, and says the other screens need a Curated Site', async ({ page }) => {
      await page.route('**/visibility?*', async (route) => {
        const response = await route.fetch()
        const body = (await response.json()) as { query: { site: Record<string, unknown> } }
        body.query.site = { ...body.query.site, id: 'custom', source: 'custom', curated: false }
        await route.fulfill({ response, json: body })
      })
      await page.goto(layout.path('?drive=hazard'))
      await expect(sheet(page).getByRole('status')).toContainText('is a typed coordinate')
      await expect(sheet(page).getByRole('heading', { name: 'Local inspector, 10 × 10 km' })).toHaveCount(0)
      await tab(page, 'Rover').click()
      await expect(sheet(page).getByRole('heading', { name: 'Which rover, and for how long?' })).toBeVisible()
    })

    test('the simulation says so when the Site has no Hazard grid', async ({ page }) => {
      await page.route('**/sites/*/hazard/grid', (route) =>
        route.fulfill({
          status: 422,
          contentType: 'application/problem+json',
          body: JSON.stringify({ type: 'https://lunar-api.luizfbm.win/problems/no_hazard_grid', title: 'no_hazard_grid', status: 422, code: 'no_hazard_grid' }),
        }),
      )
      await page.goto(layout.path('?drive=simulation'))
      await expect(sheet(page).getByRole('alert')).toContainText('No 5 m ground grid lies within 15 km of this Site')
    })
  })
}

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('the entry is Rover e travessia, and the screens keep their state in the same link', async ({ page }) => {
    await page.goto('/')
    const open = page.locator('.stage__foot').getByRole('button', { name: 'Rover e travessia', exact: true })
    await expect(open).toBeVisible()
    await open.click()
    const body = page.getByRole('dialog', { name: 'Rover e travessia' })
    await expect(body).toBeVisible()
    await expect(body.getByRole('heading', { name: 'Qual rover, e por quantos dias?' })).toBeVisible()
    await body.getByRole('tab', { name: 'Inspetor de perigo', exact: true }).click()
    await expect(body.getByRole('heading', { name: 'Inspetor local, 10 × 10 km' })).toBeVisible()
    await expect(page).toHaveURL(/[?&]drive=hazard(&|$)/)
    await body.getByRole('tab', { name: 'Simulação', exact: true }).click()
    await expect(body.getByRole('heading', { name: 'Navegação Normal × Multirresolução' })).toBeVisible()
    await body.getByRole('tab', { name: 'Caminhada', exact: true }).click()
    await expect(body.getByRole('heading', { name: 'Caminhar na superfície' })).toBeVisible()
    await expect(page).toHaveURL(/[?&]drive=walk(&|$)/)
  })
})

for (const layout of LAYOUTS) {
  test.describe(`on a phone, 390 px wide, in ${layout.name}`, () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('the entry is on the screen, and no screen of the sheet scrolls sideways', async ({ page }) => {
      await page.goto(layout.path(''))
      await expect(entry(page)).toBeVisible()
      const button = (await entry(page).boundingBox())!
      expect(button.x).toBeGreaterThanOrEqual(0)
      expect(button.x + button.width).toBeLessThanOrEqual(390)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

      await entry(page).click()
      for (const screen of SCREENS) {
        await tab(page, screen.tab).click()
        await expect(sheet(page).getByRole('heading', { name: screen.heading })).toBeVisible()
        await expectLoaded(page, screen.drive)
        const box = (await sheet(page).boundingBox())!
        expect(box.x, `${screen.tab}: sheet's left edge`).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, `${screen.tab}: sheet's right edge`).toBeLessThanOrEqual(390)
        const widths = await sheet(page).evaluate((element) => ({
          sheet: { scroll: element.scrollWidth, client: element.clientWidth },
          page: document.documentElement.scrollWidth,
          cut: [...element.querySelectorAll('h2, h3, p, button, label, dt, dd, figcaption, th, td')]
            .filter((child) => {
              const rect = child.getBoundingClientRect()
              return rect.width > 0 && (rect.right > element.getBoundingClientRect().right + 0.5 || rect.left < -0.5)
            })
            .map((child) => (child.textContent ?? '').trim().slice(0, 40)),
        }))
        expect(widths.sheet.scroll, `${screen.tab}: the sheet scrolls sideways`).toBeLessThanOrEqual(widths.sheet.client)
        expect(widths.page, `${screen.tab}: the page scrolls sideways`).toBeLessThanOrEqual(390)
        expect(widths.cut, `${screen.tab}: text past the edge`).toEqual([])
      }
    })

    test('a link with the sheet open opens it on the phone too', async ({ page }) => {
      await page.goto(layout.path('?drive=hazard'))
      await expect(sheet(page)).toBeVisible()
      await expect(tab(page, 'Hazard inspector')).toHaveAttribute('aria-selected', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    })
  })
}
