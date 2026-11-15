import { siteKey, type PlanBLink, type Query } from './query'

/** The six metrics the app shows for a Window, in the order the numbers table lists them. */
export const METRIC_KEYS = [
  'sun_and_earth_hours',
  'sunlit_hours',
  'earth_visible_hours',
  'lcip_hours',
  'lcsp_hours',
  'mean_sun_fraction',
] as const

export type MetricKey = (typeof METRIC_KEYS)[number]

export type PlanMetrics = Record<MetricKey, number>

/** What the comparison needs of one plan: the answer's metrics and the length of its Window. */
export interface Plan {
  metrics: PlanMetrics
  durationHours: number
}

/**
 * When two values are the same plan's value for all practical purposes. A difference under the
 * threshold is a tie, never a winner: the numbers come from a model with its own error, and a
 * "better" that sits inside that error would send a mission planner the wrong way.
 *
 * Hours: 0.5 h. The engine reads the sky every 15 minutes (`timeline.step_minutes`), so half an
 * hour is two samples: under it the two plans differ by less than the engine can place an edge.
 * It is also far inside the spread the Resolution ladder measures between terrain resolutions
 * (ADR 0003), which is hours to days at the pole.
 */
export const TIE_HOURS = 0.5

/**
 * Shares of the Window (and the mean Sun fraction): half a percentage point, 0.005. The app shows
 * a share as a whole percent, so a gap under half a point is a gap the screen cannot show.
 */
export const TIE_SHARE = 0.005

const EPSILON = 1e-9

export type Side = 'a' | 'b'

/** Which compared quantity a row's gap is in. */
export type Unit = 'hours' | 'share'

export interface Row {
  metric: MetricKey
  /** The metric as the API gives it, for each plan. */
  a: number
  b: number
  /** The plan with the better value, or `tie` when the difference is under the threshold. */
  better: Side | 'tie'
  /** How far apart the two compared values are, in `unit`. */
  gap: number
  /**
   * `hours` when the row compares hours; `share` when it compares a share of the Window (the
   * mean Sun fraction always, and the three totals when the two Windows differ in length).
   */
  unit: Unit
}

export type Summary =
  /** No row separates the two plans. */
  | { kind: 'inseparable' }
  /** One plan is better in `wins` rows and the other in none: the rest are ties. */
  | { kind: 'ahead'; winner: Side; wins: number; headline: Row }
  /** Each plan is better somewhere: `headline` is the first row with a winner, `against` the first the other plan wins. */
  | { kind: 'mixed'; headline: Row; against: Row }

export interface Comparison {
  rows: Row[]
  /** The two Windows have the same length, so the totals compare as hours. */
  sameLength: boolean
  summary: Summary
}

/** Only the longest night is better when it is shorter. */
const LOWER_IS_BETTER: ReadonlySet<MetricKey> = new Set(['lcsp_hours'])

/** The totals over a Window: they grow with its length, so unequal Windows compare them as shares. */
const TOTALS: ReadonlySet<MetricKey> = new Set(['sun_and_earth_hours', 'sunlit_hours', 'earth_visible_hours'])

function row(metric: MetricKey, a: Plan, b: Plan, sameLength: boolean): Row {
  const isShare = metric === 'mean_sun_fraction' || (TOTALS.has(metric) && !sameLength)
  const valueOf = (plan: Plan) => (TOTALS.has(metric) && isShare ? plan.metrics[metric] / plan.durationHours : plan.metrics[metric])
  const from = valueOf(a)
  const to = valueOf(b)
  const gap = Math.abs(to - from)
  const tie = isShare ? TIE_SHARE : TIE_HOURS
  let better: Row['better'] = 'tie'
  if (gap >= tie - EPSILON) {
    const bHigher = to > from
    better = bHigher !== LOWER_IS_BETTER.has(metric) ? 'b' : 'a'
  }
  return { metric, a: a.metrics[metric], b: b.metrics[metric], better, gap, unit: isShare ? 'share' : 'hours' }
}

function summarise(rows: Row[]): Summary {
  const wonBy = (side: Side) => rows.filter((r) => r.better === side)
  const a = wonBy('a')
  const b = wonBy('b')
  if (a.length === 0 && b.length === 0) return { kind: 'inseparable' }
  if (a.length === 0 || b.length === 0) {
    const winner: Side = a.length > 0 ? 'a' : 'b'
    const wins = winner === 'a' ? a : b
    return { kind: 'ahead', winner, wins: wins.length, headline: wins[0] }
  }
  const headline = rows.find((r) => r.better !== 'tie') as Row
  const against = (headline.better === 'a' ? b : a)[0]
  return { kind: 'mixed', headline, against }
}

/**
 * Plan A against Plan B, metric by metric, with the better one marked and a tie where the two are
 * closer than the thresholds above. When the two Windows differ in length, the totals (Sun and
 * Earth together, Sun visible, Earth visible) are compared as shares of their own Window, because
 * 10 days of sunlight against 30 would say nothing; the longest periods stay in hours.
 */
export function comparePlans(a: Plan, b: Plan): Comparison {
  const sameLength = Math.abs(a.durationHours - b.durationHours) < TIE_HOURS - EPSILON
  const rows = METRIC_KEYS.map((metric) => row(metric, a, b, sameLength))
  return { rows, sameLength, summary: summarise(rows) }
}

/**
 * The Query of Plan B: what the link changes, and Plan A's value for everything it leaves out. So
 * a link that only names another Site compares the two Sites over the same Window and height.
 */
export function planBQuery(a: Query, link: PlanBLink): Query {
  return {
    site: link.site ?? a.site,
    start: link.startDay ? new Date(`${link.startDay}T00:00:00Z`) : a.start,
    durationHours: link.hours ?? a.durationHours,
    observerHeightM: link.heightM ?? a.observerHeightM,
  }
}

/** Whether two Queries ask the same question: the comparison has nothing to say about those. */
export function sameQuery(a: Query, b: Query): boolean {
  return (
    siteKey(a.site) === siteKey(b.site) &&
    a.start.getTime() === b.start.getTime() &&
    Math.abs(a.durationHours - b.durationHours) < 1e-6 &&
    a.observerHeightM === b.observerHeightM
  )
}
