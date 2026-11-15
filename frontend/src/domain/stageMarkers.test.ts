import { describe, expect, it } from 'vitest'
import { bodyMarker, moonRadiusPx, type StageBox } from './stageMarkers'

const stage: StageBox = { width: 1000, height: 800, inset: { top: 50, right: 20, bottom: 60, left: 20 } }
const centre = { x: 500, y: 400 }

describe('the marker of a far body on the stage', () => {
  it('sits on the ring, on the side where the body lies', () => {
    expect(bodyMarker(1, 0, centre, 300, stage)).toEqual({ x: 800, y: 400 })
    expect(bodyMarker(-1, 0, centre, 300, stage)).toEqual({ x: 200, y: 400 })
    // Up on the camera is up on the screen, where y is smaller.
    expect(bodyMarker(0, 1, centre, 300, stage)).toEqual({ x: 500, y: 100 })
    expect(bodyMarker(0, -1, centre, 300, stage)).toEqual({ x: 500, y: 700 })
  })

  it('only takes the direction: a body half behind the Moon is marked on the same side', () => {
    const full = bodyMarker(0.6, 0.8, centre, 100, stage)!
    const faint = bodyMarker(0.06, 0.08, centre, 100, stage)!
    expect(faint.x).toBeCloseTo(full.x, 9)
    expect(faint.y).toBeCloseTo(full.y, 9)
    expect(Math.hypot(full.x - 500, full.y - 400)).toBeCloseTo(100, 9)
  })

  it('stops at the edge of the kept area when the ring runs off the stage', () => {
    expect(bodyMarker(1, 0, centre, 5000, stage)).toEqual({ x: 980, y: 400 })
    expect(bodyMarker(0, 1, centre, 5000, stage)).toEqual({ x: 500, y: 50 })
    expect(bodyMarker(0, -1, centre, 5000, stage)).toEqual({ x: 500, y: 740 })
    // Towards a corner it stops at whichever edge comes first, still on the line from the centre.
    const corner = bodyMarker(1, 1, centre, 5000, stage)!
    expect(corner.y).toBeCloseTo(50, 9)
    expect(corner.x).toBeCloseTo(850, 9)
  })

  it('is always inside the kept area, wherever the Moon is drawn', () => {
    for (const where of [{ x: -300, y: 400 }, { x: 500, y: 2000 }, { x: 990, y: 10 }]) {
      for (const [across, up] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, -0.7]]) {
        const marker = bodyMarker(across, up, where, 400, stage)!
        expect(marker.x).toBeGreaterThanOrEqual(20)
        expect(marker.x).toBeLessThanOrEqual(980)
        expect(marker.y).toBeGreaterThanOrEqual(50)
        expect(marker.y).toBeLessThanOrEqual(740)
      }
    }
  })

  it('has no place when the body is straight ahead or straight behind', () => {
    expect(bodyMarker(0.01, -0.02, centre, 300, stage)).toBeNull()
    expect(bodyMarker(0, 0, centre, 300, stage)).toBeNull()
  })
})

describe('how big the Moon is drawn', () => {
  it('fills half the height when its limb is at the edge of the field of view', () => {
    // A camera at 1 / sin(16°) radii sees the limb 16° off axis: the edge of a 32° field.
    expect(moonRadiusPx(1 / Math.sin((16 * Math.PI) / 180), 32, 800)).toBeCloseTo(400, 6)
  })

  it('shrinks with distance, and has no edge from the surface', () => {
    expect(moonRadiusPx(6, 32, 800)).toBeLessThan(moonRadiusPx(3, 32, 800))
    expect(moonRadiusPx(1, 32, 800)).toBe(Infinity)
  })
})
