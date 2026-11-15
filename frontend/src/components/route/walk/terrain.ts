import type { HazardGrid } from './types'

/**
 * The hazard grid as numbers, decoded exactly as `encoding` in the contract says: row 0 is the +y edge
 * and column 0 the -x edge of the grid's plane, centred on (0, 0). Nothing is added to it: the relief
 * the walk shows is these heights and no others.
 */
export interface WalkGrid {
  n: number
  cellM: number
  /** Metres from the grid's centre to its edge. */
  halfM: number
  zMidM: number
  /** Mean height of each block, in metres from `zMidM` (row-major). */
  reliefM: Float32Array
  /** The 90th percentile of the 5 m slope in each block, in degrees. */
  slope5Deg: Float32Array
  /** 1 where a real laser shot fell in the block. */
  measured: Uint8Array
}

/** A column and row of cells on the grid, as `hazard_data.py` and Eduardo's `sampleGrid` read a point. */
export function cellOf(grid: Pick<WalkGrid, 'n' | 'cellM' | 'halfM'>, x: number, y: number): { row: number; col: number } {
  const col = Math.min(Math.max(Math.floor((x + grid.halfM) / grid.cellM), 0), grid.n - 1)
  const row = Math.min(Math.max(Math.floor((grid.halfM - y) / grid.cellM), 0), grid.n - 1)
  return { row, col }
}

/** The plane coordinates of a cell's centre. */
export function centreOf(grid: Pick<WalkGrid, 'cellM' | 'halfM'>, row: number, col: number): { x: number; y: number } {
  return { x: (col + 0.5) * grid.cellM - grid.halfM, y: grid.halfM - (row + 0.5) * grid.cellM }
}

export function base64ToBytes(text: string): Uint8Array {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Thrown when the arrays do not hold n x n cells: the grid is not drawn rather than drawn wrong. */
export class GridShapeError extends Error {
  constructor(layer: string) {
    super(`hazard grid layer ${layer} does not hold n x n cells`)
    this.name = 'GridShapeError'
  }
}

export function decodeGrid(grid: HazardGrid): WalkGrid {
  const count = grid.n * grid.n
  const elevation = base64ToBytes(grid.elevation_i16)
  const slope = base64ToBytes(grid.slope_5m_u8)
  const ldec = base64ToBytes(grid.ldec_u8)
  if (elevation.length !== count * 2) throw new GridShapeError('elevation_i16')
  if (slope.length !== count) throw new GridShapeError('slope_5m_u8')
  if (ldec.length !== count) throw new GridShapeError('ldec_u8')
  const view = new DataView(elevation.buffer, elevation.byteOffset, elevation.byteLength)
  const reliefM = new Float32Array(count)
  const slope5Deg = new Float32Array(count)
  const measured = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    // int16 decimetres, little-endian; uint8 half degrees; bit 7 of ldec says a laser shot fell here.
    reliefM[i] = view.getInt16(i * 2, true) / 10
    slope5Deg[i] = slope[i] / 2
    measured[i] = ldec[i] & 0x80 ? 1 : 0
  }
  return { n: grid.n, cellM: grid.cell_m, halfM: (grid.n * grid.cell_m) / 2, zMidM: grid.z_mid_m, reliefM, slope5Deg, measured }
}

/** Height at a point, in metres from `zMidM`, read bilinearly between the centres of the four nearest blocks. */
export function reliefAt(grid: WalkGrid, x: number, y: number): number {
  const fx = Math.min(Math.max((x + grid.halfM) / grid.cellM - 0.5, 0), grid.n - 1.0001)
  const fy = Math.min(Math.max((grid.halfM - y) / grid.cellM - 0.5, 0), grid.n - 1.0001)
  const col = Math.floor(fx)
  const row = Math.floor(fy)
  const tx = fx - col
  const ty = fy - row
  const at = (r: number, c: number) => grid.reliefM[r * grid.n + c]
  const top = at(row, col) * (1 - tx) + at(row, col + 1) * tx
  const bottom = at(row + 1, col) * (1 - tx) + at(row + 1, col + 1) * tx
  return top * (1 - ty) + bottom * ty
}

/** The 5 m slope of the block under a point, in degrees. */
export function slope5At(grid: WalkGrid, x: number, y: number): number {
  const { row, col } = cellOf(grid, x, y)
  return grid.slope5Deg[row * grid.n + col]
}

export function measuredAt(grid: WalkGrid, x: number, y: number): boolean {
  const { row, col } = cellOf(grid, x, y)
  return grid.measured[row * grid.n + col] === 1
}

/** Unit normal of the ground at a point, from the heights `reachM` either side (x east, y north, z up). */
export function normalAt(grid: WalkGrid, x: number, y: number, reachM = 6): { x: number; y: number; z: number } {
  const dx = (reliefAt(grid, x + reachM, y) - reliefAt(grid, x - reachM, y)) / (2 * reachM)
  const dy = (reliefAt(grid, x, y + reachM) - reliefAt(grid, x, y - reachM)) / (2 * reachM)
  const length = Math.hypot(dx, dy, 1)
  return { x: -dx / length, y: -dy / length, z: 1 / length }
}
