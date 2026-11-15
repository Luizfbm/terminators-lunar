import { text, type InspectorLocale } from './strings'
import { falseAlarmRange, interpolateTradeOff, reductionPercent } from './tradeoff'
import type { CoarseGrid, ConfidenceLevel, HazardInterval, HazardMethod, HazardRun, SiteHazard } from './types'

/** The run that started from this coarse grid, if the API sent one. */
export function runFor(hazard: SiteHazard, coarse: CoarseGrid): HazardRun | undefined {
  return hazard.runs.find((run) => run.coarse_m === coarse)
}

/** The coarse grids the API has a run for, in its own order. */
export function coarseGridsOf(hazard: SiteHazard): CoarseGrid[] {
  return hazard.runs.map((run) => run.coarse_m)
}

export function normalMethod(run: HazardRun): HazardMethod | undefined {
  return run.methods.find((method) => method.navigation === 'normal')
}

export function multiMethod(run: HazardRun, level: ConfidenceLevel): HazardMethod | undefined {
  return run.methods.find((method) => method.navigation === 'multiresolution' && method.confidence_level === level)
}

/** The confidence levels this run has a Multiresolution row for. */
export function levelsOf(run: HazardRun): ConfidenceLevel[] {
  const levels: ConfidenceLevel[] = []
  for (const method of run.methods) {
    if (method.navigation === 'multiresolution' && method.confidence_level) levels.push(method.confidence_level)
  }
  return levels
}

/** What the screen shows for one coarse grid, one Confidence level and one false alarm. */
export interface Reading {
  normal: HazardMethod
  multi: HazardMethod
  /** The same false alarm for both navigations, as a fraction; null when the curves do not reach it. */
  fair: { falseAlarm: number; normal: number; multi: number; reductionPercent: number | null } | null
  medianError: { normal: number; multi: number; reductionPercent: number | null }
}

/** Reads the run at a false alarm in whole percents. Reads between the contract's curve points, never past them. */
export function readRun(run: HazardRun, level: ConfidenceLevel, falseAlarmPercent: number): Reading | null {
  const normal = normalMethod(run)
  const multi = multiMethod(run, level)
  if (!normal || !multi) return null
  const falseAlarm = falseAlarmPercent / 100
  const fairNormal = interpolateTradeOff(run.trade_off.normal, falseAlarm)
  const fairMulti = interpolateTradeOff(run.trade_off.multiresolution, falseAlarm)
  return {
    normal,
    multi,
    fair:
      fairNormal === null || fairMulti === null
        ? null
        : { falseAlarm, normal: fairNormal, multi: fairMulti, reductionPercent: reductionPercent(fairNormal, fairMulti) },
    medianError: {
      normal: run.median_error_deg.normal,
      multi: run.median_error_deg.multiresolution,
      reductionPercent: reductionPercent(run.median_error_deg.normal, run.median_error_deg.multiresolution),
    },
  }
}

/** The slider's range in whole percents for a run: where both curves have points. */
export function sliderRange(run: HazardRun): { min: number; max: number } | null {
  return falseAlarmRange(run.trade_off.normal, run.trade_off.multiresolution)
}

/** Keeps a false alarm inside the slider's range (a run swap can change it). */
export function clampPercent(value: number, range: { min: number; max: number }): number {
  return Math.min(Math.max(Math.round(value), range.min), range.max)
}

/** A no-break space, so a value never parts from its unit. */
const NBSP = String.fromCharCode(160)

export interface Format {
  /** A share given as a fraction, as a percent: two decimals under 1%, one above. */
  percent: (fraction: number) => string
  /** A percent that is already a percent, no decimals. */
  wholePercent: (percent: number) => string
  /** A number with at most `digits` decimals. */
  number: (value: number, digits?: number) => string
}

export function formatterFor(locale: InspectorLocale): Format {
  const tag = locale === 'pt' ? 'pt-BR' : 'en-GB'
  const build = (digits: number) => new Intl.NumberFormat(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const one = build(1)
  const two = build(2)
  const zero = build(0)
  const plain = (digits: number) => new Intl.NumberFormat(tag, { maximumFractionDigits: digits })
  return {
    percent: (fraction) => (Math.abs(fraction) < 0.01 ? two.format(fraction * 100) : one.format(fraction * 100)) + NBSP + '%',
    wholePercent: (percent) => zero.format(percent) + NBSP + '%',
    number: (value, digits = 1) => plain(digits).format(value),
  }
}

export function intervalText(locale: InspectorLocale, format: Format, interval: HazardInterval): string {
  return text(locale, 'hazard.interval', {
    mean: format.percent(interval.mean),
    low: format.percent(interval.low),
    high: format.percent(interval.high),
  })
}

/** The plain sentence that says what the false-alarm slider shows, before the numbers. */
export function fairSentence(locale: InspectorLocale, format: Format, reading: Reading): string {
  const { fair } = reading
  if (fair === null) return text(locale, 'hazard.noCurve')
  const fa = format.wholePercent(fair.falseAlarm * 100)
  const normal = format.percent(fair.normal)
  const multi = format.percent(fair.multi)
  const pct = fair.reductionPercent
  if (pct === null) return text(locale, 'hazard.noReduction')
  const shown = format.wholePercent(Math.abs(pct))
  if (shown === format.wholePercent(0)) return text(locale, 'hazard.sentenceSame', { fa, normal })
  return text(locale, pct > 0 ? 'hazard.sentenceLess' : 'hazard.sentenceMore', { fa, normal, multi, pct: shown })
}
