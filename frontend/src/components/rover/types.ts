import type { components } from '../../api/schema'

export type Rover = components['schemas']['Rover']
export type RoverList = components['schemas']['RoverList']
export type Coverage = components['schemas']['Meta']['coverage']

/** The Window a mission maps to: a start instant (whole seconds, UTC) and a duration. */
export interface MissionWindow {
  start: string
  durationHours: number
}

/** What the visitor chose about the trip. */
export interface Mission {
  /** Year of the trip, 2025 to 2032. */
  year: number
  /** Days on the Moon, 24 h each. */
  days: number
  /** The rover must see the Earth directly (DTE). Off: a relay satellite carries the link. */
  requireDte: boolean
  /** The Window the year and the days make. */
  window: MissionWindow
}

/** What `onChange` hands to the app. */
export interface RoverChoice {
  rover: Rover
  mission: Mission
  /** The mast height, clamped to what the Query takes: a natural Observer height for this rover. */
  observerHeightM: number
}
