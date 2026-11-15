import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { PanelStatus } from '../../PanelStatus'
import { MARKS, STEPS } from '../site-windows/scale'
import { isEmpty, type PanelState, type ShiftedWindow, type SiteWindows } from '../site-windows/types'
import { dayOf, span, usePanelText } from '../site-windows/text'
import { PlanB } from './PlanB'
import { en, pt } from './strings'
import './Slip.css'

export interface SlipProps {
  /** `GET /sites/{site_id}/windows` for the Query's start, -30 to +150 days. */
  state: PanelState<SiteWindows>
  /** The Darkness tolerance the battery panel holds, in hours; null when none is set. */
  darknessToleranceHours: number | null
  /** A point on the curve, or a shortcut, makes that Window the Query. */
  onSlip: (window: ShiftedWindow) => void
  onRetry: () => void
}

type Text = ReturnType<typeof usePanelText<keyof typeof en>>

function shiftWords({ t, formatNumber }: Text, days: number): string {
  if (days === 0) return t('shift.none')
  if (days === 1) return t('shift.lateOne')
  if (days === -1) return t('shift.earlyOne')
  return t(days > 0 ? 'shift.late' : 'shift.early', { value: formatNumber(Math.abs(days)) })
}

/** "+41 d", "−12 d", "0": a slip as the chart labels it. */
function shiftShort({ formatNumber }: Text, days: number): string {
  if (days === 0) return '0'
  return `${days > 0 ? '+' : '−'}${formatNumber(Math.abs(days))}\u00a0d`
}

const fits = (w: ShiftedWindow, tolerance: number | null) => tolerance !== null && w.lcsp_hours <= tolerance

