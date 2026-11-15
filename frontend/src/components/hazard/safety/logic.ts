import type { PanelState } from '../../../hooks/useLadder'
import type { Locale } from '../../../i18n/messages'
import { estimateOf, signedPercent, type RunEstimate } from '../estimate/estimate'
import type { HazardAround, HazardMethod, SiteHazard } from './types'

/** The radius of the circle: the area the 5 m and 60 m cells are counted over. */
export const RADIUS_M = 250

/** The coarse grid and the Confidence level the seal reads, as in Eduardo's cockpit. */
export const COARSE_M = 60
export const LEVEL = 'P90'

/** The two hazard shares of the seal, as the API returns them (fractions from 0 to 1). */
export interface Seal {
  normal: number
  multiresolution: number
  /** Relative change from Normal navigation to Multiresolution; null when Normal navigation misses nothing. */
  change: number | null
  gridId: string
  distanceKm: number
  slopeLimitDeg: number
  /** What the estimate line under the seal says (our group's estimate and its error range); null when the run has no such pair. */
  estimate: RunEstimate | null
}

function method(hazard: SiteHazard, navigation: HazardMethod['navigation']): HazardMethod | undefined {
  const run = hazard.runs.find((candidate) => candidate.coarse_m === COARSE_M)
  return run?.methods.find(
    (candidate) => candidate.navigation === navigation && (navigation === 'normal' || candidate.confidence_level === LEVEL),
  )
}

/**
 * The relative change between two returned values, the only arithmetic the browser does on them
 * (ADR 0002): -0.79 is a 79% reduction. Null when there is nothing to compare against.
 */
export function changeOf(from: number, to: number): number | null {
  return from > 0 ? (to - from) / from : null
}

/** Normal navigation on the 60 m grid against Multiresolution P90, or null without a grid. */
export function sealOf(hazard: SiteHazard): Seal | null {
  const normal = method(hazard, 'normal')
  const multi = method(hazard, 'multiresolution')
  const run = hazard.runs.find((candidate) => candidate.coarse_m === COARSE_M)
  if (!hazard.grid || !normal || !multi || !run) return null
  return {
    normal: normal.missed_hazard.mean,
    multiresolution: multi.missed_hazard.mean,
    change: changeOf(normal.missed_hazard.mean, multi.missed_hazard.mean),
    gridId: hazard.grid.id,
    distanceKm: hazard.grid.distance_km,
    slopeLimitDeg: hazard.slope_limit_deg,
    estimate: estimateOf(run, LEVEL),
  }
}

/** A share with two decimals, the decimal sign following the language: 0.128587 is "12,86%" in Portuguese. */
export function formatShare(fraction: number, locale: Locale): string {
  const text = (fraction * 100).toFixed(2)
  return `${locale === 'pt' ? text.replace('.', ',') : text}%`
}

/** "−79%" for a drop, "+12%" for a rise, whole percent, with a true minus sign. */
export function formatChange(change: number): string {
  return signedPercent(change)
}

export type View =
  | { kind: 'loading' }
  | { kind: 'seal'; seal: Seal; around: HazardAround | null }
  /** No percentage to show; `reason` says why. */
  | { kind: 'absent'; reason: 'custom' | 'no_grid' | 'failed' }

/** What the circle shows, from the Site and the state of the two requests. */
export function viewOf(custom: boolean, hazard: PanelState<SiteHazard>, around: PanelState<HazardAround>): View {
  if (custom) return { kind: 'absent', reason: 'custom' }
  if (hazard.status === 'error') return { kind: 'absent', reason: 'failed' }
  if (hazard.status !== 'ready') return { kind: 'loading' }
  const seal = sealOf(hazard.data)
  if (!seal) return { kind: 'absent', reason: 'no_grid' }
  // The count is a second line under the seal: without it (still loading, or the Site outside the grid) the seal stands.
  return { kind: 'seal', seal, around: around.status === 'ready' ? around.data : null }
}
