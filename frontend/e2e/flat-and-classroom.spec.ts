import { expect, test, type Page, type Route } from '@playwright/test'

// the requirement. The mock answers /visibility with CR01 (20/11/2026 12:00 UTC for 10 days, first Sunset
// at 16:21) and /visibility/flat with Site 001 (first Sunset without terrain on 13/02/2027 02:11), so
// at the Window start the Sun would set 84 d 9 h later without terrain. States the example does not
// have are made by intercepting the route; the contract is not changed.

const FLAT = '**/visibility/flat?**'

const problem = (status: number, code: string): Parameters<Route['fulfill']>[0] => ({
  status,
  contentType: 'application/problem+json',
  headers: status === 503 ? { 'Retry-After': '5' } : undefined,
  body: JSON.stringify({ type: `https://lunar-api.luizfbm.win/problems/${code}`, title: code, status, code }),
})

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

/** The flat line is the paragraph right under the Sun's reason. */
const line = (page: Page) => page.locator('.flat-line')

test.describe('the line without terrain', () => {
  test.describe('in English', () => {
    test.use({ locale: 'en-GB' })

    // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
    test.fixme('says how much later the Sun would set without terrain, and asks once for both readers', async ({ page }) => {
      let asked = 0
      page.on('request', (request) => {
        if (request.url().includes('/visibility/flat?')) asked += 1
      })
      await open(page)
      await expect(line(page)).toHaveText(/^Without terrain the Sun would set 84\sd 9\sh later\.$/)
      await page.getByRole('button', { name: 'How much of this answer is the terrain?' }).click()
      await expect(page.getByRole('table', { name: 'This Window with and without terrain' })).toBeVisible()
      expect(asked).toBe(1)
    })

    // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
    test.fixme('asks for the Query on screen', async ({ page }) => {
      const asked = page.waitForRequest((request) => request.url().includes('/visibility/flat?'))
      await open(page)
      const url = new URL((await asked).url())
      expect(url.searchParams.get('site_id')).toBe('CR01')
      expect(url.searchParams.get('start')).toBe('2026-11-20T12:00:00Z')
      expect(url.searchParams.get('duration_hours')).toBe('240')
      expect(url.searchParams.get('observer_height_m')).toBe('2')
    })

    // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
    test.fixme('shows no number while the flat answer is on its way', async ({ page }) => {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route(FLAT, async (route: Route) => {
        await gate
        await route.continue()
      })
      await open(page)
      await expect(line(page)).toHaveText('Working out the same Query without terrain…')
      await expect(line(page)).toHaveAttribute('role', 'status')
      await expect(line(page)).not.toContainText(/\d/)
      release()
      await expect(line(page)).toContainText('84 d 9 h later')
    })

    // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
    test.fixme('shows no number when the flat answer fails, and tries again', async ({ page }) => {
      let calls = 0
      await page.route(FLAT, async (route: Route) => {
        calls += 1
        if (calls === 1) await route.fulfill(problem(503, 'busy'))
        else await route.continue()
      })
      await open(page)
      const alert = line(page).getByRole('alert')
      await expect(alert).toContainText('The server is busy right now. Try again in a few seconds.')
      await expect(line(page)).not.toContainText(/\d\s?(d|h|min)\b/)
      await alert.getByRole('button', { name: 'Try again' }).click()
      await expect(line(page)).toContainText('84 d 9 h later')
    })

    const withoutSunEvents = (searchEnd?: string) => async (route: Route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.events = body.events.filter((event: { type: string }) => event.type !== 'sunset' && event.type !== 'sunrise')
      if (searchEnd) body.search_end = searchEnd
      await route.fulfill({ response, json: body })
    }

    // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
    test.fixme('names the end of the search when the flat Sun never sets in it', async ({ page }) => {
      await page.route(FLAT, withoutSunEvents())
      await open(page)
      await expect(line(page)).toHaveText('Without terrain the Sun would not set before 11 Jun 2027, 180\u00a0days after this Window.')
    })

    // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
    test.fixme('says where the data ends when coverage stops before the 180 days', async ({ page }) => {
      await page.route(FLAT, withoutSunEvents('2027-03-01T00:00:00Z'))
      await open(page)
      await expect(line(page)).toHaveText('Without terrain the Sun would not set before 1 Mar 2027, where our data ends.')
    })
  })

  test.describe('in Portuguese', () => {
    test.use({ locale: 'pt-BR' })

    // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
    test.fixme('says it in Portuguese', async ({ page }) => {
      await open(page)
      await expect(line(page)).toHaveText(/^Sem relevo, o Sol se poria 84\sd 9\sh mais tarde\.$/)
      await page.getByRole('button', { name: 'Quanto desta resposta vem do relevo?' }).click()
      const table = page.getByRole('table', { name: 'Esta Janela com e sem relevo' })
      await expect(table.getByRole('columnheader', { name: 'Com relevo' })).toBeVisible()
      await expect(table.getByRole('columnheader', { name: 'Sem relevo' })).toBeVisible()
    })
  })
})

