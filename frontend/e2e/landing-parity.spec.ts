import { test, expect } from '@playwright/test'
import type { VisibilityResult } from '../src/api/client'
import { assertEnglish } from './assertEnglish'
import { readFileSync } from 'node:fs'

const original = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8')).value
const energyExample = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-energy-001.example.json', import.meta.url), 'utf8')).value
test.use({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
test.setTimeout(90000)

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/meta', r => r.fulfill({ json: { engine_version: 'test', kernels: [], dems: [], coverage: { custom_max_latitude_deg: 90, window_min: '2023-08-01T00:00:00Z', window_max: '2032-12-31T23:59:59Z', max_duration_hours: 1440 }, defaults: { site_id: '001', duration_hours: 240, observer_height_m: 2 }, short_shadow_max_hours: 12 } }))
  await page.route('**/sites', r => r.fulfill({ json: [original.query.site] }))
  await page.route('**/regions', r => r.fulfill({ json: [] }))
  await page.route('**/sites/*/windows?*', r => r.abort())
  await page.route('**/visibility?*', r => {
    const p = new URL(r.request().url()).searchParams, body = structuredClone(original)
    if (p.has('latitude_deg')) body.query.site = { ...body.query.site, id: 'custom:test', source: 'custom', curated: false, latitude_deg: Number(p.get('latitude_deg')), longitude_deg: Number(p.get('longitude_deg')) }
    body.timeline.samples.forEach((sample: VisibilityResult['timeline']['samples'][number]) => { sample.sun.angular_radius_deg = .267; sample.earth.angular_radius_deg = .95 })
    return r.fulfill({ json: body })
  })
  // UI charge states only: production energy still comes exclusively from the backend.
  await page.route('**/visibility/energy?*', r => r.fulfill({ json: { ...energyExample, charge_fraction: [1, .5, 0, 0, .25, 1], step_minutes: original.query.duration_hours * 60 / 5 } }))
})

for (const level of [1, 2]) test(`N${level} rover, American dates, battery and isolated landing`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const energyRequests: string[] = []
  page.on('request', r => { if (r.url().includes('/visibility/energy?')) energyRequests.push(r.url()) })
  await page.goto(`/?lat=${level === 1 ? 0 : -82.4}&lon=0&view=${level === 1 ? 'orbit' : 'map'}&graphics=low&lang=pt`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US')
  await expect(page.locator('.globe canvas')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'From the ground', exact: true }).click()
  await expect(page.locator('.vehicle-picker')).toBeVisible()
  await assertEnglish(page)
  await page.getByLabel('Start date', { exact: true }).fill('11/20/2026 09:00 AM')
  await page.getByLabel('End date', { exact: true }).fill('11/30/2026 09:00 AM')
  await expect(page.locator('.vehicle-picker')).toContainText('America/Sao_Paulo')
  await page.locator('.vehicle-picker__pick').click()
  await expect(page.locator('.landing-panel')).toBeVisible({ timeout: 25000 })
  await expect(page.locator('.battery-gauge')).toContainText('100%', { timeout: 20000 })
  await expect(page.locator('.stage__precision, .safety, .answer-card, .precision-panel, .surface-exploration')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Level 3 · Explore', exact: true })).toHaveCount(0)
  await expect(page.locator('.landing-panel')).toContainText('11/20/2026, 12:00 PM')
  await expect(page.locator('.sky canvas')).toHaveAttribute('data-body-radii', 'answer')
  const plot = page.locator('.strip__row--sun .strip__bar'), rect = (await plot.boundingBox())!
  const seek = async (fraction: number) => page.mouse.click(rect.x + rect.width * fraction, rect.y + rect.height / 2)
  await seek(.25)
  await expect(page.locator('.battery-gauge')).toHaveAttribute('data-state', 'discharging')
  await expect(page.locator('.battery-gauge')).toContainText('50%')
  await seek(.5)
  await expect(page.locator('.battery-gauge')).toHaveAttribute('data-state', 'empty')
  await expect(page.locator('.battery-gauge__case i')).toHaveCSS('width', '0px')
  await expect(page.locator('[data-charge-state="empty"] polygon, .charge-row__empty')).toHaveCount(0)
  await seek(.85)
  await expect(page.locator('.battery-gauge')).toContainText('25%')
  await expect(page.locator('.battery-gauge')).toHaveAttribute('data-state', 'charging')
  expect(energyRequests).toHaveLength(1)
  await assertEnglish(page)
  await page.screenshot({ path: `test-results/landing-level-${level}.png` })
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('button', { name: level === 1 ? 'Explore the Moon' : 'South Pole in detail', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('American rover dates stay editable and a mobile globe fits on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?lat=0&lon=0&view=orbit&graphics=low&lang=pt')
  const canvas = page.locator('.globe canvas')
  await expect(canvas).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('#earthrise')).toBeHidden({ timeout: 20000 })
  await expect(page.locator('.globe-menu')).toBeHidden()
  await page.screenshot({ path: 'test-results/globe-mobile-framing.png' })
  await page.getByRole('button', { name: 'From the ground', exact: true }).click()
  const start = page.getByLabel('Start date', { exact: true })
  await start.fill('11/20/2026 09:00 AM')
  await page.getByLabel('End date', { exact: true }).fill('11/30/2026 09:00 AM')
  await expect(page.locator('.vehicle-picker__pick')).toBeEnabled()
  await start.fill('02/30/2026 09:00 AM')
  await expect(page.locator('.vehicle-picker__pick')).toBeDisabled()
  await expect(start).toHaveValue('02/30/2026 09:00 AM')
  await start.fill('11/20/2026 09:00 AM')
  await expect(page.locator('.vehicle-picker__pick')).toBeEnabled()
  await page.screenshot({ path: 'test-results/rover-american-date-mobile.png' })
  await page.keyboard.press('Escape')
  await expect(page.locator('.vehicle-picker')).toHaveCount(0)
})
