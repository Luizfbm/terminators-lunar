import type { components } from '../../../api/schema'

export type RouteComparison = components['schemas']['RouteComparison']
export type RoutePlan = components['schemas']['RoutePlan']
export type RouteWaypoint = components['schemas']['RouteWaypoint']
export type PlanePoint = components['schemas']['PlanePoint']
export type HazardGrid = components['schemas']['HazardGrid']
export type Navigation = components['schemas']['Navigation']

/** The Sun as the Cursor has it: azimuth as the route was asked for (`sun_azimuth_deg`) and elevation. */
export interface WalkSun {
  azimuthDeg: number
  elevationDeg: number
}

/** The two ways to drive: the keys, or the accepted plan's waypoints one after another. */
export type WalkMode = 'manual' | 'auto'
