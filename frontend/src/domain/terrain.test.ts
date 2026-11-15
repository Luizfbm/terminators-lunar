import { describe, expect, it } from 'vitest'
import { beyondHorizon, covers, gridTriangles, heightAt, heightMapOf, horizonDistanceTable, horizonTable, mapBoundsOn, patchAround, patchBounds, pixelOf, type HeightMap } from './terrain'

const R = 1_737_400
const RAD = Math.PI / 180

/** A square map of `size` pixels of 100 m around the pole; `value` gives each pixel's 16-bit number. */
function map(size: number, value: (column: number, row: number) => number = () => 0): HeightMap {
  const data = new Uint16Array(size * size)
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) data[row * size + column] = value(column, row)
  return { size, metresPerPixel: 100, xMinM: (-size / 2) * 100, yMaxM: (size / 2) * 100, sphereRadiusM: R, at0M: 0, at65535M: 6553.5, data }
}

/** The grid point of a patch nearest to an azimuth, among those between two distances. */
function nearest(patch: ReturnType<typeof patchAround>, azimuthDeg: number, minM: number, maxM: number): number {
  let best = -1
  let gap = Infinity
  for (let at = 0; at < patch.azimuthDeg.length; at++) {
    if (patch.distanceM[at] < minM || patch.distanceM[at] > maxM) continue
    const apart = Math.abs(((patch.azimuthDeg[at] - azimuthDeg + 540) % 360) - 180)
    if (apart < gap) {
      gap = apart
      best = at
    }
  }
  return best
}

describe('where a place falls on the height map', () => {
  it('puts the pole in the middle, 0° longitude up and 90°E to the right', () => {
    const flat = map(400)
    // Pixel centres: the pole lies on the corner shared by pixels 199 and 200.
    expect(pixelOf(flat, -90, 0)).toEqual({ column: 199.5, row: 199.5 })
    const up = pixelOf(flat, -89.9, 0)
    expect(up.column).toBeCloseTo(199.5, 6)
    expect(up.row).toBeLessThan(199.5)
    const right = pixelOf(flat, -89.9, 90)
    expect(right.row).toBeCloseTo(199.5, 6)
    expect(right.column).toBeGreaterThan(199.5)
  })

  it('is a tenth of a degree of latitude away from the pole by about 3 km', () => {
    // On the ground a tenth of a degree is R * 0.1° = 3032 m; the plane stretches that by under 1 in a million here.
    const { row } = pixelOf(map(400), -89.9, 0)
    expect((199.5 - row) * 100).toBeCloseTo(R * 0.1 * RAD, 0)
  })
})

describe('the height at a point', () => {
  it('turns the 16-bit number into metres between the two ends the file states', () => {
    const ramp = map(4, (column) => column * 10000)
    expect(heightAt(ramp, 0, 0)).toBeCloseTo(0, 6)
    expect(heightAt(ramp, 2, 0)).toBeCloseTo(2000, 6)
  })

  it('is taken from the four pixels around it, in proportion', () => {
    const ramp = map(4, (column, row) => column * 10000 + row * 1000)
    expect(heightAt(ramp, 1.5, 0)).toBeCloseTo(1500, 6)
    expect(heightAt(ramp, 1.25, 2.5)).toBeCloseTo(1250 + 250, 6)
  })
})

describe('whether the map covers a Site', () => {
  const flat = map(400) // 20 km to each side of the pole
  it('needs the margin on every side', () => {
    expect(covers(flat, -89.9, 30, 10_000)).toBe(true)
    // 15 km from the pole leaves under 5 km to the edge.
    expect(covers(flat, -89.5, 0, 10_000)).toBe(false)
    expect(covers(flat, -89.5, 0, 4_000)).toBe(true)
  })

  it('says no to a Site far from the pole', () => {
    expect(covers(flat, 0.67, 23.47, 0)).toBe(false)
    expect(covers(flat, -84.8, 29.2, 0)).toBe(false)
  })
})

