import { expect, test } from '@playwright/test'
import { closeDetails, openDetails } from './details'

// the requirement, step 1 of the identity pass: a loading state for the Moon, controls that look like
// controls, and a serif for the statements.

test.use({ locale: 'en-US' })

test('while the images of the Moon are on their way the stage says so, and the Moon appears dressed', async ({ page }) => {
  // Before: the globe showed up as a plain grey ball and got its relief seconds later.
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/moon/**', async (route) => {
    await held
    await route.fulfill({ status: 404, body: '' })
  })
  await page.goto('/')
  const loading = page.locator('.stage__loading')
  await expect(loading).toHaveText('Loading the Moon…')
  const globe = page.locator('.globe')
  await expect(globe).toHaveAttribute('data-dressed', 'false')
  // The Moon is not shown bare while it waits.
  await expect(globe.locator('canvas')).toHaveCSS('opacity', '0')

  release()
  await expect(globe).toHaveAttribute('data-dressed', 'true')
  await expect(loading).toHaveCount(0)
  await expect(globe.locator('canvas')).toHaveCSS('opacity', '1')
})

test('a slow network does not hold the Moon back for ever', async ({ page }) => {
  // What is checked is that the Moon shows without its images, not how fast: on a busy machine,
  // where the globe is drawn by software, the six seconds of waiting come after a slow start.
  test.setTimeout(90_000)
  await page.route('**/moon/**', () => {
    // Never answered.
  })
  await page.goto('/')
  // The wait is 6 s from the moment the globe is on the page, which itself comes after the answer.
  await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true', { timeout: 60_000 })
})

test('the Query line and the views look like controls, not like text', async ({ page }) => {
  // Luiz: "it is not clear where to click". They were dotted or plain text.
  await page.goto('/')
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
  // The Query line is in the drawer of details.
  await openDetails(page)
  const boxed = async (name: string | RegExp, role: 'button' | 'textbox' | 'spinbutton') => {
    const control = page.getByRole(role, { name }).first()
    await expect(control).toHaveCSS('border-top-style', 'solid')
    await expect(control).toHaveCSS('border-left-style', 'solid')
    expect(parseFloat(await control.evaluate((el) => getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0)
  }
  await boxed(/^Site:/, 'button')
  await boxed('Window length in days', 'spinbutton')
  await boxed('Observer height in metres', 'spinbutton')

  await closeDetails(page)

  // The three views are one control, and the chosen one is filled in.
  const views = page.locator('.views')
  await expect(views).toHaveCSS('border-top-style', 'solid')
  const chosen = views.getByRole('button', { name: 'From orbit' })
  const other = views.getByRole('button', { name: 'Map' })
  await expect(chosen).toHaveAttribute('aria-pressed', 'true')
  const fill = (button: typeof chosen) => button.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await fill(chosen)).not.toBe(await fill(other))
})

test('the statements are set in the serif, the numbers inside them in the mono', async ({ page }) => {
  await page.goto('/')
  const statement = page.getByRole('heading', { level: 1 })
  await expect(statement).toBeVisible()
  expect(await statement.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Instrument Serif/)
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.fonts.check('32px "Instrument Serif"'))).toBe(true)
  const number = statement.locator('b')
  if (await number.count()) {
    expect(await number.first().evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/IBM Plex Mono/)
  }
})
