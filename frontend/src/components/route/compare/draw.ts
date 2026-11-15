import { planFrame, swarmFrame, zoomAt, type SwarmFrame } from './frames'
import { sourceRect, toPixel, type Crop } from './view'
import type { GroundGrid } from './grid'
import type { PlanePoint, RoutePlan, Swarm } from './types'

/**
 * Canvas drawing of one pane, ported from Eduardo's `drawPane` in `route_sim_v18.js`. It only draws
 * what the API sent: the planned path, the swarm's agents and the sunlit spots. The colours are the
 * app's own tokens (a Sun spot is amber, a fall or a hazard is the error tone) and the two plans differ
 * by line style as well as by tone, so neither depends on colour alone.
 */

const FG = '#e9e7e2'
const HATCH = '#c4c5cb'
const ERROR = '#ff7b72'
const SUN = '#f5bd3a'

export interface PaneStyle {
  /** The colour of the path and of the Rover. */
  line: string
  /** Dashed path, to tell Normal navigation from Multiresolution without colour. */
  dashed: boolean
  /** Draws the shield's arc in front of the Rover (Multiresolution only). */
  shield: boolean
}

export const NORMAL_STYLE: PaneStyle = { line: HATCH, dashed: true, shield: false }
export const MULTIRESOLUTION_STYLE: PaneStyle = { line: FG, dashed: false, shield: true }

export interface PaneInput {
  /** One pixel per grid cell, already coloured (see `renderGround`). */
  ground: CanvasImageSource
  grid: Pick<GroundGrid, 'halfM' | 'cellM'>
  crop: Crop
  start: PlanePoint
  goal: PlanePoint
  plan: RoutePlan
  style: PaneStyle
  /** The tag by the Rover, such as "Normal navigation". */
  label: string
  progress: number
  /** The illustration of the search, with its frame; drawn under the path. */
  swarm?: { data: Swarm; frame: SwarmFrame }
  /** Sunlit-facing spots, for the animation only. */
  solarPoints?: readonly PlanePoint[]
}

function cross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x - r, y - r)
  ctx.lineTo(x + r, y + r)
  ctx.moveTo(x + r, y - r)
  ctx.lineTo(x - r, y + r)
  ctx.stroke()
}

function polyline(ctx: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]) {
  ctx.beginPath()
  points.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
  ctx.stroke()
}

function drawRover(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, heading: number, color: string, tag: string, shield: boolean) {
  if (shield) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(at.x, at.y)
    ctx.arc(at.x, at.y, 20, heading - Math.PI / 2 - 0.65, heading - Math.PI / 2 + 0.65)
    ctx.closePath()
    ctx.fillStyle = 'rgba(233, 231, 226, 0.16)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(233, 231, 226, 0.8)'
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.restore()
  }
  ctx.save()
  ctx.translate(at.x, at.y)
  ctx.rotate(heading)
  ctx.fillStyle = color
  ctx.strokeStyle = '#08090a'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(0, -7)
  ctx.lineTo(5.5, 5)
  ctx.lineTo(0, 2.5)
  ctx.lineTo(-5.5, 5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  ctx.font = '700 10px system-ui, sans-serif'
  const width = ctx.measureText(tag).width + 10
  const bx = Math.max(4, Math.min(ctx.canvas.width - width - 4, at.x - width / 2))
  const by = Math.max(4, at.y - 24)
  ctx.fillStyle = 'rgba(8, 9, 10, 0.9)'
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.fillRect(bx, by, width, 15)
  ctx.strokeRect(bx, by, width, 15)
  ctx.fillStyle = FG
  ctx.fillText(tag, bx + 5, by + 11)
}