describe('the ground seen from the Observer', () => {
  // A Site 5 km from the pole on the 30°E meridian, on a smooth Moon, with the eye 2 m up.
  const patch = patchAround(map(400), -90 + 5000 / (R * RAD), 30, 2, 12_000, 1)

  it('has north away from the south pole, and east to the right of north', () => {
    // In the plane, away from the pole along 30°E is the direction (sin 30°, cos 30°).
    const columns = patch.columns
    const column = (at: number) => at % columns
    const row = (at: number) => Math.floor(at / columns)
    const north = nearest(patch, 0, 3000, 6000)
    const south = nearest(patch, 180, 3000, 6000)
    const east = nearest(patch, 90, 3000, 6000)
    // North is further from the pole (up and to the right on the map), south nearer.
    expect(row(north)).toBeLessThan(row(south))
    expect(column(north)).toBeGreaterThan(column(south))
    // East of a point on 30°E is towards greater longitude: to the right and down on the map.
    expect(column(east)).toBeGreaterThan(column(north))
    expect(row(east)).toBeGreaterThan(row(north))
  })

  it('drops below the level plane with distance, by the curve of the Moon and the height of the eye', () => {
    for (const azimuth of [0, 90, 200]) {
      const at = nearest(patch, azimuth, 7000, 9000)
      // On a sphere, a ground point an arc `arc` away is seen from an eye `eye` up at this angle.
      const arc = 2 * Math.asin(patch.distanceM[at] / (2 * R))
      const expected = Math.atan2(R * Math.cos(arc) - (R + 2), R * Math.sin(arc)) / RAD
      expect(patch.elevationDeg[at]).toBeCloseTo(expected, 3)
      expect(patch.elevationDeg[at]).toBeLessThan(-0.1)
    }
  })

  it('raises a hill where the hill is', () => {
    const site = pixelOf(map(400), -90 + 5000 / (R * RAD), 30)
    // A 300 m block about 4 km east-north-east of the Site in the plane (to the right on the map).
    const hill = map(400, (column, row) => (Math.abs(column - (site.column + 40)) <= 2 && Math.abs(row - site.row) <= 2 ? 3000 : 0))
    const withHill = patchAround(hill, -90 + 5000 / (R * RAD), 30, 2, 12_000, 1)
    let top = 0
    for (let at = 1; at < withHill.elevationDeg.length; at++) if (withHill.elevationDeg[at] > withHill.elevationDeg[top]) top = at
    expect(withHill.distanceM[top]).toBeGreaterThan(3500)
    expect(withHill.distanceM[top]).toBeLessThan(4500)
    // 300 m up at about 4 km is about 4 degrees.
    expect(withHill.elevationDeg[top]).toBeGreaterThan(3.5)
    expect(withHill.elevationDeg[top]).toBeLessThan(5)
    // To the right on the map from a Site on 30°E is towards 90°E: between north and south, on the east side.
    expect(withHill.azimuthDeg[top]).toBeGreaterThan(20)
    expect(withHill.azimuthDeg[top]).toBeLessThan(160)
  })

  it('takes fewer points with a wider stride, over the same ground', () => {
    const coarse = patchAround(map(400), -90 + 5000 / (R * RAD), 30, 2, 12_000, 4)
    expect(coarse.columns).toBe(Math.floor((patch.columns - 1) / 4) + 1)
    expect(Math.max(...coarse.distanceM)).toBeGreaterThan(10_000)
  })
})

describe('the Horizon mask as a table', () => {
  const mask = [0, 90, 180, 270].map((azimuth_deg, at) => ({ azimuth_deg, elevation_deg: [1, 3, -1, 0][at] }))
  const horizon = horizonTable(mask)

  it('gives the mask back at its own samples', () => {
    expect(horizon(0)).toBeCloseTo(1, 5)
    expect(horizon(90)).toBeCloseTo(3, 5)
    expect(horizon(270)).toBeCloseTo(0, 5)
  })

  it('is linear between samples, and round north', () => {
    expect(horizon(45)).toBeCloseTo(2, 5)
    expect(horizon(315)).toBeCloseTo(0.5, 5)
    expect(horizon(360)).toBeCloseTo(1, 5)
    expect(horizon(-90)).toBeCloseTo(0, 5)
  })
})

