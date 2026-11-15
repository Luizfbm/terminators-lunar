import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useI18n } from '../../../i18n/I18nContext'
import { canDraw } from '../../webgl'
import { useWalkGrid } from './api'
import { mapView } from './mapView'
import { PlanMap } from './PlanMap'
import { createWalkScene, type WalkScene } from './scene'
import { errorKey, walkText, type WalkText } from './strings'
import { reliefAt, slope5At, type WalkGrid } from './terrain'
import type { Navigation, RouteComparison, RouteWaypoint, WalkMode, WalkSun } from './types'
import {
  NO_KEYS,
  anyHeld,
  batteryAt,
  collectRays,
  faceSun,
  initialState,
  resumeAuto,
  stepAuto,
  stepManual,
  wrapDeg,
  type Held,
  type WalkState,
  type WalkWorld,
} from './walk'
import './walk.css'

export interface RouteWalkProps {
  /** The Site the route and the grid belong to (`/sites/{site_id}/route` and `/hazard/grid`). */
  siteId: string
  /** The Site's name, for the picture's accessible name; the id when left out. */
  siteName?: string
  /** What `/sites/{site_id}/route` returned: both plans, the rover, the goal and the rays. */
  route: RouteComparison
  /**
   * The plan accepted, the one the autonomous drive follows and the battery is read from. A change of
   * it (or of the route) starts a new walk.
   */
  accepted: Navigation
  /** The Sun at the Cursor: lights the ground and is what F faces. Without it the Sun button is off. */
  sun?: WalkSun | null
  /** Told when the person picks the other plan inside the walk. */
  onPlanChange?: (navigation: Navigation) => void
}

const PLANS: Navigation[] = ['normal', 'multiresolution']

