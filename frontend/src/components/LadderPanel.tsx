import { useId, useState } from 'react'
import type { LadderResult, VisibilityResult } from '../api/client'
import { isPoint, ladderVerdict, type LadderVerdict } from '../domain/ladder'
import { siteRefOf, type Query } from '../domain/query'
import { useLadder } from '../hooks/useLadder'
import { useI18n } from '../i18n/I18nContext'
import type { I18n } from '../i18n/i18n'
import type { MessageKey } from '../i18n/messages'
import { PanelStatus } from './PanelStatus'

const HOUR_MS = 3_600_000
/** A minute: the finest step the screen shows a duration in. */
const MINUTE_H = 1 / 60

function verdictText({ t, formatDuration, formatNumber }: I18n, verdict: LadderVerdict): string {
  switch (verdict.kind) {
    case 'later':
    case 'earlier':
      return t(`ladder.${verdict.event}.${verdict.kind}` as MessageKey, {
        coarse: formatNumber(verdict.coarse),
        fine: formatNumber(verdict.fine),
        span: formatDuration(verdict.ms),
      })
    case 'same':
      return t(`ladder.${verdict.event}.same` as MessageKey)
    case 'only':
      return t(`ladder.${verdict.event}.only` as MessageKey, { resolution: formatNumber(verdict.resolution) })
    case 'none':
      return t('ladder.none')
  }
}

function LadderTable({ data }: { data: LadderResult }) {
  const i18n = useI18n()
  const { t, formatDateTime, formatSpan, formatNumber } = i18n
  const when = (event: { t: string } | null) => (event ? formatDateTime(Date.parse(event.t)) : t('ladder.never'))
  const hours = (value: number) => formatSpan(value * HOUR_MS)
  const range = (key: 'sunlit_hours' | 'lcsp_hours') => {
    const band = data.band[key]
    if (isPoint(band, MINUTE_H)) return hours(band.min)
    return t('ladder.from', { min: hours(band.min), max: hours(band.max) })
  }
  const rungs = [...data.rungs].sort((a, b) => b.resolution_m - a.resolution_m)
  return (
    <>
      <p className="panel__say">{verdictText(i18n, ladderVerdict(rungs))}</p>
      <div className="panel__scroll">
        <table className="ladder">
          <caption className="visually-hidden">{t('ladder.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('ladder.resolution')}</th>
              <th scope="col">{t('ladder.sunset')}</th>
              <th scope="col">{t('ladder.earthset')}</th>
              <th scope="col">{t('ladder.sunlit')}</th>
              <th scope="col">{t('ladder.night')}</th>
            </tr>
          </thead>
          <tbody>
            {rungs.map((rung) => (
              <tr key={rung.resolution_m}>
                <th scope="row">{t('ladder.metres', { value: formatNumber(rung.resolution_m) })}</th>
                <td>{when(rung.next_sunset)}</td>
                <td>{when(rung.next_earthset)}</td>
                <td>{hours(rung.metrics.sunlit_hours)}</td>
                <td>{hours(rung.metrics.lcsp_hours)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t('ladder.range')}</th>
              <td />
              <td />
              <td>{range('sunlit_hours')}</td>
              <td>{range('lcsp_hours')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="panel__note">{t('ladder.note')}</p>
    </>
  )
}

/** The Resolution ladder (ADR 0003): the same Query on coarser maps, opened on request. */
export function LadderPanel({ result }: { result: VisibilityResult }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const body = useId()
  const query: Query = {
    site: siteRefOf(result.query.site),
    start: new Date(result.query.start),
    durationHours: result.query.duration_hours,
    observerHeightM: result.query.observer_height_m,
  }
  const { state, retry } = useLadder(open, query)
  return (
    <section className="panel">
      <button type="button" className="panel__open" aria-expanded={open} aria-controls={body} onClick={() => setOpen(!open)}>
        {t('ladder.open')}
      </button>
      {open && (
        <div id={body} className="panel__body">
          {state.status === 'loading' && <PanelStatus loading="ladder.loading" onRetry={retry} />}
          {state.status === 'error' && <PanelStatus code={state.code} onRetry={retry} />}
          {state.status === 'ready' && <LadderTable data={state.data} />}
        </div>
      )}
    </section>
  )
}
