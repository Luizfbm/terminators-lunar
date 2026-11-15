import { describe, expect, it } from 'vitest'
import { latitudeCircle, POLAR_CIRCLE_LATITUDE, polarCircleShown } from './latitudeCircle'
import { toVector } from './sky'

/** The latitude, in degrees, of a point of the unit sphere. */
const latitudeOf = (point: readonly [number, number, number]) => (Math.asin(point[1] / Math.hypot(...point)) * 180) / Math.PI

describe('the circle of latitude round the south pole', () => {
  const circle = latitudeCircle(POLAR_CIRCLE_LATITUDE)

  it('is at 84°S', () => {
    expect(POLAR_CIRCLE_LATITUDE).toBe(-84)
  })

  it('has every vertex at that latitude, to 0.01°, on the same sphere the globe and the Sites are placed on', () => {
    for (const vertex of circle) expect(Math.abs(latitudeOf(toVector(vertex.latitude_deg, vertex.longitude_deg)) - POLAR_CIRCLE_LATITUDE)).toBeLessThan(0.01)
  })

  it('goes all the way round, every degree of longitude, and closes on itself', () => {
    expect(circle).toHaveLength(361)
    expect(circle[0].longitude_deg).toBe(0)
    expect(circle[360].longitude_deg).toBe(360)
    expect(circle[1].longitude_deg - circle[0].longitude_deg).toBe(1)
  })

  it('has IM-2 Athena (84.7906°S) inside it, 0.79° from the line, and leaves 85° and 87.5° out of the question', () => {
    const athena = -84.7906
    expect(athena).toBeLessThan(POLAR_CIRCLE_LATITUDE)
    expect(Math.abs(athena - POLAR_CIRCLE_LATITUDE)).toBeCloseTo(0.79, 2)
    // A circle at 85° would leave Athena outside it: that is why it is 84°.
    expect(athena).toBeGreaterThan(-85)
  })

  it('is drawn from orbit, and hidden below 150 km of height, as when landed or close to the ground', () => {
    expect(polarCircleShown(3.4)).toBe(true)
    expect(polarCircleShown(1 + 150 / 1737.4)).toBe(true)
    expect(polarCircleShown(1.04)).toBe(false)
    expect(polarCircleShown(1)).toBe(false)
  })
})
