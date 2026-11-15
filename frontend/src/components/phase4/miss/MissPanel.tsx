import { Fragment, useId, useState, type ReactNode } from 'react'
import type { VisibilityResult } from '../../../api/client'
import { compassIndex } from '../../../domain/sky'
import { terrainProblem } from '../../../domain/terrainProblem'
import { useI18n } from '../../../i18n/I18nContext'
import type { I18n } from '../../../i18n/i18n'
import type { MessageKey } from '../../../i18n/messages'
import { IM2_SITE_ID } from '../../../domain/landing'
import type { PanelState } from '../../../hooks/useLadder'
import { PanelStatus } from '../../PanelStatus'
import { headline, isSteady, METRIC_ORDER, worstIndex, worstNight } from './logic'
import { ScatterFigure } from './ScatterFigure'
import { SlopeScale } from './SlopeScale'
import { fill, missStrings, type MissStrings } from './copy'
import type { MetricKey, ScatterResult, TerrainResult } from './types'
import { useSeconds, useTerrain } from './useMiss'
import './miss.css'

const HOUR_MS = 3_600_000

/** The panel's address on the page, for the knife-edge warning that points to it. */
export const MISS_PANEL_ID = 'miss-panel'

/** The radii offered: Artemis III's landing accuracy, the IM-2 miss, and a wide margin. */
export const RADII = [100, 250, 500] as const

const HINT: Record<number, keyof MissStrings> = { 100: 'radiusHint100', 250: 'radiusHint250', 500: 'radiusHint500' }

/** The app's own label for each metric, as the numbers under the answer name them. */
const METRIC_LABEL: Record<MetricKey, MessageKey> = {
  sun_and_earth_hours: 'metric.both',
  sunlit_hours: 'metric.sun',
  earth_visible_hours: 'metric.earth',
  lcip_hours: 'metric.lcip',
  lcsp_hours: 'metric.lcsp',
  mean_sun_fraction: 'metric.fraction',
}

export interface MissViewProps {
  /** The Landing scatter for the Query on screen; it comes after the main answer and may take a minute. */
  scatter: PanelState<ScatterResult>
  /** The Slope around the Site; it does not depend on the Window. */
  terrain: PanelState<TerrainResult>
  /** Radius of the outer ring, kept in the link. */
  radiusM: number
  onRadius: (radiusM: number) => void
  /** Which metric fills the points of the drawing. */
  metric: MetricKey
  onMetric: (metric: MetricKey) => void
  /** Seconds the scatter has been computing. */
  waitedS?: number
  onRetryScatter: () => void
  onRetryTerrain: () => void
  /** Opens the Resolution ladder, the panel about map error. */
  onOpenLadder?: () => void
}

/** Wraps each value of a sentence in <b>, so numbers read in the data face. */
function rich(template: string, params: Record<string, string>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    if (name && name in params) return <b key={i}>{params[name]}</b>
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** A sentence whose values never break inside, for narrow table cells. */
function nowrap(template: string, params: Record<string, string>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1]
    if (name && name in params) return <span key={i} className="miss-table__value">{params[name]}</span>
    return <Fragment key={i}>{part}</Fragment>
  })
}

function distanceText(i18n: I18n, metres: number): string {
  if (metres >= 1000) return i18n.t('distance.km', { value: i18n.formatNumber(Math.round(metres / 100) / 10) })
  return i18n.t('distance.m', { value: i18n.formatNumber(Math.round(metres)) })
}

function directionText(i18n: I18n, azimuthDeg: number): string {
  return i18n.t(`direction.${compassIndex(azimuthDeg)}` as MessageKey)
}

function metricText(i18n: I18n, key: MetricKey, value: number): string {
  return key === 'mean_sun_fraction' ? i18n.formatPercent(value) : i18n.formatSpan(value * HOUR_MS)
}

/** Short value next to a point of the drawing: whole hours, or a percent. */
function shortText(i18n: I18n, key: MetricKey, value: number): string {
  return key === 'mean_sun_fraction' ? i18n.formatPercent(value) : `${i18n.formatNumber(Math.round(value))}\u00a0h`
}

