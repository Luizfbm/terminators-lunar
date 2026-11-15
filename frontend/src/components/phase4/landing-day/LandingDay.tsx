import { useId } from 'react'
import { PanelStatus } from '../../PanelStatus'
import { isEmpty, WINDOW_SHORTCUTS, type PanelState, type ShiftedWindow, type SiteWindows } from '../site-windows/types'
import { dayOf, span, usePanelText, wholeHours } from '../site-windows/text'
import { MARKS } from '../site-windows/scale'
import { Calendar } from './Calendar'
import { en, pt } from './strings'
import { isSynodic, lengthWords } from './windowLength'
import './LandingDay.css'

export interface LandingDayProps {
  /** `GET /sites/{site_id}/windows` for 1 January of the Query's year, 0 to 365 days. */
  state: PanelState<SiteWindows>
  /** The year of the Query. */
  year: number
  /** The Window length of the Query, in hours. */
  durationHours: number
  /** The UTC day the Query's Window starts, "2027-03-12". */
  queryDay: string | null
  /** A shortcut sets the Window length: 7, 14 or 28 days, or one synodic month. */
  onDuration: (hours: number) => void
  /** A card or a day makes that Window the Query. */
  onDay: (window: ShiftedWindow) => void
  onRetry: () => void
}

function Card({
  kind,
  window,
  year,
  asking,
  onDay,
}: {
  kind: keyof typeof MARKS
  window: ShiftedWindow
  year: number
  asking: boolean
  onDay: (window: ShiftedWindow) => void
}) {
  const text = usePanelText({ en, pt })
  const { t } = text
  const label = t(`card.${kind}`, { year: String(year) })
  const together = window.sun_and_earth_hours === 0 ? t('card.plainNone') : t('card.plain', { both: span(text, window.sun_and_earth_hours) })
  const plain = `${together} ${
    window.lcsp_hours === 0 ? t('card.noNight') : t('card.night', { dark: span(text, window.lcsp_hours) })
  }`
  return (
    <li>
      <button type="button" className={`p4card p4card--${kind}`} aria-current={asking ? 'date' : undefined} onClick={() => onDay(window)}>
        <span className="p4card__kicker">
          <span className="p4card__mark" aria-hidden="true">
            {MARKS[kind]}
          </span>
          {label}
        </span>
        <span className="p4card__date">{dayOf(text, window.start)}</span>
        <span className="p4card__plain">{plain}</span>
        <span className="p4card__metrics">
          {t('card.metrics', { both: wholeHours(text, window.sun_and_earth_hours), dark: wholeHours(text, window.lcsp_hours) })}
        </span>
        <span className="p4card__ask">{asking ? t('card.asking') : t('card.ask')}</span>
      </button>
    </li>
  )
}

/**
 * The day to land: for the year of the Query, the best, a typical and the worst day to start the
 * Window, and a calendar of every start day. Sits on the answer, right under the summary sentence.
 */
export function LandingDay({ state, year, durationHours, queryDay, onDuration, onDay, onRetry }: LandingDayProps) {
  const text = usePanelText({ en, pt })
  const { t, formatNumber } = text
  const titleId = useId()
  const length = lengthWords(durationHours, {
    synodic: t('length.synodicLong'),
    days: (value) => t('length.days', { value }),
    span: (hours) => span(text, hours),
    number: formatNumber,
  })
  const yearText = String(year)

  return (
    <section className="p4day" aria-labelledby={titleId}>
      <h3 id={titleId} className="p4day__title">
        {t('title', { year: yearText })}
      </h3>

      {state.status === 'curated-only' ? (
        <div className="p4day__note">
          <p className="p4day__noteTitle">{t('curated.title')}</p>
          <p>{t('curated.body')}</p>
        </div>
      ) : (
        <>
          <div className="p4day__lengths" role="group" aria-label={t('length.label')}>
            <span className="p4day__lengthsLabel" aria-hidden="true">
              {t('length.label')}
            </span>
            {WINDOW_SHORTCUTS.map((hours) => (
              <button
                key={hours}
                type="button"
                className="p4day__length"
                aria-pressed={isSynodic(hours) ? isSynodic(durationHours) : durationHours === hours}
                onClick={() => onDuration(hours)}
              >
                {isSynodic(hours) ? t('length.synodic') : t('length.days', { value: formatNumber(hours / 24) })}
              </button>
            ))}
          </div>

          {state.status === 'loading' && (
            <>
              <p className="panel__status" role="status">
                {t('loading', { year: yearText })}
              </p>
              <div className="p4day__ghost" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </>
          )}
          {state.status === 'error' && <PanelStatus code={state.code} onRetry={onRetry} />}
          {state.status === 'ready' && isEmpty(state.data) && <p className="p4day__say">{t('empty', { year: yearText, length })}</p>}
          {state.status === 'ready' && !isEmpty(state.data) && (
            <>
              <p className="p4day__say">
                {t(state.data.worst.sun_and_earth_hours === 0 ? 'lead.worstNone' : 'lead', {
                  year: yearText,
                  length,
                  worst: span(text, state.data.worst.sun_and_earth_hours),
                  best: span(text, state.data.best.sun_and_earth_hours),
                })}
              </p>
              <ol className="p4day__cards">
                {(['best', 'typical', 'worst'] as const).map((kind) => (
                  <Card
                    key={kind}
                    kind={kind}
                    window={state.data[kind]}
                    year={year}
                    asking={state.data[kind].start.slice(0, 10) === queryDay}
                    onDay={onDay}
                  />
                ))}
              </ol>
              <Calendar year={year} data={state.data} lengthText={length} queryDay={queryDay} onDay={onDay} />
            </>
          )}
        </>
      )}
    </section>
  )
}
