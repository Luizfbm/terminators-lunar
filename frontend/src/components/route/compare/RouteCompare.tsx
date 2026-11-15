import { useId, useMemo, useState } from 'react'
import { useI18n } from '../../../i18n/I18nContext'
import { useHazardGrid, useRoute } from './api'
import { assumptionRows, avoidedSentence, distanceText, footerRows, planOf, roverLine, type Format } from './describe'
import { MULTIRESOLUTION_STYLE, NORMAL_STYLE, swarmOf } from './draw'
import { planFrame } from './frames'
import { decodeGrid, renderGround, type GroundGrid } from './grid'
import { PaneCanvas, RoutePane } from './RoutePane'
import { textFor, type Text } from './strings'
import { GROUND_LAYERS, NAVIGATIONS, type GroundLayer, type Navigation, type RouteCompareProps, type RouteComparison } from './types'
import { prefersReducedMotion, SPEEDS, useAnimation } from './useAnimation'
import { cropOf } from './view'
import './routeCompare.css'

/** Eduardo's default Sun direction for the relief, when the caller has no azimuth for the Cursor. */
const DEFAULT_SUN_AZIMUTH_DEG = 35

const NAV_NAME = { normal: 'nav.normal', multiresolution: 'nav.multiresolution' } as const
const NAV_READS = { normal: 'reads.normal', multiresolution: 'reads.multiresolution' } as const

/**
 * Normal navigation and Multiresolution side by side: the same drive on the ground around a Site,
 * planned twice by the API. The left frame is Normal navigation on the LOLA grid the person picks
 * (60, 20 or 5 m), the right one is Multiresolution with the swarm's search animated over the 5 m
 * ground. Clicking a frame accepts that plan. The panel draws what `/sites/{id}/route` and
 * `/sites/{id}/hazard/grid` return and computes no route, hazard or survival of its own (ADR 0002).
 */
export function RouteCompare(props: RouteCompareProps) {
  const { locale } = useI18n()
  const text = textFor(locale)
  const titleId = useId()
  const [coarseM, setCoarseM] = useState<60 | 20>(props.coarseM ?? 60)
  const route = useRoute({
    siteId: props.siteId,
    rover: props.rover,
    sunFraction: props.sunFraction,
    sunAzimuthDeg: props.sunAzimuthDeg,
    confidenceLevel: props.confidenceLevel,
    coarseM,
    start: props.start,
    goal: props.goal,
  })
  const grid = useHazardGrid(props.siteId)

  const gridState = grid.state
  const ground = useMemo<GroundGrid | 'unreadable' | null>(() => {
    if (gridState.status !== 'ready') return null
    try {
      return decodeGrid(gridState.data)
    } catch {
      return 'unreadable'
    }
  }, [gridState])

  let body
  if (route.state.status === 'error' || grid.state.status === 'error') {
    const code = route.state.status === 'error' ? route.state.code : grid.state.status === 'error' ? grid.state.code : 'unknown'
    body = <Problem text={text} code={code} onRetry={route.state.status === 'error' ? route.retry : grid.retry} />
  } else if (ground === 'unreadable') {
    body = <Problem text={text} code="grid" onRetry={grid.retry} />
  } else if (route.state.status === 'ready' && ground) {
    body = (
      <RouteStage
        comparison={route.state.data}
        grid={ground}
        sunAzimuthDeg={props.sunAzimuthDeg ?? DEFAULT_SUN_AZIMUTH_DEG}
        onAccept={props.onAccept}
        onCoarse={setCoarseM}
      />
    )
  } else {
    body = (
      <p className="route-compare__status" role="status">
        {text.t('loading')}
      </p>
    )
  }

  return (
    <section className="route-compare" aria-labelledby={titleId}>
      <header className="route-compare__header">
        <h2 id={titleId} className="route-compare__title">
          {text.t('title')}
        </h2>
        {props.onClose ? (
          <button type="button" className="route-compare__close" onClick={props.onClose}>
            {text.t('close')}
          </button>
        ) : null}
      </header>
      <p className="route-compare__intro">{text.t('intro')}</p>
      {body}
    </section>
  )
}

