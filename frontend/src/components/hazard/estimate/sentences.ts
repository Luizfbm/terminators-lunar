// The estimate sentences of the hazard screens, built from a run's numbers. Every figure in them is
// the API's (or ADR 0008's, named in estimate.ts); this file only formats and places them.

import {
  countText,
  degreeText,
  MEDIAN_GAIN_26_GRIDS,
  MEDIAN_GAIN_26_GRIDS_20M,
  SHIELD_CHECK,
  SHIELD_CHECKED_REGIONS,
  SHIELD_FAR_DEG,
  plainPercent,
  SHIELD_NEAR_DEG,
  shareText,
  signedPercent,
  wholePercent,
  type EstimateLocale,
  type ConfidenceLevel,
  type RunEstimate,
  type SameAlarmRange,
} from './estimate'
import { estimateText } from './strings'

/** "from −22% to −14%", or "about −20%" when the two ends read the same. */
export function rangeText(locale: EstimateLocale, range: SameAlarmRange): string {
  const low = signedPercent(range.low)
  const high = signedPercent(range.high)
  if (low === high) return estimateText(locale, 'estimate.rangeSame', { value: low })
  return estimateText(locale, 'estimate.range', { low, high })
}

/** The line under the seal: short, the figure's label and the range it may really have. */
export function sealSentence(locale: EstimateLocale, estimate: RunEstimate): string {
  if (!estimate.sameAlarm) return estimateText(locale, 'estimate.sealNoRange')
  const range = rangeText(locale, estimate.sameAlarm)
  if (estimate.change === null) return estimateText(locale, 'estimate.sealNoChange', { range })
  return estimateText(locale, 'estimate.seal', { range, change: signedPercent(estimate.change) })
}

/** The longer pair of sentences: the figure, what it is based on, and the possible error. */
export function runSentences(locale: EstimateLocale, estimate: RunEstimate): string[] {
  const lead =
    estimate.change === null
      ? estimateText(locale, 'estimate.leadNoChange', {
          cells: countText(estimate.cellsChecked, locale),
          normal: shareText(estimate.normalMissed, locale),
        })
      : estimateText(locale, 'estimate.lead', {
          cells: countText(estimate.cellsChecked, locale),
          level: estimate.level,
          change: signedPercent(estimate.change),
        })
  if (!estimate.sameAlarm) return [lead, estimateText(locale, 'estimate.rangeNone')]
  return [
    lead,
    estimateText(locale, 'estimate.rangeDetail', {
      normalFa: shareText(estimate.normalFalseAlarm, locale),
      multiFa: shareText(estimate.multiFalseAlarm, locale),
      fromFa: wholePercent(estimate.sameAlarm.fromFalseAlarm),
      toFa: wholePercent(estimate.sameAlarm.toFalseAlarm),
      range: rangeText(locale, estimate.sameAlarm),
    }),
  ]
}

/** The 26-grid medians of ADR 0008, the same for every Site. */
export function gainsSentence(locale: EstimateLocale): string {
  return estimateText(locale, 'estimate.gains', {
    median: plainPercent(MEDIAN_GAIN_26_GRIDS, locale),
    median20: plainPercent(MEDIAN_GAIN_26_GRIDS_20M, locale),
  })
}

function margins(locale: EstimateLocale, level: ConfidenceLevel) {
  return { near: degreeText(SHIELD_NEAR_DEG, locale), far: degreeText(SHIELD_FAR_DEG, locale), level }
}

/** What the Shield margin is, and how much of the checked cells it really covered at this level. */
export function shieldCoverageSentence(locale: EstimateLocale, estimate: RunEstimate): string {
  return estimateText(locale, 'estimate.shield', { ...margins(locale, estimate.level), coverage: shareText(estimate.coverage, locale) })
}

/** What was checked against the SfS terrain, and what that check found at this level. */
export function shieldCheckSentence(locale: EstimateLocale, level: ConfidenceLevel): string {
  const check = SHIELD_CHECK[level]
  const base = { ...margins(locale, level), regions: String(SHIELD_CHECKED_REGIONS) }
  if (!check) return estimateText(locale, 'estimate.shieldNoCheck', base)
  return estimateText(locale, 'estimate.shieldCheck', {
    ...base,
    low: shareText(check.low, locale),
    high: shareText(check.high, locale),
    promised: plainPercent(check.promised, locale),
  })
}
