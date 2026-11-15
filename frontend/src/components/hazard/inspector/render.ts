import type { CoarseGrid, DecodedGrid } from './types'

/** Which side of the curtain a layer paints. */
export type Side = 'normal' | 'multiresolution'

export interface LayerOptions {
  /** The coarse grid Normal navigation reads. */
  coarse: CoarseGrid
  /** The slope that counts as a hazard, from the API (`slope_limit_deg`). */
  limitDeg: number
  /** Pixels per side of the picture. */
  size: number
}

/** Laser shot density at which the blue tint is at full strength (Eduardo's cockpit starts tinting there). */
export const LDEC_TINT_FULL = 0.1

/** How strongly a cell is tinted blue for its laser shot density, 0 to 1. */
export function ldecTint(density: number): number {
  return Math.min(1, Math.max(0, density / LDEC_TINT_FULL))
}

/** How the layers colour a cell, for the legend and the tests. */
export type CellClass = 'plain' | 'coarse-hazard' | 'hidden-hazard' | 'seen-hazard'

export function coarseSlope(grid: DecodedGrid, coarse: CoarseGrid, index: number): number {
  return coarse === 20 ? grid.slope20Deg[index] : grid.slope60Deg[index]
}

/**
 * What a cell is on one side of the curtain. Normal navigation sees the coarse slope only.
 * Multiresolution sees the 5 m slope: a cell steeper than the limit that the coarse grid calls
 * safe is the hazard the coarse grid hides. It only compares decoded values with the API's limit.
 */
export function classOf(grid: DecodedGrid, side: Side, coarse: CoarseGrid, limitDeg: number, index: number): CellClass {
  const coarseSteep = coarseSlope(grid, coarse, index) > limitDeg
  if (side === 'normal') return coarseSteep ? 'coarse-hazard' : 'plain'
  if (grid.slope5Deg[index] > limitDeg) return coarseSteep ? 'seen-hazard' : 'hidden-hazard'
  return 'plain'
}

/**
 * One side of the comparison as RGBA pixels: the shaded relief of the elevation, then the hazards
 * of that side on top, then (Multiresolution only) a blue tint as strong as the laser shot density.
 * Light comes from the upper left, as in Eduardo's cockpit. The picture has north (+y) up.
 */
export function renderLayer(grid: DecodedGrid, side: Side, options: LayerOptions): Uint8ClampedArray {
  const { size, coarse, limitDeg } = options
  const { n, cellM } = grid
  const out = new Uint8ClampedArray(size * size * 4)
  const zSpan = Math.max(1, grid.zMaxM - grid.zMinM)
  const at = (row: number, col: number) => grid.elevationM[row * n + col]

  for (let py = 0; py < size; py += 1) {
    const row = Math.min(n - 1, Math.floor((py / size) * n))
    const up = Math.max(0, row - 1)
    const down = Math.min(n - 1, row + 1)
    for (let px = 0; px < size; px += 1) {
      const col = Math.min(n - 1, Math.floor((px / size) * n))
      const left = Math.max(0, col - 1)
      const right = Math.min(n - 1, col + 1)
      const index = row * n + col

      // Shaded relief of the real elevation.
      const nx = -(at(row, right) - at(row, left)) / (2 * cellM)
      const ny = -(at(down, col) - at(up, col)) / (2 * cellM)
      const length = Math.hypot(nx, ny, 1)
      const shade = Math.max(0.18, Math.min(1, 0.45 + ((nx * 0.65 + ny * 0.55 + 0.25) / length) * 0.72))
      const height = (grid.elevationM[index] - grid.zMinM) / zSpan
      const base = Math.round(32 + height * 68 + shade * 64)
      let r = base
      let g = base + 3
      let b = base + 8

      const kind = classOf(grid, side, coarse, limitDeg, index)
      if (kind === 'hidden-hazard') {
        r = 248
        g = 68
        b = 58
      } else if (kind !== 'plain') {
        r = Math.round(base * 0.4 + 165)
        g = Math.round(base * 0.28)
        b = Math.round(base * 0.28)
      }
      // The hazard the coarse grid hides keeps its full red; everything else carries the laser's density.
      if (side === 'multiresolution' && kind !== 'hidden-hazard') {
        const tint = ldecTint(grid.ldecDensity[index])
        r = Math.round(r * (1 - 0.28 * tint))
        g = Math.min(255, Math.round(g * (1 - 0.15 * tint) + 32 * tint))
        b = Math.min(255, Math.round(b * (1 - 0.15 * tint) + 52 * tint))
      }

      const p = (py * size + px) * 4
      out[p] = r
      out[p + 1] = g
      out[p + 2] = b
      out[p + 3] = 255
    }
  }
  return out
}

/** Where a point given in metres from the grid's centre falls in the picture, in pixels; null outside it. */
export function pixelOf(
  grid: Pick<DecodedGrid, 'spanM'>,
  size: number,
  xM: number,
  yM: number,
): { x: number; y: number } | null {
  const half = grid.spanM / 2
  if (Math.abs(xM) > half || Math.abs(yM) > half) return null
  return { x: ((xM + half) / grid.spanM) * size, y: ((half - yM) / grid.spanM) * size }
}

/** The 2 km scale bar's length in pixels. */
export function scaleBarPixels(grid: Pick<DecodedGrid, 'spanM'>, size: number, barM = 2000): number {
  return (barM / grid.spanM) * size
}

/** The curtain's position as a pixel column, from a fraction 0 to 1. */
export function curtainColumn(fraction: number, size: number): number {
  return Math.round(size * Math.min(1, Math.max(0, fraction)))
}