function drawSwarm(ctx: CanvasRenderingContext2D, to: (p: readonly number[]) => { x: number; y: number }, color: string, swarm: { data: Swarm; frame: SwarmFrame }) {
  const { data, frame } = swarm
  // The generations before this one stay as faint trails.
  ctx.lineWidth = 0.9
  ctx.strokeStyle = 'rgba(233, 231, 226, 0.14)'
  for (const g of frame.earlier) {
    const agents = data.generations[g].agents
    for (let i = 0; i < agents.length; i += 2) polyline(ctx, agents[i].path.map(to))
  }
  // Trails of up to 14 agents still on their way, or home.
  const live = data.generations[frame.generation - 1]?.agents ?? []
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.28
  let trails = 0
  for (let i = 0; i < frame.agents.length && trails < 14; i++) {
    if (frame.agents[i].state === 'fallen' || frame.agents[i].index < 1) continue
    polyline(ctx, live[i].path.slice(0, frame.agents[i].index + 1).map(to))
    trails++
  }
  ctx.globalAlpha = 1
  for (const agent of frame.agents) {
    const at = to([agent.x_m, agent.y_m])
    if (agent.state === 'fallen') {
      ctx.strokeStyle = ERROR
      ctx.globalAlpha = frame.settled ? 0.42 : 0.85
      ctx.lineWidth = 1.4
      cross(ctx, at.x, at.y, 3)
      ctx.globalAlpha = 1
    } else if (agent.state === 'arrived') {
      ctx.fillStyle = FG
      ctx.beginPath()
      ctx.arc(at.x, at.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.save()
      ctx.translate(at.x, at.y)
      // The plane has +y up the screen, the canvas down it.
      ctx.rotate(-agent.heading)
      ctx.fillStyle = color
      ctx.globalAlpha = 0.85
      ctx.fillRect(-3.5, -2, 7, 4)
      ctx.restore()
    }
  }
}

/** Draws one pane at `progress` (0 to 1). */
export function drawPane(ctx: CanvasRenderingContext2D, input: PaneInput): void {
  const { crop, plan, style, progress } = input
  const size = ctx.canvas.width
  const to = (point: PlanePoint | readonly number[]) => toPixel(crop, size, point)
  ctx.clearRect(0, 0, size, size)

  // The zoom-out: from 2.4x on the start to the whole crop.
  const { zoom, ease } = zoomAt(progress)
  const startPx = to(input.start)
  ctx.save()
  if (zoom > 1.001) {
    const focusX = startPx.x + (size / 2 - startPx.x) * ease
    const focusY = startPx.y + (size / 2 - startPx.y) * ease
    ctx.translate(size / 2, size / 2)
    ctx.scale(zoom, zoom)
    ctx.translate(-focusX, -focusY)
  }

  const { sx, sy, size: cells } = sourceRect(crop, input.grid)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(input.ground, sx, sy, cells, cells, 0, 0, size, size)

  ctx.strokeStyle = 'rgba(233, 231, 226, 0.1)'
  ctx.lineWidth = 1
  for (let x = 55; x < size; x += 55) polyline(ctx, [{ x, y: 0 }, { x, y: size }])
  for (let y = 55; y < size; y += 55) polyline(ctx, [{ x: 0, y }, { x: size, y }])

  const goalPx = to(input.goal)
  ctx.setLineDash([5, 5])
  ctx.strokeStyle = 'rgba(233, 231, 226, 0.25)'
  ctx.lineWidth = 1.2
  polyline(ctx, [startPx, goalPx])
  ctx.setLineDash([])

  if (input.swarm) drawSwarm(ctx, to, style.line, input.swarm)

  for (const spot of input.solarPoints ?? []) {
    const at = to(spot)
    ctx.fillStyle = SUN
    ctx.beginPath()
    ctx.moveTo(at.x, at.y - 4)
    ctx.lineTo(at.x + 3, at.y)
    ctx.lineTo(at.x, at.y + 4)
    ctx.lineTo(at.x - 3, at.y)
    ctx.closePath()
    ctx.fill()
  }

  // Start and goal.
  ctx.fillStyle = FG
  ctx.beginPath()
  ctx.arc(startPx.x, startPx.y, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = FG
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(goalPx.x, goalPx.y, 7, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(goalPx.x, goalPx.y, 2.5, 0, Math.PI * 2)
  ctx.fill()

  const frame = planFrame(plan, progress)
  const points = plan.path.map(to)
  if (points.length > 1) {
    // The whole planned path, faint, then what the Rover has driven.
    ctx.strokeStyle = style.line
    ctx.globalAlpha = 0.3
    ctx.lineWidth = 1.6
    ctx.setLineDash(style.dashed ? [6, 4] : [])
    polyline(ctx, points)
    ctx.globalAlpha = 1
    ctx.lineWidth = 2.8
    polyline(ctx, points.slice(0, frame.index + 1))
    ctx.setLineDash([])

    for (let i = 0; i <= frame.index; i++) {
      const waypoint = plan.path[i]
      if (waypoint.hazard) {
        ctx.strokeStyle = ERROR
        ctx.lineWidth = 2
        cross(ctx, points[i].x, points[i].y, 4)
      } else if (waypoint.veto) {
        ctx.strokeStyle = FG
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(points[i].x, points[i].y, 3, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    const here = points[frame.index]
    const before = points[Math.max(0, frame.index - 1)]
    // The arrow points up at 0, so a step to the right is a quarter turn.
    const heading = Math.atan2(here.y - before.y, here.x - before.x) + Math.PI / 2
    const tag = `${input.label} · ${Math.round(frame.batteryFraction * 100)}%`
    drawRover(ctx, here, heading, style.line, tag, style.shield)
  }
  ctx.restore()
}

/** The swarm frame for a pane that has one, or undefined when the route came without a swarm. */
export function swarmOf(swarm: Swarm | null, progress: number): { data: Swarm; frame: SwarmFrame } | undefined {
  if (!swarm) return undefined
  const frame = swarmFrame(swarm, progress)
  return frame ? { data: swarm, frame } : undefined
}
