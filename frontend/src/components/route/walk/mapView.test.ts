import { describe, expect, it } from 'vitest'
import { mapView } from './mapView'

describe('mapView', () => {
  const half = 5000

  it('holds both ends of a drive with a margin', () => {
    const view = mapView(half, [{ x_m: 600, y_m: 1100 }, { x_m: 2000, y_m: 2250 }], [])
    expect(view.size).toBeCloseTo(1400 * 1.3, 6)
    expect(view.minX).toBeLessThan(600)
    expect(view.minX + view.size).toBeGreaterThan(2000)
    expect(view.minY).toBeLessThan(1100)
    expect(view.minY + view.size).toBeGreaterThan(2250)
  })

  it('is never smaller than 1.5 km', () => {
    expect(mapView(half, [{ x_m: 0, y_m: 0 }], []).size).toBe(1500)
  })

  it('stays inside the grid', () => {
    const view = mapView(half, [{ x_m: 4900, y_m: -4900 }, { x_m: 4000, y_m: -4000 }], [])
    expect(view.minX + view.size).toBeLessThanOrEqual(half + 1e-9)
    expect(view.minY).toBeGreaterThanOrEqual(-half)
  })

  it('shows the whole grid when there is nothing to show', () => {
    expect(mapView(half, [], [])).toEqual({ minX: -half, minY: -half, size: 2 * half })
  })
})
