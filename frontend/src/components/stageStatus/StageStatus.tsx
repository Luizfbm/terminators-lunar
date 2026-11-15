import type { Landing, LandingPhase } from '../../domain/land'
import { useI18n } from '../../i18n/I18nContext'
import { fill } from '../globeMap/strings'
import { limitText, placeText } from './format'
import { STRINGS } from './strings'

export interface StageStatusProps {
  /** The landing on its way, if any, and where it is. */
  landing: Landing | null
  phase: LandingPhase
  /** The state of the answer for the Site asked about now. */
  status: 'loading' | 'error' | 'ready'
  /** Why the answer failed, in the reader's language (from the app's error messages). */
  reason: string | null
  /** The answer failed because the point lies outside what the server covers, and it was a coordinate. */
  outsideCustom: boolean
  /** `coverage.custom_max_latitude_deg` from /meta, when known. */
  customLimitDeg: number | null
  /** A previous answer is on screen: then a plain loading needs only a small line. */
  hasAnswer: boolean
  onRetry: () => void
  /** Drops the landing and goes back to the Site asked about before it. */
  onCancel: () => void
  /** Without a landing to cancel, a failed coordinate goes back to the default Site. */
  onBackToDefault: () => void
}

/**
 * What the stage says about the answer it waits for (the requirement): a landing on its way, a plain
 * loading, or an error with a way to try again, over the picture, since the column of answers is hidden.
 */
export function StageStatus(props: StageStatusProps) {
  const { locale } = useI18n()
  const s = STRINGS[locale]
  const { landing, phase } = props
  const place = landing ? placeText(landing.place, landing.name, locale) : null

  if (landing && phase === 'asking') {
    return (
      <div className="stage-status" role="status" data-state="landing">
        <p className="stage-status__title">{fill(s.landing, { place: place ?? '' })}</p>
        {!landing.place.siteId && <p>{s.landingCustom}</p>}
        <p className="stage-status__actions">
          <button type="button" onClick={props.onCancel}>
            {s.cancel}
          </button>
        </p>
      </div>
    )
  }

  if (props.status === 'error') {
    const landed = landing !== null && phase === 'failed'
    return (
      // A failed landing is news of its own; any other error is also told by the column of answers, so
      // here it is a plain group, not a second alert.
      <div
        className="stage-status stage-status--error"
        role={landed ? 'alert' : 'group'}
        aria-label={landed ? undefined : s.failed}
        data-state="error"
      >
        <p className="stage-status__title">{landed ? fill(s.failedLanding, { place: place ?? '' }) : s.failed}</p>
        {props.reason && <p>{props.reason}</p>}
        {props.outsideCustom && props.customLimitDeg !== null && (
          <p>{fill(s.outsideLimit, { limit: limitText(props.customLimitDeg, locale) })}</p>
        )}
        <p className="stage-status__actions">
          <button type="button" onClick={props.onRetry}>
            {s.retry}
          </button>
          {landed ? (
            <button type="button" onClick={props.onCancel}>
              {s.cancel}
            </button>
          ) : (
            props.outsideCustom && (
              <button type="button" onClick={props.onBackToDefault}>
                {s.backToDefault}
              </button>
            )
          )}
        </p>
      </div>
    )
  }

  if (props.status === 'loading' && props.hasAnswer) {
    return (
      // The column of answers already says it to a screen reader: this line is for the eyes.
      <p className="stage-status stage-status--quiet" aria-hidden="true" data-state="loading">
        {s.loading}
      </p>
    )
  }
  return null
}
