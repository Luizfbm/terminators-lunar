/**
 * The real ground around a Site, as seen from its Observer (the requirement): each point of a published
 * height map becomes an azimuth, an elevation and a distance from the eye, on the round Moon.
 *
 * The map is a square in south polar stereographic metres, the projection of the engine's own
 * DEMs: the pole at (0, 0), 0° longitude up (+y), 90°E to the right (+x), and a point's distance
 * from the pole 2R tan(45° + lat/2). A pixel's value is the height at its centre.
 */

const RAD = Math.PI / 180

export interface HeightMap {
  /** Pixels on each side of the square. */
  size: number
  metresPerPixel: number
  /** The plane coordinates of the image's top left corner. */
  xMinM: number
  yMaxM: number
  sphereRadiusM: number
  /** The heights, in metres above the sphere, that the values 0 and 65535 stand for. */
  at0M: number
  at65535M: number
  /** Row by row from the top left. */
  data: Uint16Array
}

/** What `south_pole_fine.json` must say for its height map to be used. */
export function heightMapOf(doc: unknown, data: Uint16Array, width: number): HeightMap | null {
  const top = doc as Record<string, unknown> | null
  const png = top?.height_png as Record<string, unknown> | undefined
  const range = png?.metres_above_1737400_m as Record<string, unknown> | undefined
  const numbers = [top?.sphere_radius_m, top?.x_min_m, top?.y_max_m, png?.size_px, png?.metres_per_pixel, range?.at_0, range?.at_65535]
  if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) return null
  const [sphereRadiusM, xMinM, yMaxM, size, metresPerPixel, at0M, at65535M] = numbers as number[]
  if (size !== width || data.length !== size * size) return null
  return { size, metresPerPixel, xMinM, yMaxM, sphereRadiusM, at0M, at65535M, data }
}

/** Where a latitude and a longitude fall on the map, in pixels from the centre of the top left pixel. */
export function pixelOf(map: HeightMap, latitudeDeg: number, longitudeDeg: number): { column: number; row: number } {
  const rho = 2 * map.sphereRadiusM * Math.tan((45 + latitudeDeg / 2) * RAD)
  const x = rho * Math.sin(longitudeDeg * RAD)
  const y = rho * Math.cos(longitudeDeg * RAD)
  return { column: (x - map.xMinM) / map.metresPerPixel - 0.5, row: (map.yMaxM - y) / map.metresPerPixel - 0.5 }
}

const metres = (map: HeightMap, value: number) => map.at0M + (value / 65535) * (map.at65535M - map.at0M)

/** The height at a point between pixel centres, from the four around it. */
export function heightAt(map: HeightMap, column: number, row: number): number {
  const c = Math.min(Math.max(Math.floor(column), 0), map.size - 2)
  const r = Math.min(Math.max(Math.floor(row), 0), map.size - 2)
  const fc = Math.min(Math.max(column - c, 0), 1)
  const fr = Math.min(Math.max(row - r, 0), 1)
  const value = (dc: number, dr: number) => map.data[(r + dr) * map.size + c + dc]
  return metres(map, value(0, 0) * (1 - fc) * (1 - fr) + value(1, 0) * fc * (1 - fr) + value(0, 1) * (1 - fc) * fr + value(1, 1) * fc * fr)
}

/** Whether the map holds the Site with at least `marginM` of ground on every side of it. */
export function covers(map: HeightMap, latitudeDeg: number, longitudeDeg: number, marginM: number): boolean {
  // North of the equator the south polar plane folds back on itself.
  if (latitudeDeg > -60) return false
  const { column, row } = pixelOf(map, latitudeDeg, longitudeDeg)
  const margin = marginM / map.metresPerPixel
  return column >= margin && row >= margin && column <= map.size - 1 - margin && row <= map.size - 1 - margin
}

/** A grid of ground points around the Observer, each as it is seen from the eye. */
export interface Patch {
  columns: number
  rows: number
  /** Where the grid sits on the map: its first pixel, and the pixels between its points. */
  firstColumn: number
  firstRow: number
  stride: number
  /** Degrees from north through east. */
  azimuthDeg: Float32Array
  /** Degrees above the Observer's level plane. */
  elevationDeg: Float32Array
  /** Metres from the eye, in a straight line. */
  distanceM: Float32Array
}

/**
 * The ground within `halfM` of the Site, one point every `stride` pixels of the map, seen from an
 * eye `eyeM` above the ground at the Site. The Moon is round: a far point sits below the level
 * plane even on flat ground.
 */
