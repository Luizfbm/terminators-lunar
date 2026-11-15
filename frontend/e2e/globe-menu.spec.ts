import { expect, test, type Page } from '@playwright/test'

// The menu on the left of the globe: two level buttons on top (exclusive, in step with the view buttons under
// the stage), a rule, seven push buttons, and at the foot, after a second rule, what the top bar used to hold:
// Guide, Ask, About, Proof and the two languages. What the Moon-turning buttons and the switches do is in
// globe-layers and globe-planets; here it is which button is pressed. On the map only the levels and the app's
// own items are shown, and on the view from the ground and the Proof page a solo menu in the top left corner
// carries the same ones.
test.use({ locale: 'en-US' })

const LEVELS = ['Explore the Moon', 'South Pole in detail']
const BUTTONS = ['Initial position', 'Dark side', 'Northern Hemisphere', 'Southern Hemisphere', 'Lunar Missions', 'Sites', 'Planets']
const LABELS = [...LEVELS, ...BUTTONS]
/** The app's own items at the foot of the menu, in English in both languages; the language buttons read "PT" and "EN". */
const APP_ITEMS = ['Guide', 'Ask', 'About', 'Proof']
const LANGUAGES = ['PT', 'EN']
const APP_TEXT = [...APP_ITEMS, ...LANGUAGES]
/** The same, by accessible name: the language buttons carry the name of the language too. */
const APP_NAMES = [...APP_ITEMS, 'PT Português', 'EN English']
/** The buttons pressed when the page opens: the level of the orbit view and the three switches. */
const OPENS_PRESSED = ['Explore the Moon', 'Lunar Missions', 'Sites', 'Planets']
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const pressed = async (page: Page, name: string) => (await button(page, name).getAttribute('aria-pressed')) === 'true'

