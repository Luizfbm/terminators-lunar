import { useSyncExternalStore } from 'react'
import { TOLERANCE_PARAM } from '../site-windows/request'

/** The three fields as typed: empty or not a number until the user finishes. */
export interface LanderDraft {
  panel: string
  load: string
  battery: string
}

/**
 * Where the panels face (the requirement, after Eduardo's panel-geometry model): always toward the Sun,
 * upright and fixed toward an azimuth (as typed, degrees from north, clockwise), or lying flat.
 */
export type PanelsDraft = { pointing: 'sun' } | { pointing: 'fixed'; azimuth: string } | { pointing: 'flat' }

/** Everything the battery panel keeps in the link. */
export interface BatterySettings {
  /** Darkness tolerance in hours, or null while the field is empty. */
  tolerance: number | null
  /** Whether the full reading is open. */
  open: boolean
  draft: LanderDraft
  panels: PanelsDraft
}

/**
 * The link parameters: `tolerance=50`, `charge=1`, `lander=450,108.4,5420` (panel W, load W, battery
 * Wh), `panels=fixed:90` (`sun`, `fixed:<azimuth>` or `flat`; a link without it reads as `sun`). The
 * Darkness tolerance has one name for the whole app: the launch slip (the implementation) reads it too.
 */
export const PARAMS = { tolerance: TOLERANCE_PARAM, open: 'charge', lander: 'lander', panels: 'panels' } as const

const EMPTY: LanderDraft = { panel: '', load: '', battery: '' }
export const FACING_SUN: PanelsDraft = { pointing: 'sun' }

export function readPanels(raw: string | null): PanelsDraft {
  const text = raw?.trim() ?? ''
  if (text === 'flat') return { pointing: 'flat' }
  if (text === 'fixed' || text.startsWith('fixed:')) return { pointing: 'fixed', azimuth: text.slice('fixed:'.length).trim() }
  return FACING_SUN
}

export function writePanels(panels: PanelsDraft): string {
  return panels.pointing === 'fixed' ? `fixed:${panels.azimuth}` : panels.pointing
}

export function readSettings(search: string): BatterySettings {
  const params = new URLSearchParams(search)
  const raw = params.get(PARAMS.tolerance)?.trim()
  const hours = raw ? Number(raw) : NaN
  const [panel = '', load = '', battery = ''] = (params.get(PARAMS.lander) ?? '').split(',').map((part) => part.trim())
  return {
    tolerance: Number.isFinite(hours) && hours >= 0 ? hours : null,
    open: params.get(PARAMS.open) === '1',
    draft: { panel, load, battery },
    panels: readPanels(params.get(PARAMS.panels)),
  }
}

/** The query string with the battery's settings in it; every other parameter is left as it was. */
export function writeSettings(settings: BatterySettings, search: string): string {
  const params = new URLSearchParams(search)
  if (settings.tolerance === null) params.delete(PARAMS.tolerance)
  else params.set(PARAMS.tolerance, String(settings.tolerance))
  if (settings.open) params.set(PARAMS.open, '1')
  else params.delete(PARAMS.open)
  const { panel, load, battery } = settings.draft
  if (panel || load || battery) params.set(PARAMS.lander, [panel, load, battery].join(','))
  else params.delete(PARAMS.lander)
  if (settings.panels.pointing === 'sun') params.delete(PARAMS.panels)
  else params.set(PARAMS.panels, writePanels(settings.panels))
  const text = params.toString()
  return text ? `?${text}` : ''
}

// One copy of the settings for the panel and the Charge row on the time strip, kept in the link.
let current: BatterySettings | null = null
const listeners = new Set<() => void>()

function snapshot(): BatterySettings {
  current ??= readSettings(window.location.search)
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const follow = () => {
    current = readSettings(window.location.search)
    listener()
  }
  window.addEventListener('popstate', follow)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', follow)
  }
}

export function updateSettings(change: Partial<BatterySettings>): void {
  current = { ...snapshot(), ...change }
  const query = writeSettings(current, window.location.search)
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query}`)
  for (const listener of listeners) listener()
}

export function useBatterySettings(): BatterySettings {
  return useSyncExternalStore(subscribe, snapshot, () => ({ tolerance: null, open: false, draft: EMPTY, panels: FACING_SUN }))
}
