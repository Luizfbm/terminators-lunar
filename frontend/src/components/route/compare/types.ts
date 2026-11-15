import type { components } from '../../../api/schema'

export type RouteComparison = components['schemas']['RouteComparison']
export type RoutePlan = components['schemas']['RoutePlan']
export type RouteWaypoint = components['schemas']['RouteWaypoint']
export type Swarm = components['schemas']['Swarm']
export type SwarmGeneration = components['schemas']['SwarmGeneration']
export type HazardGrid = components['schemas']['HazardGrid']
export type Navigation = components['schemas']['Navigation']
export type ConfidenceLevel = components['schemas']['ConfidenceLevelName']
export type PlanePoint = components['schemas']['PlanePoint']

/** The two plans, in the order the API returns them: Normal navigation first. */
export const NAVIGATIONS: readonly Navigation[] = ['normal', 'multiresolution']

/** The LOLA grids of the zoom-out, in metres per cell. 5 m is the ground the Rover actually crosses. */
export type GroundLayer = 60 | 20 | 5
export const GROUND_LAYERS: readonly GroundLayer[] = [60, 20, 5]

/** The Rover numbers the caller may set; whatever is left out, the API takes from the catalogue. */
export interface RoverOptions {
  /** A Rover of `/rovers`. The API defaults to `viper`. */
  id?: string
  slopeLimitDeg?: number
  batteryWh?: number
  powerShadowW?: number
  solarW?: number
  rtgW?: number
}

export interface RouteCompareProps {
  /** The Site, by its code. The grid and the route are the ones nearest it. */
  siteId: string
  /** Called with the plan the user clicked. The panel marks it as accepted; what follows is the caller's. */
  onAccept: (navigation: Navigation) => void
  rover?: RoverOptions
  /** Share of the Sun's disc the panels get during the drive, usually the Site's at the Cursor. */
  sunFraction?: number
  /** The Sun's azimuth at the Cursor, clockwise from north: lights the relief and places the sunlit spots. */
  sunAzimuthDeg?: number
  confidenceLevel?: ConfidenceLevel
  /** The grid Normal navigation reads when the panel opens. */
  coarseM?: 60 | 20
  /** Start and goal in the grid's plane, in metres. The API's own defaults when left out. */
  start?: PlanePoint
  goal?: PlanePoint
  /** When given, the panel shows a close control that calls it. */
  onClose?: () => void
}
