import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const visibility = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8')).value
const energy = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-energy-001.example.json', import.meta.url), 'utf8')).value
const ladder = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-ladder-cr05.example.json', import.meta.url), 'utf8')).value
const dsn = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-dsn-001.example.json', import.meta.url), 'utf8')).value
const scatter = JSON.parse(readFileSync(new URL('../../contract/examples/visibility-scatter-001.example.json', import.meta.url), 'utf8')).value
const terrain = JSON.parse(readFileSync(new URL('../../contract/examples/terrain-001.example.json', import.meta.url), 'utf8')).value

test.beforeEach(async ({ page }) => {
  await page.route('**/visibility/energy?*', (route) => route.fulfill({ json: energy }))
  await page.route('**/visibility/ladder?*', (route) => route.fulfill({ json: ladder }))
  await page.route('**/visibility/dsn?*', (route) => route.fulfill({ json: dsn }))
  await page.route('**/visibility/scatter?*', (route) => route.fulfill({ json: scatter }))
  await page.route('**/terrain?*', (route) => route.fulfill({ json: terrain }))
})

test('landing cursor follows the actual plot and readouts do not seek', async ({ page }) => {
  await page.goto('/e2e/fixtures/landing-review.html')
  const plot = page.locator('.strip__row--sun .strip__bar')
  await expect(plot).toBeVisible()
  const box = (await plot.boundingBox())!
  const start = Date.parse(visibility.query.start)
  const end = Date.parse(visibility.query.end)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const value = Number(await page.locator('#cursor-value').textContent())
  expect(Math.abs(value - (start + end) / 2)).toBeLessThan((end - start) / box.width)
  const cursor = (await page.locator('.strip__cursor').boundingBox())!
  expect(Math.abs(cursor.x - (box.x + box.width / 2))).toBeLessThan(2)
  await page.locator('.strip__row--sun .strip-count').click()
  expect(Number(await page.locator('#cursor-value').textContent())).toBe(value)
})

test('chosen rover supplies the backend energy request and switches cleanly', async ({ page }) => {
  const asked: URLSearchParams[] = []
  page.on('request', (request) => {
    if (request.url().includes('/visibility/energy?')) asked.push(new URL(request.url()).searchParams)
  })
  await page.goto('/e2e/fixtures/landing-review.html')
  await expect.poll(() => asked.length).toBe(1)
  expect(asked[0].get('panel_power_w')).toBe('450')
  expect(asked[0].get('load_w')).toBe('95')
  expect(asked[0].get('battery_wh')).toBe('5420')
  expect(asked[0].get('panel_pointing')).toBe('sun')
  await page.getByRole('button', { name: 'Choose LRV' }).click()
  await expect.poll(() => asked.length).toBe(2)
  expect(asked[1].get('panel_power_w')).toBe('0')
  expect(asked[1].get('load_w')).toBe('350')
})

