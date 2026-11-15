import { useEffect, useRef, type ReactNode } from 'react'
import { drawPane, type PaneInput } from './draw'
import type { Navigation } from './types'

/** Side of the canvas in pixels; the page scales it to the width of its column. */
export const CANVAS_PX = 520

export interface RoutePaneProps {
  navigation: Navigation
  /** The plan the user accepted is this one. */
  selected: boolean
  name: string
  /** What this plan reads, in a sentence. */
  reads: string
  /** Where the Rover is, in a sentence. */
  progressLine: string
  /** The accessible name of the click target, such as "Accept Multiresolution". */
  acceptLabel: string
  acceptedLabel: string
  /** Extra line above the figure: the swarm's generation, for Multiresolution. */
  caption?: ReactNode
  onAccept: (navigation: Navigation) => void
  /** The canvas. */
  children: ReactNode
}

/**
 * One of the two frames. The frame itself is the control that accepts the plan: a single button
 * around the drawing, with no extra button beside it.
 */
export function RoutePane(props: RoutePaneProps) {
  const { navigation, selected } = props
  return (
    <figure className={`route-compare__pane route-compare__pane--${navigation}`} data-selected={selected ? 'true' : undefined}>
      <button
        type="button"
        className="route-compare__frame"
        aria-pressed={selected}
        aria-label={props.acceptLabel}
        onClick={() => props.onAccept(navigation)}
      >
        {props.children}
        {selected ? <span className="route-compare__badge">{props.acceptedLabel}</span> : null}
      </button>
      <figcaption className="route-compare__caption">
        <strong className="route-compare__name">{props.name}</strong>
        <span className="route-compare__reads">{props.reads}</span>
        {props.caption}
        <span className="route-compare__now">{props.progressLine}</span>
      </figcaption>
    </figure>
  )
}

/** One-pixel-per-cell images, kept per pixel array so a frame of the animation only draws, never rebuilds. */
const groundCanvases = new WeakMap<Uint8ClampedArray, HTMLCanvasElement>()

function groundCanvas(pixels: Uint8ClampedArray, n: number): HTMLCanvasElement {
  let canvas = groundCanvases.get(pixels)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = n
    canvas.height = n
    // A fresh buffer: ImageData does not take a view over a shared one on every browser.
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), n, n), 0, 0)
    groundCanvases.set(pixels, canvas)
  }
  return canvas
}

export interface PaneCanvasProps {
  pixels: Uint8ClampedArray
  n: number
  /** Everything `drawPane` needs except the ground image. */
  input: Omit<PaneInput, 'ground'>
  label: string
}

/** Draws on every render: the parent re-renders once per frame of the animation. */
export function PaneCanvas({ pixels, n, input, label }: PaneCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) drawPane(ctx, { ...input, ground: groundCanvas(pixels, n) })
  })
  return <canvas ref={ref} className="route-compare__canvas" width={CANVAS_PX} height={CANVAS_PX} role="img" aria-label={label} />
}
