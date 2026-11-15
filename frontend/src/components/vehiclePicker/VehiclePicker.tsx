import '@fontsource/orbitron/latin-600.css'
import './vehiclePicker.css'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { en } from './strings'
import { VEHICLES, wrapIndex, DEFAULT_VEHICLE_INDEX, darkHours, type RoverFigure, type Vehicle } from './vehicles'
import { checkPickWindow, inputBounds, type Coverage, type PickWindowError } from './pickWindow'
// Types only: the module itself (and three with it) is loaded on demand below.
import type { RoverModel, RoverStage } from './rover3d'

/** The pick, with `start` and `end` as datetime-local values (local time); the parent turns them into UTC. */
export interface VehiclePick {
  vehicle: string
  start: string
  end: string
}

export interface VehiclePickerProps {
  /** `coverage` from /meta: it bounds the dates and their span. */
  coverage: Coverage
  /** The start to offer, as a datetime-local value, when the app already has one. */
  initialStart?: string | null
  onConfirm: (pick: VehiclePick) => void
  onClose: () => void
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The staggered heights and sizes of the hangar row in nasa-2026 (LU_POS), so the rovers do not stand in a ruler line.
const ROW_POS = [
  { y: 6, s: 0.92 },
  { y: 0, s: 1 },
  { y: 10, s: 0.94 },
  { y: 2, s: 0.9 },
]

// The size of the neighbours' pictures, as in nasa-2026.
const SNAP_W = 360
const SNAP_H = 260

/** How the rovers are drawn: the generic SVG while the 3D loads or when it cannot start. */
type Art = 'loading' | '3d' | 'svg'

type StringKey = keyof typeof en

/**
 * The window always speaks American English, whatever the app's language: the app's `t` follows the
 * app locale, so this local one reads only `en`, with the same `{name}` interpolation.
 */
function t(key: StringKey, params?: Record<string, string>): string {
  return en[key].replace(/\{(\w+)\}/g, (match, name: string) => params?.[name] ?? match)
}

/** Numbers and dates in US English, to match the copy (point decimals, month/day/year, 12-hour clock). */
const TAG = 'en-US'
const BOUND_FORMAT = new Intl.DateTimeFormat(TAG, { dateStyle: 'short', timeStyle: 'short' })

/** A number with exactly `digits` decimals, as nasa-2026's luStats writes it. */
function formatFixed(value: number, tag: string, digits = 0): string {
  return new Intl.NumberFormat(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/** Date and time the American way (8/1/2023, 12:00 AM). A datetime-local value has no zone, so Date reads it as local time. */
function boundText(value: string): string {
  return BOUND_FORMAT.format(new Date(value))
}

/** Dark hours with one decimal, or ∞ when an RTG covers the power drawn in shadow. */
function darkText(v: Vehicle, tag: string): string {
  const hours = darkHours(v)
  return Number.isFinite(hours) ? formatFixed(hours, tag, 1) : '∞'
}

const isEstimated = (v: Vehicle, figure: RoverFigure) => v.estimated.includes(figure)

// The dark hours come from the battery and the power in shadow, so either one estimated makes them an estimate.
const darkEstimated = (v: Vehicle) => isEstimated(v, 'powerShadowW') || isEstimated(v, 'batteryWh')

type IconName = 'clock' | 'battery' | 'sun' | 'nocharge' | 'weight' | 'mast'

// The stat icons of nasa-2026 (STAT_ICONS, about line 5837), drawn in currentColor.
const ICON_PATHS: Record<IconName, ReactNode> = {
  clock: (
    <>
      <circle cx="16" cy="16" r="12" />
      <path d="M16 9v7l4.5 3" />
    </>
  ),
  battery: (
    <>
      <rect x="4" y="9" width="22" height="14" rx="2.5" />
      <path d="M26 13.5h2.5v5H26" />
      <path d="M15.5 11.5l-3.5 5h5l-3.5 5" />
    </>
  ),
  sun: (
    <>
      <circle cx="16" cy="16" r="5.5" />
      <path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8" />
    </>
  ),
  nocharge: (
    <>
      <rect x="4" y="9" width="22" height="14" rx="2.5" />
      <path d="M26 13.5h2.5v5H26" />
      <path d="M6 27L26 5" />
    </>
  ),
  weight: (
    <>
      <path d="M9 11h14l4 17H5z" />
      <circle cx="16" cy="7" r="3" />
    </>
  ),
  mast: (
    <>
      <path d="M16 29V9" />
      <path d="M11 29h10" />
      <rect x="11" y="4" width="10" height="5" rx="1.2" />
      <path d="M8 13a9 9 0 0 1 3-4M24 13a9 9 0 0 0-3-4" />
    </>
  ),
}

function StatIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="vehicle-picker__icon"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

interface Stat {
  icon: IconName
  value: string
  estimated: boolean
  unit: string
  caption: StringKey
}

/** The cards of nasa-2026's luStats for one rover, with the same decimals. */
function roverStats(v: Vehicle, tag: string): Stat[] {
  const power: Stat =
    v.solarW > 0
      ? { icon: 'sun', value: formatFixed(v.solarW, tag), estimated: isEstimated(v, 'solarW'), unit: 'W', caption: 'vehiclePicker.stat.solar' }
      : { icon: 'nocharge', value: formatFixed(0, tag), estimated: false, unit: 'W', caption: 'vehiclePicker.stat.noCharge' }
  return [
    { icon: 'clock', value: darkText(v, tag), estimated: darkEstimated(v), unit: 'h', caption: 'vehiclePicker.stat.dark' },
    { icon: 'battery', value: formatFixed(v.batteryWh, tag), estimated: isEstimated(v, 'batteryWh'), unit: 'Wh', caption: 'vehiclePicker.stat.battery' },
    power,
    {
      icon: 'weight',
      value: formatFixed(v.massKg, tag, v.massKg < 100 ? 1 : 0),
      estimated: isEstimated(v, 'massKg'),
      unit: 'kg',
      caption: 'vehiclePicker.stat.mass',
    },
    {
      icon: 'mast',
      value: formatFixed(v.mastHeightM, tag, v.mastHeightM < 1 ? 2 : 1),
      estimated: isEstimated(v, 'mastHeightM'),
      unit: 'm',
      caption: 'vehiclePicker.stat.mast',
    },
  ]
}

/** A generic lander, for when there is no 3D; the body takes the vehicle's tint. */
function LanderSvg({ tint }: { tint: string }) {
  return (
    <svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <g stroke="#2a2a2a" strokeWidth="3" strokeLinecap="round">
        <line x1="62" y1="120" x2="22" y2="176" />
        <line x1="138" y1="120" x2="178" y2="176" />
        <line x1="80" y1="122" x2="70" y2="176" />
        <line x1="120" y1="122" x2="130" y2="176" />
      </g>
      <g fill="#3a3a3a">
        <rect x="8" y="174" width="30" height="6" rx="3" />
        <rect x="162" y="174" width="30" height="6" rx="3" />
        <rect x="56" y="174" width="30" height="6" rx="3" />
        <rect x="114" y="174" width="30" height="6" rx="3" />
      </g>
      <rect x="52" y="96" width="96" height="30" rx="4" fill="#d98a1c" />
      <polygon points="70,40 130,40 148,96 52,96" fill={tint} stroke="#222" strokeWidth="2" />
      <rect x="86" y="54" width="28" height="18" rx="3" fill="#1b2430" />
      <line x1="100" y1="40" x2="100" y2="18" stroke="#222" strokeWidth="3" />
      <circle cx="100" cy="15" r="5" fill="#ddd" stroke="#222" />
    </svg>
  )
}

/**
 * The window that opens before a landing: the four lunar rovers side by side on the ground, as in
 * nasa-2026's hangar, the figures of the one in focus, and the start and end of the calculation. It
 * floats over the globe, which stays mounted beneath; the parent mounts it while open and unmounts
 * it on close or after a pick.
 */
export default function VehiclePicker({ coverage, initialStart, onConfirm, onClose }: VehiclePickerProps) {
  const [index, setIndex] = useState(DEFAULT_VEHICLE_INDEX)
  const [start, setStart] = useState(initialStart ?? '')
  const [end, setEnd] = useState('')
  const [art, setArt] = useState<Art>('loading')
  const [snaps, setSnaps] = useState<Partial<Record<RoverModel, string>>>({})
  const windowRef = useRef<HTMLDivElement>(null)
  const pickRef = useRef<HTMLButtonElement>(null)
  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)
  // One live canvas for the whole row; it is moved into the focused rover's slot (hosts[index]).
  const stageRef = useRef<RoverStage | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostsRef = useRef<(HTMLSpanElement | null)[]>([])
  const indexRef = useRef(index)
  const titleId = useId()
  const hintId = useId()

  const { min, max } = inputBounds(coverage)
  const error: PickWindowError | null = checkPickWindow(start, end, coverage)
  const valid = error === null
  const vehicle = VEHICLES[index]

  // Which field to mark red: the end for a bad order or span; for 'outside', the one that is out.
  // datetime-local values share one fixed layout, so they compare as strings.
  const outside = (value: string) => value !== '' && (value < min || value > max)
  const startBad = error === 'outside' && outside(start)
  const endBad = error === 'order' || error === 'too_long' || (error === 'outside' && outside(end))

  // 'missing' is just the form not filled yet: it shows the window, not an error.
  const shownError = error && error !== 'missing' ? error : null
  const hint = shownError
    ? t(`vehiclePicker.error.${shownError}` as const, { days: String(Math.floor(coverage.max_duration_hours / 24)) })
    : t('vehiclePicker.coverage', { min: boundText(min), max: boundText(max) })

  // The latest onClose, so the document listener below is added once and still calls the current one.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
    indexRef.current = index
  })

