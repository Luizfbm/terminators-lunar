import { heightGridOf } from '../../domain/terrainHeights'
import { gridTriangles, patchAround } from '../../domain/terrain'
import { direction } from '../../domain/skyScene'
import type { RouteResponse } from './routeApi'

/** Render the native pixels in the existing lunar local frame, without vertical exaggeration. */
export function routeGeometry(answer: RouteResponse) {
  const grid = heightGridOf(answer.terrain)
  if (!grid) return null
  const site = answer.terrain.site
  const patch = patchAround(grid.heights, site.latitude_deg, site.longitude_deg, 0,
    grid.heights.size * grid.heights.metresPerPixel, 1)
  const positions = new Float32Array(patch.rows * patch.columns * 3)
  for (let i = 0; i < patch.distanceM.length; i++) {
    const vector = direction(patch.azimuthDeg[i], patch.elevationDeg[i])
    positions.set(vector.map(value => value * patch.distanceM[i]), i * 3)
  }
  const route = answer.points.map(point => {
    const row = point.row - patch.firstRow
    const col = point.column - patch.firstColumn
    if (row < 0 || col < 0 || row >= patch.rows || col >= patch.columns) throw new Error('Route outside native terrain')
    const index = (row * patch.columns + col) * 3
    return [positions[index], positions[index + 1], positions[index + 2]] as const
  })
  return { positions, indices: gridTriangles(patch), route }
}
