import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blendRim, canTakeFinest, eyeOnMap, GRAIN_DEPTH, GRAIN_M, GRAIN_PX, grainRepeat, grainTexels, RIM_PX, siteTilesOf, tileCovering } from './nearGround'
import { decodeGrey16 } from './png16'
import { heightAt, heightMapOf, patchAround, pixelOf, type HeightMap } from './terrain'

// The square of Site 001 is what deploy/globe_assets.py builds from the 20 m DEM fixture
// (fixtures/dem/LDEM_80S_20MPP_ADJ.TIF). The heights it is checked against were read from that
// fixture with rasterio on their own, not through the build: testdata/site001_dem_heights.json.
const testdata = (name: string) => new URL(`./testdata/${name}`, import.meta.url)
const index: unknown = JSON.parse(readFileSync(testdata('site_20m.json'), 'utf8'))
const dem = JSON.parse(readFileSync(testdata('site001_dem_heights.json'), 'utf8')) as {
  points: { latitude_deg: number; longitude_deg: number; metres_from_site: number; height_m: number }[]
}
const SITE_001 = { latitude: -89.4661, longitude: -136.949 }

async function site001(): Promise<HeightMap> {
  const tiles = siteTilesOf(index)
  const tile = tiles && tileCovering(tiles, SITE_001.latitude, SITE_001.longitude)
  if (!tile) throw new Error('no square for Site 001')
  const { width, data } = await decodeGrey16(new Uint8Array(readFileSync(testdata(tile.file))))
  const map = heightMapOf(tile.doc, data, width)
  if (!map) throw new Error('the square does not read')
  return map
}

/** A square map of one height everywhere, on the same plane. */
function flat(heightM: number, around: HeightMap, metresPerPixel: number, size: number): HeightMap {
  const centreX = around.xMinM + (around.size * around.metresPerPixel) / 2
  const centreY = around.yMaxM - (around.size * around.metresPerPixel) / 2
  const half = (size * metresPerPixel) / 2
  return {
    size,
    metresPerPixel,
    xMinM: centreX - half,
    yMaxM: centreY + half,
    sphereRadiusM: around.sphereRadiusM,
    at0M: heightM,
    at65535M: heightM + 1,
    data: new Uint16Array(size * size),
  }
}

const quantum = (map: HeightMap) => (map.at65535M - map.at0M) / 65535
const heightOf = (map: HeightMap, latitudeDeg: number, longitudeDeg: number) => {
  const { column, row } = pixelOf(map, latitudeDeg, longitudeDeg)
  return heightAt(map, column, row)
}

describe('the 20 m ground around Site 001', () => {
  it('has, within a few hundred metres of the Observer, the 20 m DEM’s own heights', async () => {
    const square = await site001()
    expect(square.metresPerPixel).toBe(20)
    // As the view from the ground builds it: the square eased into the 90 m ground at its rim,
    // here a flat one far from the real heights, so a rim reaching inwards would show.
    const ground = blendRim(square, flat(1500, square, 90, 200))
    // Half a quantum of each 16-bit copy, and the JSON keeps the scale's ends to the millimetre.
    const tolerance = quantum(square) / 2 + 0.001 + quantum(ground) / 2
    expect(dem.points.length).toBeGreaterThan(10)
    for (const point of dem.points) {
      expect(point.metres_from_site).toBeLessThanOrEqual(450)
      expect(Math.abs(heightOf(ground, point.latitude_deg, point.longitude_deg) - point.height_m)).toBeLessThanOrEqual(tolerance)
    }
    // Real relief, not a flat sheet: tens of metres within about 400 m.
    const heights = dem.points.map((point) => point.height_m)
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(30)
  })

  it('is built a point every 20 m around the eye', async () => {
    const ground = await site001()
    const patch = patchAround(ground, SITE_001.latitude, SITE_001.longitude, 2, 4000, 1)
    // The square is all there is: 320 points a side, with the Site in the middle.
    expect(patch.columns).toBe(320)
    expect(patch.rows).toBe(320)
    const middle = 160 * patch.columns + 160
    expect(patch.distanceM[middle]).toBeLessThan(20)
    // Neighbours one point apart are 20 m apart, give or take the slope between them.
    const apart = Math.abs(patch.distanceM[middle + 10] - patch.distanceM[middle + 9])
    expect(apart).toBeGreaterThan(17)
    expect(apart).toBeLessThan(23)
  })
})

describe('which square holds a Site', () => {
  const tiles = siteTilesOf(index) ?? []

  it('finds the square of a point a few hundred metres from a Curated Site', () => {
    expect(tileCovering(tiles, -89.4661 + 0.01, -136.949)?.id).toBe('001')
  })

  it('finds none for a point too near the square’s edge, or north of the polar plane', () => {
    // 0.1° of latitude is about 3 km: under 1.5 km from the edge of a ±3.2 km square.
    expect(tileCovering(tiles, -89.4661 + 0.1, -136.949)).toBeNull()
    expect(tileCovering(tiles, 10, 0)).toBeNull()
  })

  it('reads no squares from an index that is not one', () => {
    expect(siteTilesOf(null)).toBeNull()
    expect(siteTilesOf({ tiles: {} })).toBeNull()
    expect(siteTilesOf({ sphere_radius_m: 1737400, tiles: { x: { x_min_m: 'a' } } })).toEqual([])
  })
})

