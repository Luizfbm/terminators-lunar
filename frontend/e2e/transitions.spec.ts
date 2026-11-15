import { expect, test, type Page, type Route } from '@playwright/test'

// the requirement: the dive to the ground and back, nothing fetched in the middle of the move, and no
// blank answer on a Site change. The globe's canvas says where its camera is in `data-dive`
// ('down' on the way, 'at-site' there, 'up' on the way back); the sky's canvas says where it
// looks in `data-pitch`. The globe waits under the ground view in `.stage__globe`, hidden.

test.use({ locale: 'en-US' })

const globe = (page: Page) => page.locator('.globe canvas')
const globeLayer = (page: Page) => page.locator('.stage__globe')
const groundLayer = (page: Page) => page.locator('.stage__ground')
const sky = (page: Page) => page.locator('.sky canvas')
/** A loading mark someone can see: not one inside the hidden globe. */
const visibleLoading = (page: Page) => page.locator('.stage__loading:visible')

async function openOnGlobe(page: Page) {
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname === '/visibility')
  await page.goto('/')
  await answered
  await expect(globe(page)).toHaveAttribute('data-ready', 'true')
}

/**
 * What the stage does, as it does it: every value of the ground layer's `data-fade`, and the times,
 * from the click on a view button itself, at which the globe is hidden and the ground layer goes.
 * A fade of 200 ms is shorter than Playwright's polling, and the polling adds its own time, so the
 * page keeps the record.
 */
async function recordStage(page: Page) {
  await page.evaluate(() => {
    const record = { fades: [] as string[], clickAt: 0, globeHiddenAt: 0, groundGoneAt: 0 }
    ;(window as unknown as { stageRecord: typeof record }).stageRecord = record
    document.querySelector('.views')?.addEventListener('click', () => {
      record.clickAt = performance.now()
      record.globeHiddenAt = 0
      record.groundGoneAt = 0
    }, true)
    new MutationObserver(() => {
      const fade = document.querySelector('.stage__ground')?.getAttribute('data-fade') ?? ''
      if (fade && record.fades.at(-1) !== fade) record.fades.push(fade)
      if (!record.globeHiddenAt && document.querySelector('.stage__globe[hidden]')) record.globeHiddenAt = performance.now()
      if (record.clickAt && !record.groundGoneAt && record.fades.includes('out') && !document.querySelector('.stage__ground')) {
        record.groundGoneAt = performance.now()
      }
    }).observe(document.querySelector('.stage')!, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-fade', 'hidden'] })
  })
  return () =>
    page.evaluate(() => (window as unknown as { stageRecord: { fades: string[]; clickAt: number; globeHiddenAt: number; groundGoneAt: number } }).stageRecord)
}

/** Every 30 ms until `done`, whether some scene covers the stage: the globe, or the ground over it. */
async function watchStage(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { gaps: number; watching: boolean }
    w.gaps = 0
    w.watching = true
    const tick = () => {
      if (!w.watching) return
      const globeShown = document.querySelector('.stage__globe:not([hidden]) .globe canvas') !== null
      const ground = document.querySelector('.stage__ground')
      if (!globeShown && !ground) w.gaps += 1
      window.setTimeout(tick, 30)
    }
    tick()
  })
  return async () => page.evaluate(() => {
    const w = window as unknown as { gaps: number; watching: boolean }
    w.watching = false
    return w.gaps
  })
}

test('the ground view is fetched right after the first answer, before any click on it', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => asked.push(new URL(request.url()).pathname))
  await openOnGlobe(page)
  await expect.poll(() => asked.some((path) => /\/Sky-[\w-]+\.js$/.test(path))).toBe(true)
  await expect.poll(() => asked.some((path) => path.endsWith('/south_pole_fine.json'))).toBe(true)
  await expect(page.getByRole('button', { name: 'From the ground' })).toHaveAttribute('aria-pressed', 'false')
})

test('from orbit to the ground and back: the dive, the fade and the lift, in at most 1.2 s, no blank stage', async ({ page }) => {
  await openOnGlobe(page)
  // The ground view's code and data have had time to arrive.
  await page.waitForLoadState('networkidle')
  const gaps = await watchStage(page)
  const record = await recordStage(page)

  await page.getByRole('button', { name: 'From the ground' }).click()
  await expect(globe(page)).toHaveAttribute('data-dive', /down|at-site/)
  // The sky arrives looking at the ground under the Observer, then lifts to the horizon.
  await expect.poll(async () => Number(await sky(page).getAttribute('data-pitch'))).toBeLessThan(-20)
  await expect(globeLayer(page)).toBeHidden({ timeout: 2_000 })
  const down = await record()
  expect(down.fades).toContain('in')
  // Timed in the page, from the click to the globe hidden under the ground: the move alone.
  expect(down.globeHiddenAt - down.clickAt).toBeLessThanOrEqual(1_200)
  await expect.poll(async () => Number(await sky(page).getAttribute('data-pitch'))).toBeGreaterThan(5)
  await expect(visibleLoading(page)).toHaveCount(0)

  await page.getByRole('button', { name: 'From orbit' }).click()
  await expect(globeLayer(page)).toBeVisible()
  await expect(groundLayer(page)).toHaveCount(0, { timeout: 2_000 })
  await expect(globe(page)).toHaveAttribute('data-dive', '', { timeout: 2_000 })
  const up = await record()
  expect(up.fades).toContain('out')
  // From the click to the ground view gone; the pull back of DIVE_MS (500 ms) follows it.
  expect(up.groundGoneAt - up.clickAt + 500).toBeLessThanOrEqual(1_200)
  expect(await gaps()).toBe(0)
})