test('precision opens only requested analyses and Escape returns to the launch button', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const asked: string[] = []
  page.on('request', (request) => { if (/\/(visibility\/(ladder|scatter|dsn)|terrain)\?/.test(request.url())) asked.push(request.url()) })
  await page.goto('/e2e/fixtures/landing-review.html')
  await page.getByRole('button', { name: 'Open precision' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(asked).toHaveLength(0)
  await dialog.locator('.panel__open').click()
  await expect.poll(() => asked.some((url) => url.includes('/ladder?'))).toBe(true)
  expect(asked.some((url) => url.includes('/scatter?') || url.includes('/dsn?'))).toBe(false)
  await dialog.getByRole('button', { name: 'Communication', exact: true }).click()
  await dialog.locator('.panel__open').click()
  await expect.poll(() => asked.some((url) => url.includes('/dsn?'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open precision' })).toBeFocused()
  expect(errors).toEqual([])
})

const routeAnswer = JSON.parse(readFileSync(new URL('../../contract/examples/route-plan.example.json', import.meta.url), 'utf8')).value

async function openRoutes(page: import('@playwright/test').Page) {
  await page.goto('/e2e/fixtures/landing-review.html')
  await page.getByRole('button', { name: 'Open precision' }).click()
  await page.getByRole('button', { name: 'Rover routes', exact: true }).click()
  await page.getByLabel('Destination latitude').fill('0')
  await page.getByLabel('Destination longitude').fill('-179.999')
}

test('route scenario sends explicit motion inputs, renders DEM and clears stale results', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  let sent: Record<string, unknown> | undefined
  await page.route('**/routes/plan', async route => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: routeAnswer })
  })
  await openRoutes(page)
  await page.getByLabel('Evaluate movement and battery').check()
  await page.getByLabel('Speed (m/s)').fill('0.1')
  await page.getByLabel('Total moving load (W)').fill('10')
  await page.getByLabel('Battery (Wh)').fill('20')
  await page.getByLabel('Solar panels (W)').fill('20')
  await page.getByLabel('Initial charge (%)').fill('50')
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await expect(page.getByText('Path found on this grid.', { exact: true })).toBeVisible()
  await page.getByRole('dialog').screenshot({ path: 'test-results/route-desktop.png' })
  expect(sent?.motion).toEqual({ speed_m_s: .1, load_w: 10, battery_wh: 20, panel_power_w: 20, initial_charge_fraction: .5 })
  expect(sent?.start).toBe(visibility.query.start)
  await expect(page.getByLabel('DEM elevation map', { exact: false })).toBeVisible()
  await expect(page.getByText(/Charge: 50.0%/)).toBeVisible()
  await page.getByLabel('Route point', { exact: true }).fill('2')
  await expect(page.getByText(/40.0 m/).last()).toBeVisible()
  await page.getByLabel('Destination latitude').fill('1')
  await expect(page.locator('.route-result')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('route errors, no path and unavailable energy are explicit', async ({ page }) => {
  let count = 0
  await page.route('**/routes/plan', async route => {
    count++
    if (count === 1) await route.fulfill({ status: 422, json: { code: 'outside_coverage' } })
    else if (count === 2) await route.fulfill({ json: { ...routeAnswer, status: 'no_path_in_window', points: [], length_m: null, samples: [], motion_status: 'not_requested' } })
    else await route.fulfill({ json: { ...routeAnswer, samples: [], motion_status: 'sample_limit', unmet_wh: null } })
  })
  await openRoutes(page)
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('outside available coverage')
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await expect(page.getByText('No path within this window and slope limit.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Route point', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await expect(page.getByText(/exceeds 64 motion samples/)).toBeVisible()
  await expect(page.getByLabel('Movement sample', { exact: true })).toHaveCount(0)
})

test('route form fits a phone and cancelling discards a late result', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let release: (() => void) | undefined
  await page.route('**/routes/plan', async route => {
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: routeAnswer }).catch(() => {})
  })
  await openRoutes(page)
  const dialog = page.getByRole('dialog')
  expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true)
  await dialog.screenshot({ path: 'test-results/route-mobile.png' })
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await expect.poll(() => !!release).toBe(true)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  release!()
  await expect(page.getByRole('button', { name: 'Calculate route', exact: true })).toBeEnabled()
  await expect(page.locator('.route-result')).toHaveCount(0)
})

test('route comparison survives only resolution changes and playback follows samples', async ({ page }) => {
  await page.route('**/routes/plan', route => route.fulfill({ json: routeAnswer }))
  await openRoutes(page)
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await page.getByRole('button', { name: 'Keep for resolution comparison' }).click()
  await page.getByLabel('Native DEM minimum resolution').selectOption('80')
  await expect(page.getByRole('heading', { name: 'Native resolution comparison' })).toBeVisible()
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await expect(page.getByText(/Both requests used the same DEM/)).toBeVisible()
  await page.getByRole('button', { name: 'Play samples (2/s)', exact: true }).click()
  await expect.poll(async () => page.getByLabel('Movement sample', { exact: true }).inputValue()).not.toBe('0')
  await page.getByRole('button', { name: 'Pause samples', exact: true }).click()
  const paused = await page.getByLabel('Route point', { exact: true }).inputValue()
  await page.getByLabel('Movement sample', { exact: true }).fill('2')
  await expect(page.getByLabel('Route point', { exact: true })).toHaveValue('2')
  expect(Number(paused)).toBeGreaterThanOrEqual(0)
  await page.getByLabel('Segment slope limit').fill('14')
  await expect(page.locator('.route-comparison')).toHaveCount(0)
})

test('route 3D terrain opens and releases its canvas when closed', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/routes/plan', route => route.fulfill({ json: routeAnswer }))
  await openRoutes(page)
  await page.getByRole('button', { name: 'Calculate route', exact: true }).click()
  await page.getByRole('button', { name: '3D terrain', exact: true }).click()
  await expect.poll(async () => await page.locator('.route-terrain canvas').count() || await page.getByText('WebGL unavailable.', { exact: false }).count()).toBe(1)
  if (await page.locator('.route-terrain canvas').count()) {
    await expect(page.locator('.route-terrain canvas')).toBeVisible()
    await page.getByLabel('Route point', { exact: true }).fill('2')
    await page.locator('.route-terrain').screenshot({ path: 'test-results/route-3d.png' })
  }
  await page.getByRole('button', { name: '3D terrain', exact: true }).click()
  await expect(page.locator('.route-terrain')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('globe recovers after a failed graphics context instead of remaining blank', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/meta', route => route.fulfill({ json: {"engine_version": "0.1.0", "kernels": ["naif0012.tls", "pck00011.tpc", "de440.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"], "dems": [{"product": "LDEM_80S_20MPP_ADJ", "resolution_m": 20.0}, {"product": "LDEM_80S_80MPP_ADJ", "resolution_m": 80.0}, {"product": "LDEM_60S_240MPP_ADJ", "resolution_m": 240.0}, {"product": "SLDEM2015_512", "resolution_m": 59.2}, {"product": "SLDEM2015_128", "resolution_m": 236.9}, {"product": "LDEM_60S_60MPP_ADJ", "resolution_m": 60.0}, {"product": "LDEM_60S_240MPP_ADJ", "resolution_m": 240.0}], "coverage": {"custom_max_latitude_deg": -80.0, "window_min": "2023-08-01T00:00:00Z", "window_max": "2032-12-31T23:59:59Z", "max_duration_hours": 1440.0}, "defaults": {"site_id": "001", "duration_hours": 708.73, "observer_height_m": 2.0}, "short_shadow_max_hours": 12.0} }))
  await page.route('**/sites', route => route.fulfill({ json: [visibility.query.site] }))
  await page.route('**/regions', route => route.fulfill({ json: [] }))
  await page.route('**/sites/*/windows?*', route => route.abort())
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    const state = window as unknown as { allowGraphics: boolean }
    state.allowGraphics = false
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (!state.allowGraphics && String(args[0]).startsWith('webgl')) return null
      return original.apply(this, args)
    } as typeof original
  })
  await page.route('**/visibility?*', route => route.fulfill({ json: visibility }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const retry = page.locator('.stage__note button')
  await expect(retry).toBeVisible()
  await page.evaluate(() => { (window as unknown as { allowGraphics: boolean }).allowGraphics = true })
  await retry.click()
  await expect(page.locator('.globe canvas')).toBeVisible()
  await expect(page.locator('.stage__note button')).toHaveCount(0)
  await page.locator('.globe canvas').evaluate(canvas => {
    (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext()
  })
  await expect(retry).toBeVisible()
  await retry.click()
  await expect(page.locator('.globe canvas')).toBeVisible()
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/globe-recovered.png' })
})


test('globe browser block explains recovery and offers a lightweight navigation', async ({ page }) => {
  await page.route('**/meta', route => route.fulfill({ json: {"engine_version": "0.1.0", "kernels": ["naif0012.tls", "pck00011.tpc", "de440.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"], "dems": [{"product": "LDEM_80S_20MPP_ADJ", "resolution_m": 20.0}, {"product": "LDEM_80S_80MPP_ADJ", "resolution_m": 80.0}, {"product": "LDEM_60S_240MPP_ADJ", "resolution_m": 240.0}, {"product": "SLDEM2015_512", "resolution_m": 59.2}, {"product": "SLDEM2015_128", "resolution_m": 236.9}, {"product": "LDEM_60S_60MPP_ADJ", "resolution_m": 60.0}, {"product": "LDEM_60S_240MPP_ADJ", "resolution_m": 240.0}], "coverage": {"custom_max_latitude_deg": -80.0, "window_min": "2023-08-01T00:00:00Z", "window_max": "2032-12-31T23:59:59Z", "max_duration_hours": 1440.0}, "defaults": {"site_id": "001", "duration_hours": 708.73, "observer_height_m": 2.0}, "short_shadow_max_hours": 12.0} }))
  await page.route('**/sites', route => route.fulfill({ json: [visibility.query.site] }))
  await page.route('**/regions', route => route.fulfill({ json: [] }))
  await page.route('**/sites/*/windows?*', route => route.abort())
  await page.route('**/visibility?*', route => route.fulfill({ json: visibility }))
  const assets: string[] = []
  page.on('request', request => { if (request.url().includes('/moon/')) assets.push(request.url()) })
  await page.addInitScript(() => {
    const deny = new URLSearchParams(location.search).get('graphics') !== 'low'
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (deny && String(args[0]).startsWith('webgl')) {
        this.dispatchEvent(new WebGLContextEvent('webglcontextcreationerror', { statusMessage: 'Web page caused context loss and was blocked' }))
        return null
      }
      return original.apply(this, args)
    } as typeof original
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('.stage__note')).toContainText('browser blocked 3D')
  await expect(page.locator('.stage__note button')).toHaveCount(0)
  await page.getByRole('link', { name: 'Open lightweight graphics' }).click()
  await expect(page.locator('.globe canvas')).toBeVisible()
  await expect(page.getByText('Lightweight graphics · simplified globe textures', { exact: true })).toBeVisible()
  expect(await page.locator('.globe canvas').evaluate(canvas => (canvas as HTMLCanvasElement).getContext('webgl2')!.getContextAttributes()!.antialias)).toBe(false)
  expect(assets.some(url => /\.webp(?:\?|$)/.test(url) && /8k|south_cap|south_pole_fine/.test(url))).toBe(false)
})

test('rover disposal releases GPU framebuffers across repeated openings', async ({ page }) => {
  await page.addInitScript(() => {
    const live = new Map<WebGLFramebuffer, WebGL2RenderingContext>()
    const watched = new WeakSet<HTMLCanvasElement>()
    const originalCreate = WebGL2RenderingContext.prototype.createFramebuffer
    const originalDelete = WebGL2RenderingContext.prototype.deleteFramebuffer
    WebGL2RenderingContext.prototype.createFramebuffer = function () {
      const object = originalCreate.call(this)
      if (object) live.set(object, this)
      const canvas = this.canvas as HTMLCanvasElement
      if (!watched.has(canvas)) {
        watched.add(canvas)
        canvas.addEventListener('webglcontextlost', () => {
          for (const [buffer, context] of live) if (context.canvas === canvas) live.delete(buffer)
        })
      }
      return object
    }
    WebGL2RenderingContext.prototype.deleteFramebuffer = function (object) {
      if (object) live.delete(object)
      return originalDelete.call(this, object)
    }
    Object.defineProperty(window, 'liveFramebufferCount', { get: () => live.size })
  })
  const count = () => page.evaluate(() => (window as unknown as { liveFramebufferCount: number }).liveFramebufferCount)
  await page.goto('/e2e/fixtures/rover-memory.html')
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: 'Create rover' }).click()
    await expect.poll(count).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Dispose rover' }).click()
    await expect.poll(count).toBe(0)
  }
})


