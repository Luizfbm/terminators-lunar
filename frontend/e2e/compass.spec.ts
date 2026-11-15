import { expect, test, type Locator, type Page } from '@playwright/test'

// the requirement: from the ground, a round compass in the bottom-left corner of the 3D view. The index
// on top is where the view faces; the ring turns under it, from the same yaw as the camera.

const sky = (page: Page) => page.locator('.sky canvas')
const dial = (page: Page) => page.locator('.sky__dial')
const yaw = async (page: Page) => Number(await sky(page).getAttribute('data-yaw'))
/** The ring's turn, from its transform: minus the yaw, wrapped to 0–360. */
const ringTurn = async (page: Page) => {
  const transform = (await dial(page).locator('g').getAttribute('transform')) ?? ''
  const turn = Number(/rotate\((-?[\d.]+)\)/.exec(transform)?.[1])
  return ((turn % 360) + 360) % 360
}
const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const EN = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
const PT = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste']
const eighth = (azimuth: number) => Math.round((((azimuth % 360) + 360) % 360) / 45) % 8

async function open(page: Page) {
  await page.goto('/?view=ground')
  await expect(sky(page)).toHaveAttribute('data-ready', 'true')
  await expect(dial(page)).toBeVisible()
  // The view has finished easing onto the Sun.
  await expect.poll(async () => apart(await ringTurn(page), 360 - (await yaw(page)))).toBeLessThan(0.2)
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  expect(found).not.toBeNull()
  return found!
}

/** The letter drawn nearest the index at the top of the circle. */
async function topLetter(page: Page) {
  const letters = dial(page).locator('text')
  let best = { azimuth: -1, y: Infinity }
  for (let at = 0; at < (await letters.count()); at++) {
    const letter = letters.nth(at)
    const { y, height } = await box(letter)
    if (y + height / 2 < best.y) best = { azimuth: Number(await letter.getAttribute('data-azimuth')), y: y + height / 2 }
  }
  return best.azimuth
}

for (const viewport of [
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, locale: 'en-US' })

    test('the compass sits in the bottom-left of the 3D view and covers nothing else', async ({ page }) => {
      await open(page)
      const stage = await box(sky(page))
      const compass = await box(dial(page))
      // In the bottom-left quarter of the 3D view, inside it.
      expect(compass.x).toBeGreaterThanOrEqual(stage.x)
      expect(compass.x + compass.width).toBeLessThan(stage.x + stage.width / 2)
      expect(compass.y).toBeGreaterThan(stage.y + stage.height / 2)
      expect(compass.y + compass.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5)
      expect(compass.width).toBeCloseTo(viewport.width <= 480 ? 60 : 72, 0)
      for (const other of [page.locator('.sky__turn'), page.locator('.stage__caption'), page.locator('.ground-view__strip'), page.locator('.views'), page.locator('.classroom-open')]) {
        if (await other.isVisible()) expect(overlaps(compass, await box(other))).toBe(false)
      }
    })
  })
}

test.describe('in English', () => {
  test.use({ locale: 'en-US' })

  test('24 ticks and the eight letters, and the old floating direction words are gone', async ({ page }) => {
    await open(page)
    await expect(dial(page).locator('line')).toHaveCount(24)
    await expect(dial(page).locator('text')).toHaveText(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])
    await expect(page.locator('.sky__compass')).toHaveCount(0)
    await expect(page.locator('.sky')).not.toContainText(/north|south|east|west/i)
  })

  test('the ring turns 30° the other way after "Look right", and the letter under the index is the one the view faces', async ({ page }) => {
    await open(page)
    const before = await ringTurn(page)
    expect(await topLetter(page)).toBe(eighth(await yaw(page)) * 45)
    await page.getByRole('button', { name: 'Look right' }).click()
    await expect.poll(async () => apart(await ringTurn(page), (before + 330) % 360)).toBeLessThan(0.3)
    expect(apart(await ringTurn(page), 360 - (await yaw(page)))).toBeLessThan(0.1)
    expect(await topLetter(page)).toBe(eighth(await yaw(page)) * 45)
    // The letters stay upright: drawn with no rotation of their own.
    for (const transform of await dial(page).locator('text').evaluateAll((all) => all.map((letter) => letter.getAttribute('transform')))) {
      expect(transform).toBeNull()
    }
  })

  test('the accessible name says the eighth the view faces, and follows it', async ({ page }) => {
    await open(page)
    const start = eighth(await yaw(page))
    await expect(page.getByRole('img', { name: `Looking ${EN[start]}` })).toBeVisible()
    // Three steps of 30° is two eighths and a bit: the name moves on.
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Look right' }).click()
    await expect.poll(async () => eighth(await yaw(page))).not.toBe(start)
    await expect.poll(async () => apart(await ringTurn(page), 360 - (await yaw(page)))).toBeLessThan(0.1)
    await expect(page.getByRole('img', { name: `Looking ${EN[eighth(await yaw(page))]}` })).toBeVisible()
  })
})

test.describe('in Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('the letters and the name are in Portuguese', async ({ page }) => {
    await open(page)
    await expect(dial(page).locator('text')).toHaveText(['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'])
    await expect(page.getByRole('img', { name: `Olhando para o ${PT[eighth(await yaw(page))]}` })).toBeVisible()
  })
})