describe('the rim of the 20 m square', () => {
  it('meets the coarser ground at its edge and keeps its own heights inside', async () => {
    const square = await site001()
    const coarser = flat(1500, square, 90, 200)
    const ground = blendRim(square, coarser)
    const own = (map: HeightMap, column: number, row: number) => heightAt(map, column, row)
    expect(own(ground, 0, 160)).toBeCloseTo(1500, 1)
    expect(own(ground, 319, 319)).toBeCloseTo(1500, 1)
    const inside = RIM_PX + 1
    expect(Math.abs(own(ground, inside, 160) - own(square, inside, 160))).toBeLessThanOrEqual(quantum(square) + quantum(ground))
  })

  it('leaves the square as it is when there is nothing around it', async () => {
    const square = await site001()
    expect(blendRim(square, null)).toBe(square)
  })
})

describe('the grain of regolith', () => {
  const texels = grainTexels()

  it('has no texel wider than a fraction of the finest DEM cell', () => {
    expect(GRAIN_M).toBeLessThan(20)
    expect(grainRepeat({ size: 320, metresPerPixel: 20 }) * GRAIN_PX * GRAIN_M).toBeCloseTo(6400, 6)
  })

  it('is faint, and as bright on average everywhere', () => {
    // One plain loop and a single assertion: an expect() per texel is hundreds of thousands of
    // calls, which is what made this test time out when the machine was busy.
    let sum = 0
    let lowest = Infinity
    let highest = -Infinity
    let outOfRange = -1
    for (let index = 0; index < texels.length; index++) {
      const value = texels[index]
      sum += value
      if (value < lowest) lowest = value
      if (value > highest) highest = value
      if (outOfRange < 0 && (value < 1 - GRAIN_DEPTH || value > 1)) outOfRange = index
    }
    expect(
      { lowest, highest, firstOutOfRange: outOfRange < 0 ? 'none' : `texel ${outOfRange} = ${texels[outOfRange]}` },
      `grain texels must stay within [${1 - GRAIN_DEPTH}, 1]`,
    ).toMatchObject({ firstOutOfRange: 'none' })
    expect(lowest).toBeGreaterThanOrEqual(1 - GRAIN_DEPTH)
    expect(highest).toBeLessThanOrEqual(1)
    expect(sum / texels.length).toBeCloseTo(1 - GRAIN_DEPTH / 2, 2)
  })

  it('has no shape wider than one texel: neighbours are not alike', () => {
    // Correlation of each texel with the next one across and the next one down, wrapping as the
    // image does: for a grain with blobs or ridges it would be well above zero.
    const mean = texels.reduce((total, value) => total + value, 0) / texels.length
    let variance = 0
    let across = 0
    let down = 0
    for (let row = 0; row < GRAIN_PX; row++) {
      for (let column = 0; column < GRAIN_PX; column++) {
        const here = texels[row * GRAIN_PX + column] - mean
        variance += here * here
        across += here * (texels[row * GRAIN_PX + ((column + 1) % GRAIN_PX)] - mean)
        down += here * (texels[((row + 1) % GRAIN_PX) * GRAIN_PX + column] - mean)
      }
    }
    expect(Math.abs(across / variance)).toBeLessThan(0.02)
    expect(Math.abs(down / variance)).toBeLessThan(0.02)
  })

  it('is the same on every visit', () => {
    expect(grainTexels()).toEqual(texels)
  })
})

describe('whether a device takes the 20 m ground', () => {
  it('goes without it on little memory or a small graphics card', () => {
    expect(canTakeFinest({ memoryGb: 2, maxTextureSize: 16384 })).toBe(false)
    expect(canTakeFinest({ memoryGb: 8, maxTextureSize: 2048 })).toBe(false)
  })

  it('takes it otherwise, also where the browser does not say its memory', () => {
    expect(canTakeFinest({ memoryGb: 4, maxTextureSize: 4096 })).toBe(true)
    expect(canTakeFinest({ maxTextureSize: 8192 })).toBe(true)
  })
})

describe('the one eye of every level', () => {
  it('stands a coarser map’s eye on the finest ground, so a point both maps share is seen alike', async () => {
    const square = await site001()
    const site = heightOf(square, SITE_001.latitude, SITE_001.longitude)
    // A coarser map whose ground at the Site is 30 m lower than the 20 m DEM's.
    const coarser = flat(site - 30, square, 90, 200)
    const eye = eyeOnMap(2, square, coarser, SITE_001.latitude, SITE_001.longitude)
    expect(eye).toBeCloseTo(32, 1)
    // From that eye, a point of the coarser ground 30 m under the Site's level is 32 m down, as from the 20 m eye.
    const patch = patchAround(coarser, SITE_001.latitude, SITE_001.longitude, eye, 300, 1)
    const nearest = patch.distanceM.reduce((best, distance, at) => (distance < patch.distanceM[best] ? at : best), 0)
    expect(patch.distanceM[nearest]).toBeGreaterThan(31)
    expect(patch.distanceM[nearest]).toBeLessThan(80)
    expect(eyeOnMap(2, null, coarser, SITE_001.latitude, SITE_001.longitude)).toBe(2)
    expect(eyeOnMap(2, square, square, SITE_001.latitude, SITE_001.longitude)).toBe(2)
  })
})