describe('reading the map description', () => {
  const doc = { sphere_radius_m: R, x_min_m: -200, y_max_m: 200, height_png: { size_px: 4, metres_per_pixel: 100, metres_above_1737400_m: { at_0: -10, at_65535: 10 } } }
  it('takes the numbers the file states', () => {
    const read = heightMapOf(doc, new Uint16Array(16), 4)
    expect(read).toMatchObject({ size: 4, metresPerPixel: 100, xMinM: -200, yMaxM: 200, at0M: -10, at65535M: 10 })
  })

  it('refuses a description without them, or an image of another size', () => {
    expect(heightMapOf({ ...doc, height_png: {} }, new Uint16Array(16), 4)).toBeNull()
    expect(heightMapOf(doc, new Uint16Array(16), 8)).toBeNull()
    expect(heightMapOf(null, new Uint16Array(16), 4)).toBeNull()
  })
})

describe('the triangles of the ground', () => {
  const site = [-90 + 5000 / (R * RAD), 30] as const
  const whole = map(400)

  it('are two for each cell of the grid, each on three different points', () => {
    const patch = patchAround(whole, ...site, 2, 1000, 1)
    const triangles = gridTriangles(patch)
    expect(triangles.length).toBe((patch.columns - 1) * (patch.rows - 1) * 6)
    expect(Math.max(...triangles)).toBe(patch.columns * patch.rows - 1)
    for (let at = 0; at < triangles.length; at += 3) expect(new Set(triangles.subarray(at, at + 3)).size).toBe(3)
  })

  it('leave out the coarse cells that lie under the fine grid, and keep the ones around it', () => {
    const fine = patchAround(whole, ...site, 2, 4000, 1)
    const coarse = patchAround(whole, ...site, 2, Infinity, 5)
    const all = gridTriangles(coarse)
    const holed = gridTriangles(coarse, patchBounds(fine))
    expect(holed.length).toBeLessThan(all.length)
    // What is left out is cells of 5 pixels wholly inside the fine grid, one cell in from its rim.
    const across = Math.floor((fine.columns - 1) / 5)
    const left = (all.length - holed.length) / 6
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThanOrEqual(across * across)
    expect(left).toBeGreaterThanOrEqual((across - 3) * (across - 3))
    // Every coarse point on the fine grid's outline is still used: no gap opens between the two.
    const used = new Set(holed)
    const lastColumn = fine.firstColumn + (fine.columns - 1) * fine.stride
    const lastRow = fine.firstRow + (fine.rows - 1) * fine.stride
    for (let row = 0; row < coarse.rows; row++) {
      for (let column = 0; column < coarse.columns; column++) {
        const x = coarse.firstColumn + column * coarse.stride
        const y = coarse.firstRow + row * coarse.stride
        const outside = x < fine.firstColumn || x > lastColumn || y < fine.firstRow || y > lastRow
        if (outside) expect(used.has(row * coarse.columns + column)).toBe(true)
      }
    }
  })

  it('reaches the whole map when asked for all of it', () => {
    const all = patchAround(whole, ...site, 2, Infinity, 5)
    expect(all.firstColumn).toBe(0)
    expect(all.firstRow).toBe(0)
    expect(all.columns).toBe(80)
    expect(all.rows).toBe(80)
  })
})

