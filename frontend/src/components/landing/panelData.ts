/**
 * What the landing panel shows, from the `/visibility` answer alone. No physics: the backend's metrics
 * where one means exactly the same thing, and plain interval arithmetic on its periods otherwise.
 */
import { intervalsOf, longestMs, type PeriodLike } from '../../domain/intervals'

const HOUR_MS = 3_600_000

/** One row of a period list: a stretch of one body, visible or hidden, clipped to the Window. */
export interface PeriodRow {
  start: number
  end: number
  visible: boolean
}

/** The visible and hidden periods of one body, together and in time order. */
export function periodRows(periods: readonly PeriodLike[], body: 'sun' | 'earth', startMs: number, endMs: number): PeriodRow[] {
  const visible = intervalsOf(periods, body, 'visible', startMs, endMs).map(([start, end]) => ({ start, end, visible: true }))
  const hidden = intervalsOf(periods, body, 'hidden', startMs, endMs).map(([start, end]) => ({ start, end, visible: false }))
  return [...visible, ...hidden].sort((a, b) => a.start - b.start)
}

/**
 * The row that holds the Cursor, or -1. Rows are [start, end), but a Cursor parked on the Window's end
 * still belongs to the last row, or nothing would be marked there.
 */
export function currentRow(rows: readonly PeriodRow[], t: number): number {
  const inside = rows.findIndex((row) => t >= row.start && t < row.end)
  if (inside >= 0) return inside
  const last = rows.length - 1
  return last >= 0 && t === rows[last].end ? last : -1
}

export interface Summary {
  windowMs: number
  sunMs: number
  earthMs: number
  bothMs: number
  longestNightMs: number
  longestNoEarthMs: number
}

interface SummarySource {
  query: { start: string; end: string }
  periods: readonly PeriodLike[]
  metrics: { sunlit_hours: number; earth_visible_hours: number; sun_and_earth_hours: number; lcsp_hours: number }
}

/**
 * The "In the chosen Window" block. sunlit_hours, earth_visible_hours, sun_and_earth_hours and lcsp_hours
 * are the backend's sums and maximum over these same periods; the backend has no metric for the
 * longest stretch without the Earth, so that one is measured on the Earth's hidden periods.
 */
export function summarise(result: SummarySource): Summary {
  const startMs = Date.parse(result.query.start)
  const endMs = Date.parse(result.query.end)
  const { metrics } = result
  return {
    windowMs: endMs - startMs,
    sunMs: metrics.sunlit_hours * HOUR_MS,
    earthMs: metrics.earth_visible_hours * HOUR_MS,
    bothMs: metrics.sun_and_earth_hours * HOUR_MS,
    longestNightMs: metrics.lcsp_hours * HOUR_MS,
    longestNoEarthMs: longestMs(intervalsOf(result.periods, 'earth', 'hidden', startMs, endMs)),
  }
}

/** Under 48 h: hours to one decimal. From 48 h: whole hours, and days to one decimal. */
export function durationParts(ms: number): { hours: number; days: number | null } {
  const hours = Math.max(0, ms) / HOUR_MS
  if (hours < 48) return { hours: Math.round(hours * 10) / 10, days: null }
  return { hours: Math.round(hours), days: Math.round((hours / 24) * 10) / 10 }
}

/**
 * A number with exactly one decimal in the app's own number format. The app's formatter drops a ".0",
 * so the decimal sign and the zero are read off that same formatter rather than from a second locale.
 */
export function oneDecimal(value: number, formatNumber: (value: number) => string): string {
  const rounded = Math.round(value * 10) / 10
  const text = formatNumber(rounded)
  if (!Number.isInteger(rounded)) return text
  const zero = formatNumber(0)
  const sign = formatNumber(0.5).slice(zero.length, -formatNumber(5).length)
  return `${text}${sign}${zero}`
}

/** Which panel it is: 'site' holds what exists without a vehicle, 'vehicle' is the landing panel of Level 2. */
export type PanelVariant = 'site' | 'vehicle'

export type PanelSection = 'vehicle' | 'countdown' | 'sentence' | 'summary' | 'hint' | 'energy' | 'comms' | 'note'

/**
 * What each panel holds, in order. The one without a vehicle has no vehicle line and no energy periods
 * (their "Battery" and "Solar charge" belong to a vehicle that was never chosen), and no hint about them.
 * Everything in it comes from the same `/visibility` answer as the rest.
 */
export function sectionsOf(variant: PanelVariant): readonly PanelSection[] {
  return variant === 'vehicle'
    ? ['vehicle', 'summary', 'hint', 'energy', 'comms', 'note']
    : ['countdown', 'sentence', 'summary', 'note']
}
