import type { SlopeStats } from './types'

const WIDTH = 360
const LEFT = 10
const RIGHT = WIDTH - 14
const AXIS_Y = 34

export interface SlopeScaleProps {
  slope: SlopeStats
  label: string
  limitMark: string
  /** Short names of the three marks: half, steepest 5 %, steepest cell. */
  marks: [string, string, string]
}

/** One axis in degrees with the median, the 95th percentile, the maximum and NASA's limit on it. */
export function SlopeScale({ slope, label, limitMark, marks }: SlopeScaleProps) {
  const top = Math.max(15, Math.ceil((Math.max(slope.limit_deg, slope.max_deg) * 1.15) / 5) * 5)
  const x = (deg: number) => LEFT + (Math.min(deg, top) / top) * (RIGHT - LEFT)
  const ticks = Array.from({ length: top / 5 + 1 }, (_, i) => i * 5)
  const values: [number, string][] = [
    [slope.median_deg, marks[0]],
    [slope.p95_deg, marks[1]],
    [slope.max_deg, marks[2]],
  ]
  return (
    <svg className="miss-scale" viewBox={`0 0 ${WIDTH} 78`} role="img" aria-label={label}>
      <rect className="miss-scale__over" x={x(slope.limit_deg)} y={AXIS_Y - 6} width={RIGHT - x(slope.limit_deg)} height={12} />
      <line className="miss-scale__axis" x1={LEFT} y1={AXIS_Y} x2={RIGHT} y2={AXIS_Y} />
      {ticks.map((deg) => (
        <g key={deg} className="miss-scale__tick">
          <line x1={x(deg)} y1={AXIS_Y + 6} x2={x(deg)} y2={AXIS_Y + 10} />
          {/* The limit carries its own label; its tick number would sit under the dashed line. */}
          {deg !== slope.limit_deg && (
            <text x={x(deg)} y={AXIS_Y + 22}>
              {`${deg}°`}
            </text>
          )}
        </g>
      ))}
      <line className="miss-scale__limit" x1={x(slope.limit_deg)} y1={AXIS_Y - 14} x2={x(slope.limit_deg)} y2={AXIS_Y + 30} />
      <text className="miss-scale__limit-label" x={x(slope.limit_deg)} y={AXIS_Y + 42}>
        {limitMark}
      </text>
      {values.map(([deg, name], i) => (
        <g key={name} className="miss-scale__mark">
          <circle cx={x(deg)} cy={AXIS_Y} r={4} />
          {/* Alternate heights, so close marks never print on top of each other. */}
          <text x={x(deg)} y={i % 2 === 0 ? AXIS_Y - 12 : AXIS_Y - 24}>
            {name}
          </text>
        </g>
      ))}
    </svg>
  )
}
