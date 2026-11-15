import { isCoordinate, type SiteRef } from '../../../domain/query'
import { useOnDemand } from '../../../hooks/useLadder'
import { usePanelText } from '../../phase4/site-windows/text'
import { getSiteHazard } from './hazardApi'
import { ellipseShare, isMinority, shareText } from './shareLogic'
import { en, pt } from './strings'
import './measuredShare.css'

/**
 * Under the uncertainty line: how much of the ground inside the Site's Landing ellipse the laser
 * really measured. The height error band above is only as good as that. Quiet when there is
 * nothing to say: a custom Site, a Site with no 5 m data, or the answer not arriving.
 */
export function MeasuredShare({ site }: { site: SiteRef }) {
  const text = usePanelText({ en, pt })
  const siteId = isCoordinate(site) ? null : site
  const { state } = useOnDemand(siteId !== null, siteId ?? '', () => getSiteHazard(siteId ?? ''))
  if (state.status !== 'ready') return null
  const share = ellipseShare(state.data.measured)
  if (share === null) return null
  const key = isMinority(share) ? 'measured.minority' : 'measured.majority'
  return <p className="band-line band-line--measured">{text.t(key, { share: shareText(share, text.formatPercent) })}</p>
}