const PROBLEM_KEYS = {
  no_hazard_grid: 'error.no_hazard_grid',
  invalid_parameter: 'error.invalid_parameter',
  network: 'error.network',
  busy: 'error.busy',
  grid: 'error.grid',
} as const

function Problem({ text, code, onRetry }: { text: Text; code: string; onRetry: () => void }) {
  const key = PROBLEM_KEYS[code as keyof typeof PROBLEM_KEYS] ?? 'error.unknown'
  return (
    <div className="route-compare__status" role="alert">
      <p>{text.t('error.title')}</p>
      <p>{text.t(key)}</p>
      {code === 'no_hazard_grid' ? null : (
        <button type="button" className="route-compare__retry" onClick={onRetry}>
          {text.t('retry')}
        </button>
      )}
    </div>
  )
}

export interface RouteStageProps {
  comparison: RouteComparison
  grid: GroundGrid
  sunAzimuthDeg: number
  onAccept: (navigation: Navigation) => void
  /** Normal navigation was asked to read another grid (60 or 20 m): the route has to be planned again. */
  onCoarse: (coarseM: 60 | 20) => void
}

/** The two frames, the controls and the numbers, once the route and the grid are in. */
export function RouteStage({ comparison, grid, sunAzimuthDeg, onAccept, onCoarse }: RouteStageProps) {
  const i18n = useI18n()
  const text = textFor(i18n.locale)
  const fmt: Format = i18n
  const animation = useAnimation(!prefersReducedMotion())
  const [layer, setLayer] = useState<GroundLayer>(comparison.coarse_m)
  const [accepted, setAccepted] = useState<Navigation | null>(null)

  const limitDeg = comparison.rover.slope_limit_deg
  // The two grounds are built once: the left one when the resolution changes, the right one never.
  const leftPixels = useMemo(
    () => renderGround(grid, { layer, limitDeg, sunAzimuthDeg, showMeasured: false }),
    [grid, layer, limitDeg, sunAzimuthDeg],
  )
  const rightPixels = useMemo(
    () => renderGround(grid, { layer: 5, limitDeg, sunAzimuthDeg, showMeasured: true }),
    [grid, limitDeg, sunAzimuthDeg],
  )
  const crop = useMemo(() => cropOf(comparison, grid), [comparison, grid])

  const choose = (navigation: Navigation) => {
    setAccepted(navigation)
    onAccept(navigation)
  }
  const chooseLayer = (next: GroundLayer) => {
    setLayer(next)
    // 60 and 20 m are grids Normal navigation can plan on; 5 m is only the ground, drawn as it is.
    if (next !== 5 && next !== comparison.coarse_m) onCoarse(next)
  }

  const { progress } = animation
  const swarm = swarmOf(comparison.swarm, progress)
  const settled = swarm?.frame.settled ?? false
  const swarmLine = swarm
    ? text.t(settled ? 'swarm.settled' : 'swarm.running', {
        generation: fmt.formatNumber(swarm.frame.generation),
        generations: fmt.formatNumber(swarm.frame.generations),
        total: fmt.formatNumber(swarm.frame.total),
        fallen: fmt.formatNumber(swarm.frame.fallen),
        survivors: fmt.formatNumber(swarm.frame.survivors),
      })
    : null
  const acceptedName = accepted ? text.t(NAV_NAME[accepted]) : null

  return (
    <div className="route-compare__stage">
      <p className="route-compare__rover">{roverLine(comparison, text, fmt)}</p>

      <div className="route-compare__layers" role="group" aria-label={text.t('layer.label')}>
        <span className="route-compare__layers-label">{text.t('layer.label')}</span>
        {GROUND_LAYERS.map((option) => (
          <button
            key={option}
            type="button"
            className="route-compare__layer"
            aria-pressed={layer === option}
            onClick={() => chooseLayer(option)}
          >
            {text.t('layer.option', { grid: String(option) })}
          </button>
        ))}
      </div>
      <p className="route-compare__note">
        {text.t('layer.note', { limit: fmt.formatNumber(limitDeg) })}
        {layer === 5 ? ` ${text.t('layer.note5', { grid: String(comparison.coarse_m) })}` : ''}
      </p>

      <div className="route-compare__panes">
        {NAVIGATIONS.map((navigation) => {
          const plan = planOf(comparison, navigation)
          const frame = planFrame(plan, progress)
          const name = text.t(NAV_NAME[navigation])
          const multi = navigation === 'multiresolution'
          const hazards = fmt.formatNumber(frame.hazards)
          return (
            <RoutePane
              key={navigation}
              navigation={navigation}
              selected={accepted === navigation}
              name={name}
              reads={text.t(NAV_READS[navigation], { grid: String(comparison.coarse_m), level: comparison.confidence_level })}
              progressLine={text.t('pane.so_far', {
                distance: distanceText(fmt, frame.distanceM),
                hazards,
                battery: fmt.formatPercent(frame.batteryFraction),
              })}
              acceptLabel={text.t('accept.label', { plan: name })}
              acceptedLabel={text.t('accepted')}
              caption={multi && swarmLine ? <span className="route-compare__swarm">{swarmLine}</span> : undefined}
              onAccept={choose}
            >
              <PaneCanvas
                pixels={multi ? rightPixels : leftPixels}
                n={grid.n}
                label={text.t('pane.canvas', { plan: name, distance: distanceText(fmt, plan.distance_m), hazards: fmt.formatNumber(plan.hazards_hit) })}
                input={{
                  grid,
                  crop,
                  start: comparison.start,
                  goal: comparison.goal,
                  plan,
                  style: multi ? MULTIRESOLUTION_STYLE : NORMAL_STYLE,
                  label: name,
                  progress,
                  swarm: multi ? swarm : undefined,
                  solarPoints: multi ? comparison.solar_points : undefined,
                }}
              />
            </RoutePane>
          )
        })}
      </div>

      <p className="route-compare__hint" role="status">
        {acceptedName ? text.t('accepted.line', { plan: acceptedName }) : text.t('accept.hint')}
      </p>

      <div className="route-compare__controls">
        <button type="button" className="route-compare__control" onClick={animation.toggle}>
          {animation.playing ? text.t('pause') : text.t('play')}
        </button>
        <button type="button" className="route-compare__control" onClick={animation.replay}>
          {text.t('replay')}
        </button>
        <input
          className="route-compare__scrub"
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          aria-label={text.t('scrub')}
          onChange={(event) => animation.seek(Number(event.currentTarget.value) / 1000)}
        />
        <span className="route-compare__speeds" role="group" aria-label={text.t('speed')}>
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              className="route-compare__layer"
              aria-pressed={animation.speed === value}
              onClick={() => animation.setSpeed(value)}
            >
              {text.t('speed.option', { value: fmt.formatNumber(value) })}
            </button>
          ))}
        </span>
      </div>

      <ul className="route-compare__legend">
        <li>{text.t('legend.hazard')}</li>
        <li>{text.t('legend.measured')}</li>
        <li>{text.t('legend.path.normal')}</li>
        <li>{text.t('legend.path.multiresolution')}</li>
        <li>{text.t('legend.cross')}</li>
        <li>{text.t('legend.veto')}</li>
        {comparison.solar_points.length > 0 ? <li>{text.t('legend.sun')}</li> : null}
      </ul>

      {swarm ? <p className="route-compare__note">{text.t('swarm.note')}</p> : null}

      <table className="route-compare__table">
        <caption>{text.t('footer.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{text.t('footer.number')}</th>
            {NAVIGATIONS.map((navigation) => (
              <th key={navigation} scope="col">
                {text.t(NAV_NAME[navigation])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {footerRows(comparison, text, fmt).map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.normal}</td>
              <td>{row.multiresolution}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="route-compare__avoided">{avoidedSentence(comparison, text, fmt)}</p>
      <p className="route-compare__note">{text.t('hazard.note')}</p>

      <p className="route-compare__note">{text.t('assumptions.line')}</p>
      <details className="route-compare__assumptions">
        <summary>{text.t('assumptions.summary', { count: fmt.formatNumber(Object.keys(comparison.assumptions).length) })}</summary>
        <p className="route-compare__note">{text.t('assumptions.note')}</p>
        <dl className="route-compare__assumed">
          {assumptionRows(comparison, text, fmt).map((row) => (
            <div key={row.name}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  )
}
