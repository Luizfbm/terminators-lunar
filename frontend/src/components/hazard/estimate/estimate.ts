// The "our group's estimate" wording of the hazard figures, and the error range each one carries
// (Luiz, 15/11/2026, ADR 0008). Every figure stays as the API returned it; this file only works out
// what to say beside it. The range comes only from numbers that already exist: the API answer
// (`trade_off`, `coverage`, `cells_checked`) and the few figures of ADR 0008 the API does not carry,
// which are named below with where they come from. Nothing here invents a variance.

import type { components } from '../../../api/schema'

export type EstimateLocale = 'en' | 'pt'
type HazardRun = components['schemas']['HazardRun']
type HazardMethod = components['schemas']['HazardMethod']
export type ConfidenceLevel = components['schemas']['ConfidenceLevelName']

/** Two false alarms this close are the same point of the two curves. */
const SAME = 1e-9

/**
 * ADR 0008, "Compared at the same False alarm": over our group's 26 grids, Multiresolution's own gain
 * at the same False alarm is 38.5% in the median, and 12% when the coarse grid is 20 m. The API does
 * not carry them (they are a statement about the 26 grids, not about one Site).
 */
export const MEDIAN_GAIN_26_GRIDS = 0.385
export const MEDIAN_GAIN_26_GRIDS_20M = 0.12

/**
 * ADR 0008, "The margin rule": the Shield is 1° plus z times 0.8° near laser shots or 2.0° far from
 * them. Only the 2.0° branch was checked against the SfS terrain, in three regions; the 0.8° branch
 * has no external check.
 */
export const SHIELD_NEAR_DEG = 0.8
export const SHIELD_FAR_DEG = 2.0
export const SHIELD_CHECKED_REGIONS = 3

/**
 * The same SfS check (ADR 0008): on interpolated cells (the 2.0° branch) the level was exceeded this
 * share of the time, from the lowest region to the highest, against the share it promised. P50 was
 * not reported.
 */
export const SHIELD_CHECK: Partial<Record<ConfidenceLevel, { low: number; high: number; promised: number }>> = {
  P90: { low: 0.033, high: 0.06, promised: 0.1 },
  P99: { low: 0.007, high: 0.015, promised: 0.01 },
}

/**
 * How much the change between the two navigations moves when both are held to the same False alarm:
 * the relative change of the unvetoed hazard (Multiresolution against Normal navigation) at each
 * false alarm the two `trade_off` curves share, from the most negative to the most positive.
 */
export interface SameAlarmRange {
  /** The lowest relative change (-0.22 is a 22% drop). */
  low: number
  /** The highest relative change. */
  high: number
  /** The lowest and the highest false alarm the two curves share, as fractions. */
  fromFalseAlarm: number
  toFalseAlarm: number
}

export function sameAlarmRange(run: Pick<HazardRun, 'trade_off'>): SameAlarmRange | null {
  const changes: number[] = []
  const alarms: number[] = []
  for (const normal of run.trade_off.normal) {
    const multi = run.trade_off.multiresolution.find((point) => Math.abs(point.false_alarm - normal.false_alarm) <= SAME)
    if (!multi || !(normal.missed_hazard > 0)) continue
    changes.push((multi.missed_hazard - normal.missed_hazard) / normal.missed_hazard)
    alarms.push(normal.false_alarm)
  }
  if (changes.length === 0) return null
  return {
    low: Math.min(...changes),
    high: Math.max(...changes),
    fromFalseAlarm: Math.min(...alarms),
    toFalseAlarm: Math.max(...alarms),
  }
}

/** What the estimate sentences of one run and one Confidence level are made from, as the API returned it. */
export interface RunEstimate {
  level: ConfidenceLevel
  cellsChecked: number
  /** Unvetoed hazard (means) of Normal navigation and of Multiresolution at `level`. */
  normalMissed: number
  multiMissed: number
  /** Relative change between the two; null when Normal navigation misses nothing. */
  change: number | null
  /** The false alarm each navigation really has at `level`. */
  normalFalseAlarm: number
  multiFalseAlarm: number
  sameAlarm: SameAlarmRange | null
  /** The share of the checked cells the margin really covered (`coverage` of Multiresolution at `level`). */
  coverage: number
}

function find(run: HazardRun, navigation: HazardMethod['navigation'], level?: ConfidenceLevel): HazardMethod | undefined {
  return run.methods.find((method) => method.navigation === navigation && (navigation === 'normal' || method.confidence_level === level))
}

export function estimateOf(run: HazardRun, level: ConfidenceLevel): RunEstimate | null {
  const normal = find(run, 'normal')
  const multi = find(run, 'multiresolution', level)
  if (!normal || !multi) return null
  return {
    level,
    cellsChecked: run.cells_checked,
    normalMissed: normal.missed_hazard.mean,
    multiMissed: multi.missed_hazard.mean,
    change: normal.missed_hazard.mean > 0 ? (multi.missed_hazard.mean - normal.missed_hazard.mean) / normal.missed_hazard.mean : null,
    normalFalseAlarm: normal.false_alarm.mean,
    multiFalseAlarm: multi.false_alarm.mean,
    sameAlarm: sameAlarmRange(run),
    coverage: multi.coverage.mean,
  }
}

/** "−79%" for a drop, "+12%" for a rise, whole percent, with a true minus sign. */
export function signedPercent(change: number): string {
  const whole = Math.round(change * 100)
  if (whole === 0) return '0%'
  return `${whole < 0 ? '−' : '+'}${Math.abs(whole)}%`
}

/** A share with one decimal and the decimal sign of the language: 0.059 is "5,9%" in Portuguese. */
export function shareText(fraction: number, locale: EstimateLocale): string {
  const text = (fraction * 100).toFixed(1)
  return `${locale === 'pt' ? text.replace('.', ',') : text}%`
}

/** A percent written the way the source writes it: 0.12 is "12%", 0.385 is "38.5%" ("38,5%" in Portuguese). */
export function plainPercent(fraction: number, locale: EstimateLocale): string {
  const value = Math.round(fraction * 1000) / 10
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return `${locale === 'pt' ? text.replace('.', ',') : text}%`
}

/** A whole percent with no sign: 0.30 is "30%". */
export function wholePercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/** An integer with the thousands separator of the language. */
export function countText(value: number, locale: EstimateLocale): string {
  return new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : 'en-GB', { maximumFractionDigits: 0 }).format(value)
}

/** A number with one decimal, as the margins are written: 2.0 is "2,0" in Portuguese. */
export function degreeText(value: number, locale: EstimateLocale): string {
  return new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
}