test('the map dives to the ground and comes back to the map', async ({ page }) => {
  await openOnGlobe(page)
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'From the ground' }).click()
  await expect(globeLayer(page)).toBeHidden({ timeout: 2_000 })
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(groundLayer(page)).toHaveCount(0, { timeout: 2_000 })
  await expect(page.locator('.globe')).toHaveAttribute('data-mode', 'map')
  await expect(page.locator('.stage__caption')).toHaveText(/Click a Region to see its Sites, or double-click any point to ask about it\.$/)
})

test('a slow ground holds the globe at the Site, with no loading mark in the middle of the move', async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  // The move waits for the 3D sky's code and nothing else (the ground's heights are never awaited,
  // see prepareWith), so the code is what is held. The first version held south_pole_fine.json,
  // which the move stopped waiting for, and the globe went at once.
  await page.route(/\/assets\/Sky-[^/]*\.js$/, async (route: Route) => {
    await held
    await route.continue()
  })
  await openOnGlobe(page)
  await page.getByRole('button', { name: 'From the ground' }).click()
  await expect(globe(page)).toHaveAttribute('data-dive', 'at-site')
  // Held: the globe stays on screen, at the Site, and nothing says it is loading.
  await page.waitForTimeout(800)
  await expect(globeLayer(page)).toBeVisible()
  await expect(groundLayer(page)).toHaveCount(0)
  await expect(visibleLoading(page)).toHaveCount(0)
  release()
  await expect(globeLayer(page)).toBeHidden({ timeout: 3_000 })
  await expect(sky(page)).toHaveAttribute('data-ready', 'true')
})

// Depends on the answer column or the header, which are not shown (issue #78): fixme until the cards and drawer layout (#63) brings them back.
test.fixme('a click on another Site moves the ring at once and keeps the last answer, dimmed, until the new one is in', async ({ page }) => {
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  // Every answer after the first is held. (The first version held only Sites other than 001 and
  // CR01; the mock answers 001 with its CR01 example, so both are on the list and one of them is
  // the "other" Site the click picks.)
  let answers = 0
  await page.route((url: URL) => url.pathname === '/visibility', async (route: Route) => {
    answers += 1
    if (answers > 1) await held
    await route.continue()
  })
  await openOnGlobe(page)
  const heading = await page.getByRole('heading', { level: 1 }).textContent()
  // The ring marks the Site of the answer on screen.
  const trigger = await page.getByRole('button', { name: /^Site: / }).textContent()
  await expect(page.locator('.globe__pin')).toHaveText(trigger ?? '')
  const before = await page.locator('.globe__pin').textContent()

  await page.getByRole('button', { name: /^Site: / }).click()
  const other = page.getByRole('listbox', { name: 'Sites' }).getByRole('option').filter({ hasNotText: before ?? '' }).first()
  const otherName = (await other.textContent())?.split('\n')[0]?.trim() ?? ''
  await other.click()

  // The ring and its name move before the server answers.
  await expect(page.locator('.globe__pin')).not.toHaveText(before ?? '')
  // The last answer stays, dimmed: the same first line, never a blank column.
  const answer = page.locator('main.answer')
  await expect(answer).toHaveAttribute('data-stale', 'true')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading ?? '')
  release()
  await expect(answer).toHaveAttribute('data-stale', 'false')
  expect(otherName.length).toBeGreaterThan(0)
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('the ground comes and goes with a short fade, no dive and no lift', async ({ page }) => {
    await openOnGlobe(page)
    await page.waitForLoadState('networkidle')
    const record = await recordStage(page)
    await page.getByRole('button', { name: 'From the ground' }).click()
    await expect(globeLayer(page)).toBeHidden({ timeout: 1_000 })
    // The 200 ms fade happened, as the page saw it, with no dive.
    expect((await record()).fades).toContain('in')
    await expect(globe(page)).not.toHaveAttribute('data-dive', /.+/)
    // The sky opens on the horizon at once.
    await expect.poll(async () => Number(await sky(page).getAttribute('data-pitch'))).toBeGreaterThan(5)
    await page.getByRole('button', { name: 'From orbit' }).click()
    await expect(groundLayer(page)).toHaveCount(0, { timeout: 1_000 })
    expect((await record()).fades).toContain('out')
    await expect(globe(page)).not.toHaveAttribute('data-dive', /.+/)
  })
})
