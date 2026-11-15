/**
 * The ground of any point of the Moon (the requirement), from `/terrain/heights`: a square of the
 * DEM's own pixels around the Site, on the DEM's own projection, with its heights as integers the
 * way the published maps of `/moon/` carry them. The engine chooses the DEM; this only reads it.
 *
 * At the south pole the view from the ground is exactly what it was: the published polar maps, or
 * the horizon line where they do not reach. The grid is asked for only north of the polar cap, and
 * only where none of those maps holds the Site.
 */

import { MAP_EDGE_LATITUDE } from '../components/globeMap/map'
import type { HeightMap, MapProjection } from './terrain'

/** A grid of heights read from the answer, ready to draw. */
export interface HeightGrid {
  heights: HeightMap
  /** The DEM the pixels are from, and its cell, as the answer names them. */
  product: string
  resolutionM: number
}

const PROJECTIONS = ['south_polar_stereographic', 'north_polar_stereographic', 'equirectangular'] as const

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** The contract's `TerrainHeights` as a height map, or null when it does not read as expected. */
export function heightGridOf(body: unknown): HeightGrid | null {
  const top = body as Record<string, unknown> | null
  if (!top || typeof top !== 'object') return null
  const dem = top.dem as { product?: unknown; resolution_m?: unknown } | undefined
  const grid = top.heights as { at_0_m?: unknown; at_65535_m?: unknown; values?: unknown } | undefined
  const numbers = [top.size_px, top.metres_per_pixel, top.x_min_m, top.y_max_m, top.sphere_radius_m, top.center_longitude_deg, grid?.at_0_m, grid?.at_65535_m, dem?.resolution_m]
  if (!numbers.every(finite) || typeof dem?.product !== 'string') return null
  const [size, metresPerPixel, xMinM, yMaxM, sphereRadiusM, centerLongitudeDeg, at0M, at65535M, resolutionM] = numbers as number[]
  if (!Number.isInteger(size) || size < 2 || metresPerPixel <= 0 || sphereRadiusM <= 0 || !(at65535M > at0M)) return null
  const kind = PROJECTIONS.indexOf(top.projection as (typeof PROJECTIONS)[number])
  if (kind < 0) return null
  const values = grid?.values
  if (!Array.isArray(values) || values.length !== size * size) return null
  const data = new Uint16Array(values.length)
  for (let at = 0; at < values.length; at++) {
    const value: unknown = values[at]
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65535) return null
    data[at] = value
  }
  const projection: MapProjection =
    kind === 0 ? { kind: 'south_polar' } : kind === 1 ? { kind: 'north_polar' } : { kind: 'equirectangular', centerLongitudeDeg }
  return {
    heights: { size, metresPerPixel, xMinM, yMaxM, sphereRadiusM, at0M, at65535M, data, projection },
    product: dem.product,
    resolutionM,
  }
}

/**
 * North of this latitude no published polar map can hold a Site: the south polar plane of
 * `/moon/` ends there (`covers` in terrain.ts), so there is nothing to wait for.
 */
export const POLAR_MAPS_EDGE_DEG = -60

/**
 * At or south of this latitude, the polar cap of the level 2 map (`MAP_EDGE_LATITUDE`), the view
 * keeps the published polar maps alone, as it always has: the grid is never asked for there.
 */
export const POLAR_CAP_EDGE_DEG = MAP_EDGE_LATITUDE

/** Where the ground of the view comes from: the published polar maps, the grid of the engine's DEM, or not known yet. */
export type GroundSource = 'polar' | 'patch' | 'wait'

/**
 * Which ground to draw for a Site, from whether each published polar map holds it: true, false,
 * or null while that map is still on its way. Any map that holds it wins, as before, and at the
 * pole (POLAR_CAP_EDGE_DEG and south) the polar maps are all there is, as before, held or not.
 * North of POLAR_MAPS_EDGE_DEG the grid is asked for at once; in between, once every map has said no.
 */
export function groundSource(latitudeDeg: number, polar: readonly (boolean | null)[]): GroundSource {
  if (polar.some((holds) => holds === true)) return 'polar'
  if (latitudeDeg <= POLAR_CAP_EDGE_DEG) return 'polar'
  if (latitudeDeg > POLAR_MAPS_EDGE_DEG) return 'patch'
  if (polar.some((holds) => holds === null)) return 'wait'
  return 'patch'
}
