import { shareOfWindow } from './logic'
import type { MetricKey, ScatterResult } from './types'

const SIZE = 360
const CENTRE = SIZE / 2
const OUTER = 116
const DOT = 10
const LABEL_GAP = 24
const SIDE_GAP = 15

/** Where a point's value goes: under the Site; beside the points on the sides; above or below the rest. */
function labelPlace(radius: number, azimuthDeg: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const { x, y } = place(radius, azimuthDeg)
  if (radius === 0) return { x, y: y + LABEL_GAP, anchor: 'middle' }
  const east = Math.sin((azimuthDeg * Math.PI) / 180)
  if (east > 0.3) return { x: x + SIDE_GAP, y, anchor: 'start' }
  if (east < -0.3) return { x: x - SIDE_GAP, y, anchor: 'end' }
  const north = Math.cos((azimuthDeg * Math.PI) / 180)
  return { x, y: y - Math.sign(north) * LABEL_GAP, anchor: 'middle' }
}

/** Where a point sits in the plan: north up, east to the right. */
function place(radius: number, azimuthDeg: number): { x: number; y: number } {
  const a = (azimuthDeg * Math.PI) / 180
  return { x: CENTRE + radius * Math.sin(a), y: CENTRE - radius * Math.cos(a) }
}

/** A wedge from twelve o'clock, clockwise, filling `share` of a dot. */
function wedge(x: number, y: number, r: number, share: number): string {
  const a = share * 2 * Math.PI
  const ex = x + r * Math.sin(a)
  const ey = y - r * Math.cos(a)
  const large = share > 0.5 ? 1 : 0
  return `M ${x} ${y} L ${x} ${y - r} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`
}

/** The 19 places of a Landing scatter, before any answer: the Site, 6 at half the radius, 12 at it. */
const LAYOUT: { ring: 0 | 1 | 2; azimuth: number }[] = [
  { ring: 0, azimuth: 0 },
  ...Array.from({ length: 6 }, (_, i) => ({ ring: 1 as const, azimuth: i * 60 })),
  ...Array.from({ length: 12 }, (_, i) => ({ ring: 2 as const, azimuth: i * 30 })),
]

const FILL: Record<MetricKey, string> = {
  sun_and_earth_hours: 'var(--fg)',
  sunlit_hours: 'var(--sun)',
  earth_visible_hours: 'var(--earth)',
  lcip_hours: 'var(--sun)',
  lcsp_hours: 'var(--hatch)',
  mean_sun_fraction: 'var(--sun)',
}

export interface ScatterFigureProps {
  /** Null while the answer is on its way: the rings and the empty places are drawn. */
  result: ScatterResult | null
  metric: MetricKey
  /** Index of the point to mark as the worst. */
  worst: number | null
  label: string
  north: string
  worstWord: string
  /** The value written next to each point, already formatted. */
  valueOf: (index: number) => string
}

/** The Landing scatter from above: the Site in the middle, north up, each point filled by its share of the Window. */
export function ScatterFigure({ result, metric, worst, label, north, worstWord, valueOf }: ScatterFigureProps) {
  const ringRadius = [0, OUTER / 2, OUTER]
  return (
    <svg
      className={result ? 'miss-figure' : 'miss-figure miss-figure--waiting'}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
    >
      <circle className="miss-figure__ring" cx={CENTRE} cy={CENTRE} r={OUTER / 2} />
      <circle className="miss-figure__ring" cx={CENTRE} cy={CENTRE} r={OUTER} />
      <g className="miss-figure__north" aria-hidden="true">
        <path d={`M ${CENTRE} 6 L ${CENTRE - 5} 17 L ${CENTRE + 5} 17 Z`} />
        <text x={CENTRE + 10} y={15}>
          {north}
        </text>
      </g>
      {result && worst !== null && worst !== 0 && (
        <line
          className="miss-figure__reach"
          x1={CENTRE}
          y1={CENTRE}
          x2={place(ringRadius[LAYOUT[worst].ring], LAYOUT[worst].azimuth).x}
          y2={place(ringRadius[LAYOUT[worst].ring], LAYOUT[worst].azimuth).y}
        />
      )}
      {LAYOUT.map((slot, index) => {
        const r = ringRadius[slot.ring]
        const { x, y } = place(r, slot.azimuth)
        const point = result?.points[index]
        const share = result && point ? shareOfWindow(result, point, metric) : 0
        const isWorst = result !== null && index === worst
        const label = labelPlace(r, slot.azimuth)
        return (
          <g key={index} className={isWorst ? 'miss-figure__point miss-figure__point--worst' : 'miss-figure__point'}>
            {isWorst && <circle className="miss-figure__halo" cx={x} cy={y} r={DOT + 5} />}
            <circle className="miss-figure__dot" cx={x} cy={y} r={DOT} />
            {share >= 0.999 && <circle cx={x} cy={y} r={DOT - 2} fill={FILL[metric]} />}
            {share > 0.001 && share < 0.999 && <path d={wedge(x, y, DOT - 2, share)} fill={FILL[metric]} />}
            {result && (
              <text className="miss-figure__value" x={label.x} y={label.y} textAnchor={label.anchor}>
                {valueOf(index)}
                {isWorst && (
                  <tspan className="miss-figure__worst" x={label.x} dy="1.2em">
                    {worstWord}
                  </tspan>
                )}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