export function patchAround(map: HeightMap, latitudeDeg: number, longitudeDeg: number, eyeM: number, halfM: number, stride: number): Patch {
  const site = pixelOf(map, latitudeDeg, longitudeDeg)
  const half = halfM / map.metresPerPixel
  const firstColumn = Math.max(0, Math.round(site.column - half))
  const firstRow = Math.max(0, Math.round(site.row - half))
  const lastColumn = Math.min(map.size - 1, Math.round(site.column + half))
  const lastRow = Math.min(map.size - 1, Math.round(site.row + half))
  const columns = Math.floor((lastColumn - firstColumn) / stride) + 1
  const rows = Math.floor((lastRow - firstRow) / stride) + 1

  // The eye, and the Site's east, north and up, in Moon-fixed axes.
  const lat0 = latitudeDeg * RAD
  const lon0 = longitudeDeg * RAD
  const eyeRadius = map.sphereRadiusM + heightAt(map, site.column, site.row) + eyeM
  const up = [Math.cos(lat0) * Math.cos(lon0), Math.cos(lat0) * Math.sin(lon0), Math.sin(lat0)]
  const east = [-Math.sin(lon0), Math.cos(lon0), 0]
  const north = [-Math.sin(lat0) * Math.cos(lon0), -Math.sin(lat0) * Math.sin(lon0), Math.cos(lat0)]
  const eye = up.map((part) => part * eyeRadius)

  const azimuthDeg = new Float32Array(columns * rows)
  const elevationDeg = new Float32Array(columns * rows)
  const distanceM = new Float32Array(columns * rows)
  for (let j = 0; j < rows; j++) {
    const row = firstRow + j * stride
    const y = map.yMaxM - (row + 0.5) * map.metresPerPixel
    for (let i = 0; i < columns; i++) {
      const column = firstColumn + i * stride
      const x = map.xMinM + (column + 0.5) * map.metresPerPixel
      const rho = Math.hypot(x, y)
      const lat = 2 * Math.atan(rho / (2 * map.sphereRadiusM)) - Math.PI / 2
      const lon = Math.atan2(x, y)
      const radius = map.sphereRadiusM + metres(map, map.data[row * map.size + column])
      const dx = radius * Math.cos(lat) * Math.cos(lon) - eye[0]
      const dy = radius * Math.cos(lat) * Math.sin(lon) - eye[1]
      const dz = radius * Math.sin(lat) - eye[2]
      const e = dx * east[0] + dy * east[1] + dz * east[2]
      const n = dx * north[0] + dy * north[1] + dz * north[2]
      const u = dx * up[0] + dy * up[1] + dz * up[2]
      const at = j * columns + i
      azimuthDeg[at] = ((Math.atan2(e, n) / RAD) + 360) % 360
      elevationDeg[at] = Math.atan2(u, Math.hypot(e, n)) / RAD
      distanceM[at] = Math.hypot(e, n, u)
    }
  }
  return { columns, rows, firstColumn, firstRow, stride, azimuthDeg, elevationDeg, distanceM }
}

/** A rectangle of a height map, in pixels, both ends included. */
export interface PixelBounds {
  firstColumn: number
  firstRow: number
  lastColumn: number
  lastRow: number
}

/** The rectangle of its map that a patch's points span. */
export function patchBounds(patch: Patch): PixelBounds {
  return {
    firstColumn: patch.firstColumn,
    firstRow: patch.firstRow,
    lastColumn: patch.firstColumn + (patch.columns - 1) * patch.stride,
    lastRow: patch.firstRow + (patch.rows - 1) * patch.stride,
  }
}

/** The whole of a map, as a rectangle of another map of the same projection: where its pixel centres fall there. */
export function mapBoundsOn(other: HeightMap, map: HeightMap): PixelBounds {
  const column = (own: number) => (map.xMinM + (own + 0.5) * map.metresPerPixel - other.xMinM) / other.metresPerPixel - 0.5
  const row = (own: number) => (other.yMaxM - (map.yMaxM - (own + 0.5) * map.metresPerPixel)) / other.metresPerPixel - 0.5
  return { firstColumn: column(0), firstRow: row(0), lastColumn: column(map.size - 1), lastRow: row(map.size - 1) }
}

