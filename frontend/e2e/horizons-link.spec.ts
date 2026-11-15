import { expect, test } from './classic'
import type { Page } from '@playwright/test'

// "Check in JPL Horizons": next to the Sun's and the Earth's position at the Cursor, one link per body that
// opens Horizons for the same Site, Observer height and instant, so anyone can redo the position.

test.use({ locale: 'en-US' })

const facts = (page: Page) => page.getByRole('table', { name: /Where the Sun and the Earth are at the Cursor/ })
const check = (page: Page) => facts(page).getByRole('row', { name: /Check in JPL Horizons/ })

test('each body has a link that opens JPL Horizons in a new tab for this Site, height and the instant of the numbers shown', async ({ page }) => {
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === '/visibility')
  await page.goto('/?stats=1')
  const body = await (await answered).json()
  await expect(check(page)).toBeVisible()

  const { site, observer_height_m: height } = body.query
  const near = (a: number, b: number) => Math.abs(a - b) < 0.006
  const shown = async (name: string) => {
    const text = (await facts(page).getByRole('row', { name }).getByRole('cell').textContent())!
    const [, azimuth, elevation] = text.match(/^azimuth (-?[\d.]+)°, elevation (-?[\d.]+)°$/)!
    return { azimuth: Number(azimuth), elevation: Number(elevation) }
  }
  const sun = await shown('Sun at the Cursor')
  const sample = body.timeline.samples.find((s: { sun: { azimuth_deg: number; elevation_deg: number } }) => near(s.sun.azimuth_deg, sun.azimuth) && near(s.sun.elevation_deg, sun.elevation))
  expect(sample, 'the sample the numbers on screen come from').toBeTruthy()
  const minute = new Date(sample.t).toISOString().slice(0, 16).replace('T', ' ')

  for (const [name, command] of [['Sun', '10'], ['Earth', '399']] as const) {
    const link = check(page).getByRole('link', { name: new RegExp(`Check the ${name} in JPL Horizons`) })
    await expect(link).toHaveText(name)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const url = new URL((await link.getAttribute('href'))!)
    expect(url.origin + url.pathname).toBe('https://ssd.jpl.nasa.gov/api/horizons.api')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'text',
      COMMAND: command,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: 'coord@301',
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: `${site.longitude_deg},${site.latitude_deg},${(height / 1000).toFixed(4)}`,
      TLIST: `'${minute}'`,
      QUANTITIES: '4',
      APPARENT: 'AIRLESS',
      TIME_TYPE: 'UT',
    })
  }
})

test('in Portuguese the row and the links are in Portuguese', async ({ page }) => {
  await page.goto('/?lang=pt&stats=1')
  const linha = page.getByRole('table', { name: /Onde o Sol e a Terra estão no Cursor/ }).getByRole('row', { name: /Conferir no JPL Horizons/ })
  await expect(linha).toBeVisible()
  await expect(linha.getByRole('link', { name: /Conferir o Sol no JPL Horizons/ })).toHaveText('Sol')
  await expect(linha.getByRole('link', { name: /Conferir a Terra no JPL Horizons/ })).toHaveText('Terra')
})
