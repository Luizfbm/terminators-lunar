import type { VisibilityResult } from '../api/client'
import { useI18n } from '../i18n/I18nContext'
import type { MessageKey } from '../i18n/messages'
import { earthRows } from '../domain/earthRules'

const HOUR_MS = 3_600_000

/** The metrics of the Window, as a quiet table under the sentences. */
export function Numbers({ result }: { result: VisibilityResult }) {
  const i18n = useI18n()
  const { t, formatSpan, formatPercent } = i18n
  const { query, metrics } = result
  const share = (hours: number) => `${formatSpan(hours * HOUR_MS)} · ${formatPercent(hours / query.duration_hours)}`
  const rows: [MessageKey, string][] = [
    ['metric.both', share(metrics.sun_and_earth_hours)],
    ['metric.sun', share(metrics.sunlit_hours)],
    // The Earth by its centre (the main rule) and by any part of its disc, side by side.
    ...earthRows(metrics, query.duration_hours, i18n),
    ['metric.lcip', formatSpan(metrics.lcip_hours * HOUR_MS)],
    ['metric.lcsp', formatSpan(metrics.lcsp_hours * HOUR_MS)],
    ['metric.fraction', formatPercent(metrics.mean_sun_fraction)],
  ]
  return (
    <table className="metrics">
      <caption className="visually-hidden">{t('metrics.caption')}</caption>
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{t(key)}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