/** Hour ticks for the night plot: a round step that gives at most three of them. */
function nightTicks(max: number): number[] {
  const step = [6, 12, 24, 48, 72, 96, 120, 168, 240, 336, 480, 720].find((s) => max / s <= 3) ?? 720
  const ticks = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return ticks
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(440)
  // Measured before the first paint: drawn at the 440 px guess, a 390 px phone saw the chart push
  // the readout past the screen's edge for a moment.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    setWidth(Math.round(node.getBoundingClientRect().width))
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

function SlipChart({
  data,
  tolerance,
  onSlip,
}: {
  data: SiteWindows
  tolerance: number | null
  onSlip: (window: ShiftedWindow) => void
}) {
  const text = usePanelText({ en, pt })
  const { t, formatNumber } = text
  const { ref, width } = useWidth()
  const { windows, best, worst, duration_hours: duration } = data
  const first = windows[0].shift_days
  const last = windows[windows.length - 1].shift_days
  const planned = windows.find((w) => w.shift_days === 0) ?? null
  const [active, setActive] = useState<number | null>(null)

  // Geometry, in CSS pixels.
  const left = 44
  const right = 14
  const top = 26
  const bothHeight = 128
  const stripTop = top + bothHeight + 14
  const nightTop = top + bothHeight + (tolerance === null ? 28 : 50)
  const nightHeight = 64
  const axis = nightTop + nightHeight
  const height = axis + 40
  const plotWidth = Math.max(10, width - left - right)
  const x = (shift: number) => left + ((shift - first) / Math.max(1, last - first)) * plotWidth
  const yBoth = (hours: number) => top + bothHeight - (hours / duration) * bothHeight
  const nightMax = Math.max(1, ...windows.map((w) => w.lcsp_hours), tolerance ?? 0) * 1.15
  const yNight = (hours: number) => nightTop + nightHeight - (hours / nightMax) * nightHeight
  const dayWidth = plotWidth / Math.max(1, last - first)

  const path = (y: (w: ShiftedWindow) => number) =>
    windows
      .map((w, i) => `${i > 0 && w.shift_days === windows[i - 1].shift_days + 1 ? 'L' : 'M'}${x(w.shift_days).toFixed(1)},${y(w).toFixed(1)}`)
      .join('')

  const current = active === null ? planned : (windows.find((w) => w.shift_days === active) ?? null)
  const readout = (() => {
    if (!current) return t('readout.hint')
    const params = {
      shift: shiftWords(text, current.shift_days),
      date: dayOf(text, current.start),
      both: span(text, current.sun_and_earth_hours),
      dark: span(text, current.lcsp_hours),
    }
    const said = t(current.lcsp_hours === 0 ? 'readout.dayNoNight' : 'readout.day', params)
    if (tolerance === null) return said
    return `${said} ${t(fits(current, tolerance) ? 'readout.fits' : 'readout.fitsNot')}`
  })()
  // Capitalise the readout's first letter: shift words start a sentence there.
  const sentence = readout.charAt(0).toUpperCase() + readout.slice(1)

  const nearest = (clientX: number, box: DOMRect) => {
    const shift = Math.round(first + ((clientX - box.left - left) / plotWidth) * (last - first))
    return Math.max(first, Math.min(last, shift))
  }

  const onKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 7, PageDown: -7 }
    if (event.key in moves) setActive((now) => Math.max(first, Math.min(last, (now ?? 0) + moves[event.key])))
    else if (event.key === 'Home') setActive(first)
    else if (event.key === 'End') setActive(last)
    else if ((event.key === 'Enter' || event.key === ' ') && current) onSlip(current)
    else return
    event.preventDefault()
  }

  const xTicks = [-30, 0, 30, 60, 90, 120, 150].filter((s) => s >= first && s <= last)
  const bothTicks = [0, 0.5, 1]
  const marks = [
    { w: best, glyph: MARKS.best, y: yBoth(best.sun_and_earth_hours) - 7, anchorBelow: false },
    { w: worst, glyph: MARKS.worst, y: yBoth(worst.sun_and_earth_hours) + 15, anchorBelow: true },
  ]

  return (
    <div className="p4slip__chart" ref={ref}>
      <p className="p4slip__readout">{sentence}</p>
      <div
        className="p4slip__plot"
        role="slider"
        tabIndex={0}
        aria-label={t('chart.label')}
        aria-valuemin={first}
        aria-valuemax={last}
        aria-valuenow={current?.shift_days ?? 0}
        aria-valuetext={sentence}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={height} aria-hidden="true">
          {/* The top plot: Sun and Earth together, on the whole Window. */}
          <text className="p4slip__title" x={left} y={top - 12}>
            {t('chart.both')}
          </text>
          {bothTicks.map((f) => (
            <g key={f}>
              <line className="p4slip__grid" x1={left} x2={left + plotWidth} y1={yBoth(f * duration)} y2={yBoth(f * duration)} />
              <text className="p4slip__tick" x={left - 6} y={yBoth(f * duration) + 4} textAnchor="end">
                {`${formatNumber(Math.round((f * duration) / 24))}\u00a0d`}
              </text>
            </g>
          ))}
          <path className="p4slip__both" d={path((w) => yBoth(w.sun_and_earth_hours))} style={{ stroke: STEPS[3] }} />

          {/* Which Windows fit the Darkness tolerance: a filled bar each. */}
          {tolerance !== null && (
            <g>
              <line className="p4slip__grid" x1={left} x2={left + plotWidth} y1={stripTop + 8.5} y2={stripTop + 8.5} />
              <text className="p4slip__tick" x={left - 6} y={stripTop + 8} textAnchor="end">
                {t('chart.fits')}
              </text>
              {windows
                .filter((w) => fits(w, tolerance))
                .map((w) => (
                  <rect
                    key={w.shift_days}
                    className="p4slip__fit"
                    x={x(w.shift_days) - dayWidth / 2}
                    y={stripTop}
                    width={Math.max(1, dayWidth) + 0.6}
                    height={8}
                  />
                ))}
            </g>
          )}

          {/* The bottom plot: the longest night of each Window, and the tolerance against it. */}
          <text className="p4slip__title" x={left} y={nightTop - 6}>
            {t('chart.night')}
          </text>
          {nightTicks(nightMax).map((v) => (
            <g key={v}>
              <line className="p4slip__grid" x1={left} x2={left + plotWidth} y1={yNight(v)} y2={yNight(v)} />
              <text className="p4slip__tick" x={left - 6} y={yNight(v) + 4} textAnchor="end">
                {`${formatNumber(v)}\u00a0h`}
              </text>
            </g>
          ))}
          <path className="p4slip__night" d={path((w) => yNight(w.lcsp_hours))} />
          {tolerance !== null && (
            <g>
              <line className="p4slip__tolerance" x1={left} x2={left + plotWidth} y1={yNight(tolerance)} y2={yNight(tolerance)} />
              <text className="p4slip__tick p4slip__tick--fg" x={left + plotWidth} y={yNight(tolerance) - 4} textAnchor="end">
                {`${t('chart.tolerance')}, ${formatNumber(tolerance)}\u00a0h`}
              </text>
            </g>
          )}

          {/* The planned start, across both plots. */}
          <line className="p4slip__planned" x1={x(0)} x2={x(0)} y1={top - 2} y2={axis} />

          {/* The best and the worst slip. */}
          {marks.map(({ w, glyph, y }) => {
            const px = x(w.shift_days)
            const anchor = px > left + plotWidth - 50 ? 'end' : 'start'
            return (
              <g key={glyph}>
                <circle className="p4slip__dot" cx={px} cy={yBoth(w.sun_and_earth_hours)} r={3} />
                <text className="p4slip__mark" x={px} y={y} textAnchor="middle">
                  {glyph}
                </text>
                <text className="p4slip__tick p4slip__tick--fg" x={px + (anchor === 'start' ? 8 : -8)} y={y} textAnchor={anchor}>
                  {shiftShort(text, w.shift_days)}
                </text>
              </g>
            )
          })}

          {/* The day being read. */}
          {current && (
            <g className="p4slip__cursor">
              <line x1={x(current.shift_days)} x2={x(current.shift_days)} y1={top - 2} y2={axis} />
              <circle cx={x(current.shift_days)} cy={yBoth(current.sun_and_earth_hours)} r={4} />
              <circle cx={x(current.shift_days)} cy={yNight(current.lcsp_hours)} r={4} />
            </g>
          )}

          <line className="p4slip__axis" x1={left} x2={left + plotWidth} y1={axis} y2={axis} />
          {xTicks.map((s) => (
            <text key={s} className="p4slip__tick" x={x(s)} y={axis + 15} textAnchor="middle">
              {s === 0 ? t('chart.planned') : `${s > 0 ? '+' : '−'}${formatNumber(Math.abs(s))}`}
            </text>
          ))}
          <text className="p4slip__tick" x={left + plotWidth} y={axis + 32} textAnchor="end">
            {t('chart.x')}
          </text>

          <rect
            className="p4slip__hit"
            x={left - dayWidth}
            y={0}
            width={plotWidth + 2 * dayWidth}
            height={axis}
            onPointerMove={(event) => setActive(nearest(event.clientX, event.currentTarget.ownerSVGElement!.getBoundingClientRect()))}
            onPointerLeave={() => setActive(null)}
            onClick={(event) => {
              const shift = nearest(event.clientX, event.currentTarget.ownerSVGElement!.getBoundingClientRect())
              const w = windows.find((win) => win.shift_days === shift)
              if (w) onSlip(w)
            }}
          />
        </svg>
      </div>
      <div className="p4slip__legend">
        <p>{t('legend.marks')}</p>
        {tolerance !== null && <p>{t('legend.fits')}</p>}
      </div>
    </div>
  )
}

