import type { PlanePoint, RouteWaypoint } from './types'

/** The square of the plane the flat map shows. */
export interface MapView {
  minX: number
  minY: number
  size: number
}

const MIN_SIZE_M = 1500

/**
 * A square around both routes, the start and the goal, with a margin, never smaller than 1.5 km and
 * never past the grid: the map shows the drive and not the whole 10 km.
 */
export function mapView(halfM: number, points: PlanePoint[], paths: RouteWaypoint[][]): MapView {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const see = (x: number, y: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  for (const point of points) see(point.x_m, point.y_m)
  for (const path of paths) for (const point of path) see(point.x_m, point.y_m)
  if (!Number.isFinite(minX)) return { minX: -halfM, minY: -halfM, size: halfM * 2 }
  const span = Math.max(maxX - minX, maxY - minY)
  const size = Math.min(halfM * 2, Math.max(MIN_SIZE_M, span * 1.3))
  const centreX = (minX + maxX) / 2
  const centreY = (minY + maxY) / 2
  const clamp = (value: number) => Math.min(Math.max(value, -halfM), halfM - size)
  return { minX: clamp(centreX - size / 2), minY: clamp(centreY - size / 2), size }
}
