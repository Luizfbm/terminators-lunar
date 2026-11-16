/**
 * How the Sun's path is dashed on the landing views (issue 150). Only the drawing lives here: the path
 * is the engine's own samples, and a dash is laid on a sample, never between invented ones, so the
 * trajectory, its instants and its positions are exactly what they were.
 *
 * The dashes are spaced in the picture's pixels, not on the sky: a sample every degree is 13 px apart
 * looking straight at the path and a few px apart where the path runs away from the eye or the stage
 * is small, which read as one unbroken line. Here the gap is kept in CSS pixels whatever the camera
 * direction, the stage size or the pixel density.
 */

/** A dash and the gap after it, in CSS pixels. `period` is both. */
export interface DashPattern {
  dashPx: number
  gapPx: number
  periodPx: number
}

/** The dash and the gap on a stage with room for them, in CSS pixels. The gap is three dashes. */
export const DASH_PX = 7
export const GAP_PX = 21
/** A gap is never narrower than this many dashes, so a dash always stands apart. */
export const MIN_GAP_IN_DASHES = 2.5
/** The path shown is this many periods long or more before the pattern is tightened. */
const PERIODS_WANTED = 12
/** The pattern is never tightened below this share of its size: a dash stays a dash. */
const MIN_SCALE = 0.6
/** The densities this works for: below 1 is not a screen, and above 4 gains nothing. */
const MIN_DPR = 1
const MAX_DPR = 4
/** A dash is at least this many device pixels, or it is not seen. */
const MIN_DASH_DEVICE_PX = 2

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/**
 * The dash and the gap for a path that shows `pathLengthPx` CSS pixels long on the stage, on a screen
 * of `devicePixelRatio`. A short path (a small stage, a camera looking away) is dashed a little finer
 * so a few dashes still show, but never finer than 60% and never with the gap under two and a half
 * dashes. Both are whole device pixels, so a dash is as sharp on a phone as on a desktop.
 */
export function dashPattern(pathLengthPx: number, devicePixelRatio: number): DashPattern {
  const dpr = Number.isFinite(devicePixelRatio) ? clamp(devicePixelRatio, MIN_DPR, MAX_DPR) : MIN_DPR
  const wanted = (DASH_PX + GAP_PX) * PERIODS_WANTED
  const scale = Number.isFinite(pathLengthPx) ? clamp(pathLengthPx / wanted, MIN_SCALE, 1) : 1
  const device = (px: number) => Math.round(px * dpr)
  const dashDevice = Math.max(MIN_DASH_DEVICE_PX, device(DASH_PX * scale))
  const gapDevice = Math.max(Math.ceil(dashDevice * MIN_GAP_IN_DASHES), device(GAP_PX * scale))
  const dashPx = dashDevice / dpr
  const gapPx = gapDevice / dpr
  return { dashPx, gapPx, periodPx: dashPx + gapPx }
}

/** Where a sample of the path falls in the picture, in CSS pixels, and whether it can be drawn at all (in front of the eye). */
export interface ScreenPoint {
  x: number
  y: number
  visible: boolean
}

/** A dash laid on sample `index`: how far it reaches towards the sample before and the one after, as a share of that step. */
export interface Dash {
  index: number
  back: number
  ahead: number
}

const apart = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * How much of the path falls inside a `width` by `height` stage, in CSS pixels: the sum of the steps
 * whose two ends are both on it. It sizes the pattern (`dashPattern`).
 */
export function onStageLength(points: readonly ScreenPoint[], width: number, height: number): number {
  const inside = (point: ScreenPoint) => point.visible && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height
  let length = 0
  for (let at = 1; at < points.length; at++) {
    if (inside(points[at - 1]) && inside(points[at])) length += apart(points[at - 1], points[at])
  }
  return length
}

/**
 * The samples that carry a dash, and how far each dash reaches along the path. Walking the path from its
 * first sample, a sample is taken when it is at least `periodPx` from the last one taken, so any two
 * dashes are a full period apart in the picture, wherever the camera looks. A sample that cannot be
 * drawn ends the chain. The dash is `dashPx` long, centred on its sample, and never reaches past the
 * neighbouring sample. The same picture gives the same dashes: nothing depends on the order of the calls.
 */
export function dashAlong(points: readonly ScreenPoint[], pattern: DashPattern): Dash[] {
  const dashes: Dash[] = []
  let last: ScreenPoint | null = null
  const half = pattern.dashPx / 2
  const reach = (from: ScreenPoint, to: ScreenPoint | undefined) => {
    if (!to || !to.visible) return 0
    const step = apart(from, to)
    return step > 0 ? Math.min(1, half / step) : 0
  }
  points.forEach((point, index) => {
    if (!point.visible) {
      last = null
      return
    }
    if (last && apart(last, point) < pattern.periodPx) return
    last = point
    dashes.push({ index, back: reach(point, points[index - 1]), ahead: reach(point, points[index + 1]) })
  })
  return dashes
}
