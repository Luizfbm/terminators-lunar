import type { HazardTradeOffPoint } from './types'

/** Two values this close are the same point of the curve (the slider speaks in whole percents). */
const SAME = 1e-9

/**
 * The unvetoed hazard the contract's curve gives at a false alarm, read between its points along a
 * straight line. Outside the first and last point it answers null: the curve is never extended
 * (ADR 0002 keeps the numbers in the backend, this only reads between two it sent).
 */
export function interpolateTradeOff(points: readonly HazardTradeOffPoint[], falseAlarm: number): number | null {
  if (points.length === 0 || !Number.isFinite(falseAlarm)) return null
  const sorted = [...points].sort((a, b) => a.false_alarm - b.false_alarm)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (falseAlarm < first.false_alarm - SAME || falseAlarm > last.false_alarm + SAME) return null
  for (let i = 0; i < sorted.length; i += 1) {
    const point = sorted[i]
    if (Math.abs(point.false_alarm - falseAlarm) <= SAME) return point.missed_hazard
    const next = sorted[i + 1]
    if (next && falseAlarm > point.false_alarm && falseAlarm < next.false_alarm) {
      const share = (falseAlarm - point.false_alarm) / (next.false_alarm - point.false_alarm)
      return point.missed_hazard + share * (next.missed_hazard - point.missed_hazard)
    }
  }
  return null
}

/** How much smaller `after` is than `before`, as a percent of `before`; null when `before` is zero. Negative when it grew. */
export function reductionPercent(before: number, after: number): number | null {
  if (!(before > 0)) return null
  return ((before - after) / before) * 100
}

/** The false-alarm range both curves cover, in whole percents, for the slider. */
export function falseAlarmRange(
  normal: readonly HazardTradeOffPoint[],
  multiresolution: readonly HazardTradeOffPoint[],
): { min: number; max: number } | null {
  if (normal.length === 0 || multiresolution.length === 0) return null
  const low = (points: readonly HazardTradeOffPoint[]) => Math.min(...points.map((p) => p.false_alarm))
  const high = (points: readonly HazardTradeOffPoint[]) => Math.max(...points.map((p) => p.false_alarm))
  const min = Math.ceil(Math.max(low(normal), low(multiresolution)) * 100 - 1e-6)
  const max = Math.floor(Math.min(high(normal), high(multiresolution)) * 100 + 1e-6)
  return min <= max ? { min, max } : null
}