/**
 * The triangles of a patch's grid, two per cell, as indices into its points. With `hole`, the
 * cells that lie wholly inside a finer ground are left out, so the two fit together: the coarse
 * grid runs up to the fine one and one cell under its rim. With `hidden`, one flag per point, a
 * triangle whose three points are all hidden is left out too.
 */
export function gridTriangles(patch: Patch, hole?: PixelBounds, hidden?: ArrayLike<number>): Uint32Array {
  const inside = (column: number, row: number) => {
    if (!hole) return false
    const left = patch.firstColumn + column * patch.stride
    const top = patch.firstRow + row * patch.stride
    return (
      left >= hole.firstColumn + patch.stride &&
      top >= hole.firstRow + patch.stride &&
      left + patch.stride <= hole.lastColumn - patch.stride &&
      top + patch.stride <= hole.lastRow - patch.stride
    )
  }
  const index: number[] = []
  for (let row = 0; row < patch.rows - 1; row++) {
    for (let column = 0; column < patch.columns - 1; column++) {
      if (inside(column, row)) continue
      const corner = row * patch.columns + column
      for (const [a, b, c] of [
        [corner, corner + patch.columns, corner + 1],
        [corner + 1, corner + patch.columns, corner + patch.columns + 1],
      ]) {
        if (hidden && hidden[a] && hidden[b] && hidden[c]) continue
        index.push(a, b, c)
      }
    }
  }
  return new Uint32Array(index)
}

/**
 * The Horizon mask as a table, one entry every tenth of a degree of azimuth, so the height of the
 * engine's horizon in any direction is one lookup. Linear between the mask's own samples.
 */
export function horizonTable(mask: readonly { azimuth_deg: number; elevation_deg: number }[]): (azimuthDeg: number) => number {
  const sorted = [...mask].sort((a, b) => a.azimuth_deg - b.azimuth_deg)
  const table = new Float32Array(3600)
  let next = 0
  for (let at = 0; at < table.length; at++) {
    const azimuth = at / 10
    while (next < sorted.length && sorted[next].azimuth_deg <= azimuth) next++
    const before = sorted[(next - 1 + sorted.length) % sorted.length]
    const after = sorted[next % sorted.length]
    const span = (after.azimuth_deg - before.azimuth_deg + 360) % 360 || 360
    const along = ((azimuth - before.azimuth_deg + 360) % 360) / span
    table[at] = before.elevation_deg + (after.elevation_deg - before.elevation_deg) * along
  }
  return (azimuthDeg) => table[Math.round((((azimuthDeg % 360) + 360) % 360) * 10) % 3600]
}

/**
 * How far away the terrain that closes the horizon is in each direction, as the engine found it:
 * one lookup per tenth of a degree of azimuth, from the nearest sample of the mask. A direction
 * with no Occluder has no limit.
 */
export function horizonDistanceTable(
  mask: readonly { azimuth_deg: number; occluder?: { distance_m: number } | null }[],
): (azimuthDeg: number) => number {
  const table = new Float32Array(3600).fill(Infinity)
  if (mask.length > 0) {
    for (let at = 0; at < table.length; at++) {
      const azimuth = at / 10
      let best = mask[0]
      let gap = Infinity
      for (const sample of mask) {
        const apart = Math.abs(((sample.azimuth_deg - azimuth + 540) % 360) - 180)
        if (apart < gap) {
          gap = apart
          best = sample
        }
      }
      table[at] = best.occluder?.distance_m ?? Infinity
    }
  }
  return (azimuthDeg) => table[Math.round((((azimuthDeg % 360) + 360) % 360) * 10) % 3600]
}

/** Ground this much beyond the horizon's own point is still drawn: the point is one sample of a rise, not its far edge. */
const BEYOND_HORIZON = { share: 0.05, metres: 100 }

/**
 * Which points of a patch the Observer cannot see because they lie beyond the terrain that
 * closes the horizon in their direction: 1 for hidden, 0 for in view. A rise a hundred metres
 * away hides the mountain a hundred kilometres behind it.
 */
export function beyondHorizon(patch: Patch, horizonDistanceM: (azimuthDeg: number) => number): Uint8Array {
  const hidden = new Uint8Array(patch.azimuthDeg.length)
  for (let at = 0; at < hidden.length; at++) {
    const limit = horizonDistanceM(patch.azimuthDeg[at])
    if (patch.distanceM[at] > limit * (1 + BEYOND_HORIZON.share) + BEYOND_HORIZON.metres) hidden[at] = 1
  }
  return hidden
}

