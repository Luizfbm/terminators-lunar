import { useEffect, useRef, useState } from 'react'
import type { VisibilityResult } from '../api/client'
import { maskElevationAt } from '../domain/sky'
import { sampleAt } from '../domain/sky'
import { dashAlong, dashPattern, onStageLength, type ScreenPoint } from '../domain/sunDashes'
import { useI18n } from '../i18n/I18nContext'

const COMPASS_KEYS = ['direction.0', 'direction.2', 'direction.4', 'direction.6'] as const
/** One path sample per this many timeline samples: enough to read the Sun's loop, light to draw. */
const PATH_POINTS = 320

function useSize(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

/**
 * The view from the ground: the Horizon mask unrolled from north round to north, with the Sun's
 * path over the Window, the Sun and the Earth at the Cursor, and the terrain drawn in front of them.
 * Drawn in the stage's own pixels, so the type is the same size as everywhere else.
 */
export interface GroundMark {
  body: 'sun' | 'earth'
  azimuthDeg: number
  label: string
}

export function Ground({
  result,
  cursorMs,
  mark = null,
  compact = false,
}: {
  result: VisibilityResult
  cursorMs: number
  mark?: GroundMark | null
  /** As the strip under the 3D sky: the caption about stretched heights is said once, above. */
  compact?: boolean
}) {
  const { t } = useI18n()
  const [frame, { width, height }] = useSize()
  const mask = result.horizon.samples
  const samples = result.timeline.samples
  const now = sampleAt(samples, cursorMs)

  let low = 0
  let high = 0
  for (const point of mask) {
    low = Math.min(low, point.elevation_deg)
    high = Math.max(high, point.elevation_deg)
  }
  for (const sample of samples) high = Math.max(high, sample.sun.elevation_deg)
  low = Math.max(low, -3) - 0.5
  high += 1

  const base = height * 0.86
  const scale = height > 0 ? (base - height * 0.16) / (high - low) : 0
  const x = (azimuthDeg: number) => (azimuthDeg / 360) * width
  const y = (elevationDeg: number) => base - (Math.max(elevationDeg, low) - low) * scale
  const hills = mask.map((point) => `${x(point.azimuth_deg).toFixed(1)},${y(point.elevation_deg).toFixed(1)}`).join(' ')
  const every = Math.max(1, Math.floor(samples.length / PATH_POINTS))
  // The Sun's path as dashes a fixed number of CSS pixels apart (domain/sunDashes.ts), laid on the same samples.
  const pathSamples = samples.filter((_, index) => index % every === 0)
  const pathPoints: ScreenPoint[] = pathSamples.map((sample) => ({ x: x(sample.sun.azimuth_deg), y: y(sample.sun.elevation_deg), visible: true }))
  const pattern = dashPattern(onStageLength(pathPoints, width, height), typeof window === 'undefined' ? 1 : window.devicePixelRatio)
  // The plot is cut where the azimuth wraps from 360° to 0°: a dash never reaches over the cut.
  const reachTo = (at: number, towards: number, share: number) => {
    const from = pathPoints[at]
    const to = pathPoints[towards]
    if (!to || share === 0 || Math.abs(to.x - from.x) > width / 2) return { x: from.x, y: from.y }
    return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share }
  }
  const dashes = dashAlong(pathPoints, pattern).map((dash) => ({ index: dash.index, from: reachTo(dash.index, dash.index - 1, dash.back), to: reachTo(dash.index, dash.index + 1, dash.ahead) }))
  // The marked Occluder stands on the ridge at its own azimuth, with its name above it.
  const markX = mark ? x(mark.azimuthDeg) : 0
  const markY = mark ? y(maskElevationAt(mask, mark.azimuthDeg)) : 0
  const labelY = Math.max(64, markY - 46)
  const sunRadius = Math.max(5, (result.timeline.sun_radius_deg ?? 0.27) * scale)

  return (
    <div className="ground" ref={frame}>
      {width > 0 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t('ground.label', { site: result.query.site.name })}
        >
          {dashes.map((dash) => (
            <line
              key={pathSamples[dash.index].t}
              className="ground__path"
              x1={dash.from.x}
              y1={dash.from.y}
              x2={dash.to.x}
              y2={dash.to.y}
              stroke="var(--sun)"
              strokeWidth="2.4"
              strokeLinecap="round"
              opacity="0.6"
            />
          ))}
          {now && <circle className="ground__sun" cx={x(now.sun.azimuth_deg)} cy={y(now.sun.elevation_deg)} r={sunRadius} />}
          {now && <circle className="ground__earth" cx={x(now.earth.azimuth_deg)} cy={y(now.earth.elevation_deg)} r="7" />}
          <polygon className="ground__terrain" points={`0,${height} ${hills} ${width},${height}`} />
          <polyline className="ground__ridge" points={hills} />
          {mark && (
            <g className={`ground__mark ground__mark--${mark.body}`} data-azimuth={mark.azimuthDeg}>
              <line x1={markX} y1={labelY + 8} x2={markX} y2={markY - 5} />
              <circle cx={markX} cy={markY} r="5" />
              <text x={markX > width * 0.6 ? markX + 6 : markX - 6} y={labelY} textAnchor={markX > width * 0.6 ? 'end' : 'start'}>
                {mark.label}
              </text>
            </g>
          )}
          {COMPASS_KEYS.map((key, index) => (
            <text key={key} className="ground__compass" x={x(index * 90) + 8} y={height - 12}>
              {t(key)}
            </text>
          ))}
        </svg>
      )}
      {/* Outside the drawing, so it wraps on a narrow screen instead of running off the edge. */}
      {!compact && <p className="ground__caption">{t('ground.caption')}</p>}
    </div>
  )
}