describe('a small map as a rectangle of a larger one', () => {
  // Two maps of the same projection: 400 pixels of 100 m, and 200 pixels of 500 m, both centred on the pole.
  const small = map(400)
  const large: HeightMap = { ...map(200), metresPerPixel: 500, xMinM: -50_000, yMaxM: 50_000 }

  it('lands where its own edges are, in the larger map\'s pixels', () => {
    const bounds = mapBoundsOn(large, small)
    // The small map runs from -20 km to +20 km; the large one starts at -50 km: 60 pixels of 500 m in.
    // Pixel centres: the small map's first centre is at -19.95 km, the large map's column 60 centre at -19.75 km.
    expect(bounds.firstColumn).toBeCloseTo(59.6, 6)
    expect(bounds.lastColumn).toBeCloseTo(139.4, 6)
    expect(bounds.firstRow).toBeCloseTo(59.6, 6)
    expect(bounds.lastRow).toBeCloseTo(139.4, 6)
  })

  it('makes a hole in the larger ground that stays inside the smaller map', () => {
    const site = [-90 + 5000 / (R * RAD), 30] as const
    const wide = patchAround(large, ...site, 2, Infinity, 4)
    const bounds = mapBoundsOn(large, small)
    const left = gridTriangles(wide, bounds)
    const used = new Set(left)
    // No point of the larger ground outside the small map is dropped.
    for (let row = 0; row < wide.rows; row++) {
      for (let column = 0; column < wide.columns; column++) {
        const x = wide.firstColumn + column * wide.stride
        const y = wide.firstRow + row * wide.stride
        if (x < bounds.firstColumn || x > bounds.lastColumn || y < bounds.firstRow || y > bounds.lastRow) expect(used.has(row * wide.columns + column)).toBe(true)
      }
    }
    expect(left.length).toBeLessThan(gridTriangles(wide).length)
  })

  it('is its own whole when the two maps are the same', () => {
    expect(mapBoundsOn(small, small)).toEqual({ firstColumn: 0, firstRow: 0, lastColumn: 399, lastRow: 399 })
  })
})

describe('ground beyond the horizon', () => {
  const site = [-90 + 5000 / (R * RAD), 30] as const
  const patch = patchAround(map(400), ...site, 2, 12_000, 1)
  // The engine's horizon: a rise 300 m away to the north half of the sky, nothing in the way to the south.
  const mask = Array.from({ length: 720 }, (_, at) => {
    const azimuth_deg = at / 2
    const north = azimuth_deg < 90 || azimuth_deg >= 270
    return { azimuth_deg, occluder: north ? { distance_m: 300 } : null }
  })
  const distance = horizonDistanceTable(mask)
  const hidden = beyondHorizon(patch, distance)

  it('reads the distance of the horizon in each direction off the mask', () => {
    expect(distance(0)).toBe(300)
    expect(distance(45.2)).toBe(300)
    expect(distance(359.9)).toBe(300)
    expect(distance(180)).toBe(Infinity)
    expect(distance(-10)).toBe(300)
  })

  it('hides the ground behind a near rise and keeps the ground before it', () => {
    for (let at = 0; at < hidden.length; at++) {
      const north = patch.azimuthDeg[at] < 89 || patch.azimuthDeg[at] > 271
      if (north && patch.distanceM[at] > 500) expect(hidden[at]).toBe(1)
      if (north && patch.distanceM[at] < 300) expect(hidden[at]).toBe(0)
    }
  })

  it('hides nothing where the horizon has no limit', () => {
    for (let at = 0; at < hidden.length; at++) {
      if (patch.azimuthDeg[at] > 91 && patch.azimuthDeg[at] < 269) expect(hidden[at]).toBe(0)
    }
  })

  it('leaves out the triangles that are wholly hidden, and only those', () => {
    const all = gridTriangles(patch)
    const seen = gridTriangles(patch, undefined, hidden)
    expect(seen.length).toBeLessThan(all.length)
    for (let at = 0; at < seen.length; at += 3) {
      expect(hidden[seen[at]] && hidden[seen[at + 1]] && hidden[seen[at + 2]]).toBeFalsy()
    }
    // Every triangle with a point in view is still there.
    let withAPointInView = 0
    for (let at = 0; at < all.length; at += 3) if (!(hidden[all[at]] && hidden[all[at + 1]] && hidden[all[at + 2]])) withAPointInView++
    expect(seen.length / 3).toBe(withAPointInView)
  })
})

