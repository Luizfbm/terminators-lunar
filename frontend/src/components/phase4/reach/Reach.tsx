import type { VisibilityResult } from '../../../api/client'
import { useI18n } from '../../../i18n/I18nContext'
import type { I18n } from '../../../i18n/i18n'
import type { MessageKey } from '../../../i18n/messages'
import { HORIZON_REACH_KM, reachItems } from './logic'
import './reach.css'

function kmText({ t, formatNumber }: I18n, km: number): string {
  return t('distance.km', { value: formatNumber(km) })
}

function distanceText(i18n: I18n, metres: number): string {
  const km = metres / 1000
  if (km >= 1) return kmText(i18n, km >= 10 ? Math.round(km) : Math.round(km * 10) / 10)
  return i18n.t('distance.m', { value: i18n.formatNumber(Math.round(metres)) })
}

/**
 * Under the summary, next to the numbers: how far our horizon reaches and how far the Occluders the
 * Countdown names are, then the rule for when the Sun and the Earth count as visible. Words only.
 */
export function Reach({ result, cursorMs }: { result: VisibilityResult; cursorMs: number }) {
  const i18n = useI18n()
  const { t } = i18n
  const clauses = reachItems(result, cursorMs).map((item) =>
    t(`reach.${item.event}` as MessageKey, { distance: distanceText(i18n, item.distanceM) }),
  )
  const reach = kmText(i18n, HORIZON_REACH_KM)
  const first = clauses.length === 0 ? t('reach', { reach }) : t('reach.with', { reach, list: clauses.join(t('reach.and')) })
  return (
    <div className="reach">
      <p className="reach__line">{first}</p>
      <p className="reach__rule">{t('rule')}</p>
    </div>
  )
}
