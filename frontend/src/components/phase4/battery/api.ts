import { useEffect, useState } from 'react'
import { getJson, siteParams, toApiInstant, type VisibilityResult } from '../../../api/client'
import { siteRefOf } from '../../../domain/query'
import { useOnDemand, type PanelState } from '../../../hooks/useLadder'
import type { LanderDraft, PanelsDraft } from './settings'
import type { EnergyResult, Lander } from './types'

type QueryEcho = VisibilityResult['query']

/** The contract's bounds for each field. */
const BOUNDS = { panel: [0, 1_000_000], load: [0.1, 1_000_000], battery: [1, 100_000_000] } as const

/** The lander the three fields describe, or null while any of them is empty or out of bounds. */
export function landerOf(draft: LanderDraft): Lander | null {
  const read = (text: string, [min, max]: readonly [number, number]) => {
    const value = text.trim() === '' ? NaN : Number(text)
    return Number.isFinite(value) && value >= min && value <= max ? value : null
  }
  const panel = read(draft.panel, BOUNDS.panel)
  const load = read(draft.load, BOUNDS.load)
  const battery = read(draft.battery, BOUNDS.battery)
  return panel === null || load === null || battery === null ? null : { panel_power_w: panel, load_w: load, battery_wh: battery }
}

/** The panel azimuth as typed, in degrees, or null while it is empty or outside 0 ≤ value < 360. */
export function azimuthOf(text: string): number | null {
  const value = text.trim() === '' ? NaN : Number(text)
  return Number.isFinite(value) && value >= 0 && value < 360 ? value : null
}

/**
 * The lander with its panels' pointing, or null while a number is missing or out of bounds. The
 * pointing is always sent, so the answer always carries `panel_lit_hours`.
 */
export function pointedLanderOf(draft: LanderDraft, panels: PanelsDraft): Lander | null {
  const lander = landerOf(draft)
  if (lander === null) return null
  if (panels.pointing !== 'fixed') return { ...lander, panel_pointing: panels.pointing }
  const azimuth = azimuthOf(panels.azimuth)
  return azimuth === null ? null : { ...lander, panel_pointing: 'fixed', panel_azimuth_deg: azimuth }
}

export function energyParams(query: QueryEcho, lander: Lander): URLSearchParams {
  const params = new URLSearchParams({
    ...siteParams(siteRefOf(query.site)),
    start: toApiInstant(new Date(query.start)),
    duration_hours: String(query.duration_hours),
    observer_height_m: String(query.observer_height_m),
    panel_power_w: String(lander.panel_power_w),
    load_w: String(lander.load_w),
    battery_wh: String(lander.battery_wh),
  })
  if (lander.panel_pointing) params.set('panel_pointing', lander.panel_pointing)
  if (lander.panel_azimuth_deg !== undefined) params.set('panel_azimuth_deg', String(lander.panel_azimuth_deg))
  return params
}

// The panel and the Charge row on the time strip read the same answer: one request per Query and
// lander, kept for the last few.
const asked = new Map<string, Promise<EnergyResult>>()
const KEEP = 6

function getEnergy(key: string, params: URLSearchParams, signal: AbortSignal): Promise<EnergyResult> {
  let pending = asked.get(key)
  if (!pending) {
    // The shared request is not tied to one reader's signal: the other may still be waiting on it.
    pending = getJson<EnergyResult>('/visibility/energy', params, new AbortController().signal)
    pending.catch(() => asked.delete(key))
    asked.set(key, pending)
    while (asked.size > KEEP) asked.delete(asked.keys().next().value as string)
  }
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    pending.then(resolve, reject)
  })
}

// A retry from either reader asks again for both.
let attempts = 0
const listeners = new Set<() => void>()

function retryEnergy(): void {
  attempts += 1
  for (const listener of listeners) listener()
}

function useAttempt(): number {
  const [attempt, setAttempt] = useState(attempts)
  useEffect(() => {
    const follow = () => setAttempt(attempts)
    listeners.add(follow)
    return () => {
      listeners.delete(follow)
    }
  }, [])
  return attempt
}

/** Waits for the typing to stop before a new lander is asked about. */
function useSettled<T>(value: T, key: string, ms: number): T {
  const [settled, setSettled] = useState({ key, value })
  useEffect(() => {
    if (settled.key === key) return
    const timer = window.setTimeout(() => setSettled({ key, value }), ms)
    return () => window.clearTimeout(timer)
  }, [key, value, ms, settled.key])
  return settled.value
}

/**
 * The Charge across the Window for the lander in the fields, asked only while the full reading is
 * open and the three numbers (and, for fixed panels, the azimuth) make a lander. Idle otherwise.
 */
export function useEnergy(
  query: QueryEcho,
  draft: LanderDraft,
  panels: PanelsDraft,
  open: boolean,
): { state: PanelState<EnergyResult>; retry: () => void } {
  const typed = pointedLanderOf(draft, panels)
  const lander = useSettled(typed, typed ? JSON.stringify(typed) : '', 400)
  const attempt = useAttempt()
  const params = lander ? energyParams(query, lander) : null
  const key = params ? `${params.toString()}#${attempt}` : ''
  const { state } = useOnDemand(open && params !== null, key, (signal) => getEnergy(key, params as URLSearchParams, signal))
  return { state, retry: retryEnergy }
}
