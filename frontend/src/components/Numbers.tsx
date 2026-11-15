import type { VisibilityResult } from '../api/client'
import { rangeText, type BandedMetric } from '../domain/uncertainty'
import type { UncertaintyState } from '../hooks/useUncertainty'
import { useI18n } from '../i18n/I18nContext'
import type { MessageKey } from '../i18n/messages'
import { earthRows } from '../domain/earthRules'

const HOUR_MS = 3_600_000

/** The metrics of the Window, as a quiet table under the sentences. */
export function Numbers({ result, uncertainty }: { result: VisibilityResult; uncertainty?: UncertaintyState }) {
  const i18n = useI18n()
  const { t, formatSpan, formatPercent } = i18n
  const { query, metrics } = result
  const share = (hours: number) => `${formatSpan(hours * HOUR_MS)} · ${formatPercent(hours / query.duration_hours)}`
  // The metrics the DEM Uncertainty band covers (the LCIP is not one of them). The Earth comes
  // by its centre (the main rule, banded) and by any part of its disc (not banded), side by side.
  const [earthCentre, earthAnyPart] = earthRows(metrics, query.duration_hours, i18n)
  const rows: [MessageKey, string, BandedMetric | null][] = [
    ['metric.both', share(metrics.sun_and_earth_hours), 'sun_and_earth_hours'],
    ['metric.sun', share(metrics.sunlit_hours), 'sunlit_hours'],
    [...earthCentre, 'earth_visible_hours'],
    [...earthAnyPart, null],
    ['metric.lcip', formatSpan(metrics.lcip_hours * HOUR_MS), null],
    ['metric.lcsp', formatSpan(metrics.lcsp_hours * HOUR_MS), 'lcsp_hours'],
    ['metric.fraction', formatPercent(metrics.mean_sun_fraction), 'mean_sun_fraction'],
  ]
  const bands = uncertainty?.status === 'ready' ? uncertainty.data.metrics : null
  return (
    <table className="metrics">
      <caption className="visually-hidden">{t('metrics.caption')}</caption>
      <tbody>
        {rows.map(([key, value, banded]) => (
          <tr key={key}>
            <th scope="row">{t(key)}</th>
            <td>
              {value}
              {banded && bands && <span className="metrics__band">{rangeText(i18n, banded, bands[banded])}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
