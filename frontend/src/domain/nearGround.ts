/**
 * The ground right around the Observer (the requirement): the 20 m DEM where a square of it is
 * published for the Site, blended at its rim into the coarser map around it, and a fine grain
 * of regolith on top that is texture only, never relief.
 *
 * The squares are `site_20m_<site id>.png`, built by `deploy/globe_assets.py` from
 * LDEM_80S_20MPP_ADJ: the DEM's own pixels, 320 of them (6.4 km) on a side, centred on a
 * Curated Site. Their index is `site_20m.json`.
 */

import { heightAt, pixelOf, type HeightMap } from './terrain'

const RAD = Math.PI / 180

/** One square of the index, as `site_20m.json` describes it. */
export interface SiteTile {
  id: string
  xMinM: number
  yMaxM: number
  sizePx: number
  metresPerPixel: number
  file: string
  /** The rest of the entry, for `heightMapOf`. */
  doc: unknown
}

/** The squares that `site_20m.json` lists, or null when it does not read as expected. */
export function siteTilesOf(index: unknown): SiteTile[] | null {
  const top = index as { sphere_radius_m?: unknown; tiles?: unknown } | null
  if (!top || typeof top.sphere_radius_m !== 'number' || typeof top.tiles !== 'object' || top.tiles === null) return null
  const tiles: SiteTile[] = []
  for (const [id, raw] of Object.entries(top.tiles as Record<string, unknown>)) {
    const entry = raw as { x_min_m?: unknown; y_max_m?: unknown; height_png?: { file?: unknown; size_px?: unknown; metres_per_pixel?: unknown } } | null
    const png = entry?.height_png
    const numbers = [entry?.x_min_m, entry?.y_max_m, png?.size_px, png?.metres_per_pixel]
    if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value)) || typeof png?.file !== 'string') continue
    const [xMinM, yMaxM, sizePx, metresPerPixel] = numbers as number[]
    tiles.push({ id, xMinM, yMaxM, sizePx, metresPerPixel, file: png.file, doc: { sphere_radius_m: top.sphere_radius_m, x_min_m: xMinM, y_max_m: yMaxM, height_png: png } })
  }
  return tiles
}

/** The Site must be at least this far inside a square for the square to be used. */
export const TILE_MARGIN_M = 1_500

/**
 * The square that holds the Site deepest inside it, at least TILE_MARGIN_M from every edge, or
 * null. Any point near a Curated Site finds that Site's square, so a custom Site a few hundred
 * metres away gets the fine ground too.
 */
export function tileCovering(tiles: readonly SiteTile[], latitudeDeg: number, longitudeDeg: number, sphereRadiusM = 1_737_400): SiteTile | null {
  if (latitudeDeg > -60) return null
  const rho = 2 * sphereRadiusM * Math.tan((45 + latitudeDeg / 2) * RAD)
  const x = rho * Math.sin(longitudeDeg * RAD)
  const y = rho * Math.cos(longitudeDeg * RAD)
  let best: SiteTile | null = null
  let deepest = TILE_MARGIN_M
  for (const tile of tiles) {
    const side = tile.sizePx * tile.metresPerPixel
    const inside = Math.min(x - tile.xMinM, tile.xMinM + side - x, tile.yMaxM - y, y - (tile.yMaxM - side))
    if (inside >= deepest) {
      deepest = inside
      best = tile
    }
  }
  return best
}

/** The outer band of the 20 m square, in its pixels, over which it turns into the coarser map. */
export const RIM_PX = 40

/**
 * The 20 m square with its outer RIM_PX pixels eased into the coarser map's heights, so the two
 * meet without a step. Inside the rim every height is the 20 m DEM's own. Without a coarser map
 * the square is returned as it is.
 */
export function blendRim(fine: HeightMap, coarser: HeightMap | null, rimPx = RIM_PX): HeightMap {
  if (!coarser) return fine
  const size = fine.size
  const heights = new Float64Array(size * size)
  let low = Infinity
  let high = -Infinity
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const own = fine.at0M + (fine.data[row * size + column] / 65535) * (fine.at65535M - fine.at0M)
      const edge = Math.min(column, row, size - 1 - column, size - 1 - row)
      let height = own
      if (edge < rimPx) {
        const x = fine.xMinM + (column + 0.5) * fine.metresPerPixel
        const y = fine.yMaxM - (row + 0.5) * fine.metresPerPixel
        const far = heightAt(coarser, (x - coarser.xMinM) / coarser.metresPerPixel - 0.5, (coarser.yMaxM - y) / coarser.metresPerPixel - 0.5)
        const along = edge / rimPx
        const weight = along * along * (3 - 2 * along)
        height = far + (own - far) * weight
      }
      heights[row * size + column] = height
      low = Math.min(low, height)
      high = Math.max(high, height)
    }
  }
  const span = high > low ? high - low : 1
  const data = new Uint16Array(size * size)
  for (let at = 0; at < data.length; at++) data[at] = Math.round(((heights[at] - low) / span) * 65535)
  return { ...fine, at0M: low, at65535M: low + span, data }
}

/** The grain of regolith: one texel this many metres wide, far under any DEM cell (20 m at the finest). */
export const GRAIN_M = 1
/** Texels on each side of the grain's image, which repeats across the ground. */
export const GRAIN_PX = 256
/** The grain darkens a texel by at most this share: a faint grain, not a pattern. */
export const GRAIN_DEPTH = 0.16

/**
 * The grain as one multiplier per texel, from 1 - GRAIN_DEPTH to 1, independent from one texel to
 * the next: white noise, so no texel is tied to its neighbours and the grain has no shape wider
 * than a texel. Cosmetic only: it changes the colour of the ground, never its heights.
 */
export function grainTexels(size = GRAIN_PX, seed = 20261114): Float32Array {
  let state = seed >>> 0
  const out = new Float32Array(size * size)
  for (let at = 0; at < out.length; at++) {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    out[at] = 1 - GRAIN_DEPTH * (((t ^ (t >>> 14)) >>> 0) / 4294967296)
  }
  return out
}

/** How many times the grain's image repeats across a map, so each texel is GRAIN_M wide on the ground. */
export const grainRepeat = (map: Pick<HeightMap, 'size' | 'metresPerPixel'>) => (map.size * map.metresPerPixel) / (GRAIN_PX * GRAIN_M)

/**
 * Whether this device can take the 20 m ground: 102 400 more points, a mesh of about 5 MB. A
 * browser that reports under 4 GB of memory, or a graphics card that cannot hold a 4096 texture,
 * goes without it and keeps the coarser ground.
 */
export function canTakeFinest(device: { memoryGb?: number; maxTextureSize: number }): boolean {
  if (device.memoryGb !== undefined && device.memoryGb < 4) return false
  return device.maxTextureSize >= 4096
}

/**
 * The Observer height to build a coarser map's ground with, so its eye is where the finest map
 * puts it: the engine stands the Observer on the finest DEM, and a coarser map averages the Site's
 * own ground with what is around it. Without a finer map, the height as it is.
 */
export function eyeOnMap(eyeM: number, finest: HeightMap | null, map: HeightMap, latitudeDeg: number, longitudeDeg: number): number {
  if (!finest || finest === map) return eyeM
  const at = (on: HeightMap) => {
    const { column, row } = pixelOf(on, latitudeDeg, longitudeDeg)
    return heightAt(on, column, row)
  }
  return eyeM + at(finest) - at(map)
}
