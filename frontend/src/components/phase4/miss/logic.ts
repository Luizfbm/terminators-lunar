import type { MetricKey, ScatterPoint, ScatterRange, ScatterResult } from './types'

/** The metrics in the order the screen lists them, the headline first. */
export const METRIC_ORDER: MetricKey[] = [
  'sun_and_earth_hours',
  'sunlit_hours',
  'earth_visible_hours',
  'lcip_hours',
  'lcsp_hours',
  'mean_sun_fraction',
]

/** A minute, in hours: the finest step the screen shows a duration in. */
const MINUTE_H = 1 / 60

/** Only the longest night is worse when it grows. */
export function moreIsWorse(key: MetricKey): boolean {
  return key === 'lcsp_hours'
}

/** The index of the point where the metric is worst; the first one on a tie, as the API does. */
export function worstIndex(result: ScatterResult, key: MetricKey): number {
  const range = result.band[key]
  return moreIsWorse(key) ? range.max_point : range.min_point
}

/** True when the 19 points agree to the minute (or to the percent, for the Sun fraction). */
export function isSteady(range: ScatterRange, key: MetricKey): boolean {
  const tolerance = key === 'mean_sun_fraction' ? 0.005 : MINUTE_H
  return range.max - range.min < tolerance
}

/** Share of the Window a point's metric fills, from 0 to 1, for the drawing. */
export function shareOfWindow(result: ScatterResult, point: ScatterPoint, key: MetricKey): number {
  const value = point.metrics[key]
  const share = key === 'mean_sun_fraction' ? value : value / result.query.duration_hours
  return Math.min(1, Math.max(0, share))
}

export type Headline =
  | { kind: 'steady' }
  | { kind: 'siteWorst'; best: number }
  | { kind: 'drop'; point: ScatterPoint; from: number; to: number }

/** What the sentence says about Sun-and-Earth time, the headline metric. */
export function headline(result: ScatterResult): Headline {
  const key: MetricKey = 'sun_and_earth_hours'
  const range = result.band[key]
  if (isSteady(range, key) && isSteady(result.band.lcsp_hours, 'lcsp_hours')) return { kind: 'steady' }
  const site = result.points[0].metrics[key]
  const worst = result.points[range.min_point]
  if (range.min_point === 0 || site - worst.metrics[key] < MINUTE_H) return { kind: 'siteWorst', best: range.max }
  return { kind: 'drop', point: worst, from: site, to: worst.metrics[key] }
}

/** The longest night at its worst point, when that is longer than at the Site. */
export function worstNight(result: ScatterResult): { point: ScatterPoint; from: number; to: number } | null {
  const range = result.band.lcsp_hours
  const site = result.points[0].metrics.lcsp_hours
  if (range.max_point === 0 || range.max - site < MINUTE_H) return null
  return { point: result.points[range.max_point], from: site, to: range.max }
}

/** Minimum and maximum of each metric, as the API computes `band`. */
export function bandOf(points: ScatterPoint[]): Record<MetricKey, ScatterRange> {
  const entries = METRIC_ORDER.map((key) => {
    let minPoint = 0
    let maxPoint = 0
    points.forEach((point, index) => {
      if (point.metrics[key] < points[minPoint].metrics[key]) minPoint = index
      if (point.metrics[key] > points[maxPoint].metrics[key]) maxPoint = index
    })
    const range: ScatterRange = {
      min: points[minPoint].metrics[key],
      max: points[maxPoint].metrics[key],
      min_point: minPoint,
      max_point: maxPoint,
    }
    return [key, range] as const
  })
  return Object.fromEntries(entries) as Record<MetricKey, ScatterRange>
}