function ScatterSentences({ data, s }: { data: ScatterResult; s: MissStrings }) {
  const i18n = useI18n()
  const radius = distanceText(i18n, data.radius_m)
  const head = headline(data)
  const night = worstNight(data)
  const span = (hours: number) => i18n.formatSpan(hours * HOUR_MS)
  let first: ReactNode
  if (head.kind === 'steady') first = rich(s.steady, { radius })
  else if (head.kind === 'siteWorst') first = rich(s.siteWorst, { radius, to: span(head.best) })
  else {
    const where = {
      distance: distanceText(i18n, head.point.distance_m),
      direction: directionText(i18n, head.point.azimuth_deg),
      from: span(head.from),
      to: span(head.to),
    }
    first = rich(head.to < 1 / 60 ? s.dropToNone : s.dropTo, where)
  }
  return (
    <>
      <p className="miss__say">{first}</p>
      {night && (
        <p className="miss__say">
          {rich(night.from < 1 / 60 ? s.nightFromNone : s.nightFrom, {
            distance: distanceText(i18n, night.point.distance_m),
            direction: directionText(i18n, night.point.azimuth_deg),
            from: span(night.from),
            to: span(night.to),
          })}
        </p>
      )}
    </>
  )
}

function ScatterTable({
  data,
  s,
  metric,
  onMetric,
}: {
  data: ScatterResult
  s: MissStrings
  metric: MetricKey
  onMetric: (metric: MetricKey) => void
}) {
  const i18n = useI18n()
  return (
    <div className="panel__scroll">
      <table className="miss-table">
        <caption className="visually-hidden">{s.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{s.tableMetric}</th>
            <th scope="col">{s.tableSite}</th>
            <th scope="col">{s.tableRange}</th>
          </tr>
        </thead>
        <tbody>
          {METRIC_ORDER.map((key) => {
            const range = data.band[key]
            const name = i18n.t(METRIC_LABEL[key])
            return (
              <tr key={key} className={key === metric ? 'miss-table__row--drawn' : undefined}>
                <th scope="row">
                  <button
                    type="button"
                    className="miss-table__pick"
                    aria-pressed={key === metric}
                    aria-label={fill(s.tableShow, { metric: name })}
                    onClick={() => onMetric(key)}
                  >
                    {name}
                  </button>
                </th>
                <td className="miss-table__value">{metricText(i18n, key, data.points[0].metrics[key])}</td>
                <td>
                  {isSteady(range, key)
                    ? metricText(i18n, key, range.min)
                    : nowrap(s.tableFromTo, { min: metricText(i18n, key, range.min), max: metricText(i18n, key, range.max) })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ScatterBody(props: MissViewProps & { s: MissStrings }) {
  const { scatter, s, metric, onMetric, waitedS, onRetryScatter } = props
  const i18n = useI18n()
  if (scatter.status === 'error' && scatter.code === 'outside_coverage') {
    return <p className="panel__note">{s.notForSiteScatter}</p>
  }
  // A busy server is not a failure: it says what to do next and keeps the empty places on screen.
  if (scatter.status === 'error' && scatter.code !== 'busy') return <PanelStatus code={scatter.code} onRetry={onRetryScatter} />
  const busy = scatter.status === 'error'
  const data = scatter.status === 'ready' ? scatter.data : null
  const radius = data?.radius_m ?? props.radiusM
  const worst = data ? worstIndex(data, metric) : null
  const caption = fill(s.figureCaption, {
    inner: distanceText(i18n, radius / 2),
    outer: distanceText(i18n, radius),
    metric: i18n.t(METRIC_LABEL[metric]),
  })
  return (
    <>
      {data && <ScatterSentences data={data} s={s} />}
      {busy && (
        <div className="panel__status miss__waiting" role="status">
          <p>{s.busy}</p>
          <button type="button" className="panel__retry" onClick={onRetryScatter}>
            {i18n.t('error.retry')}
          </button>
        </div>
      )}
      {!data && !busy && (
        <p className="panel__status miss__waiting" role="status">
          {s.loadingScatter}
          {waitedS !== undefined && <span className="miss__waited">{fill(s.waited, { value: i18n.formatNumber(waitedS) })}</span>}
        </p>
      )}
      <figure className="miss__figure">
        <ScatterFigure
          result={data}
          metric={metric}
          worst={data && !isSteady(data.band[metric], metric) ? worst : null}
          label={caption}
          north={s.figureNorth}
          worstWord={s.figureWorst}
          valueOf={(index) => (data ? shortText(i18n, metric, data.points[index].metrics[metric]) : '')}
        />
        <figcaption className="panel__note">{caption}</figcaption>
      </figure>
      {data && <ScatterTable data={data} s={s} metric={metric} onMetric={onMetric} />}
    </>
  )
}

function SlopeBody({
  terrain,
  radiusM,
  s,
  onRetry,
}: {
  terrain: PanelState<TerrainResult>
  radiusM: number
  s: MissStrings
  onRetry: () => void
}) {
  const i18n = useI18n()
  const deg = (value: number) => fill(s.degrees, { value: i18n.formatNumber(Math.round(value * 10) / 10) })
  if (terrain.status === 'loading' || terrain.status === 'idle') {
    return (
      <p className="panel__status" role="status">
        {fill(s.loadingSlope, { resolution: i18n.t('distance.m', { value: '20' }) })}
      </p>
    )
  }
  if (terrain.status === 'error') {
    const problem = terrainProblem(terrain.code, terrain.detail)
    if (problem.kind === 'too_coarse') {
      const radius = distanceText(i18n, radiusM)
      const text =
        problem.resolutionM === null
          ? fill(s.slopeTooCoarseNoPixel, { radius })
          : fill(s.slopeTooCoarse, { resolution: distanceText(i18n, Math.round(problem.resolutionM)), radius })
      return <p className="panel__note">{text}</p>
    }
    if (problem.kind === 'no_dem') return <p className="panel__note">{s.notForSiteSlope}</p>
  }
  if (terrain.status === 'error') return <PanelStatus code={terrain.code} onRetry={onRetry} />
  const { slope, dem, permanent_shadow: shadow } = terrain.data
  const radius = distanceText(i18n, terrain.data.radius_m)
  const resolution = distanceText(i18n, dem.resolution_m)
  const limit = deg(slope.limit_deg)
  return (
    <>
      <p className="miss__say">
        {rich(s.slopeSay, { radius, median: deg(slope.median_deg), p95: deg(slope.p95_deg), max: deg(slope.max_deg) })}
      </p>
      <p className="miss__say">{rich(s.slopeLimit, { limit, share: i18n.formatPercent(slope.share_below_limit) })}</p>
      <SlopeScale
        slope={slope}
        label={fill(s.slopeAxis, { top: deg(Math.max(15, slope.max_deg)) })}
        limitMark={fill(s.slopeLimitMark, { limit })}
        marks={[s.markMedian, s.markP95, s.markMax]}
      />
      <dl className="miss-facts">
        <div>
          <dt>{s.slopeMedian}</dt>
          <dd>{deg(slope.median_deg)}</dd>
        </div>
        <div>
          <dt>{s.slopeP95}</dt>
          <dd>{deg(slope.p95_deg)}</dd>
        </div>
        <div>
          <dt>{s.slopeMax}</dt>
          <dd>{deg(slope.max_deg)}</dd>
        </div>
        <div>
          <dt>{fill(s.slopeShare, { limit })}</dt>
          <dd>{i18n.formatPercent(slope.share_below_limit)}</dd>
        </div>
      </dl>
      <p className="panel__note">
        {fill(s.slopeCells, { cells: i18n.formatNumber(slope.cells), resolution, product: dem.product })}
      </p>
      <p className="panel__note">
        <a className="miss__source" href="https://ntrs.nasa.gov/citations/20250009323" target="_blank" rel="noreferrer">
          {s.slopeSource}
        </a>
      </p>
      <p className="panel__note">
        {fill(s.slopeCaveat, { resolution })}
        {terrain.data.site.id === IM2_SITE_ID ? null : ` ${s.athena}`}
      </p>
      {/* At the IM-2 landing point the route's own numbers tell the story: flat on the map, and still lost. */}
      {terrain.data.site.id === IM2_SITE_ID && (
        <p className="miss__say">{rich(s.athenaHere, { radius, max: deg(slope.max_deg) })}</p>
      )}
      {shadow && (
        <p className="miss__psr">
          {rich(s.psr, {
            distance: distanceText(i18n, shadow.distance_m),
            direction: directionText(i18n, shadow.azimuth_deg),
            product: shadow.product,
          })}
        </p>
      )}
    </>
  )
}

/** "If the lander misses", drawn from what it is given: the Landing scatter, then the Slope. */
export function MissView(props: MissViewProps) {
  const i18n = useI18n()
  const s = missStrings(i18n.t)
  const title = useId()
  const { scatter, radiusM, onRadius, onOpenLadder } = props
  const notForSite = scatter.status === 'error' && scatter.code === 'outside_coverage'
  const slopeRadius = props.terrain.status === 'ready' ? props.terrain.data.radius_m : 100
  return (
    <section id={MISS_PANEL_ID} tabIndex={-1} className="miss" aria-labelledby={title}>
      {/* h3: the Countdown's two sentences are the page's h1 and h2, and nothing else competes with them. */}
      <h3 id={title} className="miss__title">
        {s.title}
      </h3>
      {!notForSite && (
        <>
          <div className="miss__radius" role="group" aria-label={s.radiusLabel}>
            <span className="miss__radius-label" aria-hidden="true">
              {s.radiusLabel}
            </span>
            {RADII.map((r) => (
              <button key={r} type="button" aria-pressed={r === radiusM} onClick={() => onRadius(r)}>
                {fill(s.radiusMetres, { value: i18n.formatNumber(r) })}
              </button>
            ))}
          </div>
          {HINT[radiusM] && <p className="panel__note">{s[HINT[radiusM]]}</p>}
        </>
      )}
      <ScatterBody {...props} s={s} />
      {!notForSite && (
        <p className="miss__aside">
          {s.landingNotMap}{' '}
          {onOpenLadder && (
            <button type="button" className="miss__link" onClick={onOpenLadder}>
              {s.openLadder}
            </button>
          )}
        </p>
      )}
      <h4 className="miss__subtitle">{fill(s.slopeTitle, { radius: distanceText(i18n, slopeRadius) })}</h4>
      <SlopeBody terrain={props.terrain} radiusM={slopeRadius} s={s} onRetry={props.onRetryTerrain} />
    </section>
  )
}

/** Opens "Stats for nerds", then the Resolution ladder inside it, and brings the ladder into view. */
function openLadder(openStats: () => void, label: string): void {
  openStats()
  // The nerds panel renders on the next frame; the ladder keeps its own open state, so it is clicked.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('.nerds__panel .panel__open')
      const ladder = Array.from(buttons).find((button) => button.textContent === label)
      if (!ladder) return
      if (ladder.getAttribute('aria-expanded') !== 'true') ladder.click()
      ladder.scrollIntoView({ block: 'start' })
      ladder.focus({ preventScroll: true })
    }),
  )
}

/**
 * "If the lander misses" for the answer on screen. The Landing scatter and its radius come from the
 * caller (`useRadius`, `useScatter`), which shares them with the knife-edge warning; the Slope it asks
 * for itself. Both start once the answer is in, so the slow scatter never holds the rest of the screen back.
 */
export function MissPanel({
  result,
  radius: [radiusM, setRadiusM],
  scatter,
  onOpenStats,
}: {
  result: VisibilityResult
  radius: [number, (radiusM: number) => void]
  scatter: { state: PanelState<ScatterResult>; retry: () => void }
  onOpenStats?: () => void
}) {
  const { t } = useI18n()
  const [metric, setMetric] = useState<MetricKey>('sun_and_earth_hours')
  const terrain = useTerrain(result)
  const { query } = result
  const asked = [query.site.latitude_deg, query.site.longitude_deg, query.start, query.duration_hours, query.observer_height_m, radiusM]
  const waitedS = useSeconds(scatter.state.status === 'loading', asked.join('|'))
  return (
    <MissView
      scatter={scatter.state}
      terrain={terrain.state}
      radiusM={radiusM}
      onRadius={setRadiusM}
      metric={metric}
      onMetric={setMetric}
      waitedS={waitedS}
      onRetryScatter={scatter.retry}
      onRetryTerrain={terrain.retry}
      onOpenLadder={onOpenStats ? () => openLadder(onOpenStats, t('ladder.open')) : undefined}
    />
  )
}
