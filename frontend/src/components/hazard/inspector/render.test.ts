import { describe, expect, it } from 'vitest'
import { decodeGrid } from './decode'
import { gridExample, hazardExample } from './examples'
import { classOf, curtainColumn, ldecTint, pixelOf, renderLayer, scaleBarPixels } from './render'

const grid = decodeGrid(gridExample())
const limit = hazardExample().slope_limit_deg
const SIZE = 400
const HIDDEN = [248, 68, 58]

function pixel(layer: Uint8ClampedArray, x: number, y: number): number[] {
  const p = (y * SIZE + x) * 4
  return [layer[p], layer[p + 1], layer[p + 2], layer[p + 3]]
}

/** The first cell of a kind, found by reading the decoded values. */
function firstCell(kind: ReturnType<typeof classOf>): number {
  for (let i = 0; i < grid.n * grid.n; i += 1) {
    if (classOf(grid, 'multiresolution', 60, limit, i) === kind) return i
  }
  throw new Error(`no ${kind} cell`)
}

describe('which cells are hazards on each side of the curtain', () => {
  it('uses the API’s 15° limit', () => {
    expect(limit).toBe(15)
  })

  it('Normal navigation sees only the coarse grid', () => {
    // Eduardo's row 3 of the DM1 table: slopes 5 m 20.0°, 20 m 19.5°, 60 m 19.5°, all over 15°.
    const steep = 157 * grid.n + 164
    expect(classOf(grid, 'normal', 60, limit, steep)).toBe('coarse-hazard')
    expect(classOf(grid, 'normal', 20, limit, steep)).toBe('coarse-hazard')
    // Row 1: 2.5° at 5 m, 1.5° at 20 m, 1.0° at 60 m: safe on both.
    const flat = 76 * grid.n + 112
    expect(classOf(grid, 'normal', 60, limit, flat)).toBe('plain')
    expect(classOf(grid, 'multiresolution', 60, limit, flat)).toBe('plain')
  })

  it('Multiresolution shows a hazard the coarse grid hides', () => {
    // The corner cell: 15.5° at 5 m (over 15°), 7.0° on the 60 m grid (under it).
    const corner = 0
    expect(classOf(grid, 'normal', 60, limit, corner)).toBe('plain')
    expect(classOf(grid, 'multiresolution', 60, limit, corner)).toBe('hidden-hazard')
    // The same cell on the 20 m grid, 12.5°, is hidden too.
    expect(classOf(grid, 'multiresolution', 20, limit, corner)).toBe('hidden-hazard')
  })

  it('a cell both see as steep is not a hidden hazard', () => {
    expect(classOf(grid, 'multiresolution', 60, limit, 157 * grid.n + 164)).toBe('seen-hazard')
  })

  it('has hidden hazards in this grid, the point of the comparison', () => {
    let hidden = 0
    for (let i = 0; i < grid.n * grid.n; i += 1) if (classOf(grid, 'multiresolution', 60, limit, i) === 'hidden-hazard') hidden += 1
    expect(hidden).toBeGreaterThan(0)
  })
})

describe('the two pictures', () => {
  const normal = renderLayer(grid, 'normal', { coarse: 60, limitDeg: limit, size: SIZE })
  const multi = renderLayer(grid, 'multiresolution', { coarse: 60, limitDeg: limit, size: SIZE })

  it('are opaque squares of the size asked', () => {
    expect(normal.length).toBe(SIZE * SIZE * 4)
    expect(multi.length).toBe(SIZE * SIZE * 4)
    expect(pixel(normal, 0, 0)[3]).toBe(255)
    expect(pixel(multi, SIZE - 1, SIZE - 1)[3]).toBe(255)
  })

  it('paint the hidden hazard bright red on the Multiresolution side only', () => {
    const cell = firstCell('hidden-hazard')
    const row = Math.floor(cell / grid.n)
    const col = cell % grid.n
    // Two picture pixels per cell: the cell's top-left pixel.
    expect(pixel(multi, col * 2, row * 2).slice(0, 3)).toEqual(HIDDEN)
    expect(pixel(normal, col * 2, row * 2).slice(0, 3)).not.toEqual(HIDDEN)
  })

  it('never paint that red on the Normal navigation side', () => {
    let bright = 0
    for (let p = 0; p < normal.length; p += 4) if (normal[p] === HIDDEN[0] && normal[p + 1] === HIDDEN[1] && normal[p + 2] === HIDDEN[2]) bright += 1
    expect(bright).toBe(0)
  })

  it('tint blue as strongly as the laser shot density, on the Multiresolution side only', () => {
    // The densest plain cell: the blue tint lifts blue over red there, and leaves Normal navigation alone.
    let index = -1
    for (let i = 0; i < grid.n * grid.n; i += 1) {
      if (classOf(grid, 'multiresolution', 60, limit, i) !== 'plain') continue
      if (index < 0 || grid.ldecDensity[i] > grid.ldecDensity[index]) index = i
    }
    expect(grid.ldecDensity[index]).toBeGreaterThan(0.08)
    const x = (index % grid.n) * 2
    const y = Math.floor(index / grid.n) * 2
    const [rm, , bm] = pixel(multi, x, y)
    const [rn, , bn] = pixel(normal, x, y)
    expect(bn - rn).toBe(8)
    expect(bm - rm).toBeGreaterThan(40)
  })

  it('has a tint that grows with the density and stops at 1', () => {
    expect(ldecTint(0)).toBe(0)
    expect(ldecTint(0.05)).toBeCloseTo(0.5, 9)
    expect(ldecTint(0.1)).toBe(1)
    expect(ldecTint(1)).toBe(1)
  })

  it('differ between the 60 m and the 20 m grid on the Normal navigation side', () => {
    const coarse20 = renderLayer(grid, 'normal', { coarse: 20, limitDeg: limit, size: SIZE })
    expect(Buffer.compare(Buffer.from(coarse20), Buffer.from(normal))).not.toBe(0)
  })
})

describe('where things sit on the picture', () => {
  it('puts the Site at the API’s offset from the centre, north up', () => {
    // AR06 is 609.9 m east and 1159 m north of DM1's centre (contract example): right of centre, above it.
    const at = pixelOf(grid, SIZE, 609.9, 1159.0)!
    expect(at.x).toBeCloseTo(((609.9 + 5000) / 10000) * SIZE, 6)
    expect(at.y).toBeCloseTo(((5000 - 1159) / 10000) * SIZE, 6)
    expect(at.x).toBeGreaterThan(SIZE / 2)
    expect(at.y).toBeLessThan(SIZE / 2)
  })

  it('gives no place for a point outside the grid', () => {
    expect(pixelOf(grid, SIZE, 5001, 0)).toBeNull()
    expect(pixelOf(grid, SIZE, 0, -6000)).toBeNull()
  })

  it('draws the 2 km bar as a fifth of the 10 km picture', () => {
    expect(scaleBarPixels(grid, SIZE)).toBe(80)
  })

  it('keeps the curtain on the picture', () => {
    expect(curtainColumn(0.5, SIZE)).toBe(200)
    expect(curtainColumn(-1, SIZE)).toBe(0)
    expect(curtainColumn(7, SIZE)).toBe(SIZE)
  })
})