  // On open, focus goes to Choose when it can be pressed, else to the first field still empty; on close it
  // goes back to where it was, so a keyboard user lands where they left the globe.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const first = pickRef.current && !pickRef.current.disabled ? pickRef.current : startRef.current?.value ? endRef.current : startRef.current
    first?.focus()
    return () => {
      if (before && document.contains(before)) before.focus()
    }
    // Only on mount and unmount.
  }, [])

  // Escape closes from anywhere while the window is open, even if focus slipped out of it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  // The 3D rovers load on demand, so three stays out of the first bundle; until then, and for good
  // when WebGL cannot start, the row shows the generic SVG.
  useEffect(() => {
    let cancelled = false
    let stage: RoverStage | null = null
    let observer: ResizeObserver | null = null
    const canvas = document.createElement('canvas')
    canvas.className = 'vehicle-picker__canvas'
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    const fail = () => {
      if (cancelled) return
      canvas.remove()
      setArt('svg')
    }

    import('./rover3d')
      .then(({ createRoverStage }) => {
        if (cancelled) return
        // The stage sizes itself from the canvas's box, so the canvas is in its slot before it starts.
        hostsRef.current[indexRef.current]?.appendChild(canvas)
        stage = createRoverStage(canvas, { reducedMotion })
        if (!stage) return fail()
        const live = stage
        const shots: Partial<Record<RoverModel, string>> = {}
        for (const v of VEHICLES) shots[v.model] = live.snapshot(v.model, SNAP_W, SNAP_H)
        stageRef.current = live
        canvasRef.current = canvas
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => live.resize())
          observer.observe(canvas)
        }
        setSnaps(shots)
        setArt('3d')
      })
      .catch(fail)

    return () => {
      cancelled = true
      observer?.disconnect()
      stage?.dispose()
      canvas.remove()
      stageRef.current = null
      canvasRef.current = null
    }
  }, [])

  // Before paint, the live canvas moves into the newly focused slot and draws that rover.
  useLayoutEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const host = hostsRef.current[index]
    if (art !== '3d' || !stage || !canvas || !host) return
    if (canvas.parentElement !== host) host.appendChild(canvas)
    stage.show(VEHICLES[index].model)
    stage.resize()
  }, [index, art])

  const step = (by: number) => setIndex((i) => wrapIndex(i + by, VEHICLES.length))

  const onWindowKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // The arrows move the focus along the row, except in a date field, where they edit the date and time.
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault()
      step(e.key === 'ArrowLeft' ? -1 : 1)
      return
    }
    // Tab goes round inside the window, since the page beneath is out of reach while it is open.
    if (e.key === 'Tab' && windowRef.current) {
      const items = Array.from(windowRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const confirm = () => {
    if (!valid) return
    onConfirm({ vehicle: vehicle.id, start, end })
  }

  const has3d = art === '3d'
  const stats = roverStats(vehicle, TAG)

  return createPortal(
    <div
      className="vehicle-picker"
      // A press on the clear area round the window closes it; a press inside does not.
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={windowRef}
        className="vehicle-picker__window"
        role="dialog"
        // English always (see t above), so screen readers and spell-check read it as English too.
        lang="en-US"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onWindowKey}
      >
        <h2 id={titleId} className="vehicle-picker__sr">
          {t('vehiclePicker.title')}
        </h2>
        <button type="button" className="vehicle-picker__close" aria-label={t('vehiclePicker.close')} onClick={onClose}>
          <span aria-hidden="true">✕</span>
        </button>

        <div className="vehicle-picker__stage">
          <svg className="vehicle-picker__hills" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d="M0 150 L70 104 L150 132 L250 70 L340 122 L430 92 L540 140 L630 84 L740 116 L850 62 L1000 120 L1000 200 L0 200Z" fill="#202a39" />
            <path d="M0 176 L120 146 L240 166 L380 136 L520 172 L700 142 L840 162 L1000 146 L1000 200 L0 200Z" fill="#2c3545" />
          </svg>
          <div className="vehicle-picker__row">
            {VEHICLES.map((v, i) => {
              const on = i === index
              const pos = ROW_POS[i % ROW_POS.length]
              const snap = has3d ? snaps[v.model] : undefined
              return (
                <button
                  key={v.id}
                  type="button"
                  className={on ? 'vehicle-picker__who vehicle-picker__who--on' : 'vehicle-picker__who'}
                  style={{ '--y': `${pos.y}%`, '--s': pos.s } as CSSProperties}
                  title={v.name}
                  aria-current={on ? 'true' : undefined}
                  // The focused one is already chosen; the others are stops for Tab.
                  tabIndex={on ? -1 : 0}
                  // A click on the focused one (also the end of a drag on its canvas) changes nothing.
                  onClick={() => setIndex(i)}
                >
                  <span className="vehicle-picker__tag">
                    <span className="vehicle-picker__dot" aria-hidden="true" />
                    {v.short.split(' · ')[0]}
                  </span>
                  <span className="vehicle-picker__lv">
                    {t('vehiclePicker.darkLine', { hours: darkText(v, TAG) + (darkEstimated(v) ? '*' : '') })}
                  </span>
                  <span className="vehicle-picker__fig" aria-hidden="true">
                    <span className="vehicle-picker__main">
                      {/* React never renders into this host: the live canvas is moved in by hand. */}
                      <span
                        className="vehicle-picker__live"
                        ref={(el) => {
                          hostsRef.current[i] = el
                        }}
                      />
                      {/* An empty snapshot ('' from the stage) also falls back to the SVG. */}
                      {!has3d && <LanderSvg tint={v.tint} />}
                      {has3d && !on && (snap ? <img src={snap} alt="" draggable={false} /> : <LanderSvg tint={v.tint} />)}
                    </span>
                    {/* The reflection is the rover's still picture flipped, also under the live one. */}
                    <span className="vehicle-picker__refl">{snap && <img src={snap} alt="" draggable={false} />}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {VEHICLES.length > 1 && (
            <>
              <button type="button" className="vehicle-picker__nav vehicle-picker__nav--prev" aria-label={t('vehiclePicker.prev')} onClick={() => step(-1)}>
                <span aria-hidden="true">‹</span>
              </button>
              <button type="button" className="vehicle-picker__nav vehicle-picker__nav--next" aria-label={t('vehiclePicker.next')} onClick={() => step(1)}>
                <span aria-hidden="true">›</span>
              </button>
            </>
          )}
        </div>

        <div className="vehicle-picker__pick-wrap">
          <button ref={pickRef} type="button" className="vehicle-picker__pick" disabled={!valid} onClick={confirm}>
            <span>{t('vehiclePicker.pick')}</span>
            <span className="vehicle-picker__arrow" aria-hidden="true">→</span>
          </button>
        </div>

        <section className="vehicle-picker__info" aria-live="polite">
          <dl className="vehicle-picker__stats">
            {stats.map((s) => (
              <div key={s.caption} className="vehicle-picker__st">
                <StatIcon name={s.icon} />
                <div className="vehicle-picker__st-text">
                  <dt>{t(s.caption)}</dt>
                  <dd>
                    {s.value}
                    {s.estimated && '*'}
                    <span className="vehicle-picker__unit">{`\u00a0${s.unit}`}</span>
                  </dd>
                </div>
              </div>
            ))}
          </dl>
          <div className="vehicle-picker__about">
            <h3 className="vehicle-picker__name">{vehicle.name}</h3>
            <p className="vehicle-picker__desc">{t(vehicle.description)}</p>
            <p className="vehicle-picker__source">
              {vehicle.estimated.length > 0 && `${t('vehiclePicker.estimate')} · `}
              {t(vehicle.source)}
            </p>
          </div>
        </section>

        {/* Native datetime-local fields draw their inner date and time in the browser's or OS's locale in
            most browsers, whatever `lang` says, so inside the field the format may not be American. */}
        <div className="vehicle-picker__dates">
          <label className="vehicle-picker__field">
            {t('vehiclePicker.start')}
            <input
              ref={startRef}
              type="datetime-local"
              lang="en-US"
              className="vehicle-picker__input"
              min={min}
              max={max}
              value={start}
              aria-invalid={startBad || undefined}
              aria-describedby={hintId}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="vehicle-picker__field">
            {t('vehiclePicker.end')}
            <input
              ref={endRef}
              type="datetime-local"
              lang="en-US"
              className="vehicle-picker__input"
              min={min}
              max={max}
              value={end}
              aria-invalid={endBad || undefined}
              aria-describedby={hintId}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <p id={hintId} className={shownError ? 'vehicle-picker__hint vehicle-picker__hint--error' : 'vehicle-picker__hint'} aria-live="polite">
          {hint}
          <br />
          <span className="vehicle-picker__zone">{t('vehiclePicker.localTime')}</span>
        </p>
      </div>
    </div>,
    document.body,
  )
}
