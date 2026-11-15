import { useMemo } from 'react'
import { centreOf, type WalkGrid } from './terrain'
import type { MapView } from './mapView'
import type { Navigation, PlanePoint, RouteWaypoint } from './types'
import type { WalkState } from './walk'

/**
 * The flat map of the drive: both routes, the goal, the rays, the trail and the rover, seen from
 * above, with the blocks steeper than the Rover's limit shaded. It sits as an inset over the 3D
 * view, and is the whole stage where the browser cannot draw 3D.
 */
export function PlanMap({
  grid,
  view,
  slopeLimitDeg,
  routes,
  accepted,
  goal,
  rays,
  state,
  label,
}: {
  grid: WalkGrid
  view: MapView
  slopeLimitDeg: number
  routes: Record<Navigation, RouteWaypoint[]>
  accepted: Navigation
  goal: PlanePoint
  rays: PlanePoint[]
  state: WalkState
  label: string
}) {
  // The steep blocks inside the view: a few hundred rectangles, set once.
  const steep = useMemo(() => {
    const out: { x: number; y: number }[] = []
    for (let row = 0; row < grid.n; row++) {
      for (let col = 0; col < grid.n; col++) {
        if (grid.slope5Deg[row * grid.n + col] <= slopeLimitDeg) continue
        const { x, y } = centreOf(grid, row, col)
        if (x < view.minX - grid.cellM || x > view.minX + view.size + grid.cellM) continue
        if (y < view.minY - grid.cellM || y > view.minY + view.size + grid.cellM) continue
        out.push({ x: x - grid.cellM / 2, y: -(y + grid.cellM / 2) })
      }
    }
    return out
  }, [grid, view, slopeLimitDeg])
  const line = (path: RouteWaypoint[]) => path.map((point) => `${point.x_m.toFixed(1)},${(-point.y_m).toFixed(1)}`).join(' ')
  const trail = state.trail.map((point) => `${point.x_m.toFixed(1)},${(-point.y_m).toFixed(1)}`).join(' ')
  const unit = view.size / 100
  return (
    <svg className="walk-map" viewBox={`${view.minX} ${-(view.minY + view.size)} ${view.size} ${view.size}`} role="img" aria-label={label}>
      <rect className="walk-map__ground" x={view.minX} y={-(view.minY + view.size)} width={view.size} height={view.size} />
      {steep.map((cell) => (
        <rect key={`${cell.x}:${cell.y}`} className="walk-map__steep" x={cell.x} y={cell.y} width={grid.cellM} height={grid.cellM} />
      ))}
      {(['normal', 'multiresolution'] as const).map((navigation) => (
        <polyline
          key={navigation}
          className={`walk-map__route walk-map__route--${navigation}${navigation === accepted ? ' walk-map__route--on' : ''}`}
          points={line(routes[navigation])}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <polyline className="walk-map__trail" points={trail} vectorEffect="non-scaling-stroke" />
      {rays.map((ray, index) =>
        state.collected.includes(index) ? null : (
          <circle key={index} className="walk-map__ray" cx={ray.x_m} cy={-ray.y_m} r={unit * 1.1} />
        ),
      )}
      <circle className="walk-map__goal" cx={goal.x_m} cy={-goal.y_m} r={unit * 1.8} />
      <g transform={`translate(${state.x} ${-state.y}) rotate(${state.headingDeg})`}>
        <polygon className="walk-map__rover" points={`0,${-unit * 3} ${unit * 1.9},${unit * 2.2} ${-unit * 1.9},${unit * 2.2}`} />
      </g>
    </svg>
  )
}