test('has the nine buttons and the six app items, in English and in this order, with Explore the Moon and the three switches pressed', async ({ page }) => {
  await page.goto('/')
  const menu = page.getByRole('group', { name: 'Globe menu' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button')).toHaveText([...LABELS, ...APP_TEXT])
  for (const label of LABELS) await expect(button(page, label)).toHaveAttribute('aria-pressed', OPENS_PRESSED.includes(label) ? 'true' : 'false')
  // The app's items: Proof and the language of the page (en-US) say whether they are pressed; Ask whether its sheet is open.
  await expect(button(page, 'Proof')).toHaveAttribute('aria-pressed', 'false')
  await expect(button(page, 'Ask')).toHaveAttribute('aria-expanded', 'false')
  await expect(button(page, 'EN English')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'PT Português')).toHaveAttribute('aria-pressed', 'false')
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
  await expect(button(page, 'Dark side')).toHaveCSS('color', 'rgb(31, 20, 20)')
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
  // The app's items make the menu taller than this stage: it scrolls instead of being cut.
  await expect(menu).toHaveCSS('overflow-y', 'auto')
  const panel = (await menu.boundingBox())!
  expect(panel.y + panel.height).toBeLessThanOrEqual(globe.y + globe.height)
  for (const name of APP_NAMES) {
    const one = button(page, name)
    await one.scrollIntoViewIfNeeded()
    const own = (await one.boundingBox())!
    expect(own.height).toBeGreaterThanOrEqual(40)
    // Reached by scrolling, each is inside the panel and not clipped on the sides.
    expect(own.y).toBeGreaterThanOrEqual(panel.y - 1)
    expect(own.y + own.height).toBeLessThanOrEqual(panel.y + panel.height + 1)
    expect(own.x).toBeGreaterThanOrEqual(panel.x)
    expect(own.x + own.width).toBeLessThanOrEqual(panel.x + panel.width + 1)
    await expect(one).toHaveCSS('font-weight', '600')
    await expect(one).toHaveCSS('white-space', 'nowrap')
    expect(await one.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
  await menu.evaluate((element) => element.scrollTo({ top: 0 }))
  for (const label of LABELS) {
    const one = button(page, label)
    const own = (await one.boundingBox())!
    expect(own.height).toBeGreaterThanOrEqual(40)
    // All nine fit inside the stage: the menu is not cut off at the bottom.
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
  expect(await pressed(page, 'Lunar Missions')).toBe(true)
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
  // The app's items are in the folded panel too.
  for (const name of APP_NAMES) await expect(button(page, name)).toBeAttached()
  // A button that turns the Moon folds it again.
  await button(page, 'Dark side').click()
  await expect(panel).toBeHidden()
  // So does a choice of language.
  await toggle.click()
  await expect(panel).toBeVisible()
  await button(page, 'PT Português').click()
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

test('a rule separates the two levels from the seven buttons below, and a second one the seven from the app items', async ({ page }) => {
  await page.goto('/')
  const rules = page.getByRole('group', { name: 'Globe menu' }).getByRole('separator')
  await expect(rules).toHaveCount(2)
  const rule = rules.first()
  await expect(rule).toBeVisible()
  const [levels, line, first] = await Promise.all([button(page, 'South Pole in detail').boundingBox(), rule.boundingBox(), button(page, 'Initial position').boundingBox()])
  expect(line!.y).toBeGreaterThanOrEqual(levels!.y + levels!.height)
  expect(line!.y + line!.height).toBeLessThanOrEqual(first!.y)
  // The second rule sits between Planets and Guide. The menu scrolls at this height, so Guide is brought into view first.
  await button(page, 'Guide').scrollIntoViewIfNeeded()
  const [planets, second, guide] = await Promise.all([button(page, 'Planets').boundingBox(), rules.last().boundingBox(), button(page, 'Guide').boundingBox()])
  expect(second!.y).toBeGreaterThanOrEqual(planets!.y + planets!.height)
  expect(second!.y + second!.height).toBeLessThanOrEqual(guide!.y)
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

test('on the map the menu has only the two levels and the app items, and the buttons of the orbit are back when you return', async ({ page }) => {
  await page.goto('/?view=map')
  const menu = page.getByRole('group', { name: 'Globe menu' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button')).toHaveText([...LEVELS, ...APP_TEXT])
  await expect(button(page, 'South Pole in detail')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'Explore the Moon')).toHaveAttribute('aria-pressed', 'false')
  await button(page, 'Explore the Moon').click()
  await expect(menu.getByRole('button')).toHaveText([...LABELS, ...APP_TEXT])
  // What was pressed before is as it was: the three switches pressed, the level of the orbit pressed.
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

// The app's items, which used to be the top bar.
test('on the view from the ground a solo menu in the top left corner has the two levels and the app items, and neither level is pressed', async ({ page }) => {
  await page.goto('/?view=ground')
  await expect(page.locator('.sky canvas')).toHaveAttribute('data-ready', 'true')
  const menu = page.getByRole('group', { name: 'Globe menu' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button')).toHaveText([...LEVELS, ...APP_TEXT])
  await expect(levelPressed(page)).toHaveCount(0)
  const box = (await menu.boundingBox())!
  expect(box.x).toBeCloseTo(0, 0)
  expect(box.y).toBeCloseTo(0, 0)
  // A level takes the stage back to its view.
  await button(page, 'Explore the Moon').click()
  await expect(view(page, 'From orbit')).toHaveAttribute('aria-pressed', 'true')
  await expect(page).not.toHaveURL(/view=ground/)
})

test('Proof opens the Proof page, the menu stays in the corner with Proof pressed, and a level goes back to the answer', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await button(page, 'Proof').click()
  await expect(page).toHaveURL(/page=proof/)
  await expect(page.locator('.proof')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Globe menu' })).toBeVisible()
  await expect(button(page, 'Proof')).toHaveAttribute('aria-pressed', 'true')
  await expect(levelPressed(page)).toHaveCount(0)
  await button(page, 'Explore the Moon').click()
  await expect(page).not.toHaveURL(/page=proof/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.proof')).toHaveCount(0)
})

test('Guide and About from the menu bring the guide and the introduction back', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await button(page, 'Guide').click()
  const guide = page.getByRole('dialog', { name: 'Guide' })
  await expect(guide).toContainText('1 of 3')
  await guide.getByRole('button', { name: 'Skip' }).click()
  await expect(guide).toHaveCount(0)
  await button(page, 'About').click()
  await expect(page.getByRole('dialog', { name: 'Will your lander see the Sun?' })).toBeVisible()
})

test('Ask from the menu opens the assistant', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await button(page, 'Ask').click()
  await expect(button(page, 'Ask')).toHaveAttribute('aria-expanded', 'true')
})

test('the language buttons switch the language of the page and put it in the link', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await button(page, 'PT Português').click()
  await expect(button(page, 'PT Português')).toHaveAttribute('aria-pressed', 'true')
  await expect(button(page, 'EN English')).toHaveAttribute('aria-pressed', 'false')
  await expect(page).toHaveURL(/[?&]lang=pt/)
  await button(page, 'EN English').click()
  await expect(button(page, 'EN English')).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/[?&]lang=en/)
})
