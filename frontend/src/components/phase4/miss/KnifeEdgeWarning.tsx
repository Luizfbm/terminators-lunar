import { knifeEdge } from '../../../domain/knifeEdge'
import { compassIndex } from '../../../domain/sky'
import { useI18n } from '../../../i18n/I18nContext'
import type { MessageKey } from '../../../i18n/messages'
import type { PanelState } from '../../../hooks/useLadder'
import { MISS_PANEL_ID } from './MissPanel'
import { fill, missStrings } from './copy'
import type { ScatterResult } from './types'

const HOUR_MS = 3_600_000

/** Brings "If the lander misses" into view and puts the keyboard in it. */
function showMissPanel(): void {
  const panel = document.getElementById(MISS_PANEL_ID)
  if (!panel) return
  panel.scrollIntoView({ block: 'start' })
  panel.focus({ preventScroll: true })
}

/**
 * A short warning under the answer when a small miss flips it (see `knifeEdge`). It reads the Landing
 * scatter the miss panel shows and asks for nothing itself, so it appears only once that answer is in,
 * and not at all for a stable Site, while the scatter loads, or when it fails.
 */
export function KnifeEdgeWarning({ scatter }: { scatter: PanelState<ScatterResult> }) {
  const i18n = useI18n()
  if (scatter.status !== 'ready') return null
  const edge = knifeEdge(scatter.data)
  if (!edge) return null
  const s = missStrings(i18n.t)
  const sentence = fill(edge.kind === 'loses' ? s.knifeLoses : s.knifeGains, {
    distance: i18n.t('distance.m', { value: i18n.formatNumber(Math.round(edge.point.distance_m)) }),
    direction: i18n.t(`direction.${compassIndex(edge.point.azimuth_deg)}` as MessageKey),
    body: edge.body === 'sun' ? s.knifeSun : s.knifeEarth,
    span: i18n.formatSpan(edge.hours * HOUR_MS),
  })
  return (
    <p className="knife-edge">
      {sentence}{' '}
      <button type="button" className="knife-edge__link" onClick={showMissPanel}>
        {s.knifeSee}
      </button>
    </p>
  )
}
