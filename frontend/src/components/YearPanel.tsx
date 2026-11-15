import { useId, useState } from 'react'
import type { SiteYear, VisibilityResult } from '../api/client'
import { bestMonth, shareOfMonth, yearOf } from '../domain/year'
import { useYear } from '../hooks/useYear'
import { useI18n } from '../i18n/I18nContext'
import { PanelStatus } from './PanelStatus'

const HOUR_MS = 3_600_000

/** A best Window, as the Window controls will take it. */
export interface WindowChoice {
  start: string
  durationHours: number
}

function monthName(locale: string, month: number, style: 'short' | 'long'): string {
  const tag = locale === 'pt' ? 'pt-BR' : 'en-GB'
  return new Intl.DateTimeFormat(tag, { month: style, timeZone: 'UTC' }).format(Date.UTC(2000, month - 1, 1))
}

function YearBody({ data, onWindow }: { data: SiteYear; onWindow?: (choice: WindowChoice) => void }) {
  const { t, locale, formatNumber, formatSpan, formatDate } = useI18n()
  const best = bestMonth(data.months)
  const year = String(data.year)
  const rows = [
    { key: 'sun', label: t('year.sunRow'), hours: (m: SiteYear['months'][number]) => m.sunlit_hours },
    { key: 'both', label: t('year.bothRow'), hours: (m: SiteYear['months'][number]) => m.sun_and_earth_hours },
  ] as const
  return (
    <>
      <p className="panel__say">
        {t('year.summary', {
          year,
          days: t('year.days', { value: formatNumber(Math.round(data.totals.sunlit_days)) }),
          month: best ? monthName(locale, best.month, 'long') : '',
          both: formatSpan((best?.sun_and_earth_hours ?? 0) * HOUR_MS),
        })}
      </p>
      {rows.map((row) => (
        <table key={row.key} className={`year year--${row.key}`}>
          <caption>{row.label}</caption>
          <thead>
            <tr>
              {data.months.map((m) => (
                <th key={m.month} scope="col" abbr={monthName(locale, m.month, 'long')}>
                  {monthName(locale, m.month, 'short')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {data.months.map((m) => (
                <td key={m.month}>
                  <span className="year__bar" aria-hidden="true">
                    <span style={{ height: `${shareOfMonth(m, row.hours(m)) * 100}%` }} />
                  </span>
                  <span className="year__value">{formatNumber(Math.round(row.hours(m)))}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      ))}
      {data.best_windows.length > 0 && (
        <>
          <p className="panel__note">{t('year.best')}</p>
          <ol className="year__best">
            {data.best_windows.map((w) => {
              const text = t('year.window', {
                start: formatDate(Date.parse(w.start)),
                end: formatDate(Date.parse(w.end)),
                both: formatSpan(w.sun_and_earth_hours * HOUR_MS),
              })
              return (
                <li key={w.start}>
                  {onWindow ? (
                    <button type="button" onClick={() => onWindow({ start: w.start, durationHours: w.duration_hours })}>
                      {text}
                    </button>
                  ) : (
                    text
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}
    </>
  )
}

/**
 * The year of the Window at a Curated Site, opened on request. `onWindow` is where the Window
 * controls will plug in: given, each best Window becomes a button that moves the Query to it.
 */
export function YearPanel({ result, onWindow }: { result: VisibilityResult; onWindow?: (choice: WindowChoice) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const body = useId()
  const { site, start, observer_height_m } = result.query
  const year = yearOf(start)
  const listed = site.curated
  const { state, retry } = useYear(open && listed, site.id, year, observer_height_m)
  return (
    <section className="panel">
      <button type="button" className="panel__open" aria-expanded={open} aria-controls={body} onClick={() => setOpen(!open)}>
        {t('year.open', { year: String(year) })}
      </button>
      {open && (
        <div id={body} className="panel__body">
          {!listed && <p className="panel__note">{t('year.listedOnly')}</p>}
          {listed && state.status === 'loading' && <PanelStatus loading="year.loading" onRetry={retry} />}
          {listed && state.status === 'error' && <PanelStatus code={state.code} onRetry={retry} />}
          {listed && state.status === 'ready' && <YearBody data={state.data} onWindow={onWindow} />}
        </div>
      )}
    </section>
  )
}
