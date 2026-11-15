import type { HorizonsBody, HorizonsObserver } from '../../domain/horizons'
import { horizonsUrl } from '../../domain/horizons'
import { useI18n } from '../../i18n/I18nContext'
import './horizons.css'

const BODIES: HorizonsBody[] = ['sun', 'earth']

/**
 * One link per body to JPL Horizons, with the Site, the Observer height and the instant of the numbers
 * on screen already filled in, so anyone can redo the position themselves. Each opens in a new tab.
 */
export function HorizonsLinks({ observer, instantMs }: { observer: HorizonsObserver; instantMs: number }) {
  const { t } = useI18n()
  return (
    <span className="horizons-links" title={t('horizons.hint')}>
      {BODIES.map((body) => (
        <a
          key={body}
          className="horizons-links__link"
          href={horizonsUrl(body, observer, instantMs)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t(body === 'sun' ? 'horizons.sunLabel' : 'horizons.earthLabel')}
        >
          {t(body === 'sun' ? 'horizons.sun' : 'horizons.earth')}
        </a>
      ))}
    </span>
  )
}
