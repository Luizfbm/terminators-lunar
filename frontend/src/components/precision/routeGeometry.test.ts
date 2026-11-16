import { describe, expect, it } from 'vitest'
import example from '../../../../contract/examples/route-plan.example.json'
import { routeGeometry } from './routeGeometry'
import type { RouteResponse } from './routeApi'

const answer = example.value as RouteResponse

describe('native route rendering', () => {
  it('places every path point on its matching mesh vertex without vertical exaggeration', () => {
    const data = routeGeometry(answer)!
    expect(data.positions.length).toBe(27)
    expect(data.indices.length).toBe(24)
    answer.points.forEach((point, index) => {
      const vertex = (point.row * 3 + point.column) * 3
      expect(data.route[index]).toEqual(Array.from(data.positions.slice(vertex, vertex + 3)))
    })
    const [a,b] = data.route
    expect(Math.hypot(...a.map((value,index) => value - b[index]))).toBeCloseTo(20, 3)
  })
  it('rejects a path outside the measured mesh', () => {
    expect(() => routeGeometry({ ...answer, points: [{ ...answer.points[0], row: 99 }] })).toThrow('outside native terrain')
  })
  it('leaves an invalid DEM unavailable', () => {
    expect(routeGeometry({ ...answer, terrain: { ...answer.terrain, size_px: 0 } })).toBeNull()
  })
})
