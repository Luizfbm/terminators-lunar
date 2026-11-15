import { expect, test, type Page } from '@playwright/test'

// "Land here": an orange dot under the cursor on the Moon and a bubble beside it. The click only says
// where, for now: the hook writes `[land] {"lat":..,"lon":..}` to the console.

// The words are English in both languages, like the menu.
test.use({ locale: 'pt-BR' })

const canvas = (page: Page) => page.locator('.globe canvas')
const layer = (page: Page) => page.locator('.globe-land')

async function open(page: Page) {
  const landings: string[] = []
  page.on('console', (message) => {
    if (message.text().startsWith('[land]')) landings.push(message.text())
  })
  await page.goto('/')
  await expect(canvas(page)).toHaveAttribute('data-ready', 'true')
  const box = (await canvas(page).boundingBox())!
  return { landings, box, middle: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
}

test('the dot and the bubble appear under the mouse over the Moon, and go when it leaves for space', async ({ page }) => {
  const { box, middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await expect(layer(page)).toBeVisible()
  await expect(page.locator('.globe-land__dot')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Land here' })).toContainText('Land')
  // Far left of the stage there is only space.
  await page.mouse.move(box.x + 6, middle.y)
  await expect(layer(page)).toBeHidden()
})

test('they go while the Moon is dragged and come back when the mouse is let go', async ({ page }) => {
  const { middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await expect(layer(page)).toBeVisible()
  await page.mouse.down()
  await page.mouse.move(middle.x + 60, middle.y + 10, { steps: 6 })
  await expect(layer(page)).toBeHidden()
  await page.mouse.up()
  await page.mouse.move(middle.x + 62, middle.y + 12)
  await expect(layer(page)).toBeVisible()
})

test('a click without dragging calls the landing hook once, with a numeric latitude and longitude', async ({ page }) => {
  const { landings, middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await expect(layer(page)).toBeVisible()
  await page.mouse.down()
  await page.mouse.up()
  await expect.poll(() => landings.length).toBe(1)
  const place = JSON.parse(landings[0].replace('[land] ', ''))
  expect(typeof place.lat).toBe('number')
  expect(typeof place.lon).toBe('number')
  expect(Math.abs(place.lat)).toBeLessThanOrEqual(90)
  expect(Math.abs(place.lon)).toBeLessThanOrEqual(180)
})

test('a click that ends a drag does not land', async ({ page }) => {
  const { landings, middle } = await open(page)
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 50, middle.y + 5, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  expect(landings).toHaveLength(0)
})

test('near a Site the dot snaps to it and the bubble gives its name', async ({ page }) => {
  const { middle } = await open(page)
  // Over the south pole the chosen Site, Connecting Ridge, is on the near side.
  await page.getByRole('button', { name: 'Southern Hemisphere', exact: true }).click()
  await page.waitForTimeout(2400)
  const ring = page.locator('.globe__chosen')
  await expect(ring).toBeVisible()
  const spot = (await ring.boundingBox())!
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.move(spot.x + spot.width / 2 + 4, spot.y + spot.height / 2 + 3)
  await expect(page.locator('.globe-land__site')).toContainText('Connecting Ridge')
})
