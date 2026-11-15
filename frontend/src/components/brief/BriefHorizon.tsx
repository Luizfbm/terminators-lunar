import type { VisibilityResult } from '../../api/client'
import { useI18n } from '../../i18n/I18nContext'
import { briefText } from './strings'
import { buildFigure, FIGURE_HEIGHT, FIGURE_WIDTH } from './figure'

const COMPASS_KEYS = ['direction.0', 'direction.2', 'direction.4', 'direction.6'] as const

/**
 * The Horizon mask unrolled from north round to north, with the Sun's and the Earth's paths over the
 * Window, and no Cursor. A fixed drawing, not sized by the screen, so it prints the same everywhere
 * and never splits across two pages.
 */
export function BriefHorizon({ result }: { result: VisibilityResult }) {
  const i18n = useI18n()
  const { t } = i18n
  const text = briefText(i18n)
  const figure = buildFigure(result)
  return (
    <figure className="brief__figure">
      <svg
        viewBox={`0 0 ${FIGURE_WIDTH} ${FIGURE_HEIGHT}`}
        role="img"
        aria-label={text('brief.horizonLabel', { site: result.query.site.name })}
      >
        {figure.sunPath.map((point, index) => (
          <circle key={`s${index}`} className="brief__sun-path" cx={point.x} cy={point.y} r="1.6" />
        ))}
        {figure.earthPath.map((point, index) => (
          <circle key={`e${index}`} className="brief__earth-path" cx={point.x} cy={point.y} r="1.6" />
        ))}
        <polygon className="brief__terrain" points={figure.terrain} />
        <polyline className="brief__ridge" points={figure.ridge} />
        {figure.compass.map((mark, index) => (
          <text key={mark.azimuthDeg} className="brief__compass" x={mark.x + 6} y={FIGURE_HEIGHT - 8}>
            {t(COMPASS_KEYS[index])}
          </text>
        ))}
      </svg>
      <figcaption>
        <ul className="brief__legend">
          <li className="brief__legend-mask">{text('brief.legend.mask')}</li>
          <li className="brief__legend-sun">{text('brief.legend.sun')}</li>
          <li className="brief__legend-earth">{text('brief.legend.earth')}</li>
        </ul>
        <p>{text('brief.horizonCaption')}</p>
      </figcaption>
    </figure>
  )
}
