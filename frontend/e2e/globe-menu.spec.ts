import { expect, test, type Page } from '@playwright/test'

// The menu on the left of the globe: two level buttons on top (exclusive, in step with the view buttons under
// the stage), a rule, and seven push buttons. What the Moon-turning buttons and the switches do is in
// globe-layers and globe-planets; here it is which button is pressed.
test.use({ locale: 'en-US' })

const LEVELS = ['Explore the Moon', 'South Pole in detail']
const BUTTONS = ['Initial position', 'Dark side', 'Northern Hemisphere', 'Southern Hemisphere', 'Lunar Missions', 'Sites', 'Planets']
// #149 adds a third level button under the two, in the same group.
const LEVEL3 = 'Level 3 · Explore'
const LABELS = [...LEVELS, LEVEL3, ...BUTTONS]
/** The buttons pressed when the page opens: the level of the orbit view, Sites and Planets. Lunar Missions starts released. */
const OPENS_PRESSED = ['Explore the Moon', 'Sites', 'Planets']
/** On the polar map the menu keeps the two levels and the two switches of the dots. */
const MAP_LABELS = [...LEVELS, LEVEL3, 'Lunar Missions', 'Sites']
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const pressed = async (page: Page, name: string) => (await button(page, name).getAttribute('aria-pressed')) === 'true'

test('has the ten buttons, in English and in this order, with Explore the Moon, Sites and Planets pressed', async ({ page }) => {
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
  await expect(button(page, 'Dark side')).toHaveCSS('background-color', 'rgb(133, 123, 108)')
  // The words are black and light grey, not #1f1414 and #8e8e8e: those were under WCAG AA's 4.5:1 on
  // these backgrounds (accessibility.spec.ts).
  await expect(button(page, 'Dark side')).toHaveCSS('color', 'rgb(0, 0, 0)')
  await expect(button(page, 'Sites')).toHaveCSS('background-color', 'rgb(70, 65, 57)')
  await expect(button(page, 'Sites')).toHaveCSS('color', 'rgb(189, 189, 189)')
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
    // All ten fit inside the stage: the menu is not cut off at the bottom.
    expect(own.y + own.height).toBeLessThanOrEqual(globe.y + globe.height)
    await expect(one).toHaveCSS('font-weight', '600')
    await expect(one).toHaveCSS('white-space', 'nowrap')
    expect(await one.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await expect(button(page, 'Sites')).toHaveCSS('font-family', /Orbitron/)
})

test('the buttons that turn the Moon release one another, and the three switches stay their own', async ({ page }) => {
  await page.goto('/')
  await button(page, 'Southern Hemisphere').click()
  expect(await pressed(page, 'Southern Hemisphere')).toBe(true)
  await button(page, 'Northern Hemisphere').click()
  expect(await pressed(page, 'Northern Hemisphere')).toBe(true)
  expect(await pressed(page, 'Southern Hemisphere')).toBe(false)
  await button(page, 'Dark side').click()
  expect(await pressed(page, 'Dark side')).toBe(true)
  expect(await pressed(page, 'Northern Hemisphere')).toBe(false)
  // The three switches were not touched by any of it.
  expect(await pressed(page, 'Lunar Missions')).toBe(false)
  expect(await pressed(page, 'Sites')).toBe(true)
  expect(await pressed(page, 'Planets')).toBe(true)
})

test('Initial position turns the camera back to the opening framing, never over the point under the Sun', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.globe')).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
  const camera = (state: string) => page.locator('.globe').evaluate((element, name) => Number(element.getAttribute(`data-${name}`)), state)
  await expect.poll(() => camera('camera-distance'), { timeout: 30_000 }).toBeGreaterThan(0)
  await button(page, 'Northern Hemisphere').click()
  await expect.poll(() => camera('camera-polar'), { timeout: 15_000 }).toBeLessThan(5)
  await button(page, 'Initial position').click()
  // The opening framing is on the side of the Site, at 5 Moon radii, and well off the north pole.
  await expect.poll(() => camera('camera-polar'), { timeout: 15_000 }).toBeGreaterThan(40)
  await expect.poll(() => camera('camera-distance'), { timeout: 15_000 }).toBeGreaterThan(4.9)
  expect(await camera('camera-distance')).toBeLessThanOrEqual(6)
})

test('on a 375 px phone the menu folds into a button in the corner, and opens clear of the view buttons', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const panel = page.getByRole('group', { name: 'Globe menu' })
  const toggle = page.getByRole('button', { name: 'Menu', exact: true })
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(panel).toBeHidden()
  const globe = (await page.locator('.globe').first().boundingBox())!
  const folded = (await toggle.boundingBox())!
  expect(folded.x).toBeGreaterThanOrEqual(globe.x)
  expect(folded.width).toBeLessThanOrEqual(48)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(panel).toBeVisible()
  const open = (await panel.boundingBox())!
  const views = (await page.locator('.views').boundingBox())!
  // Inside the picture, and not over the buttons for the three views, which are below it on a phone.
  expect(open.x + open.width).toBeLessThanOrEqual(globe.x + globe.width)
  expect(open.y + open.height).toBeLessThanOrEqual(globe.y + globe.height + 1)
  expect(open.y + open.height).toBeLessThanOrEqual(views.y)
  // A button that turns the Moon folds it again.
  await button(page, 'Dark side').click()
  await expect(panel).toBeHidden()
})

test('on a wide screen the menu stops above the view buttons and the map caption starts beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeHidden()
  const panel = page.getByRole('group', { name: 'Globe menu' })
  const views = (await page.locator('.views').boundingBox())!
  const open = (await panel.boundingBox())!
  expect(open.y + open.height).toBeLessThanOrEqual(views.y)
  await button(page, 'South Pole in detail').click()
  const caption = page.locator('.stage__caption')
  await expect(caption).toBeVisible({ timeout: 15_000 })
  const side = (await caption.boundingBox())!
  const levels = (await panel.boundingBox())!
  expect(side.x).toBeGreaterThanOrEqual(levels.x + levels.width)
})

// The levels: the context of the stage, in step with the view buttons under it.
const view = (page: Page, name: 'From orbit' | 'Map' | 'From the ground') => page.locator('.views').getByRole('button', { name, exact: true })
const levelPressed = (page: Page) => page.locator('[aria-label="Level"] button[aria-pressed="true"]')

test('a rule separates the two levels from the seven buttons below', async ({ page }) => {
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

// Regression (2026-11-15): on the map the menu had only the two levels, so Sites and Lunar Missions could not be switched there.
test('on the map the menu has the two levels and the two switches of the dots, and the buttons of the orbit are back when you return', async ({ page }) => {
  await page.goto('/?view=map')
  const menu = page.getByRole('group', { name: 'Globe menu' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button')).toHaveText(MAP_LABELS)
  await expect(button(page, 'South Pole in detail')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'Explore the Moon')).toHaveAttribute('aria-pressed', 'false')
  await button(page, 'Explore the Moon').click()
  await expect(menu.getByRole('button')).toHaveText(LABELS)
  // What was pressed before is as it was: Sites and Planets pressed, the level of the orbit pressed.
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