/**
 * A launch that slips: the Query's Window started 30 days early to 150 days late, one Window per
 * day. Sits on the answer under the day to land.
 */
export function Slip({ state, darknessToleranceHours: tolerance, onSlip, onRetry }: SlipProps) {
  const text = usePanelText({ en, pt })
  const { t, formatNumber } = text
  const titleId = useId()

  const body = (() => {
    if (state.status === 'curated-only') {
      return (
        <div className="p4slip__note">
          <p className="p4slip__noteTitle">{t('curated.title')}</p>
          <p>{t('curated.body')}</p>
        </div>
      )
    }
    if (state.status === 'loading') {
      return (
        <>
          <p className="panel__status" role="status">
            {t('loading')}
          </p>
          <div className="p4slip__ghost" aria-hidden="true" />
        </>
      )
    }
    if (state.status === 'error') return <PanelStatus code={state.code} onRetry={onRetry} />
    const { data } = state
    if (isEmpty(data)) return <p className="p4slip__say">{t('empty')}</p>
    const planned = data.windows.find((w) => w.shift_days === 0) ?? data.windows[0]
    const lead =
      data.best.shift_days === 0
        ? t('lead.plannedBest', {
            planned: span(text, planned.sun_and_earth_hours),
            worstShift: shiftWords(text, data.worst.shift_days),
            worst: span(text, data.worst.sun_and_earth_hours),
          })
        : t('lead', {
            planned: span(text, planned.sun_and_earth_hours),
            bestShift: shiftWords(text, data.best.shift_days),
            best: span(text, data.best.sun_and_earth_hours),
            worstShift: shiftWords(text, data.worst.shift_days),
            worst: span(text, data.worst.sun_and_earth_hours),
          })
    const total = String(data.windows.length)
    const fitting = tolerance === null ? [] : data.windows.filter((w) => fits(w, tolerance))
    const bestFit = fitting.reduce<ShiftedWindow | null>((top, w) => (!top || w.sun_and_earth_hours > top.sun_and_earth_hours ? w : top), null)
    const toleranceText = tolerance === null ? '' : `${formatNumber(tolerance)}\u00a0h`
    const verdict =
      tolerance === null
        ? t('tolerance.unset')
        : fitting.length === 0
          ? t('tolerance.none', { tolerance: toleranceText, total })
          : fitting.length === data.windows.length
            ? t('tolerance.all', { tolerance: toleranceText, total })
            : t('tolerance.some', {
                tolerance: toleranceText,
                fit: formatNumber(fitting.length),
                total,
                shift: shiftWords(text, bestFit!.shift_days),
                both: span(text, bestFit!.sun_and_earth_hours),
              })
    return (
      <>
        <p className="p4slip__say">{lead}</p>
        <p className={tolerance === null ? 'p4slip__hint' : 'p4slip__say'}>{verdict}</p>
        <SlipChart data={data} tolerance={tolerance} onSlip={onSlip} />
        <p className="p4slip__go">
          {data.best.shift_days !== 0 && (
            <button type="button" onClick={() => onSlip(data.best)}>
              {MARKS.best} {t('go.best', { shift: shiftWords(text, data.best.shift_days) })}
            </button>
          )}
          <button type="button" onClick={() => onSlip(data.worst)}>
            {MARKS.worst} {t('go.worst', { shift: shiftWords(text, data.worst.shift_days) })}
          </button>
        </p>
        <PlanB data={data} shiftWords={(days: number) => shiftWords(text, days)} />
      </>
    )
  })()

  return (
    <section className="p4slip" aria-labelledby={titleId}>
      <h3 id={titleId} className="p4slip__title2">
        {t('title')}
      </h3>
      {body}
    </section>
  )
}
