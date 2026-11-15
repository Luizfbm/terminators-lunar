import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { curtainColumn, pixelOf, renderLayer, scaleBarPixels } from './render'
import { text, type InspectorLocale } from './strings'
import type { CoarseGrid, ConfidenceLevel, DecodedGrid, HazardGridRef } from './types'

/** Pixels per side of the picture; the page scales it to fit. */
export const PICTURE = 400

export interface InspectorCanvasProps {
  grid: DecodedGrid
  gridRef: HazardGridRef
  coarse: CoarseGrid
  level: ConfidenceLevel
  limitDeg: number
  /** Where the curtain stands, 0 (all Multiresolution) to 1 (all Normal navigation). */
  curtain: number
  onCurtain: (fraction: number) => void
  locale: InspectorLocale
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, align: CanvasTextAlign, color: string) {
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const width = ctx.measureText(value).width
  ctx.fillStyle = 'rgba(4, 10, 22, 0.84)'
  const left = align === 'right' ? x - width - 6 : x - 6
  ctx.fillRect(left, y - 10, width + 12, 20)
  ctx.fillStyle = color
  ctx.fillText(value, x, y)
}

/**
 * The 10 x 10 km grid as shaded relief, Normal navigation on the left of the curtain and
 * Multiresolution on the right, with the ⊕ on the Site and a 2 km bar. The pictures are drawn from
 * the decoded grid; nothing is computed about the hazard here.
 */
export function InspectorCanvas({ grid, gridRef, coarse, level, limitDeg, curtain, onCurtain, locale }: InspectorCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)

  // The two sides do not change with the curtain, so they are drawn once per choice.
  const normal = useMemo(() => renderLayer(grid, 'normal', { coarse, limitDeg, size: PICTURE }), [grid, coarse, limitDeg])
  const multi = useMemo(() => renderLayer(grid, 'multiresolution', { coarse, limitDeg, size: PICTURE }), [grid, coarse, limitDeg])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const split = curtainColumn(curtain, PICTURE)
    const left = new ImageData(new Uint8ClampedArray(normal), PICTURE, PICTURE)
    const right = new ImageData(new Uint8ClampedArray(multi), PICTURE, PICTURE)
    ctx.putImageData(left, 0, 0, 0, 0, split, PICTURE)
    ctx.putImageData(right, 0, 0, split, 0, PICTURE - split, PICTURE)

    // The curtain.
    ctx.strokeStyle = '#00e5ff'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(split, 0)
    ctx.lineTo(split, PICTURE)
    ctx.stroke()

    // The ⊕ on the Site, when the Site is inside the grid.
    const site = gridRef.site_inside ? pixelOf(grid, PICTURE, gridRef.site_offset_m.x_m, gridRef.site_offset_m.y_m) : null
    if (site) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(site.x, site.y, 9, 0, Math.PI * 2)
      ctx.moveTo(site.x - 14, site.y)
      ctx.lineTo(site.x + 14, site.y)
      ctx.moveTo(site.x, site.y - 14)
      ctx.lineTo(site.x, site.y + 14)
      ctx.stroke()
      const flip = site.x > PICTURE - 70
      label(ctx, text(locale, 'hazard.legendSite'), flip ? site.x - 14 : site.x + 16, site.y - 14, flip ? 'right' : 'left', '#fde047')
    }

    label(ctx, text(locale, 'hazard.paneNormal', { m: String(coarse) }), 10, 16, 'left', '#ffb36b')
    label(ctx, text(locale, 'hazard.paneMulti', { level }), PICTURE - 10, 42, 'right', '#5dff9b')

    // The scale bar.
    const bar = scaleBarPixels(grid, PICTURE)
    ctx.strokeStyle = '#f8fafc'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(14, PICTURE - 16)
    ctx.lineTo(14 + bar, PICTURE - 16)
    ctx.moveTo(14, PICTURE - 21)
    ctx.lineTo(14, PICTURE - 11)
    ctx.moveTo(14 + bar, PICTURE - 21)
    ctx.lineTo(14 + bar, PICTURE - 11)
    ctx.stroke()
    label(ctx, text(locale, 'hazard.scale'), 14 + bar + 10, PICTURE - 16, 'left', '#e2e8f0')
  }, [normal, multi, curtain, grid, gridRef, coarse, level, locale])

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width > 0) onCurtain(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)))
  }

  return (
    <div
      className="hazard-canvas"
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        move(event)
      }}
      onPointerMove={(event) => {
        if (dragging.current) move(event)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
    >
      <canvas
        ref={canvas}
        width={PICTURE}
        height={PICTURE}
        role="img"
        aria-label={text(locale, 'hazard.alt', { grid: gridRef.id })}
      />
    </div>
  )
}
