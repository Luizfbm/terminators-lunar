import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { heightAt, pixelOf } from './terrain'
import { groundSource, heightGridOf, POLAR_CAP_EDGE_DEG, POLAR_MAPS_EDGE_DEG } from './terrainHeights'

// Phase C, 15/11/2026. Before: away from the south pole the view from the ground was the horizon
// line alone, because the only ground was the published south polar maps of /moon/. Now, where
// none of them holds the Site, the view asks /terrain/heights for the engine's own DEM around it.

/** The contract's example: a real answer of the engine, 1 km around Apollo 11 on SLDEM2015_512. */
const example = JSON.parse(readFileSync(new URL('../../../contract/examples/terrain-heights-apollo11.example.json', import.meta.url), 'utf-8')).value

/** A small answer of the shape the contract gives, with heights `values`. */
function answer(values: number[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const size = Math.round(Math.sqrt(values.length))
  return {
    site: { id: 'custom', latitude_deg: 0, longitude_deg: 0 },
    dem: { product: 'LDEM_128', resolution_m: 236.9 },
    projection: 'equirectangular',
    center_longitude_deg: 180,
    sphere_radius_m: 1_737_400,
    size_px: size,
    metres_per_pixel: 236.90117518866782,
    x_min_m: -5_458_203.076346907 - 1.5 * 236.90117518866782,
    y_max_m: 1.5 * 236.90117518866782,
    half_extent_m: 1000,
    heights: { at_0_m: -1000, at_65535_m: 1000, quantum_m: 2000 / 65535, values },
    ...extra,
  }
}

describe('reading the grid of /terrain/heights', () => {
  it('reads the contract’s real example as a cylindrical map on its own DEM', () => {
    const grid = heightGridOf(example)
    expect(grid).not.toBeNull()
    expect(grid?.product).toBe('SLDEM2015_512')
    expect(grid?.resolutionM).toBe(59.2)
    expect(grid?.heights.size).toBe(example.size_px)
    expect(grid?.heights.projection).toEqual({ kind: 'equirectangular', centerLongitudeDeg: 180 })
    // The Site is in the middle pixel, and its height is between the grid's two ends.
    const heights = grid!.heights
    const { column, row } = pixelOf(heights, example.site.latitude_deg, example.site.longitude_deg)
    expect(Math.abs(column - (heights.size - 1) / 2)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(row - (heights.size - 1) / 2)).toBeLessThanOrEqual(0.5)
    const height = heightAt(heights, column, row)
    expect(height).toBeGreaterThanOrEqual(example.heights.at_0_m)
    expect(height).toBeLessThanOrEqual(example.heights.at_65535_m)
  })

  it('turns each integer into metres as the /moon/ maps do', () => {
    const grid = heightGridOf(answer([0, 0, 0, 0, 65535, 0, 0, 0, 32768]))!
    expect(heightAt(grid.heights, 1, 1)).toBe(1000)
    expect(heightAt(grid.heights, 0, 0)).toBe(-1000)
    expect(heightAt(grid.heights, 2, 2)).toBeCloseTo(-1000 + (32768 / 65535) * 2000, 9)
  })

  it('knows the three projections and nothing else', () => {
    const nine = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    expect(heightGridOf(answer(nine, { projection: 'south_polar_stereographic' }))?.heights.projection).toEqual({ kind: 'south_polar' })
    expect(heightGridOf(answer(nine, { projection: 'north_polar_stereographic' }))?.heights.projection).toEqual({ kind: 'north_polar' })
    expect(heightGridOf(answer(nine, { projection: 'mercator' }))).toBeNull()
  })

  it('never draws a grid that does not read as the contract says', () => {
    const nine = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    expect(heightGridOf(null)).toBeNull()
    expect(heightGridOf(answer([0, 1, 2, 3, 4, 5, 6, 7]))).toBeNull() // not size × size
    expect(heightGridOf(answer([0, 1, 2, 3, 4, 5, 6, 7, 70000]))).toBeNull()
    expect(heightGridOf(answer([0, 1, 2, 3, 4, 5, 6, 7, 1.5]))).toBeNull()
    expect(heightGridOf(answer(nine, { metres_per_pixel: 0 }))).toBeNull()
    expect(heightGridOf(answer(nine, { dem: { resolution_m: 236.9 } }))).toBeNull()
    expect(heightGridOf(answer(nine, { heights: { at_0_m: 5, at_65535_m: 5, quantum_m: 1, values: nine } }))).toBeNull()
  })
})

describe('which ground the view from the ground draws', () => {
  it('keeps the published polar map wherever one holds the Site, as before', () => {
    expect(groundSource(-89.47, [true, true, true])).toBe('polar')
    expect(groundSource(-85, [false, true, null])).toBe('polar')
    // Even when another map is still on its way.
    expect(groundSource(-89.47, [true, null, null])).toBe('polar')
  })

  it('never asks for the grid at the pole: the polar maps, or the horizon line, as before', () => {
    // e2e/ground3d.spec.ts: a polar map short of the Site leaves the silhouette, it does not ask the server.
    expect(POLAR_CAP_EDGE_DEG).toBe(-80)
    expect(groundSource(-89.47, [false, false, false])).toBe('polar')
    expect(groundSource(-89.47, [null, null, null])).toBe('polar')
    expect(groundSource(-80, [false, false, false])).toBe('polar')
  })

  it('waits for the polar maps between the cap and their edge before asking for the grid', () => {
    expect(groundSource(-75, [false, null, false])).toBe('wait')
    expect(groundSource(-79.99, [null, false, false])).toBe('wait')
  })

  it('asks for the grid once every polar map has said no', () => {
    expect(groundSource(-75, [false, false, false])).toBe('patch')
  })

  it('asks for the grid at once north of the polar maps’ edge, with nothing to wait for', () => {
    expect(POLAR_MAPS_EDGE_DEG).toBe(-60)
    expect(groundSource(0.674, [null, null, null])).toBe('patch')
    expect(groundSource(85, [false, null, null])).toBe('patch')
    expect(groundSource(-59.9, [null, null, null])).toBe('patch')
  })
})
