import type { ReactNode } from 'react'
import type { VisibilityResult } from '../../../api/client'
import { useLinkParam } from '../../../hooks/useLinkParam'
import { useI18n } from '../../../i18n/I18nContext'
import type { I18n } from '../../../i18n/i18n'
import type { MessageKey } from '../../../i18n/messages'
import { PanelStatus } from '../../PanelStatus'
import { useFlat } from './api'
import { flatReading, type FlatReading } from './reading'
import type { Metrics } from './types'
import './flatLine.css'

const HOUR_MS = 3_600_000
/** The link parameter that keeps the Window without terrain open. */
export const FLAT_PARAM = 'flat'

/** A sentence with its number set apart, as the Countdown sets its own. */
function withValue(sentence: string, name: string, value: string): ReactNode {
  const [before, after] = sentence.split(`{${name}}`)
  if (after === undefined) return sentence
  return (
    <>
      {before}
      <b>{value}</b>
      {after}
    </>
  )
}

function lineText(reading: FlatReading, { t, formatSpan, formatDate }: I18n): ReactNode {
  switch (reading.kind) {
    case 'later':
    case 'earlier':
      return withValue(t(`flat.${reading.event}.${reading.kind}` as MessageKey), 'span', formatSpan(reading.ms))
    case 'same':
      return t(`flat.${reading.event}.same` as MessageKey)
    case 'never': {
      // Coverage can end before the 180 days: then the sentence says where the data ends instead.
      const key = reading.daysAfterWindow >= 180 ? 'never' : 'neverShort'
      return withValue(t(`flat.${reading.event}.${key}` as MessageKey), 'date', formatDate(reading.untilMs))
    }
    case 'at':
    case 'notInWindow':
      return withValue(t(`flat.${reading.event}.${reading.kind}` as MessageKey), 'date', formatDate(reading.atMs))
    case 'flatUp':
      return t('flat.up')
    case 'flatDown':
      return t('flat.down')
  }
}

/**
 * The line under the Countdown's Sun statement: the same Query on the Flat horizon, read at the
 * Cursor. Never a number while the flat answer is loading or failed.
 */
export function FlatLine({ result, cursorMs }: { result: VisibilityResult; cursorMs: number }) {
  const i18n = useI18n()
  const { state, retry } = useFlat(result.query)
  if (state.status === 'error') {
    return (
      <div className="flat-line flat-line--quiet">
        <PanelStatus code={state.code} onRetry={retry} />
      </div>
    )
  }
  if (state.status !== 'ready') {
    return (
      <p className="flat-line flat-line--quiet" role="status">
        {i18n.t('flat.loading')}
      </p>
    )
  }
  const real = { periods: result.periods, events: result.events, windowEndMs: Date.parse(result.query.end) }
  return (
    <p className="flat-line" aria-live="polite">
      {lineText(flatReading(real, state.data, cursorMs), i18n)}
    </p>
  )
}

const ROWS: { key: keyof Metrics; label: 'both' | 'sun' | 'earth' | 'lcip' | 'lcsp' | 'fraction' }[] = [
  { key: 'sun_and_earth_hours', label: 'both' },
  { key: 'sunlit_hours', label: 'sun' },
  { key: 'earth_visible_hours', label: 'earth' },
  { key: 'lcip_hours', label: 'lcip' },
  { key: 'lcsp_hours', label: 'lcsp' },
  { key: 'mean_sun_fraction', label: 'fraction' },
]

/**
 * The Window's metrics without terrain, next to the real ones. A panel that opens under the answer,
 * like the Resolution ladder: a plain sentence first, then the two columns. Open or closed is kept
 * in the link.
 */
export function FlatMetrics({ result }: { result: VisibilityResult }) {
  const { t, formatSpan, formatPercent, formatNumber } = useI18n()
  const [param, setParam] = useLinkParam(FLAT_PARAM)
  const open = param === '1'
  const { state, retry } = useFlat(result.query)
  const real = result.metrics
  const value = (metrics: Metrics, key: keyof Metrics) =>
    key === 'mean_sun_fraction'
      ? formatPercent(metrics[key])
      : metrics[key] === 0
        ? t('flatMetrics.none')
        : formatSpan(metrics[key] * HOUR_MS)
  return (
    <section className="panel flat-metrics">
      <button type="button" className="panel__open" aria-expanded={open} onClick={() => setParam(open ? null : '1')}>
        {t('flatMetrics.open')}
      </button>
      {open && (
        <div className="panel__body">
          {state.status === 'error' && <PanelStatus code={state.code} onRetry={retry} />}
          {(state.status === 'loading' || state.status === 'idle') && <PanelStatus loading="flatMetrics.loading" onRetry={retry} />}
          {state.status === 'ready' && (
            <>
              <p className="flat-metrics__say">
                {Math.round(state.data.metrics.sun_and_earth_hours * 60) === Math.round(real.sun_and_earth_hours * 60)
                  ? t('flatMetrics.sayNoChange', { real: formatSpan(real.sun_and_earth_hours * HOUR_MS) })
                  : t('flatMetrics.say', {
                      flat: formatSpan(state.data.metrics.sun_and_earth_hours * HOUR_MS),
                      real: formatSpan(real.sun_and_earth_hours * HOUR_MS),
                    })}
              </p>
              <table className="metrics flat-metrics__table">
                <caption className="visually-hidden">{t('flatMetrics.caption')}</caption>
                <thead>
                  <tr>
                    <td />
                    <th scope="col">{t('flatMetrics.real')}</th>
                    <th scope="col">{t('flatMetrics.flat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{t(`metric.${row.label}`)}</th>
                      <td>{value(real, row.key)}</td>
                      <td className="flat-metrics__flat">{value(state.data.metrics, row.key)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="panel__note">
                {state.data.horizon_elevation_deg < 0
                  ? t('flatMetrics.note', { dip: `${formatNumber(Math.round(-state.data.horizon_elevation_deg * 1000) / 1000)}°` })
                  : t('flatMetrics.noteGround')}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
