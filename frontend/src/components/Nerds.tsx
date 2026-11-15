import { useId, type ReactNode } from 'react'
import type { VisibilityResult } from '../api/client'
import { sampleAt } from '../domain/sky'
import { useI18n } from '../i18n/I18nContext'
import type { MessageKey } from '../i18n/messages'
import { HorizonsLinks } from './horizons/HorizonsLinks'
import { LadderPanel } from './LadderPanel'
import { DsnLink } from './phase4/dsn/DsnLink'
import { Numbers } from './Numbers'
import { YearPanel, type WindowChoice } from './YearPanel'

/** Two decimals: finer than the Sun's disc is wide, and short enough to read. */
const round = (value: number) => Math.round(value * 100) / 100

/**
 * "Stats for nerds": everything behind the plain sentences, one click away. Closed, the screen is
 * for someone meeting the question for the first time; open, it is for someone planning the trip.
 */
export function Nerds({
  result,
  cursorMs,
  open,
  onOpen,
  onWindow,
}: {
  result: VisibilityResult
  cursorMs: number
  open: boolean
  onOpen: (open: boolean) => void
  onWindow?: (choice: WindowChoice) => void
}) {
  const { t, locale, formatNumber, formatPercent } = useI18n()
  // A published coordinate is shown with every decimal it came with, not rounded to three.
  const degrees = new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : 'en', { maximumFractionDigits: 6 })
  const panel = useId()
  const now = sampleAt(result.timeline.samples, cursorMs)
  const { site } = result.query
  const position = (body: { azimuth_deg: number; elevation_deg: number }) =>
    t('nerds.position', { azimuth: formatNumber(round(body.azimuth_deg)), elevation: formatNumber(round(body.elevation_deg)) })
  const rows: [MessageKey, ReactNode][] = [
    ...(now
      ? ([
          ['nerds.sun', position(now.sun)],
          ['nerds.disc', formatPercent(now.sun.fraction)],
          ['nerds.earth', position(now.earth)],
          // The numbers above are those of this sample, so Horizons is asked for its instant.
          [
            'horizons.row',
            <HorizonsLinks
              key="horizons"
              observer={{ latitudeDeg: site.latitude_deg, longitudeDeg: site.longitude_deg, heightM: result.query.observer_height_m }}
              instantMs={Date.parse(now.t)}
            />,
          ],
        ] satisfies [MessageKey, ReactNode][])
      : []),
    [
      'nerds.site',
      t('nerds.coordinate', {
        latitude: degrees.format(Math.abs(site.latitude_deg)),
        ns: t(site.latitude_deg < 0 ? 'sites.hemisphere.S' : 'sites.hemisphere.N'),
        longitude: degrees.format(Math.abs(site.longitude_deg)),
        ew: t(site.longitude_deg < 0 ? 'sites.hemisphere.W' : 'sites.hemisphere.E'),
      }),
    ],
    [
      'nerds.dems',
      result.provenance.dems
        .map((dem) => t('nerds.dem', { product: dem.product, resolution: formatNumber(dem.resolution_m) }))
        .join(', '),
    ],
    ['nerds.kernels', result.provenance.kernels.join(', ')],
    ['nerds.engine', result.provenance.engine_version],
  ]
  return (
    <div className="nerds">
      <button type="button" className="nerds__open" aria-expanded={open} aria-controls={panel} onClick={() => onOpen(!open)}>
        {t('nerds.open')}
      </button>
      {open && (
        <div id={panel} className="nerds__panel">
          <Numbers result={result} />
          <table className="metrics nerds__facts">
            <caption className="visually-hidden">{t('nerds.caption')}</caption>
            <tbody>
              {rows.map(([key, value]) => (
                <tr key={key}>
                  <th scope="row">{t(key)}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <LadderPanel result={result} />
          <YearPanel result={result} onWindow={onWindow} />
          <DsnLink result={result} />
        </div>
      )}
    </div>
  )
}
