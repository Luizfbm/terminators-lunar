import { expect, test, type Page } from '@playwright/test'
import { settle, tipTo, turn, zoomAllTheWay } from './orbit'

// The "Planets" switch of the globe menu: it shows and hides the planets of the sky behind the Moon (the points
// and their names, ADR 0007) and nothing else. The globe says which planets are on the stage in `data-planets`
// and which carry a name in `data-planet-names`. It also checks what the marks of the Moon (the Equator, the circle
// at 84 S, the dots and the letters N and S of the poles) and the menu keep clear of.
test.use({ locale: 'en-US' })
test.describe.configure({ timeout: 300_000 })

const globe = (page: Page) => page.locator('.globe')
const planets = async (page: Page) => (await globe(page).getAttribute('data-planets')) ?? ''
const names = async (page: Page) => (await globe(page).getAttribute('data-planet-names')) ?? ''
const press = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click()

/** Goes round the Moon, as far out as the orbit lets the camera go, until a planet is named. */
async function findNamedPlanet(page: Page) {
  await page.goto('/')
  await expect(globe(page)).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
  await settle(page)
  await zoomAllTheWay(page, 'out')
  search: for (const polar of [90, 70, 110, 50, 130]) {
    await tipTo(page, polar)
    for (let step = 0; step < 24; step++) {
      if ((await names(page)) !== '') break search
      await turn(page, 15)
    }
  }
  expect(await names(page)).not.toBe('')
}

test('Planets is pressed when the page opens, and releasing it hides the planets and their names, pressing it brings them back', async ({ page }) => {
  await findNamedPlanet(page)
  const on = await planets(page)
  await expect(page.getByRole('button', { name: 'Planets', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.globe__planets span:not([hidden])').first()).toBeVisible()

  await press(page, 'Planets')
  await expect(page.getByRole('button', { name: 'Planets', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(globe(page)).toHaveAttribute('data-planets', '')
  await expect(globe(page)).toHaveAttribute('data-planet-names', '')
  await expect(page.locator('.globe__planets span:not([hidden])')).toHaveCount(0)

  await press(page, 'Planets')
  await expect.poll(() => planets(page)).toBe(on)
  await expect(page.locator('.globe__planets span:not([hidden])').first()).toBeVisible()
})

test('Planets does not touch the Sun, the Earth or the dots of the Sites', async ({ page }) => {
  await page.goto('/')
  await expect(globe(page)).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
  await settle(page)
  const dots = await page.locator('.globe canvas').getAttribute('data-dots')
  await press(page, 'Planets')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-dots', dots ?? '')
  // The two switches of the dots stay as they opened: Sites pressed, Lunar Missions released (Larissa's layer
  // rules, domain/siteLayers.ts), and pressing Planets moves neither.
  await expect(page.getByRole('button', { name: 'Sites', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Lunar Missions', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('a planet\'s name never covers the menu, the Site\'s name or the view buttons', async ({ page }) => {
  await findNamedPlanet(page)
  const menu = (await page.locator('.globe-menu').boundingBox())!
  const others = ['.globe__pin', '.stage__foot .views']
  for (const box of await page.locator('.globe__planets span:not([hidden])').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()))) {
    const apart = (against: { x: number; y: number; width: number; height: number }) =>
      box.right <= against.x || against.x + against.width <= box.left || box.bottom <= against.y || against.y + against.height <= box.top
    expect(apart(menu), "a planet's name over the menu").toBe(true)
    for (const other of others) {
      const against = await page.locator(other).first().boundingBox()
      if (against) expect(apart(against), `a planet's name over ${other}`).toBe(true)
    }
  }
})

test('the marks of the Moon are drawn in the scene from orbit, and not on the map', async ({ page }) => {
  await page.goto('/')
  await expect(globe(page)).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
  await expect(globe(page)).toHaveAttribute('data-marks', 'on')
  await press(page, 'South Pole in detail')
  await expect(globe(page)).toHaveAttribute('data-marks', 'off')
  await press(page, 'Explore the Moon')
  await expect(globe(page)).toHaveAttribute('data-marks', 'on')
})

test('a letter of a pole is never over the Sun or the Earth', async ({ page }) => {
  await page.goto('/')
  await expect(globe(page)).toHaveAttribute('data-dressed', 'true', { timeout: 20_000 })
  await settle(page)
  await zoomAllTheWay(page, 'out')
  // Turned round the Moon, the letters and the two bodies come near one another now and then.
  for (const polar of [90, 60, 120]) {
    await tipTo(page, polar)
    for (let step = 0; step < 12; step++) {
      const state = await globe(page).evaluate((element) => {
        // A body off the stage or behind the Moon has empty attributes: it is not in the list.
        const bodies = ['sun', 'earth']
          .map((name) => [element.getAttribute(`data-${name}-x`), element.getAttribute(`data-${name}-y`), element.getAttribute(`data-${name}-r`)])
          .filter((values) => values.every((value) => value !== null && value !== ''))
          .map(([x, y, r]) => ({ x: Number(x), y: Number(y), r: Number(r) }))
        const host = element.getBoundingClientRect()
        const letters = [...element.querySelectorAll<SVGGElement>('.globe__poles g')]
          .filter((group) => group.style.display !== 'none')
          .map((group) => group.querySelector('text')!.getBoundingClientRect())
          .map((box) => ({ x: box.left + box.width / 2 - host.left, y: box.top + box.height / 2 - host.top, half: Math.min(box.width, box.height) / 2 }))
        return { bodies, letters }
      })
      for (const letter of state.letters) {
        for (const body of state.bodies) expect(Math.hypot(letter.x - body.x, letter.y - body.y), 'a letter over a body of the sky').toBeGreaterThanOrEqual(body.r)
      }
      await turn(page, 30)
    }
  }
})
