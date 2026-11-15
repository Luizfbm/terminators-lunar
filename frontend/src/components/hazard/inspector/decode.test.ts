import { describe, expect, it } from 'vitest'
import { base64Bytes, cellOf, decodeGrid, GridDecodeError } from './decode'
import { gridExample } from './examples'

// The expected values were printed by Eduardo's own `decodePGDA` + `sampleGrid`
// (src/js/rover_tese_engine.js, commit 2195fcb) run under Node on his DM1 bundle. The same rows are in
// backend/tests/test_hazard_data.py, which checks the backend's decoder against them. The contract's
// grid example is the central 10 x 10 km of DM1, so this decoder must give them too.
// x_m, y_m, row, col, elevation, slope 5 m, slope 20 m, slope 60 m, slope error, LDEC density, LDEC shot
const EDUARDO_DM1: [number, number, number, number, number, number, number, number, number, number, boolean][] = [
  [0, 0, 100, 100, 401.13, 8.5, 5.5, 4.0, 3.0, 0.015748, true],
  [609.9, 1159.0, 76, 112, 387.93, 2.5, 1.5, 1.0, 2.75, 0.007874, true],
  [-4975, 4975, 0, 0, 59.43, 15.5, 12.5, 7.0, 2.75, 0.007874, true],
  [3210, -2875, 157, 164, 81.43, 20.0, 19.5, 19.5, 2.5, 0.015748, false],
]

describe('the grid decodes the way Eduardo’s decoder does', () => {
  const grid = decodeGrid(gridExample())

  it.each(EDUARDO_DM1)('cell at (%f, %f) m', (x, y, row, col, surf, s5, s20, s60, serr, density, shot) => {
    expect(cellOf(grid, x, y)).toEqual({ row, col })
    const i = row * grid.n + col
    expect(grid.elevationM[i]).toBeCloseTo(surf, 2)
    expect(grid.slope5Deg[i]).toBeCloseTo(s5, 5)
    expect(grid.slope20Deg[i]).toBeCloseTo(s20, 5)
    expect(grid.slope60Deg[i]).toBeCloseTo(s60, 5)
    expect(grid.slopeErrorDeg[i]).toBeCloseTo(serr, 5)
    expect(grid.ldecDensity[i]).toBeCloseTo(density, 6)
    expect(grid.ldecAny[i] === 1).toBe(shot)
  })

  it('has 200 x 200 cells of 50 m across 10 km, every layer the same size', () => {
    expect([grid.n, grid.cellM, grid.spanM]).toEqual([200, 50, 10000])
    for (const layer of [grid.elevationM, grid.slope5Deg, grid.slope20Deg, grid.slope60Deg, grid.slopeErrorDeg, grid.ldecDensity, grid.ldecAny]) {
      expect(layer.length).toBe(200 * 200)
    }
  })

  it('stays inside the elevation range the API states', () => {
    const lo = Math.min(...grid.elevationM)
    const hi = Math.max(...grid.elevationM)
    expect(lo).toBeGreaterThanOrEqual(grid.zMinM - 0.1)
    expect(hi).toBeLessThanOrEqual(grid.zMaxM + 0.1)
  })

  it('puts the Site at the cell the API’s offset says', () => {
    // AR06 sits 609.9 m east and 1159 m north of DM1's centre (the contract's example): row 76, column 112.
    expect(cellOf(grid, 609.9, 1159.0)).toEqual({ row: 76, col: 112 })
    // A point past the edge is clamped onto the grid.
    expect(cellOf(grid, 9000, -9000)).toEqual({ row: 199, col: 199 })
  })
})

describe('what it refuses to draw', () => {
  it('reads standard base64', () => {
    expect([...base64Bytes('AQL/')]).toEqual([1, 2, 255])
  })

  it('rejects an array of the wrong size', () => {
    const grid = { ...gridExample(), slope_5m_u8: 'AAAA' }
    expect(() => decodeGrid(grid)).toThrow(GridDecodeError)
  })

  it('rejects an encoding it does not read', () => {
    const grid = gridExample()
    expect(() => decodeGrid({ ...grid, encoding: { ...grid.encoding, slope_5m: 'uint8, whole degrees' } })).toThrow(GridDecodeError)
  })
})
