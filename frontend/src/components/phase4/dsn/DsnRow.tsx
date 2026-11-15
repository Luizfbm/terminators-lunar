import { useI18n } from '../../../i18n/I18nContext'
import { minus, pieces, weightOf, type Span } from './bands'
import { STRINGS } from './strings'
import type { DsnState } from './types'
import './dsn.css'

const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`

/**
 * The DSN link as a third row of the timeline, right under the Earth row (the requirement). It goes
 * inside `.strip__track`, after the Earth row. Solid: the DSN link. Dark notches: the Earth is up
 * and no dish can see the Moon. The row is left out when that gap is too small to see (see `weightOf`).
 */
export function DsnRow({
  state,
  earthPeriods,
  startMs,
  endMs,
}: {
  state: DsnState
  /** The Earth-visible periods the timeline already draws. */
  earthPeriods: readonly Span[]
  startMs: number
  endMs: number
}) {
  const { locale } = useI18n()
  const s = STRINGS[locale]
  if (state.status !== 'ready') return null
  const { data } = state
  if (weightOf(data.earth_visible_hours, data.earth_without_station_hours) !== 'full') return null
  const link = pieces(data.link_periods, startMs, endMs)
  const gaps = pieces(minus(earthPeriods, data.link_periods), startMs, endMs)
  return (
    <div className="strip__row dsn-row">
      <span className="strip__name">{s.rowName}</span>
      <div className="strip__bar dsn-row__bar">
        {link.map((piece, index) => (
          <i key={`l${index}`} className="strip__band dsn-row__link" style={{ left: percent(piece.left), width: percent(piece.width) }} />
        ))}
        {gaps.map((piece, index) => (
          <i key={`g${index}`} className="strip__band dsn-row__gap" style={{ left: percent(piece.left), width: percent(piece.width) }} />
        ))}
      </div>
    </div>
  )
}