const HELD_KEYS: Record<string, keyof Held> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
}

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * Walk the surface (Eduardo's Tela 3): the grid's heights in 3D, with the rover, the two routes, the
 * trail and the rays, driven by the keys or along the accepted plan. It draws only what the API
 * returned. The battery is the accepted plan's own `battery_fraction`, and the rays, which carry no
 * energy, are said to be an illustration.
 */
export function RouteWalk(props: RouteWalkProps) {
  const { locale } = useI18n()
  const text = useMemo(() => walkText(locale), [locale])
  const { state, retry } = useWalkGrid(props.siteId)
  const { route, accepted } = props
  const titleId = useId()
  if (state.status !== 'ready') {
    return (
      <section className="walk" aria-labelledby={titleId}>
        <h2 id={titleId} className="walk__title">
          {text('walk.title')}
        </h2>
        {state.status === 'error' ? (
          <div className="walk__status" role="alert">
            <p>{text('walk.error.title')}</p>
            <p>{text(errorKey(state.code))}</p>
            <button type="button" className="walk__button" onClick={retry}>
              {text('walk.retry')}
            </button>
          </div>
        ) : (
          <p className="walk__status" role="status">
            {text('walk.loading')}
          </p>
        )}
      </section>
    )
  }
  const key = [
    props.siteId,
    route.grid_id,
    route.start.x_m,
    route.start.y_m,
    route.goal.x_m,
    route.goal.y_m,
    route.rover.slope_limit_deg,
    route.plans.map((plan) => plan.distance_m).join(','),
    route.solar_points.length,
    accepted,
  ].join('|')
  return <Walk key={key} {...props} grid={state.data} text={text} />
}

function Walk({
  siteId,
  siteName,
  route,
  accepted,
  sun = null,
  onPlanChange,
  grid,
  text,
}: RouteWalkProps & { grid: WalkGrid; text: WalkText }) {
  const { formatNumber } = useI18n()
  const titleId = useId()
  const hintId = useId()
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const scene = useRef<WalkScene | null>(null)
  const held = useRef<Held>({ ...NO_KEYS })

  const routes = useMemo(
    (): Record<Navigation, RouteWaypoint[]> => ({
      normal: route.plans.find((plan) => plan.navigation === 'normal')?.path ?? [],
      multiresolution: route.plans.find((plan) => plan.navigation === 'multiresolution')?.path ?? [],
    }),
    [route],
  )
  const world = useMemo(
    (): WalkWorld => ({ halfM: grid.halfM, slopeLimitDeg: route.rover.slope_limit_deg, slope5At: (x, y) => slope5At(grid, x, y) }),
    [grid, route.rover.slope_limit_deg],
  )
  const view = useMemo(() => mapView(grid.halfM, [route.start, route.goal], [routes.normal, routes.multiresolution]), [grid, route, routes])

  const [plan, setPlan] = useState<Navigation>(accepted)
  const [mode, setMode] = useState<WalkMode>('manual')
  const [running, setRunning] = useState(false)
  const [overhead, setOverhead] = useState(false)
  const [flat, setFlat] = useState(() => !canDraw())
  const [first] = useState(() => initialState(route, routes[accepted]))
  const sim = useRef<WalkState>(first)
  const [shown, setShown] = useState<WalkState>(first)

  // What the frame loop reads: the latest of these, since the loop is set up once.
  const latest = useRef({ plan, mode, running, overhead, sun, fail: () => setFlat(true) })
  useEffect(() => {
    latest.current = { plan, mode, running, overhead, sun, fail: () => setFlat(true) }
  })

  // The 3D stage. A browser that cannot draw it, or loses the context, gets the flat map.
  useEffect(() => {
    const target = canvas.current
    const host = stage.current
    if (flat || !target || !host) return
    let made: WalkScene
    try {
      made = createWalkScene(target, {
        grid,
        slopeLimitDeg: route.rover.slope_limit_deg,
        routes,
        goal: route.goal,
        rays: route.solar_points,
        onLost: () => latest.current.fail(),
      })
    } catch {
      latest.current.fail()
      return
    }
    scene.current = made
    const fit = () => made.resize(host.clientWidth, host.clientHeight)
    fit()
    const watcher = new ResizeObserver(fit)
    watcher.observe(host)
    return () => {
      watcher.disconnect()
      scene.current = null
      made.dispose()
    }
  }, [flat, grid, route, routes])

  // The walk itself: every frame the keys or the plan move the rover, the rays are picked up and the stage is drawn.
  useEffect(() => {
    let handle = 0
    let before = performance.now()
    let last: WalkState = sim.current
    let lastShown = 0
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - before) / 1000)
      before = now
      const { plan: chosen, mode: how, running: go, overhead: far, sun: light } = latest.current
      let next = sim.current
      if (anyHeld(held.current)) {
        // Any key takes the wheel from the autonomous drive.
        if (how === 'auto') {
          setMode('manual')
          setRunning(false)
        }
        next = stepManual(next, held.current, dt, world)
      } else if (how === 'auto' && go) {
        next = stepAuto(next, routes[chosen], dt, world)
        if (next.arrived) setRunning(false)
      }
      next = collectRays(next, route.solar_points)
      sim.current = next
      scene.current?.frame({ state: next, accepted: chosen, sun: light, view: far ? 1 : 0, dt, time: now / 1000 })
      // The readout follows a few times a second, and only when something moved.
      if (next !== last && (next.arrived || now - lastShown >= 100)) {
        last = next
        lastShown = now
        setShown(next)
      }
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [world, route.solar_points, routes])

  const restart = (navigation: Navigation) => {
    sim.current = initialState(route, routes[navigation])
    setShown(sim.current)
    setRunning(false)
  }
  const choosePlan = (navigation: Navigation) => {
    if (navigation === plan) return
    setPlan(navigation)
    restart(navigation)
    onPlanChange?.(navigation)
  }
  const chooseMode = (next: WalkMode) => {
    setMode(next)
    if (next === 'auto') {
      sim.current = resumeAuto(sim.current, routes[plan])
      setShown(sim.current)
      setRunning(!sim.current.arrived)
    } else {
      setRunning(false)
    }
  }
  const toggleRun = () => {
    if (running) return setRunning(false)
    if (sim.current.arrived) restart(plan)
    sim.current = resumeAuto(sim.current, routes[plan])
    setRunning(true)
  }
  const turnToSun = () => {
    if (!sun) return
    sim.current = faceSun(sim.current, sun.azimuthDeg)
    setShown(sim.current)
    setMode('manual')
    setRunning(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = HELD_KEYS[event.code]
    if (key) {
      event.preventDefault()
      held.current[key] = true
    } else if (event.code === 'KeyF') {
      event.preventDefault()
      turnToSun()
    }
  }
  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = HELD_KEYS[event.code]
    if (key) held.current[key] = false
  }
  // A key held while the focus leaves would otherwise stay held.
  const release = () => {
    held.current = { ...NO_KEYS }
  }
  const press = (key: keyof Held) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      held.current[key] = true
    },
    onPointerUp: () => {
      held.current[key] = false
    },
    onPointerCancel: () => {
      held.current[key] = false
    },
  })

  const chosen = route.plans.find((candidate) => candidate.navigation === plan)
  const battery = batteryAt(routes[plan], shown.x, shown.y)
  const heightM = grid.zMidM + reliefAt(grid, shown.x, shown.y)
  const slopeDeg = slope5At(grid, shown.x, shown.y)
  const rays = route.solar_points.length
  const label = siteName ?? siteId
  const map = (
    <PlanMap
      grid={grid}
      view={view}
      slopeLimitDeg={route.rover.slope_limit_deg}
      routes={routes}
      accepted={plan}
      goal={route.goal}
      rays={route.solar_points}
      state={shown}
      label={text('walk.label.map')}
    />
  )

  return (
    <section className="walk" aria-labelledby={titleId}>
      <header className="walk__head">
        <h2 id={titleId} className="walk__title">
          {text('walk.title')}
        </h2>
        <p className="walk__intro">{text('walk.intro')}</p>
      </header>
      <div className="walk__body">
        <div
          className="walk__stage"
          ref={stage}
          tabIndex={0}
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={release}
        >
          {flat ? (
            <div className="walk__flat">{map}</div>
          ) : (
            <>
              <canvas ref={canvas} role="img" aria-label={text('walk.label.canvas', { site: label })} />
              <div className="walk__inset">{map}</div>
            </>
          )}
          <div className="walk__pad">
            <button type="button" className="walk__key walk__key--up" aria-label={text('walk.pad.forward')} {...press('forward')}>
              ▲
            </button>
            <button type="button" className="walk__key walk__key--left" aria-label={text('walk.pad.left')} {...press('left')}>
              ◀
            </button>
            <button type="button" className="walk__key walk__key--down" aria-label={text('walk.pad.back')} {...press('back')}>
              ▼
            </button>
            <button type="button" className="walk__key walk__key--right" aria-label={text('walk.pad.right')} {...press('right')}>
              ▶
            </button>
          </div>
        </div>
        <div className="walk__panel">
          <p className="walk__hint" id={hintId}>
            {text('walk.keys')}
          </p>
          {flat && <p className="walk__note">{text('walk.flat')}</p>}

          <div className="walk__group" role="group" aria-label={text('walk.plan')}>
            <span className="walk__group-label">{text('walk.plan')}</span>
            {PLANS.map((navigation) => (
              <button
                key={navigation}
                type="button"
                className={`walk__button walk__button--${navigation}`}
                aria-pressed={plan === navigation}
                onClick={() => choosePlan(navigation)}
              >
                {text(`walk.plan.${navigation}`)}
              </button>
            ))}
          </div>
          {chosen && (
            <p className="walk__summary">
              {text('walk.summary', {
                distance: formatNumber(Math.round(chosen.distance_m)),
                hours: formatNumber(round1(chosen.duration_hours)),
                hazards: formatNumber(chosen.hazards_hit),
                reached: text(chosen.reached ? 'walk.reached.yes' : 'walk.reached.no'),
              })}
            </p>
          )}

          <div className="walk__group" role="group" aria-label={text('walk.mode')}>
            <span className="walk__group-label">{text('walk.mode')}</span>
            {(['manual', 'auto'] as const).map((how) => (
              <button key={how} type="button" className="walk__button" aria-pressed={mode === how} onClick={() => chooseMode(how)}>
                {text(`walk.mode.${how}`)}
              </button>
            ))}
          </div>
          <div className="walk__actions">
            {mode === 'auto' && (
              <button type="button" className="walk__button" onClick={toggleRun}>
                {text(running ? 'walk.pause' : 'walk.start')}
              </button>
            )}
            <button type="button" className="walk__button" onClick={turnToSun} disabled={!sun} aria-label={text('walk.sun.label')} title={sun ? undefined : text('walk.sun.none')}>
              {text('walk.sun')}
            </button>
            <button type="button" className="walk__button" aria-pressed={overhead} onClick={() => setOverhead((on) => !on)} disabled={flat}>
              {text(overhead ? 'walk.view.rover' : 'walk.view.top')}
            </button>
            <button type="button" className="walk__button" onClick={() => restart(plan)}>
              {text('walk.reset')}
            </button>
          </div>
          {shown.arrived && (
            <p className="walk__note" role="status">
              {text('walk.arrived')}
            </p>
          )}

          <dl className="walk__readout">
            <div>
              <dt>{text('walk.t.heading')}</dt>
              <dd>{text('walk.degrees', { value: formatNumber(Math.round(wrapDeg(shown.headingDeg))) })}</dd>
            </div>
            <div>
              <dt>{text('walk.t.distance')}</dt>
              <dd>{formatNumber(Math.round(shown.distanceM))} m</dd>
            </div>
            <div>
              <dt>{text('walk.t.height')}</dt>
              <dd>{formatNumber(Math.round(heightM))} m</dd>
            </div>
            <div>
              <dt>{text('walk.t.slope')}</dt>
              <dd>{text('walk.degrees', { value: formatNumber(round1(slopeDeg)) })}</dd>
            </div>
            <div>
              <dt>{text('walk.t.battery')}</dt>
              <dd>{battery ? `${formatNumber(Math.round(battery.fraction * 100))} %` : text('walk.battery.off')}</dd>
            </div>
            <div>
              <dt>{text('walk.t.steep')}</dt>
              <dd>{formatNumber(shown.steepEntered)}</dd>
            </div>
            {rays > 0 && (
              <div>
                <dt>{text('walk.t.rays')}</dt>
                <dd>
                  {formatNumber(shown.collected.length)} / {formatNumber(rays)}
                </dd>
              </div>
            )}
          </dl>

          <ul className="walk__legend">
            <li>
              <span className="walk__swatch walk__swatch--steep" />
              {text('walk.legend.steep')}
            </li>
            <li>
              <span className="walk__swatch walk__swatch--measured" />
              {text('walk.legend.measured')}
            </li>
            <li>
              <span className="walk__swatch walk__swatch--normal" />
              {text('walk.legend.normal')}
            </li>
            <li>
              <span className="walk__swatch walk__swatch--multiresolution" />
              {text('walk.legend.multiresolution')}
            </li>
            <li>
              <span className="walk__swatch walk__swatch--ray" />
              {text('walk.legend.rays')}
            </li>
            <li>
              <span className="walk__swatch walk__swatch--goal" />
              {text('walk.legend.goal')}
            </li>
          </ul>

          <div className="walk__notes">
            <p>{text('walk.battery.note', { wh: formatNumber(Math.round(route.rover.battery_wh)) })}</p>
            <p>{text(rays > 0 ? 'walk.rays.note' : 'walk.rays.none')}</p>
            <p>{text('walk.light.note')}</p>
            {chosen && <p>{text('walk.pace.note', { hours: formatNumber(round1(chosen.duration_hours)) })}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
