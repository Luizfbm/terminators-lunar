import type { VisibilityResult } from '../../../api/client'
import { useI18n } from '../../../i18n/I18nContext'
import { sealSentence } from '../estimate/sentences'
import { formatChange, formatShare, LEVEL, RADIUS_M, type View } from './logic'
import { fill, stringsFor } from './strings'
import { useSafety } from './useSafety'
import './safety.css'

/**
 * The safety circle on the view from the ground, with its seal: the hazard not vetoed by Normal
 * navigation on the 60 m grid against Multiresolution at P90, and how many 50 m cells within 250 m are
 * over the slope limit at 5 m and at 60 m. Without a grid the seal goes and says why. It lets every
 * pointer through, so the sky under it still turns.
 */
export function SafetyCircle({ result }: { result: VisibilityResult }) {
  return <SafetyView view={useSafety(result)} />
}

/** The circle for a given state of the two answers; the part tests draw without asking the API. */
export function SafetyView({ view }: { view: View }) {
  const { locale, formatNumber } = useI18n()
  const s = stringsFor(locale)
  const radius = fill(s.metres, { value: formatNumber(RADIUS_M) })
  return (
    <div className="safety" role="group" aria-label={fill(s.circle, { radius })} data-state={view.kind}>
      <svg className="safety__ring" viewBox="0 0 168 48" aria-hidden="true">
        <ellipse cx="84" cy="24" rx="80" ry="20" />
      </svg>
      {view.kind === 'seal' && (
        <div className="safety__seal">
          <p className="safety__title">{s.seal}</p>
          <p className="safety__values">
            <span>
              {s.normal} <b>{formatShare(view.seal.normal, locale)}</b>
            </span>
            <span aria-hidden="true"> → </span>
            <span>
              {fill(s.multiresolution, { level: LEVEL })} <b>{formatShare(view.seal.multiresolution, locale)}</b>
            </span>
            {view.seal.change !== null && (
              <span className="safety__change"> · {fill(s.change, { change: formatChange(view.seal.change) })}</span>
            )}
          </p>
          {view.seal.estimate && <p className="safety__note safety__estimate">{sealSentence(locale, view.seal.estimate)}</p>}
          {view.around && (
            <p className="safety__note">
              {fill(s.around, {
                radius: fill(s.metres, { value: formatNumber(view.around.radius_m) }),
                over5: formatNumber(view.around.over_limit_5m),
                cells: formatNumber(view.around.cells),
                limit: fill(s.degrees, { value: formatNumber(view.around.slope_limit_deg) }),
                over60: formatNumber(view.around.over_limit_60m),
              })}
            </p>
          )}
          <p className="safety__note">
            {fill(s.grid, { grid: view.seal.gridId, distance: formatNumber(view.seal.distanceKm) })}
          </p>
        </div>
      )}
      {view.kind === 'absent' && (
        <p className="safety__seal safety__why">
          {view.reason === 'custom' ? s.custom : view.reason === 'no_grid' ? s.noGrid : s.failed}
        </p>
      )}
    </div>
  )
}
