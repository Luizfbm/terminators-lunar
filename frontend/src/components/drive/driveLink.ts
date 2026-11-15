import { MISSION_DAYS, MISSION_YEARS } from '../rover/mission'
import type { Navigation } from '../route/compare/types'

/**
 * "Rover and drive" in the link (issue #100). The App's link writer carries parameters it does not own, so
 * these ride along with the Query and nothing here touches `query.ts`.
 *
 *   drive=rover|hazard|simulation|walk   the screen open; no `drive`, no sheet
 *   rover=<id>                           the Rover of `/rovers`
 *   myear=2027, mdays=10, mdte=0|1       the mission the picker holds
 *   plan=normal|multiresolution          the plan accepted, which the walk follows
 */
export const DRIVE_SCREENS = ['rover', 'hazard', 'simulation', 'walk'] as const
export type DriveScreen = (typeof DRIVE_SCREENS)[number]

export const DRIVE_PARAMS = { screen: 'drive', rover: 'rover', year: 'myear', days: 'mdays', dte: 'mdte', plan: 'plan' } as const

export interface DriveState {
  /** null: the sheet is closed. */
  screen: DriveScreen | null
  roverId: string | null
  year: number | null
  days: number | null
  requireDte: boolean | null
  plan: Navigation | null
}

/** A Rover's id goes to the API as it is: only what the catalogue's ids are made of is read back. */
const ROVER_ID = /^[a-z0-9_-]{1,40}$/i

function whole(raw: string | null): number | null {
  return raw !== null && /^\d{1,4}$/.test(raw) ? Number(raw) : null
}

/** What the link says about the sheet. Anything that is not one of the values above reads as absent. */
export function readDrive(search: string): DriveState {
  const params = new URLSearchParams(search)
  const screen = params.get(DRIVE_PARAMS.screen)
  const roverId = params.get(DRIVE_PARAMS.rover)
  const year = whole(params.get(DRIVE_PARAMS.year))
  const days = whole(params.get(DRIVE_PARAMS.days))
  const dte = params.get(DRIVE_PARAMS.dte)
  const plan = params.get(DRIVE_PARAMS.plan)
  return {
    screen: (DRIVE_SCREENS as readonly string[]).includes(screen ?? '') ? (screen as DriveScreen) : null,
    roverId: roverId && ROVER_ID.test(roverId) ? roverId : null,
    year: year !== null && (MISSION_YEARS as readonly number[]).includes(year) ? year : null,
    days: days !== null && (MISSION_DAYS as readonly number[]).includes(days) ? days : null,
    requireDte: dte === '1' ? true : dte === '0' ? false : null,
    plan: plan === 'normal' || plan === 'multiresolution' ? plan : null,
  }
}

/**
 * The query string for `state` on top of `keep` (the current one): the parameters of the Query and of
 * the other panels are kept as they are, and the sheet's own are replaced. A closed sheet leaves none.
 */
export function writeDrive(state: DriveState, keep = ''): string {
  const params = new URLSearchParams()
  const own = new Set<string>(Object.values(DRIVE_PARAMS))
  for (const [name, value] of new URLSearchParams(keep)) {
    if (!own.has(name)) params.append(name, value)
  }
  if (state.screen !== null) {
    params.set(DRIVE_PARAMS.screen, state.screen)
    if (state.roverId) params.set(DRIVE_PARAMS.rover, state.roverId)
    if (state.year !== null) params.set(DRIVE_PARAMS.year, String(state.year))
    if (state.days !== null) params.set(DRIVE_PARAMS.days, String(state.days))
    if (state.requireDte !== null) params.set(DRIVE_PARAMS.dte, state.requireDte ? '1' : '0')
    if (state.plan) params.set(DRIVE_PARAMS.plan, state.plan)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function sameDrive(a: DriveState, b: DriveState): boolean {
  return (
    a.screen === b.screen &&
    a.roverId === b.roverId &&
    a.year === b.year &&
    a.days === b.days &&
    a.requireDte === b.requireDte &&
    a.plan === b.plan
  )
}

/**
 * The state after the link changed under the sheet (the back button, a pasted link): what the link says, and
 * when it says the sheet is closed, the choices the sheet still remembers.
 */
export function followLink(previous: DriveState, search: string): DriveState {
  const read = readDrive(search)
  return read.screen === null ? { ...previous, screen: null } : read
}
