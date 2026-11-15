import { expect, test, type Page } from '@playwright/test'

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme(true, 'depends on the answer column and the header, not shown (issue #78)')

// the requirement: a way in to the IM-2 Athena landing, and a note at that Site saying what the map
// cannot see. The mock always answers for its example Site, so the Site that was asked is put
// into the answer here.

async function serve(page: Page) {
  await page.route('**/visibility?**', async (route) => {
    const asked = new URL(route.request().url()).searchParams.get('site_id')
    const response = await route.fetch()
    const body = await response.json()
    if (asked === 'IM2') {
      body.query.site = { ...body.query.site, id: 'IM2', name: 'IM-2 Athena landing point', latitude_deg: -84.7906, longitude_deg: 29.1957 }
    }
    await route.fulfill({ response, json: body })
  })
}

const entry = (page: Page, name: string) => page.getByRole('link', { name })
const note = (page: Page) => page.locator('.landing-note')

test('the line under the numbers opens the IM-2 landing, where a note says what the map cannot see', async ({ page }) => {
  await serve(page)
  await page.goto('/?lang=en')
  const link = entry(page, 'A real landing: IM-2 Athena, March 2025')
  await expect(link).toBeVisible()
  await expect(note(page)).toHaveCount(0)
  // A real address, so it can be copied or opened in another tab.
  const href = new URL((await link.getAttribute('href'))!, 'http://app.test')
  expect(Object.fromEntries(href.searchParams)).toEqual({ site: 'IM2', lang: 'en', start: '2025-03-06', hours: '48' })

  const asked = page.waitForRequest((request) => new URL(request.url()).searchParams.get('site_id') === 'IM2')
  await link.click()
  const query = new URL((await asked).url()).searchParams
  expect(query.get('start')).toBe('2025-03-06T00:00:00Z')
  expect(query.get('duration_hours')).toBe('48')

  await expect(note(page)).toHaveText(
    'A real landing. Athena came down here on 6 March 2025 and the mission ended 12 h 45 min later. The Sun was up the whole time: the lander tipped over inside a crater about 20 m across, smaller than this map can see, with its panels facing away from the Sun. Source: NASA, LROC.',
  )
  // The link sits under the numbers, and the new answer is read from its first line.
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
  // At the landing itself there is nowhere else to send the visitor.
  await expect(link).toHaveCount(0)
  await expect(page).toHaveURL(/site=IM2/)
  await expect(page).toHaveURL(/start=2025-03-06/)
  await expect(page).toHaveURL(/hours=48/)
})

test('in Portuguese the line and the note are in Portuguese', async ({ page }) => {
  await serve(page)
  await page.goto('/?lang=pt')
  await entry(page, 'Um pouso real: IM-2 Athena, março de 2025').click()
  await expect(note(page)).toHaveText(
    'Um pouso real. O Athena desceu aqui em 6 de março de 2025 e a missão acabou 12 h 45 min depois. O Sol ficou visível o tempo todo: o módulo tombou numa cratera de uns 20 m, menor do que este mapa enxerga, com os painéis de costas para o Sol. Fonte: NASA, LROC.',
  )
})

test('a link straight to the landing shows the note', async ({ page }) => {
  await serve(page)
  await page.goto('/?site=IM2&start=2025-03-06&hours=48&lang=en')
  await expect(note(page)).toBeVisible()
  await expect(entry(page, 'A real landing: IM-2 Athena, March 2025')).toHaveCount(0)
})
