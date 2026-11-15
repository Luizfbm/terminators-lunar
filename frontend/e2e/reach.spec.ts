import { expect, test } from './classic'
import type { Page } from '@playwright/test'

// The Prism mock answers every Query with Connecting Ridge CR01 from 20 Nov 2026 12:00 UTC: the Sun sets
// behind the rim of Shackleton, 4.6 km away, and the Earth sets behind Mons Malapert, 134 km away.
// The engine walks the terrain out to 300 km (backend/app/horizon.py).

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
}

test.describe('how far our horizon reaches, English browser', () => {
  test.use({ locale: 'en-GB' })

  test('says the reach, the distance of the Occluders and the rule of the disc', async ({ page }) => {
    await open(page)

    await expect(
      page.getByText(
        /^Our horizon reaches 300\skm; the Sun sets behind high ground 4\.6\skm away and the Earth sets behind high ground 134\skm away\.$/,
      ),
    ).toBeVisible()
    await expect(
      page.getByText('The Sun counts as visible while any part of its disc is in view; the Earth counts by its centre.'),
    ).toBeVisible()
  })
})

test.describe('how far our horizon reaches, Portuguese browser', () => {
  test.use({ locale: 'pt-BR' })

  test('says the reach, the distance of the Occluders and the rule of the disc', async ({ page }) => {
    await open(page)

    await expect(
      page.getByText(
        /^O nosso horizonte vai até 300\skm; o Sol se põe atrás de um relevo a 4,6\skm e a Terra some atrás de um relevo a 134\skm\.$/,
      ),
    ).toBeVisible()
    await expect(
      page.getByText('O Sol conta como visível enquanto qualquer pedaço do disco estiver à vista; a Terra conta pelo centro.'),
    ).toBeVisible()
  })
})
