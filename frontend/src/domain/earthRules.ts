import type { VisibilityResult } from '../api/client'
import type { I18n } from '../i18n/i18n'
import type { MessageKey } from '../i18n/messages'

const HOUR_MS = 3_600_000

/**
 * The Earth's hours in the Window by the two rules, as rows of "span · share of the Window". The
 * app counts the Earth visible by its centre; the other row counts it the way the Sun is counted,
 * with any part of the disc above the Horizon mask, so a reader comparing with another tool sees
 * where a difference of hours comes from.
 */
export function earthRows(
  metrics: Pick<VisibilityResult['metrics'], 'earth_visible_hours' | 'earth_visible_hours_any_part'>,
  windowHours: number,
  { formatSpan, formatPercent }: Pick<I18n, 'formatSpan' | 'formatPercent'>,
): [MessageKey, string][] {
  const share = (hours: number) => `${formatSpan(hours * HOUR_MS)} · ${formatPercent(hours / windowHours)}`
  return [
    ['nerds.earthCentre', share(metrics.earth_visible_hours)],
    ['nerds.earthAnyPart', share(metrics.earth_visible_hours_any_part)],
  ]
}
