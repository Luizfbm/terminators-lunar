import { expect, type Page } from '@playwright/test'

// Driving the camera of the globe the way a person does, with the mouse, and reading where it is and
// where the Sun and the Earth are on the stage from the data attributes of `.globe`: the camera's
// distance in Moon radii and its angles round the Moon, and for each body its place and radius in
// pixels, empty while it is off the stage or behind the Moon.

export interface BodyOnStage {
  x: number
  y: number
  r: number
}

export interface GlobeState {
  distance: number
  polar: number
  azimuth: number
  sun: BodyOnStage | null
  earth: BodyOnStage | null
}

export const readGlobe = (page: Page): Promise<GlobeState> =>
  page.locator('.globe').evaluate((element) => {
    const number = (name: string) => {
      const value = element.getAttribute(`data-${name}`)
      return value ? Number(value) : null
    }
    const body = (name: string) => {
      const x = number(`${name}-x`)
      const y = number(`${name}-y`)
      const r = number(`${name}-r`)
      return x === null || y === null || r === null ? null : { x, y, r }
    }
    return {
      distance: number('camera-distance') ?? NaN,
      polar: number('camera-polar') ?? NaN,
      azimuth: number('camera-azimuth') ?? NaN,
      sun: body('sun'),
      earth: body('earth'),
    }
  })

const near = (a: number | null, b: number | null, within: number) => (a === null || b === null ? a === b : Math.abs(a - b) <= within)
const sameBody = (a: BodyOnStage | null, b: BodyOnStage | null) =>
  a === null || b === null ? a === b : near(a.x, b.x, 4) && near(a.y, b.y, 4) && near(a.r, b.r, 0.5)
const sameState = (a: GlobeState, b: GlobeState) =>
  near(a.distance, b.distance, a.distance * 0.01) &&
  near(a.polar, b.polar, 1) &&
  near(a.azimuth, b.azimuth, 1) &&
  sameBody(a.sun, b.sun) &&
  sameBody(a.earth, b.earth)

/**
 * Waits for the camera to come to rest: the opening flight, a drag's glide, a wheel's. The glide
 * ends in a long tail of fractions of a degree, so two readings that agree to within a degree
 * are rest enough.
 */
export async function settle(page: Page) {
  let last: GlobeState | null = null
  await expect
    .poll(
      async () => {
        const now = await readGlobe(page)
        const still = last !== null && sameState(last, now)
        last = now
        return still
      },
      { intervals: [250], timeout: 30_000 },
    )
    .toBe(true)
}

async function stage(page: Page) {
  const box = (await page.locator('.globe canvas').boundingBox())!
  return { box, centre: { x: box.x + box.width / 2, y: box.y + box.height / 2 } }
}

/** A drag from the middle of the stage, in pixels. */
export async function drag(page: Page, dx: number, dy: number) {
  const { centre } = await stage(page)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move(centre.x + dx / 2, centre.y + dy / 2)
  await page.mouse.move(centre.x + dx, centre.y + dy)
  await page.mouse.up()
  await settle(page)
}

/** Turns the camera round the Moon by `degrees` of azimuth: a whole turn is the stage's height in pixels. */
export async function turn(page: Page, degrees: number) {
  const { box } = await stage(page)
  await drag(page, (degrees / 360) * box.height, 0)
}

/** Tips the camera to `polarDeg` from the north pole, a few degrees at a time as the mouse gets there. */
export async function tipTo(page: Page, polarDeg: number) {
  const { box } = await stage(page)
  for (let attempt = 0; attempt < 12; attempt++) {
    const { polar } = await readGlobe(page)
    if (Math.abs(polar - polarDeg) < 4) return
    // Dragging down brings the camera up towards the north pole.
    await drag(page, 0, -((polarDeg - polar) / 360) * box.height)
  }
}

/** Turns the wheel until the camera stops coming closer (`in`) or going away (`out`): where the controls stop it. */
export async function zoomAllTheWay(page: Page, way: 'in' | 'out') {
  const { centre } = await stage(page)
  await page.mouse.move(centre.x, centre.y)
  let last = (await readGlobe(page)).distance
  for (let attempt = 0; attempt < 60; attempt++) {
    await page.mouse.wheel(0, way === 'out' ? 300 : -300)
    await page.waitForTimeout(100)
    const now = (await readGlobe(page)).distance
    // The glide goes on after the wheel, so two equal readings in a row are the stop.
    if (attempt > 3 && Math.abs(now - last) < 0.005) break
    last = now
  }
  await settle(page)
}

/**
 * Goes round the Moon, a level of latitude at a time, until `body` is on the stage. The Sun and the
 * Earth are far behind the Moon in the sky, so each shows beside the Moon's disc only when the camera
 * looks past the Moon at it, and the Moon hides it when it is in the way.
 */
export async function findOnStage(page: Page, body: 'sun' | 'earth'): Promise<GlobeState & { found: BodyOnStage }> {
  for (const polar of [90, 80, 100, 70, 110, 60, 120, 50, 130, 40, 140, 30, 150]) {
    await tipTo(page, polar)
    for (let step = 0; step < 60; step++) {
      const state = await readGlobe(page)
      const found = state[body]
      if (found) return { ...state, found }
      await turn(page, 6)
    }
  }
  throw new Error(`the ${body} never came into view`)
}
