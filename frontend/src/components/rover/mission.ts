import { HEIGHT_MAX_M, HEIGHT_MIN_M, clampNumber } from '../../domain/query'
import type { Coverage, Mission, MissionWindow, Rover } from './types'

/** The trip years Eduardo's cockpit offers. */
export const MISSION_YEARS = [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032] as const
/** Days on the Moon, 24 h each, as in the cockpit. */
export const MISSION_DAYS = [3, 5, 7, 10, 14, 21, 30] as const
export const DEFAULT_YEAR = 2027
export const DEFAULT_DAYS = 10
export const DEFAULT_ROVER_ID = 'viper'

const HOUR_MS = 3_600_000
const DAY_HOURS = 24

/**
 * The Window a trip makes: it starts at 00:00 UTC on 1 January of the year and lasts `days` times
 * 24 h. This is only the screen's choice of a Window; every number about it still comes from the API.
 */
export function missionWindow(year: number, days: number): MissionWindow {
  return { start: `${String(year).padStart(4, '0')}-01-01T00:00:00Z`, durationHours: days * DAY_HOURS }
}

export function buildMission(year: number, days: number, requireDte: boolean): Mission {
  return { year, days, requireDte, window: missionWindow(year, days) }
}

export function defaultMission(): Mission {
  return buildMission(DEFAULT_YEAR, DEFAULT_DAYS, true)
}

/** The end of the Window, in ms since the epoch. */
export function windowEndMs(window: MissionWindow): number {
  return Date.parse(window.start) + window.durationHours * HOUR_MS
}

/** Whether the Window lies inside the dates the engine covers and is no longer than it takes. */
export function windowInCoverage(window: MissionWindow, coverage: Coverage): boolean {
  return (
    Date.parse(window.start) >= Date.parse(coverage.window_min) &&
    windowEndMs(window) <= Date.parse(coverage.window_max) &&
    window.durationHours <= coverage.max_duration_hours
  )
}

/** Moon rovers first, then the Mars ones; each group keeps the order it came in. */
export function moonFirst(rovers: readonly Rover[]): Rover[] {
  return [...rovers.filter((rover) => rover.body === 'moon'), ...rovers.filter((rover) => rover.body === 'mars')]
}

/** The rover to start on: the one asked for, else VIPER, else the first. */
export function initialRover(rovers: readonly Rover[], id?: string): Rover | null {
  return rovers.find((rover) => rover.id === id) ?? rovers.find((rover) => rover.id === DEFAULT_ROVER_ID) ?? rovers[0] ?? null
}

/** The mast as an Observer height: a natural one for this rover, inside what the Query takes. */
export function suggestedObserverHeight(rover: Rover): number {
  return clampNumber(rover.mast_height_m, HEIGHT_MIN_M, HEIGHT_MAX_M)
}

/** The fields a rover card shows, in order. `darkness_tolerance_hours` is derived by the API. */
export type RoverField =
  | 'mass_kg'
  | 'battery_wh'
  | 'solar_w'
  | 'rtg_w'
  | 'power_shadow_w'
  | 'mast_height_m'
  | 'slope_limit_deg'
  | 'darkness_tolerance_hours'

/**
 * Whether the catalogue estimated a field. The Darkness tolerance is battery over the load the
 * RTG leaves, so it is an estimate whenever one of those three is.
 */
export function isEstimated(rover: Rover, field: RoverField): boolean {
  if (field === 'darkness_tolerance_hours') {
    return (['battery_wh', 'power_shadow_w', 'rtg_w'] as const).some((input) => rover.estimated.includes(input))
  }
  return rover.estimated.includes(field)
}

/** The rover's Darkness tolerance, as the API computed it (null: the RTG covers the load). */
export function darknessToleranceHours(rover: Rover): number | null {
  return rover.darkness_tolerance_hours
}

/** The rover has nothing to recharge the battery with. */
export function cannotRecharge(rover: Rover): boolean {
  return rover.solar_w === 0 && rover.rtg_w === 0
}

export type MissionFit =
  | { kind: 'no-night' }
  | { kind: 'rtg' }
  | { kind: 'fits'; marginHours: number }
  | { kind: 'short'; gapHours: number }

/**
 * Mission fit for one rover: its Darkness tolerance against the Query's LCSP. A plain comparison:
 * the battery is full when the night starts and the load stays the same.
 */
export function missionFit(rover: Rover, lcspHours: number): MissionFit {
  if (lcspHours <= 0) return { kind: 'no-night' }
  const tolerance = darknessToleranceHours(rover)
  if (tolerance === null) return { kind: 'rtg' }
  if (tolerance >= lcspHours) return { kind: 'fits', marginHours: tolerance - lcspHours }
  return { kind: 'short', gapHours: lcspHours - tolerance }
}

/** The name without its parenthesis: "Curiosity (Mars Science Laboratory)" reads "Curiosity" in a sentence. */
export function shortName(rover: Rover): string {
  return rover.name.split(' (')[0]
}

const MARS_PREFIXES = ['What if it went to the Moon?', 'E se fosse à Lua?']

/** The rover's description in `locale`, without the "what if it went to the Moon?" the label already says. */
export function describeRover(rover: Rover, locale: 'en' | 'pt'): string {
  let text = rover.description?.[locale]?.trim() ?? ''
  for (const prefix of MARS_PREFIXES) {
    if (text.startsWith(prefix)) text = text.slice(prefix.length).trim()
  }
  return text
}
