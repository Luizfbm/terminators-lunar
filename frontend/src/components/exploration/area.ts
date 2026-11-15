import { API_BASE_URL } from '../../api/client'
import type { components } from '../../api/schema'
import { heightGridOf } from '../../domain/terrainHeights'
import { gridTriangles, patchAround, planeOf } from '../../domain/terrain'
import { direction } from '../../domain/skyScene'

export type LandingArea = components['schemas']['LandingArea']
export const LEVEL3_EDGE = -87.5
export function insideLevel3(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= LEVEL3_EDGE && lon >= -180 && lon <= 180
}
export async function fetchArea(lat: number, lon: number, signal: AbortSignal): Promise<LandingArea> {
  const response = await fetch(`${API_BASE_URL}/terrain/landing-area?latitude_deg=${lat}&longitude_deg=${lon}`, { signal })
  if (!response.ok) throw new Error(response.status === 422
    ? 'The complete 10 × 10 km terrain is not available here. Choose another location.'
    : 'Could not load the landing area. Please try again.')
  const body = await response.json() as LandingArea
  if (!heightGridOf(body.before) || !heightGridOf(body.after)) throw new Error('The terrain response is incomplete.')
  return body
}

/** Shared polar map coordinates, never stretching two different native windows to fit. */
export function areaPoint(area: LandingArea, u: number, v: number) {
  const b = area.bounds
  return { x: b.x_min_m + u * (b.x_max_m-b.x_min_m), y: b.y_max_m - v * (b.y_max_m-b.y_min_m) }
}

export function surfaceGeometry(area: LandingArea) {
  const decoded = heightGridOf(area.after)
  if (!decoded) throw new Error('Invalid native terrain')
  const map = decoded.heights
  const site = area.site
  const patch = patchAround(map, site.latitude_deg, site.longitude_deg, 0, Infinity, 1)
  const positions = new Float32Array(patch.rows * patch.columns * 3)
  for (let i=0; i<patch.distanceM.length; i++) {
    positions.set(direction(patch.azimuthDeg[i], patch.elevationDeg[i]).map(n => n*patch.distanceM[i]), i*3)
  }
  // Interpolate on precisely the triangles rendered by gridTriangles (diagonal b-c).
  const at = (x: number, y: number): [number, number, number] => {
    const col = (x-map.xMinM)/map.metresPerPixel-.5-patch.firstColumn
    const row = (map.yMaxM-y)/map.metresPerPixel-.5-patch.firstRow
    const c = Math.max(0, Math.min(patch.columns-2, Math.floor(col)))
    const r = Math.max(0, Math.min(patch.rows-2, Math.floor(row)))
    const u = Math.max(0, Math.min(1, col-c)), v = Math.max(0, Math.min(1, row-r))
    const a = r*patch.columns+c, b=a+1, cc=a+patch.columns, d=cc+1
    const nodes = u+v<=1 ? [a,b,cc] : [d,cc,b]
    const weights = u+v<=1 ? [1-u-v,u,v] : [u+v-1,1-u,1-v]
    return [0,1,2].map(axis => nodes.reduce((sum, n, i) => sum+positions[n*3+axis]*weights[i], 0)) as [number,number,number]
  }
  return { positions, indices: gridTriangles(patch), at, map,
    centre: planeOf(map, site.latitude_deg, site.longitude_deg) }
}

export interface RoverPosition { x: number; y: number; heading: number }
/** Visual navigation in map metres. Heading is clockwise from local lunar north. */
export function drive(position: RoverPosition, turnDeg: number, distanceM: number, area: LandingArea): RoverPosition {
  const heading = ((position.heading + turnDeg) % 360 + 360) % 360
  const longitude = Math.hypot(position.x,position.y) < .001 ? area.site.longitude_deg*Math.PI/180 : Math.atan2(position.x,position.y)
  const angle = longitude + heading*Math.PI/180
  const b=area.bounds, margin=4
  return { heading,
    x: Math.max(b.x_min_m+margin,Math.min(b.x_max_m-margin,position.x+Math.sin(angle)*distanceM)),
    y: Math.max(b.y_min_m+margin,Math.min(b.y_max_m-margin,position.y+Math.cos(angle)*distanceM)) }
}
