import type { I18n } from '../../../i18n/i18n'
import type { Text } from './strings'
import type { Navigation, RouteComparison, RoutePlan } from './types'

/** The number formats the app already uses, so the panel reads like the rest of it. */
export type Format = Pick<I18n, 'formatNumber' | 'formatPercent' | 'formatDuration'>

const HOUR_MS = 3_600_000
const NBSP = ' '

export function planOf(comparison: RouteComparison, navigation: Navigation): RoutePlan {
  const plan = comparison.plans.find((candidate) => candidate.navigation === navigation)
  if (!plan) throw new Error(`the route has no ${navigation} plan`)
  return plan
}

export function distanceText(fmt: Format, metres: number): string {
  if (metres >= 1000) return `${fmt.formatNumber(Math.round(metres / 10) / 100)}${NBSP}km`
  return `${fmt.formatNumber(Math.round(metres))}${NBSP}m`
}

export function durationText(fmt: Format, hours: number): string {
  return fmt.formatDuration(Math.round(hours * 60) * (HOUR_MS / 60))
}

export interface FooterRow {
  key: 'reached' | 'distance' | 'time' | 'hazards' | 'vetoes' | 'battery'
  label: string
  normal: string
  multiresolution: string
}

/** The numbers under the panes, as the API sends them: this file adds up nothing. */
export function footerRows(comparison: RouteComparison, text: Text, fmt: Format): FooterRow[] {
  const normal = planOf(comparison, 'normal')
  const multi = planOf(comparison, 'multiresolution')
  const row = (key: FooterRow['key'], label: string, pick: (plan: RoutePlan) => string): FooterRow => ({
    key,
    label,
    normal: pick(normal),
    multiresolution: pick(multi),
  })
  return [
    row('reached', text.t('row.reached'), (plan) => text.t(plan.reached ? 'yes' : 'no')),
    row('distance', text.t('row.distance'), (plan) => distanceText(fmt, plan.distance_m)),
    row('time', text.t('row.time'), (plan) => durationText(fmt, plan.duration_hours)),
    row('hazards', text.t('row.hazards'), (plan) => fmt.formatNumber(plan.hazards_hit)),
    row('vetoes', text.t('row.vetoes'), (plan) => fmt.formatNumber(plan.vetoes)),
    row('battery', text.t('row.battery'), (plan) => fmt.formatPercent(plan.battery_min_fraction)),
  ]
}

/** `hazards_avoided` in words, with the two counts it comes from. */
export function avoidedSentence(comparison: RouteComparison, text: Text, fmt: Format): string {
  const avoided = comparison.hazards_avoided
  const params = {
    count: fmt.formatNumber(avoided),
    normal: fmt.formatNumber(planOf(comparison, 'normal').hazards_hit),
    multi: fmt.formatNumber(planOf(comparison, 'multiresolution').hazards_hit),
  }
  if (avoided <= 0) return text.t('avoided.none', params)
  return text.t(avoided === 1 ? 'avoided.one' : 'avoided.many', params)
}

export interface AssumptionRow {
  name: string
  label: string
  value: string
}

/** Every number the API lists in `assumptions`, in the order it sends them. */
export function assumptionRows(comparison: RouteComparison, text: Text, fmt: Pick<Format, 'formatNumber'>): AssumptionRow[] {
  return Object.entries(comparison.assumptions).map(([name, value]) => ({
    name,
    label: text.assumption(name),
    value: fmt.formatNumber(value),
  }))
}

export function roverLine(comparison: RouteComparison, text: Text, fmt: Format): string {
  const { rover } = comparison
  return text.t('rover.line', {
    rover: rover.rover_id ?? text.t('rover.custom'),
    limit: fmt.formatNumber(rover.slope_limit_deg),
    sun: fmt.formatNumber(comparison.sun_fraction),
  })
}
