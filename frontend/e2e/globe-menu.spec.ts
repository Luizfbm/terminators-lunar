import { expect, test, type Page } from '@playwright/test'

// The menu on the left of the globe: two level buttons on top (exclusive, in step with the view buttons under
// the stage), a rule, and six push buttons. What the Moon-turning buttons and the two switches do is in
// globe-land and globe-layers; here it is which button is pressed.
test.use({ locale: 'en-US' })

const LEVELS = ['Explore the Moon', 'South Pole in detail']
const BUTTONS = ['Initial position', 'Dark side', 'Northern Hemisphere', 'Southern Hemisphere', 'Lunar Missions', 'Sites']
const LABELS = [...LEVELS, ...BUTTONS]
/** The buttons pressed when the page opens: the level of the orbit view and the Artemis Sites. */
const OPENS_PRESSED = ['Explore the Moon', 'Sites']
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const pressed = async (page: Page, name: string) => (await button(page, name).getAttribute('aria-pressed')) === 'true'

test('has the eight buttons, in English and in this order, with only Explore the Moon and Sites pressed', async ({ page }) => {
  await page.goto('/')
  const menu = page.getByRole('group', { name: 'Globe menu' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button')).toHaveText(LABELS)
  for (const label of LABELS) await expect(button(page, label)).toHaveAttribute('aria-pressed', OPENS_PRESSED.includes(label) ? 'true' : 'false')
})

test('a click presses a button and the next releases it, and no other button changes', async ({ page }) => {
  await page.goto('/')
  await button(page, 'Dark side').click()
  expect(await pressed(page, 'Dark side')).toBe(true)
  for (const other of LABELS.filter((label) => label !== 'Dark side')) expect(await pressed(page, other)).toBe(OPENS_PRESSED.includes(other))
  await button(page, 'Dark side').click()
  expect(await pressed(page, 'Dark side')).toBe(false)
  await button(page, 'Sites').click()
  expect(await pressed(page, 'Sites')).toBe(false)
  await button(page, 'Sites').click()
  expect(await pressed(page, 'Sites')).toBe(true)
})

test('Space and Enter press and release a button from the keyboard', async ({ page }) => {
  await page.goto('/')
  await button(page, 'Northern Hemisphere').focus()
  await page.keyboard.press('Space')
  expect(await pressed(page, 'Northern Hemisphere')).toBe(true)
  await page.keyboard.press('Enter')
  expect(await pressed(page, 'Northern Hemisphere')).toBe(false)
})

test('has the colours of the reference: taupe when released, dark and sunk when pressed', async ({ page }) => {
  await page.goto('/')
  await expect(button(page, 'Lunar Missions')).toHaveCSS('background-color', 'rgb(133, 123, 108)')
  await expect(button(page, 'Lunar Missions')).toHaveCSS('color', 'rgb(31, 20, 20)')
  await expect(button(page, 'Sites')).toHaveCSS('background-color', 'rgb(70, 65, 57)')
  await expect(button(page, 'Sites')).toHaveCSS('color', 'rgb(142, 142, 142)')
  await expect(page.getByRole('group', { name: 'Globe menu' })).toHaveCSS('background-color', 'rgba(60, 60, 60, 0.72)')
})

test('sits in the very top left corner of the globe, at 85% of a fifth of the window, in Orbitron on one line', async ({ page }) => {
  await page.setViewportSize({ width: 1820, height: 820 })
  await page.goto('/')
  const menu = page.getByRole('group', { name: 'Globe menu' })
  const box = (await menu.boundingBox())!
  const globe = (await page.locator('.globe').first().boundingBox())!
  // Right in the corner, at 85% of 20vw of 1820 px (about 309 px).
  expect(box.x - globe.x).toBeCloseTo(0, 0)
  expect(box.y - globe.y).toBeCloseTo(0, 0)
  expect(box.width).toBeGreaterThan(295)
  expect(box.width).toBeLessThan(325)
  await expect(menu).toHaveCSS('border-top-left-radius', '8.5px')
  await expect(menu).toHaveCSS('border-bottom-right-radius', '8.5px')
  for (const label of LABELS) {
    const one = button(page, label)
    const own = (await one.boundingBox())!
    expect(own.height).toBeGreaterThanOrEqual(40)
    // All eight fit inside the stage: the menu is not cut off at the bottom.
    expect(own.y + own.height).toBeLessThanOrEqual(globe.y + globe.height)
    await expect(one).toHaveCSS('font-weight', '600')
    await expect(one).toHaveCSS('white-space', 'nowrap')
    expect(await one.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await expect(button(page, 'Sites')).toHaveCSS('font-family', /Orbitron/)
})

test('the three buttons that turn the Moon release one another, and Sites and Missions stay their own', async ({ page }) => {
  await page.goto('/')
  await button(page, 'Lunar Missions').click()
  await button(page, 'Southern Hemisphere').click()
  expect(await pressed(page, 'Southern Hemisphere')).toBe(true)
  await button(page, 'Northern Hemisphere').click()
  expect(await pressed(page, 'Northern Hemisphere')).toBe(true)
  expect(await pressed(page, 'Southern Hemisphere')).toBe(false)
  await button(page, 'Dark side').click()
  expect(await pressed(page, 'Dark side')).toBe(true)
  expect(await pressed(page, 'Northern Hemisphere')).toBe(false)
  // Missions and Sites were not touched by any of it.
  expect(await pressed(page, 'Lunar Missions')).toBe(true)
  expect(await pressed(page, 'Sites')).toBe(true)
})

// The levels: the context of the stage, in step with the view buttons under it.
const view = (page: Page, name: 'From orbit' | 'Map' | 'From the ground') => page.locator('.views').getByRole('button', { name, exact: true })
const levelPressed = (page: Page) => page.locator('[aria-label="Level"] button[aria-pressed="true"]')

test('a rule separates the two levels from the six buttons below', async ({ page }) => {
  await page.goto('/')
  const rule = page.getByRole('group', { name: 'Globe menu' }).getByRole('separator')
  await expect(rule).toBeVisible()
  const [levels, line, first] = await Promise.all([button(page, 'South Pole in detail').boundingBox(), rule.boundingBox(), button(page, 'Initial position').boundingBox()])
  expect(line!.y).toBeGreaterThanOrEqual(levels!.y + levels!.height)
  expect(line!.y + line!.height).toBeLessThanOrEqual(first!.y)
})

test('the levels are exclusive: pressing one releases the other, and pressing the pressed one does nothing', async ({ page }) => {
  await page.goto('/')
  await button(page, 'South Pole in detail').click()
  expect(await pressed(page, 'South Pole in detail')).toBe(true)
  expect(await pressed(page, 'Explore the Moon')).toBe(false)
  // Pressed again, it stays pressed.
  await button(page, 'South Pole in detail').click()
  expect(await pressed(page, 'South Pole in detail')).toBe(true)
  expect(await pressed(page, 'Explore the Moon')).toBe(false)
  await button(page, 'Explore the Moon').click()
  expect(await pressed(page, 'Explore the Moon')).toBe(true)
  expect(await pressed(page, 'South Pole in detail')).toBe(false)
  await button(page, 'Explore the Moon').click()
  expect(await pressed(page, 'Explore the Moon')).toBe(true)
})

test('a level takes the stage to its view, and the view buttons press the level back', async ({ page }) => {
  await page.goto('/')
  await expect(view(page, 'From orbit')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'orbit')
  await button(page, 'South Pole in detail').click()
  await expect(view(page, 'Map')).toHaveAttribute('aria-pressed', 'true')
  await expect(view(page, 'From orbit')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
  await expect(page).toHaveURL(/view=map/)
  // The other way round: the view button under the stage presses the level.
  await view(page, 'From orbit').click()
  await expect(button(page, 'Explore the Moon')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'South Pole in detail')).toHaveAttribute('aria-pressed', 'false')
  await view(page, 'Map').click()
  await expect(button(page, 'South Pole in detail')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'Explore the Moon')).toHaveAttribute('aria-pressed', 'false')
})

test('on the map the menu has only the two levels, and the buttons of the orbit are back when you return', async ({ page }) => {
  await page.goto('/?view=map')
  const menu = page.getByRole('group', { name: 'Globe menu' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button')).toHaveText(LEVELS)
  await expect(button(page, 'South Pole in detail')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'Explore the Moon')).toHaveAttribute('aria-pressed', 'false')
  await button(page, 'Explore the Moon').click()
  await expect(menu.getByRole('button')).toHaveText(LABELS)
  // What was pressed before is as it was: Sites pressed, the level of the orbit pressed.
  for (const label of LABELS) await expect(button(page, label)).toHaveAttribute('aria-pressed', OPENS_PRESSED.includes(label) ? 'true' : 'false')
})

test('on the ground neither level is pressed, and coming back from it presses Explore the Moon again', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await view(page, 'From the ground').click()
  await expect(page.locator('.stage__ground')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.stage__globe')).toBeHidden()
  // The menu is under the hidden globe; its state is still the one the app is in.
  await expect(levelPressed(page)).toHaveCount(0)
  await view(page, 'From orbit').click()
  await expect(page.locator('.stage__globe')).toBeVisible()
  await expect(levelPressed(page)).toHaveCount(1)
  await expect(button(page, 'Explore the Moon')).toHaveAttribute('aria-pressed', 'true')
})

test('the double click on the map still asks about that point after going there by the level button', async ({ page }) => {
  await page.goto('/')
  await button(page, 'South Pole in detail').click()
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
  // The grid names its meridians once the camera has settled over the pole.
  await expect(page.locator('.globe__grid span').first()).toBeVisible({ timeout: 10_000 })
  const box = (await page.locator('.globe canvas').boundingBox())!
  const asked = page.waitForRequest((request) => request.url().includes('/visibility?') && request.url().includes('latitude_deg='))
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  const url = new URL((await asked).url())
  expect(Number(url.searchParams.get('latitude_deg'))).toBeLessThan(-89)
  expect(url.searchParams.get('site_id')).toBeNull()
})
