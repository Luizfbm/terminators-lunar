/** The year at a Site in words and bars. */

export interface Month {
  month: number
  start: string
  end: string
  sunlit_hours: number
  sun_and_earth_hours: number
}

const HOUR_MS = 3_600_000

/** The month with the most Sun-and-Earth hours; the first one wins a tie. */
export function bestMonth<T extends Month>(months: readonly T[]): T | null {
  let best: T | null = null
  for (const month of months) {
    if (best === null || month.sun_and_earth_hours > best.sun_and_earth_hours) best = month
  }
  return best
}

/** A month's hours as a share of the month itself, 0 to 1, for a bar. */
export function shareOfMonth(month: Month, hours: number): number {
  const length = (Date.parse(month.end) - Date.parse(month.start)) / HOUR_MS
  if (length <= 0) return 0
  return Math.min(1, Math.max(0, hours / length))
}

/** The calendar year a Window starts in, in UTC: the year the panel shows. */
export function yearOf(startIso: string): number {
  return new Date(Date.parse(startIso)).getUTCFullYear()
}
