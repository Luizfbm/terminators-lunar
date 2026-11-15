import { useMemo } from 'react'
import { FRAGILE_CLEARANCE_DEG, fragileHours, type FragileInput } from '../../../domain/fragile'
import { useI18n } from '../../../i18n/I18nContext'
import { fill } from '../miss/copy'
import { fragileStrings } from './strings'
import './fragile.css'

const HOUR_MS = 3_600_000

/**
 * A short warning under the answer when, for part of the Window, the Sun or the Earth passes within
 * 0.5° of the Horizon mask (see `fragileHours`): a small error in the DEM changes the answer in those
 * hours. It says only the bodies that have hours, and not at all when none does. "why?" opens Stats for
 * nerds, where the Uncertainty band and the DEM error are explained.
 */
export function FragileLine({ result, onOpenStats }: { result: FragileInput; onOpenStats?: () => void }) {
  const i18n = useI18n()
  const hours = useMemo(() => fragileHours(result), [result])
  if (hours.sun <= 0 && hours.earth <= 0) return null
  const s = fragileStrings[i18n.locale]
  const template = hours.sun > 0 && hours.earth > 0 ? s.both : hours.sun > 0 ? s.sun : s.earth
  const sentence = fill(template, {
    limit: `${i18n.formatNumber(FRAGILE_CLEARANCE_DEG)}°`,
    sun: i18n.formatSpan(hours.sun * HOUR_MS),
    earth: i18n.formatSpan(hours.earth * HOUR_MS),
  })
  return (
    <p className="fragile">
      {sentence}
      {onOpenStats && (
        <>
          {' '}
          <button type="button" className="fragile__link" onClick={onOpenStats}>
            {s.why}
          </button>
        </>
      )}
    </p>
  )
}
