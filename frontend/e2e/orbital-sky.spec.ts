import { assertEnglish } from './assertEnglish'
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const original = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8')).value
test.use({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' })
test.setTimeout(60000)

test('opening flag and English copy paint without JavaScript, even with a Portuguese link', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: 'pt-BR', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5186/?lang=pt')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
    await expect(page.locator('.earthrise__flag')).toBeVisible()
    await expect(page.locator('.earthrise__title')).toHaveText('Loading the Moon…')
    await expect(page.locator('[data-lang="pt"]')).toHaveCount(0)
    expect(await page.locator('.earthrise__cloth').evaluate(el => getComputedStyle(el).animationName)).toBe('none')
    await page.screenshot({ path: 'test-results/opening-flag-mobile.png' })
  } finally { await context.close() }
})

test('orbital Sun and planets use the sky, toggle and disappear on the polar map', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/meta', r => r.fulfill({ json: { engine_version: 'test', kernels: [], dems: [], coverage: { custom_max_latitude_deg: 90, window_min: '2023-08-01T00:00:00Z', window_max: '2032-12-31T23:59:59Z', max_duration_hours: 1440 }, defaults: { site_id: '001', duration_hours: 240, observer_height_m: 2 }, short_shadow_max_hours: 12 } }))
  await page.route('**/sites', r => r.fulfill({ json: [original.query.site] }))
  await page.route('**/regions', r => r.fulfill({ json: [] }))
  await page.route('**/sites/*/windows?*', r => r.abort())
  await page.route('**/visibility?*', r => {
    const params = new URL(r.request().url()).searchParams, body = structuredClone(original)
    body.query.site = { ...body.query.site, id: 'custom:orbit', source: 'custom', curated: false, latitude_deg: Number(params.get('latitude_deg') ?? 0), longitude_deg: Number(params.get('longitude_deg') ?? 180) }
    for (const sample of body.timeline.samples) { sample.sun.angular_radius_deg = .267; sample.earth.angular_radius_deg = .95 }
    return r.fulfill({ json: body })
  })
  await page.goto('/?lat=0&lon=-135&view=orbit&graphics=low&lang=pt')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('#earthrise')).toBeHidden()
  const globe = page.locator('.globe'), planets = page.getByRole('button', { name: 'Planets', exact: true })
  await expect(planets).toHaveAttribute('aria-pressed', 'true')
  await expect(globe).not.toHaveAttribute('data-sun-r', '')
  // The real angular radius supplied by the answer, projected with the 32° camera.
  const height = (await page.locator('.globe canvas').boundingBox())!.height
  const radius = Number(await globe.getAttribute('data-sun-r'))
  expect(radius).toBeGreaterThan(height * .007)
  expect(radius).toBeLessThan(height * .012)
  await page.screenshot({ path: 'test-results/orbital-sun.png' })
  // Planets belong to their sky directions; turn the globe until one enters the field of view.
  const canvas = (await page.locator('.globe canvas').boundingBox())!
  for (let turn = 0; turn < 24 && !(await globe.getAttribute('data-planet-names')); turn++) {
    await page.mouse.move(canvas.x + canvas.width * .72, canvas.y + canvas.height * .5)
    await page.mouse.down()
    await page.mouse.move(canvas.x + canvas.width * .72 + 50, canvas.y + canvas.height * .5, { steps: 6 })
    await page.mouse.up()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  await expect(globe).not.toHaveAttribute('data-planet-names', '')
  await assertEnglish(page)
  await page.screenshot({ path: 'test-results/orbital-sun-planets.png' })
  await planets.click()
  await expect(globe).toHaveAttribute('data-planets', '')
  await expect(page.locator('[data-planet]:not([hidden])')).toHaveCount(0)
  await planets.click()
  await expect(globe).not.toHaveAttribute('data-planets', '')
  await page.getByRole('button', { name: 'South Pole in detail', exact: true }).click()
  await expect(globe).toHaveAttribute('data-mode', 'map')
  await expect(globe).toHaveAttribute('data-planets', '')
  await expect(globe).toHaveAttribute('data-sun-r', '')
  await expect(page.locator('.globe__planets span:not([hidden])')).toHaveCount(0)
  await expect(planets).toHaveCount(0)
  await page.getByRole('button', { name: 'Explore the Moon', exact: true }).click()
  await expect(planets).toHaveAttribute('aria-pressed', 'true')
  await expect(globe).toHaveAttribute('data-mode', 'orbit')
  expect(errors).toEqual([])
})
