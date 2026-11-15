import type { VisibilityResult } from '../../../api/client'
import { compassIndex } from '../../../domain/sky'
import { useI18n } from '../../../i18n/I18nContext'
import type { MessageKey } from '../../../i18n/messages'
import { siteName } from '../../siteName'
import { span, usePanelText } from '../site-windows/text'
import { useNeighbours } from '../slip/api'
import type { SiteNeighbours } from '../slip/slipPlan'
import { isAskable, nearbyHref, nearbyOf, nearbyRequest } from './nearby'
import { en, pt } from './strings'
import './nearby.css'

/** What the neighbours request is in: not asked, loading, an error (which says nothing), or the answer. */
export type NearbyState =
  | { status: 'loading' }
  | { status: 'error'; code: string }
  | { status: 'curated-only' }
  | { status: 'ready'; data: SiteNeighbours }
  | null

/**
 * The line itself, from what the route answered. Nothing for anything but a better neighbour: no
 * answer yet, an error, a custom Site, or a Site that is already the best of its neighbours.
 */
export function NearbyView({ result, state }: { result: VisibilityResult; state: NearbyState }) {
  const i18n = useI18n()
  const text = usePanelText({ en, pt })
  if (state?.status !== 'ready') return null
  const nearby = nearbyOf(result, state.data)
  if (!nearby) return null
  const { formatNumber } = text
  const km = nearby.distanceKm
  // The sentence keeps `{site}` in place, so the Site's name can be set apart as the link.
  const sentence = text.t('line', {
    distance: i18n.t('distance.km', { value: formatNumber(km >= 10 ? Math.round(km) : Math.round(km * 10) / 10) }),
    direction: i18n.t(`direction.${compassIndex(nearby.bearingDeg)}` as MessageKey),
    both: span(text, nearby.bothHours),
    own: span(text, nearby.ownHours),
  })
  const [before, after] = sentence.split('{site}')
  const search = typeof window === 'undefined' ? '' : window.location.search
  return (
    <p className="nearby">
      {before}
      <a href={nearbyHref(search, result, nearby.site.id)}>{siteName(nearby.site, i18n)}</a>
      {after}
    </p>
  )
}

/** Under the summary: the nearby Site with more Sun-and-Earth time in this Window, as a link to it. */
export function NearbyLine({ result }: { result: VisibilityResult }) {
  // Asked once the answer is here, and never for a custom Site; the answer does not wait on it.
  const { state } = useNeighbours(isAskable(result.query.site) ? nearbyRequest(result) : null)
  return <NearbyView result={result} state={state} />
}
