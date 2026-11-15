import { getJson } from '../../../api/client'
import { useOnDemand, type PanelState } from '../../../hooks/useLadder'
import type { ConfidenceLevel, HazardGrid, PlanePoint, RouteComparison, RoverOptions } from './types'

export interface RouteRequest {
  siteId: string
  rover?: RoverOptions
  sunFraction?: number
  sunAzimuthDeg?: number
  confidenceLevel?: ConfidenceLevel
  coarseM: 60 | 20
  start?: PlanePoint
  goal?: PlanePoint
}

/** `/sites/{id}/route` with the animation's swarm. Only what the caller set goes out; the API fills the rest. */
export function routeParams(request: RouteRequest): URLSearchParams {
  const params = new URLSearchParams({ swarm: 'true', coarse_m: String(request.coarseM) })
  const set = (name: string, value: number | string | undefined) => {
    if (value !== undefined) params.set(name, String(value))
  }
  const { rover } = request
  set('rover_id', rover?.id)
  set('slope_limit_deg', rover?.slopeLimitDeg)
  set('battery_wh', rover?.batteryWh)
  set('power_shadow_w', rover?.powerShadowW)
  set('solar_w', rover?.solarW)
  set('rtg_w', rover?.rtgW)
  set('sun_fraction', request.sunFraction)
  set('sun_azimuth_deg', request.sunAzimuthDeg)
  set('confidence_level', request.confidenceLevel)
  set('start_x_m', request.start?.x_m)
  set('start_y_m', request.start?.y_m)
  set('goal_x_m', request.goal?.x_m)
  set('goal_y_m', request.goal?.y_m)
  return params
}

const path = (siteId: string, tail: string) => `/sites/${encodeURIComponent(siteId)}/${tail}`

export function getRoute(request: RouteRequest, signal: AbortSignal): Promise<RouteComparison> {
  return getJson<RouteComparison>(path(request.siteId, 'route'), routeParams(request), signal)
}

export function getHazardGrid(siteId: string, signal: AbortSignal): Promise<HazardGrid> {
  return getJson<HazardGrid>(path(siteId, 'hazard/grid'), new URLSearchParams(), signal)
}

/** The two plans for the request; asked again only when something in it changes. */
export function useRoute(request: RouteRequest): { state: PanelState<RouteComparison>; retry: () => void } {
  const key = `${request.siteId}|${routeParams(request).toString()}`
  return useOnDemand(true, key, (signal) => getRoute(request, signal))
}

/** The ground grid of the Site; it does not depend on the Rover or the drive. */
export function useHazardGrid(siteId: string): { state: PanelState<HazardGrid>; retry: () => void } {
  return useOnDemand(true, siteId, (signal) => getHazardGrid(siteId, signal))
}
