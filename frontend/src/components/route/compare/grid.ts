import type { GroundLayer, HazardGrid } from './types'

/**
 * The hazard grid as numbers a canvas can draw. Nothing here decides anything: the layers are
 * decoded exactly as the contract's `encoding` says, and the only judgement left is the colour of
 * a cell, drawn against the slope limit the route came back with (ADR 0002).
 */
export interface GroundGrid {
  /** Cells per side. */
  n: number
  /** Metres per cell side (50). */
  cellM: number
  /** Metres from the grid's centre to its edge. */
  halfM: number
  /** Height of each cell in metres, absolute (`z_mid_m` already added). */
  elevationM: Float32Array
  zMinM: number
  zMaxM: number
  /** Slope in degrees at each resolution, per 50 m cell. */
  slopeDeg: Record<GroundLayer, Float32Array>
  /** The cell holds a real laser shot (bit 7 of the `ldec` layer). */
  measured: Uint8Array
}

export function decodeBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function layerBytes(name: string, text: string, expected: number): Uint8Array {
  const bytes = decodeBase64(text)
  if (bytes.length !== expected) throw new Error(`hazard grid layer ${name} has ${bytes.length} bytes, expected ${expected}`)
  return bytes
}

/** `slope_*_u8` are half degrees; the elevation is int16 little-endian decimetres from `z_mid_m`. */
export function decodeGrid(grid: HazardGrid): GroundGrid {
  const cells = grid.n * grid.n
  const half = (bytes: Uint8Array) => Float32Array.from(bytes, (v) => v / 2)
  const elevationBytes = layerBytes('elevation_i16', grid.elevation_i16, cells * 2)
  const view = new DataView(elevationBytes.buffer, elevationBytes.byteOffset, elevationBytes.byteLength)
  const elevationM = new Float32Array(cells)
  for (let i = 0; i < cells; i++) elevationM[i] = grid.z_mid_m + view.getInt16(i * 2, true) / 10
  const ldec = layerBytes('ldec_u8', grid.ldec_u8, cells)
  return {
    n: grid.n,
    cellM: grid.cell_m,
    halfM: grid.span_m / 2,
    elevationM,
    zMinM: grid.z_min_m,
    zMaxM: grid.z_max_m,
    slopeDeg: {
      60: half(layerBytes('slope_60m_u8', grid.slope_60m_u8, cells)),
      20: half(layerBytes('slope_20m_u8', grid.slope_20m_u8, cells)),
      5: half(layerBytes('slope_5m_u8', grid.slope_5m_u8, cells)),
    },
    measured: Uint8Array.from(ldec, (v) => (v & 0x80 ? 1 : 0)),
  }
}

/** The cell index under a point of the plane; row 0 is the +y edge and column 0 the -x edge. */
export function cellIndex(grid: GroundGrid, xM: number, yM: number): number {
  const col = Math.max(0, Math.min(grid.n - 1, Math.floor((xM + grid.halfM) / grid.cellM)))
  const row = Math.max(0, Math.min(grid.n - 1, Math.floor((grid.halfM - yM) / grid.cellM)))
  return row * grid.n + col
}

export interface GroundStyle {
  /** The resolution whose slope decides which cells are drawn as hazard. */
  layer: GroundLayer
  /** The Rover's slope limit, in degrees. */
  limitDeg: number
  /** The Sun's azimuth, clockwise from north, for the relief shading. */
  sunAzimuthDeg: number
  /** Lighten the cells that hold a real laser shot. */
  showMeasured: boolean
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

/**
 * One RGBA pixel per cell: relief shaded from the Sun's side, with the cells steeper than the
 * limit (at the chosen resolution) washed red. The red is the app's error tone, not a third meaning
 * for amber or blue.
 */
export function renderGround(grid: GroundGrid, style: GroundStyle): Uint8ClampedArray {
  const { n, cellM } = grid
  const out = new Uint8ClampedArray(n * n * 4)
  const az = (style.sunAzimuthDeg * Math.PI) / 180
  const sx = Math.sin(az)
  const sy = Math.cos(az)
  const span = Math.max(1, grid.zMaxM - grid.zMinM)
  const z = (row: number, col: number) => grid.elevationM[clamp(row, 0, n - 1) * n + clamp(col, 0, n - 1)]
  const slope = grid.slopeDeg[style.layer]

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const i = row * n + col
      // Row 0 is +y, so north is the row above.
      const nx = -(z(row, col + 1) - z(row, col - 1)) / (2 * cellM)
      const ny = -(z(row - 1, col) - z(row + 1, col)) / (2 * cellM)
      const lit = (nx * sx + ny * sy + 0.25) / Math.hypot(nx, ny, 1)
      const hill = clamp(0.45 + lit * 0.65, 0.15, 1)
      const alt = (grid.elevationM[i] - grid.zMinM) / span
      let base = 26 + alt * 50 + hill * 70
      let r: number
      let g: number
      let b: number
      if (slope[i] > style.limitDeg) {
        r = base * 0.45 + 150
        g = base * 0.3 + 22
        b = base * 0.3 + 22
      } else {
        if (style.showMeasured && grid.measured[i]) base += 16
        r = base
        g = base + 2
        b = base + 8
      }
      const p = i * 4
      out[p] = r
      out[p + 1] = g
      out[p + 2] = b
      out[p + 3] = 255
    }
  }
  return out
}
