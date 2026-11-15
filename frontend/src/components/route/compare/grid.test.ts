import { describe, expect, it } from 'vitest'
import { gridExample, routeExample } from './exampleData'
import { cellIndex, decodeBase64, decodeGrid, renderGround, type GroundGrid } from './grid'
import { cropOf, sourceRect, toPixel } from './view'

const grid = decodeGrid(gridExample)
const count = (values: Float32Array, over: number) => values.reduce((total, v) => total + (v > over ? 1 : 0), 0)

describe('the hazard grid decoded as the contract says', () => {
  // The expected numbers were counted by hand-run Python (base64 + struct) on the same example file,
  // not by this decoder: 20450 cells above 15 degrees at 5 m, 17477 at 60 m, 30882 laser cells.
  it('reads every layer to 200 x 200 cells of half degrees and decimetres', () => {
    expect(grid.n).toBe(200)
    expect(grid.elevationM.length).toBe(40000)
    expect(count(grid.slopeDeg[5], 15)).toBe(20450)
    expect(count(grid.slopeDeg[60], 15)).toBe(17477)
    expect(grid.slopeDeg[60].reduce((a, v) => Math.max(a, v), 0)).toBe(32)
    expect(grid.measured.reduce((a, v) => a + v, 0)).toBe(30882)
  })

  it('adds z_mid_m to the int16 decimetres of the centre cell', () => {
    // int16 at row 100, column 100 is 2026 dm and z_mid_m is 198.53 m: 401.13 m.
    expect(grid.elevationM[100 * 200 + 100]).toBeCloseTo(401.13, 1)
  })

  it('puts the start of the example on a cell whose 5 m slope is the waypoint’s own', () => {
    // Row 0 is +y and column 0 is -x: (609.9, 1159) is column 112, row 76.
    const index = cellIndex(grid, routeExample.start.x_m, routeExample.start.y_m)
    expect(index).toBe(76 * 200 + 112)
    expect(grid.slopeDeg[5][index]).toBe(routeExample.plans[0].path[0].slope_5m_deg)
  })

  it('refuses a layer whose length does not match n x n', () => {
    expect(() => decodeGrid({ ...gridExample, slope_5m_u8: gridExample.slope_5m_u8.slice(0, 40) })).toThrow(/slope_5m_u8/)
    expect(decodeBase64('AQID')).toEqual(Uint8Array.of(1, 2, 3))
  })
})

describe('the ground as pixels', () => {
  const style = { layer: 60 as const, limitDeg: 15, sunAzimuthDeg: 35, showMeasured: false }
  const pixels = renderGround(grid, style)
  const redder = (i: number) => pixels[i * 4] - pixels[i * 4 + 1]

  it('washes red exactly the cells steeper than the limit at the chosen resolution', () => {
    let wrong = 0
    for (let i = 0; i < grid.n * grid.n; i++) {
      const steep = grid.slopeDeg[60][i] > 15
      if (steep !== redder(i) > 60) wrong++
    }
    expect(wrong).toBe(0)
  })

  it('draws the same ground differently at another resolution', () => {
    const at5 = renderGround(grid, { ...style, layer: 5 })
    expect(at5).not.toEqual(pixels)
  })

  it('lightens a laser-measured cell that is not a hazard, and only when asked', () => {
    const lit = renderGround(grid, { ...style, layer: 5, showMeasured: true })
    const plain = renderGround(grid, { ...style, layer: 5 })
    let checked = 0
    for (let i = 0; i < grid.n * grid.n && checked < 50; i++) {
      if (grid.measured[i] && grid.slopeDeg[5][i] <= 15) {
        expect(lit[i * 4]).toBeGreaterThan(plain[i * 4])
        checked++
      }
    }
    expect(checked).toBe(50)
    const unmeasured = grid.measured.findIndex((v, i) => !v && grid.slopeDeg[5][i] <= 15)
    expect(lit[unmeasured * 4]).toBe(plain[unmeasured * 4])
  })
})

describe('the crop both panes show', () => {
  const crop = cropOf(routeExample, grid)

  it('holds the start, the goal and every waypoint of both plans inside the grid', () => {
    const half = (grid as GroundGrid).halfM
    expect(crop.x0).toBeGreaterThanOrEqual(-half)
    expect(crop.y1).toBeLessThanOrEqual(half)
    const inside = (x: number, y: number) => x >= crop.x0 && x <= crop.x0 + crop.spanM && y <= crop.y1 && y >= crop.y1 - crop.spanM
    expect(inside(routeExample.start.x_m, routeExample.start.y_m)).toBe(true)
    expect(inside(routeExample.goal.x_m, routeExample.goal.y_m)).toBe(true)
    for (const plan of routeExample.plans) for (const p of plan.path) expect(inside(p.x_m, p.y_m)).toBe(true)
  })

  it('maps the corners of the crop to the corners of the canvas, +y up', () => {
    expect(toPixel(crop, 500, { x_m: crop.x0, y_m: crop.y1 })).toEqual({ x: 0, y: 0 })
    const bottomRight = toPixel(crop, 500, [crop.x0 + crop.spanM, crop.y1 - crop.spanM])
    expect(bottomRight.x).toBeCloseTo(500)
    expect(bottomRight.y).toBeCloseTo(500)
  })

  it('picks the cells of the image under the crop', () => {
    const { sx, sy, size } = sourceRect(crop, grid)
    expect(size).toBeCloseTo(crop.spanM / 50)
    expect(sx).toBeCloseTo((crop.x0 + 5000) / 50)
    expect(sy).toBeCloseTo((5000 - crop.y1) / 50)
    expect(sx + size).toBeLessThanOrEqual(200 + 1e-9)
    expect(sy + size).toBeLessThanOrEqual(200 + 1e-9)
  })
})
