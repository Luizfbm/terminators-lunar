import { expect, test, type Page } from '@playwright/test'
import { openDetails, withDetails } from './details'

// the requirement: "Stats for nerds". The plain sentences are the default screen; the numbers, the panels
// and where the answer comes from are one click away, and the link remembers the click. They are in the
// drawer of details, so a test opens it first.

test.use({ locale: 'en-US' })

const toggle = (page: Page) => page.getByRole('button', { name: 'Stats for nerds' })
const numbers = (page: Page) => page.getByRole('table', { name: 'The numbers for this Window' })
const facts = (page: Page) => page.getByRole('table', { name: /Where the Sun and the Earth are at the Cursor/ })
const fact = (page: Page, name: string) => facts(page).getByRole('row', { name }).getByRole('cell')

test('the default screen has the sentences only; the button opens the numbers in place and the link remembers it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await openDetails(page)
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(numbers(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /map’s detail/ })).toHaveCount(0)
  // What stays: the summary, the way to the IM-2 landing and the way to the Proof page.
  await expect(page.locator('.sum')).toBeVisible()
  await expect(page.getByRole('link', { name: /A real landing/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'How we know these numbers' })).toBeVisible()

  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(numbers(page).getByRole('rowheader', { name: 'Longest sunlight (LCIP)' })).toBeVisible()
  await expect(page.getByRole('button', { name: /map’s detail/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^The year \d{4} at this Site$/ })).toBeVisible()
  await expect(page).toHaveURL(/stats=1/)

  await toggle(page).click()
  await expect(numbers(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/stats=/)
})

test('a link with stats=1 opens with the panel open', async ({ page }) => {
  await page.goto('/?stats=1')
  await openDetails(page)
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(numbers(page)).toBeVisible()
})

test('the panel says where the Sun and the Earth are at the Cursor, as the API gave them, and what the answer came from', async ({ page }) => {
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === '/visibility')
  await page.goto(withDetails('/?stats=1'))
  const body = await (await answered).json()
  await expect(facts(page)).toBeVisible()

  // Checked against the answer itself: the azimuth and elevation on screen are those of one sample.
  const read = async (name: string) => {
    const text = (await fact(page, name).textContent())!
    const [, azimuth, elevation] = text.match(/^azimuth (-?[\d.]+)°, elevation (-?[\d.]+)°$/)!
    return { azimuth: Number(azimuth), elevation: Number(elevation) }
  }
  const near = (a: number, b: number) => Math.abs(a - b) < 0.006
  const sun = await read('Sun at the Cursor')
  const earth = await read('Earth at the Cursor')
  const sample = body.timeline.samples.find(
    (s: { sun: { azimuth_deg: number; elevation_deg: number } }) => near(s.sun.azimuth_deg, sun.azimuth) && near(s.sun.elevation_deg, sun.elevation),
  )
  expect(sample, `no sample with the Sun at ${JSON.stringify(sun)}`).toBeTruthy()
  expect(near(sample.earth.azimuth_deg, earth.azimuth) && near(sample.earth.elevation_deg, earth.elevation)).toBe(true)
  await expect(fact(page, 'Sun’s disc showing at the Cursor')).toHaveText(/^\d+%$/)

  const { site } = body.query
  await expect(fact(page, 'Site coordinates')).toHaveText(
    `${Math.abs(site.latitude_deg)}° ${site.latitude_deg < 0 ? 'S' : 'N'}, ${Math.abs(site.longitude_deg)}° ${site.longitude_deg < 0 ? 'W' : 'E'}`,
  )
  for (const dem of body.provenance.dems) await expect(fact(page, 'Terrain (DEM)')).toContainText(dem.product)
  for (const kernel of body.provenance.kernels) await expect(fact(page, 'SPICE kernels')).toContainText(kernel)
  await expect(fact(page, 'Engine version')).toHaveText(body.provenance.engine_version)
})

test('in Portuguese the button and the rows are in Portuguese', async ({ page }) => {
  await page.goto(withDetails('/?lang=pt'))
  await page.getByRole('button', { name: 'Estatísticas para nerds' }).click()
  const tabela = page.getByRole('table', { name: /Onde o Sol e a Terra estão no Cursor/ })
  await expect(tabela.getByRole('rowheader', { name: 'Coordenadas do Local' })).toBeVisible()
  await expect(tabela.getByRole('row', { name: 'Sol no Cursor' }).getByRole('cell')).toHaveText(/^azimute .+°, elevação .+°$/)
})

test.describe('on a phone, 390 px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the open panel fits the screen: long kernel names wrap', async ({ page }) => {
    await page.goto(withDetails('/?stats=1'))
    await expect(facts(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
    const box = (await facts(page).boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  })
})
