import { expect, test } from './classic'
import type { Page } from '@playwright/test'

// the requirement: the cover of the first visit and the three-step guide. Every other test runs in a
// browser that has already seen the cover (playwright.config.ts); these start from an empty one.

test.use({ storageState: { cookies: [], origins: [] }, locale: 'en-US' })

const cover = (page: Page) => page.getByRole('dialog', { name: 'Will your lander see the Sun?' })
const guide = (page: Page) => page.getByRole('dialog', { name: 'Guide' })

test('the plain address opens on the cover: the question and two ways in', async ({ page }) => {
  await page.goto('/')
  await expect(cover(page)).toBeVisible()
  await expect(cover(page).getByRole('heading', { level: 1 })).toHaveText('Will your lander see the Sun?')
  await expect(cover(page).getByText('a single ridge can hide it')).toBeVisible()
  await expect(cover(page).getByRole('button', { name: 'Start' })).toBeFocused()
  await expect(cover(page).getByRole('button', { name: 'See a real landing' })).toBeVisible()
  // The app waits behind it, out of reach of the mouse and the keyboard.
  for (const part of ['.stage', 'main.answer', 'footer.strip']) {
    expect(await page.locator(part).evaluate((el) => (el as HTMLElement).inert)).toBe(true)
  }
  // The language can still be changed from here.
  await page.getByRole('button', { name: 'PT Português' }).click()
  await expect(page.getByRole('heading', { name: 'Seu módulo vai ver o Sol?' })).toBeVisible()
})

test('Start closes the cover and walks through three tips, each with a ring around what it names', async ({ page }) => {
  await page.goto('/')
  await cover(page).getByRole('button', { name: 'Start' }).click()
  await expect(cover(page)).toHaveCount(0)
  expect(await page.locator('main.answer').evaluate((el) => (el as HTMLElement).inert)).toBe(false)

  await expect(guide(page)).toContainText('1 of 3')
  await expect(guide(page)).toContainText('This is the Site.')
  await expect(page.locator('.where button.site')).toHaveAttribute('data-guide', 'true')

  await guide(page).getByRole('button', { name: 'Next' }).click()
  await expect(guide(page)).toContainText('2 of 3')
  await expect(guide(page)).toContainText('Drag the Cursor or press play')
  await expect(page.locator('footer.strip')).toHaveAttribute('data-guide', 'true')
  await expect(page.locator('.where button.site')).not.toHaveAttribute('data-guide', 'true')

  await guide(page).getByRole('button', { name: 'Next' }).click()
  await expect(guide(page)).toContainText('3 of 3')
  await expect(guide(page)).toContainText('From the ground')
  await expect(page.locator('.views')).toHaveAttribute('data-guide', 'true')

  await guide(page).getByRole('button', { name: 'Done' }).click()
  await expect(guide(page)).toHaveCount(0)
  await expect(page.locator('[data-guide]')).toHaveCount(0)

  // Once seen, the cover does not come back on the next visit.
  await page.goto('/')
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
  await expect(cover(page)).toHaveCount(0)
})

test('a link with a Query goes straight to its answer, with no cover', async ({ page }) => {
  await page.goto('/?view=map')
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
  await expect(cover(page)).toHaveCount(0)
})

test('"See a real landing" closes the cover and opens the IM-2 landing', async ({ page }) => {
  await page.goto('/')
  const asked = page.waitForRequest((request) => new URL(request.url()).searchParams.get('site_id') === 'IM2')
  await cover(page).getByRole('button', { name: 'See a real landing' }).click()
  expect(new URL((await asked).url()).searchParams.get('start')).toBe('2025-03-06T00:00:00Z')
  await expect(cover(page)).toHaveCount(0)
  await expect(page).toHaveURL(/site=IM2/)
})

test('Escape closes the cover; About brings it back; Guide opens the tips and Skip leaves them', async ({ page }) => {
  await page.goto('/')
  await expect(cover(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(cover(page)).toHaveCount(0)

  await page.getByRole('button', { name: 'About', exact: true }).click()
  await expect(cover(page)).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Guide' }).click()
  await expect(guide(page)).toContainText('1 of 3')
  await guide(page).getByRole('button', { name: 'Skip' }).click()
  await expect(guide(page)).toHaveCount(0)
})

test.describe('in a Portuguese browser', () => {
  test.use({ locale: 'pt-BR' })

  test('the cover and the guide are in Portuguese', async ({ page }) => {
    await page.goto('/')
    const capa = page.getByRole('dialog', { name: 'Seu módulo vai ver o Sol?' })
    await expect(capa.getByText('um único morro pode escondê-lo')).toBeVisible()
    await capa.getByRole('button', { name: 'Começar' }).click()
    const guia = page.getByRole('dialog', { name: 'Guia' })
    await expect(guia).toContainText('1 de 3')
    await expect(guia).toContainText('Este é o Local.')
  })
})

test.describe('on a phone, 390 px wide', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the cover and each tip fit the screen', async ({ page }) => {
    await page.goto('/')
    const inside = async (selector: string) => {
      const box = (await page.locator(selector).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(390)
      expect(box.y + box.height).toBeLessThanOrEqual(844)
    }
    await inside('.cover__text')
    await cover(page).getByRole('button', { name: 'Start' }).click()
    for (const step of ['1 of 3', '2 of 3', '3 of 3']) {
      await expect(guide(page)).toContainText(step)
      await inside('.guide')
      if (step !== '3 of 3') await guide(page).getByRole('button', { name: 'Next' }).click()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})