test.describe('the Window without terrain', () => {
  test.use({ locale: 'en-GB' })

  // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
  test.fixme('opens beside the real metrics and stays open across a reload', async ({ page }) => {
    await open(page)
    const button = page.getByRole('button', { name: 'How much of this answer is the terrain?' })
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await button.click()

    const table = page.getByRole('table', { name: 'This Window with and without terrain' })
    // CR01 has 87 h 37 min of Sun and Earth together; Site 001 without terrain has 285 h 25 min.
    await expect(page.getByText(/Without terrain this Window would have 11\sd 21\sh of Sun and Earth together\. With the terrain it has 3\sd 15\sh\./)).toBeVisible()
    await expect(table.getByRole('row')).toHaveCount(7)
    await expect(table.getByRole('row', { name: /Longest night/ })).toContainText(/5\sd 2\sh\s*none/)
    await expect(page.getByText(/the horizon sits 0\.087° below level/)).toBeVisible()
    await expect(page).toHaveURL(/[?&]flat=1/)

    await page.reload()
    await expect(page.getByRole('button', { name: 'How much of this answer is the terrain?' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('table', { name: 'This Window with and without terrain' })).toBeVisible()

    await page.getByRole('button', { name: 'How much of this answer is the terrain?' }).click()
    await expect(page).not.toHaveURL(/flat=1/)
  })

  // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
  test.fixme('says it is computing, then that it failed, and tries again', async ({ page }) => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(FLAT, async (route: Route) => {
      calls += 1
      if (calls === 1) {
        await gate
        await route.fulfill(problem(503, 'busy'))
      } else {
        await route.continue()
      }
    })
    await open(page, '/?flat=1')
    const panel = page.locator('.flat-metrics')
    await expect(panel.getByRole('status')).toHaveText('Working out this Window without terrain…')
    release()
    await expect(panel.getByRole('alert')).toContainText('The server is busy right now.')
    await panel.getByRole('button', { name: 'Try again' }).click()
    await expect(panel.getByRole('table')).toBeVisible()
    await expect(line(page)).toContainText('84 d 9 h later')
  })
})

test.describe('the Classroom figure', () => {
  test.use({ locale: 'en-GB' })

  test('opens from the view from the ground, labelled as a model, and keeps its latitude in the link', async ({ page }) => {
    await open(page, '/?view=ground')
    await page.getByRole('button', { name: 'Why does one small hill matter so much?' }).click()
    const sheet = page.getByRole('dialog', { name: 'Why does one small hill matter so much?' })
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('A hill 300 m high and 10 km away stands 1.55° above the horizon. At the pole the Sun never climbs more than about 1.5°.')
    await expect(sheet).toContainText('Classroom model')
    await expect(sheet).toContainText('The app’s answers come from the engine, never from this figure.')
    await expect(sheet.getByRole('row', { name: /Highest Sun here/ })).toContainText('1.54°')
    await expect(page).toHaveURL(/[?&]classroom=90/)

    await sheet.getByRole('button', { name: '30° S' }).click()
    await expect(sheet.getByRole('row', { name: /Highest Sun here/ })).toContainText('61.54°')
    await expect(page).toHaveURL(/[?&]classroom=30/)

    await page.reload()
    const again = page.getByRole('dialog', { name: 'Why does one small hill matter so much?' })
    await expect(again).toBeVisible()
    await expect(again.getByRole('button', { name: '30° S' })).toHaveAttribute('aria-pressed', 'true')
    await expect(again.getByRole('slider', { name: 'Latitude' })).toHaveValue('30')

    await page.keyboard.press('Escape')
    await expect(again).toBeHidden()
    await expect(page).not.toHaveURL(/classroom=/)
  })

  test('is not offered from orbit', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('button', { name: 'Why does one small hill matter so much?' })).toHaveCount(0)
  })

  test.describe('in Portuguese', () => {
    test.use({ locale: 'pt-BR' })

    test('says it in Portuguese', async ({ page }) => {
      await open(page, '/?view=ground&classroom=88')
      const sheet = page.getByRole('dialog', { name: 'Por que um morro pequeno pesa tanto?' })
      await expect(sheet).toContainText('No polo, o Sol nunca sobe mais que cerca de 1,5°.')
      await expect(sheet).toContainText('Modelo de aula')
      await expect(sheet.getByRole('button', { name: '88° S' })).toHaveAttribute('aria-pressed', 'true')
      await sheet.getByRole('button', { name: 'Fechar' }).click()
      await expect(sheet).toBeHidden()
    })
  })
})

test.describe('at 390 px wide', () => {
  test.use({ locale: 'en-GB', viewport: { width: 390, height: 844 } })

  // Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
  test.fixme('the line, the panel and the sheet fit without scrolling sideways', async ({ page }) => {
    await open(page, '/?flat=1')
    await expect(line(page)).toContainText('84 d 9 h later')
    await expect(page.getByRole('table', { name: 'This Window with and without terrain' })).toBeVisible()
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await wide()).toBeLessThanOrEqual(0)
    const answer = page.locator('main.answer')
    expect(await answer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0)

    await page.goto('/?view=ground&classroom=88')
    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()
    const box = await sheet.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true)
    expect(await sheet.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0)
  })
})
