import type { DecodedGrid, HazardGrid } from './types'

/** The contract's `encoding` no longer says what this decoder reads, or the arrays are the wrong size. */
export class GridDecodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GridDecodeError'
  }
}

// How the stored integers turn into values (contract: HazardGridEncoding).
const DECIMETRE = 0.1
const HALF_DEGREE = 0.5
const QUARTER_DEGREE = 0.25
const LDEC_SHOT_BIT = 128
const LDEC_DENSITY_MASK = 127

/** Standard base64 to bytes. */
export function base64Bytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function uint8Layer(text: string, cells: number, name: string): Uint8Array {
  const bytes = base64Bytes(text)
  if (bytes.length !== cells) throw new GridDecodeError(`${name}: ${bytes.length} bytes, expected ${cells}`)
  return bytes
}

function scaled(bytes: Uint8Array, scale: number): Float32Array {
  const out = new Float32Array(bytes.length)
  for (let i = 0; i < bytes.length; i += 1) out[i] = bytes[i] * scale
  return out
}

/** Every stored layer says how it is scaled; refuse to draw if the contract's words are not the ones this reads. */
function checkEncoding(encoding: HazardGrid['encoding']): void {
  const expect: [string, string, RegExp][] = [
    ['elevation', encoding.elevation, /int16.*decimetre/i],
    ['slope_5m', encoding.slope_5m, /uint8.*half degree/i],
    ['slope_20m', encoding.slope_20m, /uint8.*half degree/i],
    ['slope_60m', encoding.slope_60m, /uint8.*half degree/i],
    ['slope_error', encoding.slope_error, /uint8.*quarter degree/i],
    ['ldec', encoding.ldec, /uint8.*bit 7/i],
  ]
  for (const [name, text, pattern] of expect) {
    if (!pattern.test(text)) throw new GridDecodeError(`encoding of ${name} is not the one this reads: ${text}`)
  }
}

/**
 * Turns the grid the API sends into numbers: elevation as int16 little-endian decimetres from
 * `z_mid_m`, slopes as uint8 half degrees, slope error as uint8 quarter degrees, LDEC with bit 7 for
 * a real laser shot and bits 0 to 6 for its density times 127. This is only reading; no hazard is
 * computed here (ADR 0002).
 */
export function decodeGrid(grid: HazardGrid): DecodedGrid {
  checkEncoding(grid.encoding)
  const cells = grid.n * grid.n

  const raw = base64Bytes(grid.elevation_i16)
  if (raw.length !== cells * 2) throw new GridDecodeError(`elevation: ${raw.length} bytes, expected ${cells * 2}`)
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const elevationM = new Float32Array(cells)
  for (let i = 0; i < cells; i += 1) elevationM[i] = grid.z_mid_m + view.getInt16(i * 2, true) * DECIMETRE

  const ldec = uint8Layer(grid.ldec_u8, cells, 'ldec')
  const ldecDensity = new Float32Array(cells)
  const ldecAny = new Uint8Array(cells)
  for (let i = 0; i < cells; i += 1) {
    ldecDensity[i] = (ldec[i] & LDEC_DENSITY_MASK) / LDEC_DENSITY_MASK
    ldecAny[i] = (ldec[i] & LDEC_SHOT_BIT) !== 0 ? 1 : 0
  }

  return {
    n: grid.n,
    cellM: grid.cell_m,
    spanM: grid.span_m,
    elevationM,
    zMinM: grid.z_min_m,
    zMaxM: grid.z_max_m,
    slope5Deg: scaled(uint8Layer(grid.slope_5m_u8, cells, 'slope_5m'), HALF_DEGREE),
    slope20Deg: scaled(uint8Layer(grid.slope_20m_u8, cells, 'slope_20m'), HALF_DEGREE),
    slope60Deg: scaled(uint8Layer(grid.slope_60m_u8, cells, 'slope_60m'), HALF_DEGREE),
    slopeErrorDeg: scaled(uint8Layer(grid.slope_error_u8, cells, 'slope_error'), QUARTER_DEGREE),
    ldecDensity,
    ldecAny,
  }
}

/** Row and column of the cell holding a point given in metres from the grid's centre (+y up, +x right), clamped to the grid. */
export function cellOf(grid: Pick<DecodedGrid, 'n' | 'cellM'>, xM: number, yM: number): { row: number; col: number } {
  const half = (grid.n * grid.cellM) / 2
  const clamp = (value: number) => Math.min(Math.max(Math.floor(value), 0), grid.n - 1)
  return { col: clamp((xM + half) / grid.cellM), row: clamp((half - yM) / grid.cellM) }
}
