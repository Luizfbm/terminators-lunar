import { shareText } from '../../hazard/uncertainty/shareLogic'
import type { HazardMethod, HazardRun, SiteHazard } from '../../hazard/uncertainty/hazardApi'
import type { HazardKey } from './hazardStrings'

/** The Confidence levels of the Multiresolution margin, as the contract names them. */
export const LEVELS = ['P50', 'P90', 'P99'] as const
export type Level = (typeof LEVELS)[number]
/** The contract's default, and the one the Multiresolution results are usually quoted at. */
export const DEFAULT_LEVEL: Level = 'P90'

export interface Interval {
  mean: number
  low: number
  high: number
}

/** One grid's numbers for one Confidence level, as the API returns them (nothing recomputed). */
export interface RunView {
  coarseM: number
  normal: HazardMethod
  multiresolution: HazardMethod
  /** The fair comparison: both navigations at the same false alarm. Null if the API has no such pair. */
  fair: { falseAlarm: number; normal: number; multiresolution: number } | null
  medianError: { normal: number; multiresolution: number }
}

/** What a Site's block says: its grid and runs, or that no 5 m grid lies near it. */
export type SiteView = { kind: 'noGrid' } | { kind: 'grid'; gridId: string; distanceKm: number; slopeLimitDeg: number; runs: RunView[] }

/**
 * The fair comparison needs both navigations at the same false alarm. The API lists them at 5, 10,
 * ... 30%, so the point is the one nearest to the false alarm the chosen Multiresolution level
 * really has: the closest equal-false-alarm reading to the nominal one next to it.
 */
function fairPoint(run: HazardRun, multiresolution: HazardMethod): RunView['fair'] {
  const target = multiresolution.false_alarm.mean
  let best: HazardRun['trade_off']['multiresolution'][number] | null = null
  for (const point of run.trade_off.multiresolution) {
    if (best === null || Math.abs(point.false_alarm - target) < Math.abs(best.false_alarm - target)) best = point
  }
  if (best === null) return null
  const normal = run.trade_off.normal.find((point) => point.false_alarm === best.false_alarm)
  if (!normal) return null
  return { falseAlarm: best.false_alarm, normal: normal.missed_hazard, multiresolution: best.missed_hazard }
}

export function runView(run: HazardRun, level: Level): RunView | null {
  const normal = run.methods.find((method) => method.navigation === 'normal')
  const multiresolution = run.methods.find((method) => method.navigation === 'multiresolution' && method.confidence_level === level)
  if (!normal || !multiresolution) return null
  return {
    coarseM: run.coarse_m,
    normal,
    multiresolution,
    fair: fairPoint(run, multiresolution),
    medianError: { normal: run.median_error_deg.normal, multiresolution: run.median_error_deg.multiresolution },
  }
}

/** "No grid" is the API's `grid: null`, and also a grid it has no run for: there is nothing to show either way. */
export function siteView(hazard: SiteHazard, level: Level): SiteView {
  if (hazard.grid === null) return { kind: 'noGrid' }
  const runs = hazard.runs.flatMap((run) => runView(run, level) ?? [])
  if (runs.length === 0) return { kind: 'noGrid' }
  return { kind: 'grid', gridId: hazard.grid.id, distanceKm: hazard.grid.distance_km, slopeLimitDeg: hazard.slope_limit_deg, runs }
}

/** The change from one returned value to the other, as a fraction ("-0.38" is 38% lower). Null when there is no base to compare to. */
export function relativeChange(from: number, to: number): number | null {
  return from === 0 ? null : (to - from) / from
}

/** A signed whole percentage: "+16%", "-38%", "0%". Null stays null. */
export function changeText(change: number | null, formatPercent: (fraction: number) => string): string | null {
  if (change === null) return null
  const text = formatPercent(change)
  return change > 0 && !text.startsWith('+') ? `+${text}` : text
}

/**
 * A Monte Carlo mean with its 95% interval. The interval is left out when its two ends read the
 * same at the app's rounding, where "3% (3%-3%)" would only look like a mistake.
 */
export function intervalText(
  interval: Interval,
  format: (value: number) => string,
): { value: string; range: string | null } {
  const low = format(interval.low)
  const high = format(interval.high)
  return { value: format(interval.mean), range: low === high ? null : `${low}–${high}` }
}

/** Degrees at two decimals, as the API's own precision allows. */
export const degrees = (value: number, formatNumber: (value: number) => string): string =>
  `${formatNumber(Math.round(value * 100) / 100)}°`

export interface Say {
  t: (key: HazardKey, params?: Record<string, string>) => string
  formatPercent: (fraction: number) => string
}

/** The plain sentence over a grid's table: the nominal reading, then the fair one. */
export function runSentence(view: RunView, level: Level, slopeLimitDeg: number, say: Say): string {
  const percent = (fraction: number) => shareText(fraction, say.formatPercent)
  const base = {
    coarse: String(view.coarseM),
    level,
    limit: String(slopeLimitDeg),
    multiresolution: percent(view.multiresolution.missed_hazard.mean),
    normal: percent(view.normal.missed_hazard.mean),
  }
  if (view.fair === null) return say.t('sentence.nominal', base)
  return say.t('sentence.fair', {
    ...base,
    falseAlarm: percent(view.fair.falseAlarm),
    fairMultiresolution: percent(view.fair.multiresolution),
    fairNormal: percent(view.fair.normal),
  })
}
