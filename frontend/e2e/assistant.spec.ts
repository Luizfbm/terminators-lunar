import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type Route } from '@playwright/test'

// The assistant (the requirement). The Prism mock answers POST /assistant with the contract's example,
// an offline answer about CR01 with 4 of 4 numbers traced. The other states come from intercepting
// the route with replies shaped like the contract's AssistantReply and its 503 Busy problem.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const MODEL_REPLY = {
  answer:
    'In March 2027 this Site has 412 hours with the Sun and the Earth together, against 310 in this Window.\n\nThe Sun sets next on 20 November.',
  mode: 'model',
  numbers: { total: 4, traced: 3, untraced: ['412'] },
  sources: [
    { operation: 'getSiteYear', request: '/sites/CR01/year?year=2027&observer_height_m=2' },
    { operation: 'getVisibility', request: '/visibility?site_id=CR01&start=2026-11-20T12:00:00Z&duration_hours=240&observer_height_m=2' },
  ],
}

// Worded as the server's per-address cap words it. The app runs on another origin than the API and
// the server does not expose Retry-After to it, so the wait is read from the detail, as in production.
const busy = (seconds: number) => ({
  status: 503,
  contentType: 'application/problem+json',
  headers: { 'Retry-After': String(seconds) },
  body: JSON.stringify({
    type: 'https://lunar-api.luizfbm.win/problems/busy',
    title: 'Busy',
    status: 503,
    detail: `Too many requests from one address; ask again in ${seconds} s.`,
    code: 'busy',
  }),
})

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('slider', { name: 'Cursor' })).toBeVisible()
}