test('globe uploads fit the memory budget in the default view', async ({ page }) => {
  await page.route('**/meta', route => route.fulfill({ json: {"engine_version": "0.1.0", "kernels": ["naif0012.tls", "pck00011.tpc", "de440.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"], "dems": [{"product": "LDEM_80S_20MPP_ADJ", "resolution_m": 20.0}, {"product": "LDEM_80S_80MPP_ADJ", "resolution_m": 80.0}, {"product": "LDEM_60S_240MPP_ADJ", "resolution_m": 240.0}, {"product": "SLDEM2015_512", "resolution_m": 59.2}, {"product": "SLDEM2015_128", "resolution_m": 236.9}, {"product": "LDEM_60S_60MPP_ADJ", "resolution_m": 60.0}, {"product": "LDEM_60S_240MPP_ADJ", "resolution_m": 240.0}], "coverage": {"custom_max_latitude_deg": -80.0, "window_min": "2023-08-01T00:00:00Z", "window_max": "2032-12-31T23:59:59Z", "max_duration_hours": 1440.0}, "defaults": {"site_id": "001", "duration_hours": 708.73, "observer_height_m": 2.0}, "short_shadow_max_hours": 12.0} }))
  await page.route('**/sites', route => route.fulfill({ json: [visibility.query.site] }))
  await page.route('**/regions', route => route.fulfill({ json: [] }))
  await page.route('**/sites/*/windows?*', route => route.abort())
  await page.route('**/visibility?*', route => route.fulfill({ json: visibility }))
  await page.addInitScript(() => {
    const sizes: number[] = []
    const original = WebGL2RenderingContext.prototype.texStorage2D
    WebGL2RenderingContext.prototype.texStorage2D = function (target, levels, format, width, height) {
      sizes.push(width, height)
      return original.call(this, target, levels, format, width, height)
    }
    Object.defineProperty(window, 'uploadedTextureSizes', { get: () => sizes })
  })
  const failures: string[] = []
  page.on('console', message => { if (/OUT_OF_MEMORY|CONTEXT_LOST|Context Lost/.test(message.text())) failures.push(message.text()) })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('.globe canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { uploadedTextureSizes: number[] }).uploadedTextureSizes.length)).toBeGreaterThanOrEqual(12)
  expect(await page.evaluate(() => Math.max(...(window as unknown as { uploadedTextureSizes: number[] }).uploadedTextureSizes))).toBeLessThanOrEqual(2048)
  expect(failures).toEqual([])
  await page.screenshot({ path: 'test-results/globe-budget.png' })
})
