import type { VisibilityEvent } from '../api/client'
import type { UncertaintyState } from '../hooks/useUncertainty'
import { siteRefOf } from '../domain/query'
import { matchBand, spreadOf, spreadText } from '../domain/uncertainty'
import { useI18n } from '../i18n/I18nContext'
import { MeasuredShare } from './hazard/uncertainty/MeasuredShare'

/**
 * Under the time of a Sunset or an Earthset: the window the map's own height error leaves it
 * (the DEM Uncertainty band), or that it is still being worked out. Nothing at all when there is no
 * band to give, so the answer reads the same as before.
 */
export function UncertaintyLine({
  uncertainty,
  event,
  events,
}: {
  uncertainty: UncertaintyState
  event: VisibilityEvent
  events: readonly VisibilityEvent[]
}) {
  const i18n = useI18n()
  if (uncertainty.status === 'none') return null
  if (uncertainty.status === 'computing') {
    return (
      <p className="band-line band-line--working">
        {i18n.t('uncertainty.working', { done: i18n.formatNumber(uncertainty.clonesDone), total: i18n.formatNumber(uncertainty.clones) })}
      </p>
    )
  }
  const band = matchBand(uncertainty.data.events, event, events.indexOf(event))
  const spread = band && spreadOf(band, uncertainty.data.clones)
  // Under the window, how much of the ground inside the Landing ellipse the laser measured.
  return (
    <>
      {spread && <p className="band-line">{spreadText(i18n, spread, Date.parse(event.t))}</p>}
      <MeasuredShare site={siteRefOf(uncertainty.data.query.site)} />
    </>
  )
}
