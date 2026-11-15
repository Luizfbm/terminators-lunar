import { describe, expect, it } from 'vitest'
import { exampleGrid, exampleRoute } from './fixtures'
import { GridShapeError, cellOf, centreOf, decodeGrid, measuredAt, normalAt, reliefAt, slope5At } from './terrain'

describe('decodeGrid on the contract example', () => {
  const raw = exampleGrid()
  const grid = decodeGrid(raw)

  it('holds n x n cells of 50 m centred on the plane origin', () => {
    expect(grid.n).toBe(200)
    expect(grid.cellM).toBe(50)
    expect(grid.halfM).toBe(5000)
    expect(grid.reliefM).toHaveLength(200 * 200)
  })

  it('has the heights the grid says it has: z_min_m and z_max_m, to the decimetre it is stored in', () => {
    let low = Infinity
    let high = -Infinity
    for (const value of grid.reliefM) {
      low = Math.min(low, value)
      high = Math.max(high, value)
    }
    expect(grid.zMidM + low).toBeCloseTo(raw.z_min_m, 1)
    expect(grid.zMidM + high).toBeCloseTo(raw.z_max_m, 1)
  })

  it('reads a block of the 5 m slope and the laser bit as the encoding says (half degrees, bit 7)', () => {
    // Values taken from the example's own bytes with an independent decoder (python base64 + struct).
    const middle = 100 * 200 + 100
    expect(grid.slope5Deg[middle]).toBe(17 / 2)
    expect(grid.reliefM[middle]).toBeCloseTo(202.6, 3)
    expect(grid.reliefM[0]).toBeCloseTo(-139.1, 3)
    expect(grid.measured.reduce((sum, bit) => sum + bit, 0)).toBe(30882)
  })

  it('agrees with the route example: its waypoints carry the 5 m slope of the block they stand on', () => {
    const route = exampleRoute()
    for (const plan of route.plans) {
      for (const point of plan.path) {
        expect(slope5At(grid, point.x_m, point.y_m)).toBe(point.slope_5m_deg)
        expect(point.hazard).toBe(point.slope_5m_deg > route.rover.slope_limit_deg)
      }
    }
  })

  it('refuses arrays that are not n x n instead of drawing them wrong', () => {
    expect(() => decodeGrid({ ...raw, slope_5m_u8: raw.slope_5m_u8.slice(0, 40) })).toThrow(GridShapeError)
    expect(() => decodeGrid({ ...raw, elevation_i16: raw.elevation_i16.slice(0, 400) })).toThrow(GridShapeError)
  })
})

describe('reading the grid', () => {
  const grid = decodeGrid(exampleGrid())

  it('puts row 0 at the +y edge and column 0 at the -x edge', () => {
    expect(cellOf(grid, -4990, 4990)).toEqual({ row: 0, col: 0 })
    expect(cellOf(grid, 4990, -4990)).toEqual({ row: 199, col: 199 })
    expect(cellOf(grid, 0, 0)).toEqual({ row: 100, col: 100 })
    // Past the edge the nearest cell answers, as Eduardo's sampleGrid does.
    expect(cellOf(grid, 9000, -9000)).toEqual({ row: 199, col: 199 })
  })

  it('gives a cell its centre back', () => {
    expect(centreOf(grid, 0, 0)).toEqual({ x: -4975, y: 4975 })
    const { x, y } = centreOf(grid, 37, 120)
    expect(cellOf(grid, x, y)).toEqual({ row: 37, col: 120 })
  })

  it('returns a block’s own height at its centre and blends between centres', () => {
    const { x, y } = centreOf(grid, 80, 90)
    expect(reliefAt(grid, x, y)).toBeCloseTo(grid.reliefM[80 * 200 + 90], 4)
    const next = centreOf(grid, 80, 91)
    const between = reliefAt(grid, (x + next.x) / 2, y)
    expect(between).toBeCloseTo((grid.reliefM[80 * 200 + 90] + grid.reliefM[80 * 200 + 91]) / 2, 4)
  })

  it('stays inside the grid at its edges', () => {
    expect(Number.isFinite(reliefAt(grid, 99999, -99999))).toBe(true)
    expect(measuredAt(grid, 0, 0)).toBe(grid.measured[100 * 200 + 100] === 1)
  })

  it('has unit normals that lean away from rising ground', () => {
    const n = normalAt(grid, 600, 1160)
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 6)
    expect(n.z).toBeGreaterThan(0)
    const rise = (reliefAt(grid, 606, 1160) - reliefAt(grid, 594, 1160)) / 12
    expect(Math.sign(n.x)).toBe(rise === 0 ? 0 : -Math.sign(rise))
  })
})
