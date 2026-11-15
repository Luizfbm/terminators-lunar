import type { GroundGrid } from './grid'
import type { PlanePoint, RouteComparison } from './types'

/** The square of the plane the two panes show: its west edge, its north edge and its side, in metres. */
export interface Crop {
  x0: number
  y1: number
  spanM: number
}

/** Margin round the start and the goal, and round every waypoint, so the whole drive fits with room. */
const PAD_M = 600
const PATH_PAD_M = 320
/** The smallest square worth showing. */
const MIN_SPAN_M = 1300

/**
 * The square that holds the start, the goal and both paths, kept inside the grid. It is the view the
 * zoom-out ends on; the animation starts closer, on the start.
 */
export function cropOf(comparison: RouteComparison, grid: Pick<GroundGrid, 'halfM'>): Crop {
  const { start, goal } = comparison
  let minX = Math.min(start.x_m, goal.x_m) - PAD_M
  let maxX = Math.max(start.x_m, goal.x_m) + PAD_M
  let minY = Math.min(start.y_m, goal.y_m) - PAD_M
  let maxY = Math.max(start.y_m, goal.y_m) + PAD_M
  for (const plan of comparison.plans) {
    for (const point of plan.path) {
      minX = Math.min(minX, point.x_m - PATH_PAD_M)
      maxX = Math.max(maxX, point.x_m + PATH_PAD_M)
      minY = Math.min(minY, point.y_m - PATH_PAD_M)
      maxY = Math.max(maxY, point.y_m + PATH_PAD_M)
    }
  }
  const whole = grid.halfM * 2
  const spanM = Math.min(whole, Math.max(MIN_SPAN_M, maxX - minX, maxY - minY))
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const x0 = Math.max(-grid.halfM, Math.min(grid.halfM - spanM, cx - spanM / 2))
  const y1 = Math.min(grid.halfM, Math.max(-grid.halfM + spanM, cy + spanM / 2))
  return { x0, y1, spanM }
}

/** A point of the plane on a square canvas of `size` pixels showing `crop`. +y is up the screen. */
export function toPixel(crop: Crop, size: number, point: PlanePoint | readonly number[]): { x: number; y: number } {
  const [x, y] = 'x_m' in point ? [point.x_m, point.y_m] : point
  return { x: ((x - crop.x0) / crop.spanM) * size, y: ((crop.y1 - y) / crop.spanM) * size }
}

/** The part of the one-pixel-per-cell image that `crop` shows, in cells. */
export function sourceRect(crop: Crop, grid: Pick<GroundGrid, 'halfM' | 'cellM'>): { sx: number; sy: number; size: number } {
  return {
    sx: (crop.x0 + grid.halfM) / grid.cellM,
    sy: (grid.halfM - crop.y1) / grid.cellM,
    size: crop.spanM / grid.cellM,
  }
}