async function violations(page: Page) {
  const { violations: found } = await new AxeBuilder({ page }).include('dialog.ask').withTags(WCAG).analyze()
  return found.map((rule) => `${rule.id}: ${rule.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

/** Holds the next request on the route until `release` is called, then answers with `reply`. */
async function hold(page: Page, reply: Parameters<Route['fulfill']>[0]) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/assistant', async (route) => {
    await gate
    await route.fulfill(reply)
  })
  return () => release()
}

test.describe('the assistant, English', () => {
  test.use({ locale: 'en-GB' })

  test('opens empty with example questions, and the box takes the focus', async ({ page }) => {
    await open(page)
    const button = page.getByRole('button', { name: 'Ask', exact: true })
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await button.click()

    const dialog = page.getByRole('dialog', { name: 'Ask about this Query' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/^About Connecting Ridge CR01, 10\sd 0\sh from 20 Nov 2026$/)).toBeVisible()
    await expect(dialog.getByRole('list', { name: 'Try one of these' }).getByRole('button')).toHaveCount(4)
    await expect(dialog.getByRole('textbox', { name: 'Your question' })).toBeFocused()
    await expect(dialog.getByText('The conversation stays in this tab, and the app stores none of it.')).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('sends the conversation, the language and the Query on screen, and marks an offline answer', async ({ page }) => {
    await open(page)
    const bodies: unknown[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/assistant')) bodies.push(request.postDataJSON())
    })
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'When does the Sun set next here, and what hides it?' }).click()

    const log = dialog.getByRole('log', { name: 'Conversation' })
    await expect(log.getByText('The Sun first sets on 20 November 2026 at 16:21 UTC')).toBeVisible()
    await expect(log.getByText('Offline answer')).toBeVisible()
    await expect(log.getByText('4 of 4 numbers come from the engine')).toBeVisible()
    await expect(log.getByRole('link', { name: 'The answer and its Numbers' })).toBeVisible()
    expect(bodies).toEqual([
      {
        messages: [{ role: 'user', content: 'When does the Sun set next here, and what hides it?' }],
        lang: 'en',
        query: { site_id: 'CR01', start: '2026-11-20T12:00:00Z', duration_hours: 240, observer_height_m: 2 },
      },
    ])
    expect(await violations(page)).toEqual([])

    // The second question carries the first and its answer.
    await dialog.getByRole('textbox', { name: 'Your question' }).fill('And the Earth?')
    await dialog.getByRole('textbox', { name: 'Your question' }).press('Enter')
    await expect(log.getByText('And the Earth?')).toBeVisible()
    await expect.poll(() => bodies.length).toBe(2)
    const second = bodies[1] as { messages: { role: string }[] }
    expect(second.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user'])
  })

  test('waits without looking broken, and says a long answer is normal', async ({ page }) => {
    await open(page)
    const release = await hold(page, { status: 200, contentType: 'application/json', body: JSON.stringify(MODEL_REPLY) })
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Your question' }).fill('Would March be better?')
    await dialog.getByRole('button', { name: 'Ask', exact: true }).click()

    const waiting = dialog.getByRole('status')
    await expect(waiting).toContainText('Reading the engine’s answers…')
    await expect(dialog.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled()
    expect(await violations(page)).toEqual([])
    await expect(waiting).toContainText('A long answer can take half a minute.', { timeout: 12_000 })

    release()
    await expect(dialog.getByRole('status')).toHaveCount(0)
    await expect(dialog.getByText('against 310 in this Window')).toBeVisible()
  })

  test('flags an untraced number in the text and links each source to its view', async ({ page }) => {
    await open(page)
    await page.route('**/assistant', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MODEL_REPLY) }))
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Your question' }).fill('Would March be better?')
    await dialog.getByRole('textbox', { name: 'Your question' }).press('Enter')

    const flagged = dialog.locator('mark.ask-untraced')
    await expect(flagged).toHaveCount(1)
    await expect(flagged).toHaveText(/^412/)
    await expect(flagged).toContainText('not in the engine’s answers')
    await expect(dialog.getByText('3 of 4 numbers come from the engine')).toBeVisible()
    await expect(dialog.getByText(/1 number is not in the engine’s answers/)).toBeVisible()
    await expect(dialog.getByText('Offline answer')).toHaveCount(0)
    expect(await violations(page)).toEqual([])

    // The source closes the sheet and opens "Stats for nerds", where the Numbers are.
    await dialog.getByRole('link', { name: 'The answer and its Numbers' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Stats for nerds' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('button', { name: 'Stats for nerds' })).toBeFocused()

    // The conversation stays while the sheet is closed, and the year's link opens the year panel.
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await dialog.getByRole('link', { name: 'The year at this Site' }).click()
    await expect(page.getByRole('button', { name: 'The year 2026 at this Site' })).toHaveAttribute('aria-expanded', 'true')
  })

  test('busy: says when to ask again, counts down, then lets the question go', async ({ page }) => {
    await open(page)
    let calls = 0
    await page.route('**/assistant', async (route) => {
      calls += 1
      if (calls === 1) await route.fulfill(busy(2))
      else await route.continue()
    })
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Your question' }).fill('When is the next sunset?')
    await dialog.getByRole('textbox', { name: 'Your question' }).press('Enter')

    const alert = dialog.getByRole('alert')
    await expect(alert).toHaveText(/Ask again in 2\ss\. Your question is still in the box\./)
    await expect(dialog.getByRole('textbox', { name: 'Your question' })).toHaveValue('When is the next sunset?')
    await expect(dialog.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled()
    expect(await violations(page)).toEqual([])

    await expect(alert).toHaveText('You can ask again now. Your question is still in the box.', { timeout: 5_000 })
    await dialog.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(dialog.getByText('Offline answer')).toBeVisible()
    expect(calls).toBe(2)
  })

  test('failed: keeps the question and tries again', async ({ page }) => {
    await open(page)
    let calls = 0
    await page.route('**/assistant', async (route) => {
      calls += 1
      if (calls === 1) await route.abort('connectionrefused')
      else await route.continue()
    })
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Your question' }).fill('When is the next sunset?')
    await dialog.getByRole('textbox', { name: 'Your question' }).press('Enter')

    await expect(dialog.getByRole('alert')).toContainText('The server did not answer. Check the connection, then try again.')
    await expect(dialog.getByRole('textbox', { name: 'Your question' })).toHaveValue('When is the next sunset?')
    expect(await violations(page)).toEqual([])
    await dialog.getByRole('button', { name: 'Try again' }).click()
    await expect(dialog.getByText('Offline answer')).toBeVisible()
  })

  test('keeps the conversation out of the link and out of storage', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Your question' }).fill('A question nobody keeps')
    await dialog.getByRole('textbox', { name: 'Your question' }).press('Enter')
    await expect(dialog.getByText('Offline answer')).toBeVisible()
    await page.waitForTimeout(500)
    expect(decodeURIComponent(page.url())).not.toContain('nobody keeps')
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    expect(stored).not.toContain('nobody keeps')
    expect(stored).not.toContain('16:21')
  })

  test('works with the keyboard alone', async ({ page }) => {
    await open(page)
    const button = page.getByRole('button', { name: 'Ask', exact: true })
    for (let presses = 0; presses < 40 && !(await button.evaluate((element) => element === document.activeElement)); presses += 1) {
      await page.keyboard.press('Tab')
    }
    await expect(button).toBeFocused()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('textbox', { name: 'Your question' })).toBeFocused()
    await page.keyboard.type('When is the next sunset?')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('And what hides it?')
    await expect(dialog.getByRole('textbox', { name: 'Your question' })).toHaveValue('When is the next sunset?\nAnd what hides it?')
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('log').getByText('Offline answer')).toBeVisible()
    // Focus stays in the box for the next question; Escape closes and gives it back to the button.
    await expect(dialog.getByRole('textbox', { name: 'Your question' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(button).toBeFocused()
  })

  test('is on the Proof page too', async ({ page }) => {
    await page.goto('/?page=proof')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})

test.describe('the assistant, Portuguese', () => {
  test.use({ locale: 'pt-BR' })

  test('asks in Portuguese and reads the reply in Portuguese', async ({ page }) => {
    await open(page)
    const bodies: { lang: string }[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/assistant')) bodies.push(request.postDataJSON())
    })
    await page.route('**/assistant', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...MODEL_REPLY, answer: 'Em março de 2027 este Local tem 412 horas com o Sol e a Terra juntos, contra 310 nesta Janela.' }),
      }),
    )
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Pergunte sobre esta Consulta' })
    await expect(dialog.getByRole('list', { name: 'Experimente uma destas' }).getByRole('button')).toHaveCount(4)
    await dialog.getByRole('button', { name: 'Qual mês do ano é o melhor neste Local?' }).click()

    await expect(dialog.getByText('3 de 4 números vêm do motor')).toBeVisible()
    await expect(dialog.locator('mark.ask-untraced')).toContainText('não está nas respostas do motor')
    await expect(dialog.getByRole('link', { name: 'O ano neste Local' })).toBeVisible()
    expect(bodies[0].lang).toBe('pt')
    expect(await violations(page)).toEqual([])
  })

  test('busy in Portuguese', async ({ page }) => {
    await open(page)
    await page.route('**/assistant', (route) => route.fulfill(busy(9)))
    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Sua pergunta' }).fill('Quando é o próximo pôr do Sol?')
    await dialog.getByRole('textbox', { name: 'Sua pergunta' }).press('Enter')
    await expect(dialog.getByRole('alert')).toHaveText(/Pergunte de novo em [89]\ss\./)
  })
})

test.describe('the assistant on a phone', () => {
  test.use({ locale: 'en-GB', viewport: { width: 390, height: 844 } })

  // the requirement: it floated over the answer before, and covered the headline and the custom point's Check.
  // It is an item of the globe's menu now, which folds behind a button on a phone.
  test('the button is in the folded menu, and the sheet takes the whole screen', async ({ page }) => {
    await open(page)
    const toggle = page.getByRole('button', { name: 'Menu', exact: true })
    await toggle.click()
    const button = page.getByRole('button', { name: 'Ask', exact: true })
    await expect(button).toBeInViewport()
    const box = await button.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true)

    await button.click()
    const dialog = page.getByRole('dialog')
    const sheet = await dialog.boundingBox()
    expect(sheet?.width).toBe(390)
    expect(await violations(page)).toEqual([])
  })
})
