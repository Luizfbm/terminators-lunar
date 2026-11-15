import { useId, useState } from 'react'
import { useI18n } from '../../../i18n/I18nContext'
import { PanelStatus } from '../../PanelStatus'
import { pieces, weightOf } from './bands'
import { fill, STRINGS } from './strings'
import type { DsnResult, DsnState, DsnStation } from './types'
import './dsn.css'

const HOUR_MS = 3_600_000
const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`
const sum = (list: { duration_hours: number }[]) => list.reduce((total, item) => total + item.duration_hours, 0)

function Station({ station, data }: { station: DsnStation; data: DsnResult }) {
  const { locale, formatSpan, formatNumber, formatDateTime, formatDuration } = useI18n()
  const s = STRINGS[locale]
  const [open, setOpen] = useState(false)
  const list = useId()
  const startMs = Date.parse(data.query.start)
  const endMs = Date.parse(data.query.end)
  const name = `${s[station.complex]} · ${station.id}`
  const hours = formatSpan(sum(station.passes) * HOUR_MS)
  const count = station.passes.length
  const summary =
    count === 0
      ? fill(s.stationNone, { min: formatNumber(data.min_elevation_deg) })
      : fill(count === 1 ? s.stationSummaryOne : s.stationSummary, { count: formatNumber(count), hours })
  return (
    <li className="dsn-station">
      <p className="dsn-station__head">
        <span className="dsn-station__name">{name}</span>
        <span className="dsn-station__sum">{summary}</span>
      </p>
      <span className="dsn-station__bar" aria-hidden="true">
        {pieces(station.passes, startMs, endMs).map((piece, index) => (
          <i key={index} style={{ left: percent(piece.left), width: percent(piece.width) }} />
        ))}
      </span>
      {count > 0 && (
        <>
          <button type="button" className="panel__open dsn-station__toggle" aria-expanded={open} aria-controls={list} onClick={() => setOpen(!open)}>
            {open ? s.passesHide : s.passesShow}
          </button>
          {open && (
            <div id={list} className="panel__scroll">
              <table className="dsn-passes">
                <caption className="visually-hidden">{fill(s.passesCaption, { station: name })}</caption>
                <thead>
                  <tr>
                    <th scope="col">{s.passStart}</th>
                    <th scope="col">{s.passEnd}</th>
                    <th scope="col">{s.passLength}</th>
                  </tr>
                </thead>
                <tbody>
                  {station.passes.map((pass) => (
                    <tr key={pass.start}>
                      <td>{formatDateTime(Date.parse(pass.start))}</td>
                      <td>{formatDateTime(Date.parse(pass.end))}</td>
                      <td>{formatDuration(pass.duration_hours * HOUR_MS)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </li>
  )
}

/** Each dish's passes. Folded away when the link is the same as Earth visible: then they add nothing. */
function Stations({ data, folded }: { data: DsnResult; folded: boolean }) {
  const { locale, formatNumber } = useI18n()
  const s = STRINGS[locale]
  const [open, setOpen] = useState(!folded)
  const list = useId()
  const title = fill(s.stations, { min: formatNumber(data.min_elevation_deg) })
  return (
    <>
      {folded ? (
        <button type="button" className="panel__open dsn-stations__toggle" aria-expanded={open} aria-controls={list} onClick={() => setOpen(!open)}>
          {open ? s.stationsHide : s.stationsShow}
        </button>
      ) : (
        <p className="panel__note dsn-stations__title">{title}</p>
      )}
      {open && (
        <div id={list}>
          {folded && <p className="panel__note dsn-stations__title">{title}</p>}
          <ul className="dsn-stations">
            {data.stations.map((station) => (
              <Station key={station.id} station={station} data={data} />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function DsnBody({ data }: { data: DsnResult }) {
  const { locale, formatSpan, formatPercent, formatNumber } = useI18n()
  const s = STRINGS[locale]
  const span = (hours: number) => formatSpan(hours * HOUR_MS)
  const min = formatNumber(data.min_elevation_deg)
  const limits = <p className="panel__note dsn-limits">{fill(s.limits, { min })}</p>
  if (data.earth_visible_hours <= 0) {
    return (
      <>
        <p className="panel__say">{s.empty}</p>
        {limits}
      </>
    )
  }
  const weight = weightOf(data.earth_visible_hours, data.earth_without_station_hours)
  const params = { earth: span(data.earth_visible_hours), link: span(data.link_hours), gap: span(data.earth_without_station_hours) }
  const say = weight === 'full' ? s.sayGap : weight === 'quiet' ? s.sayQuiet : s.sayNone
  const share = (hours: number) => fill(s.ofEarth, { share: formatPercent(hours / data.earth_visible_hours) })
  return (
    <>
      <p className="panel__say">{fill(say, params)}</p>
      <table className="metrics dsn-totals">
        <caption className="visually-hidden">{s.tableCaption}</caption>
        <tbody>
          <tr>
            <th scope="row">{s.rowEarth}</th>
            <td>{span(data.earth_visible_hours)}</td>
          </tr>
          <tr>
            <th scope="row">{s.rowLink}</th>
            <td>
              {span(data.link_hours)}
              <span className="dsn-totals__share">{share(data.link_hours)}</span>
            </td>
          </tr>
          <tr>
            <th scope="row">{s.rowGap}</th>
            <td>
              {span(data.earth_without_station_hours)}
              <span className="dsn-totals__share">{share(data.earth_without_station_hours)}</span>
            </td>
          </tr>
        </tbody>
      </table>
      {weight === 'full' && <p className="panel__note">{fill(s.legend, { min })}</p>}
      <Stations data={data} folded={weight !== 'full'} />
      {limits}
    </>
  )
}

/**
 * The DSN link panel, in the answer column with the Resolution ladder and the year (the requirement).
 * Closed by default, like them; whether it is open belongs to the link, so the caller owns it.
 */
export function DsnPanel({
  state,
  open,
  onToggle,
  onRetry,
}: {
  state: DsnState
  open: boolean
  onToggle: (open: boolean) => void
  onRetry: () => void
}) {
  const { locale } = useI18n()
  const s = STRINGS[locale]
  const body = useId()
  return (
    <section className="panel dsn">
      <button type="button" className="panel__open" aria-expanded={open} aria-controls={body} onClick={() => onToggle(!open)}>
        {s.open}
      </button>
      {open && (
        <div id={body} className="panel__body">
          {state.status === 'loading' && (
            <p className="panel__status" role="status">
              {s.loading}
            </p>
          )}
          {state.status === 'error' && <PanelStatus code={state.code} onRetry={onRetry} />}
          {state.status === 'ready' && <DsnBody data={state.data} />}
        </div>
      )}
    </section>
  )
}
