import { describe, expect, it } from 'vitest'
import { bodyPlace, bodySizes, moonRadiusPx, type Rect, type StageBox } from './stageBodies'

const stage: StageBox = { width: 1000, height: 800, inset: { top: 50, right: 20, bottom: 60, left: 20 } }
const centre = { x: 500, y: 400 }

describe('the place of a far body on the stage', () => {
  it('sits on the ring, on the side where the body lies', () => {
    const right = bodyPlace(1, 0, centre, 300, 0, stage)!
    expect([right.x, right.y]).toEqual([800, 400])
    const left = bodyPlace(-1, 0, centre, 300, 0, stage)!
    expect(left.x).toBeCloseTo(200, 9)
    expect(left.y).toBeCloseTo(400, 9)
    // Up on the camera is up on the screen, where y is smaller.
    const above = bodyPlace(0, 1, centre, 300, 0, stage)!
    expect(above.x).toBeCloseTo(500, 9)
    expect(above.y).toBeCloseTo(100, 9)
    const below = bodyPlace(0, -1, centre, 300, 0, stage)!
    expect(below.x).toBeCloseTo(500, 9)
    expect(below.y).toBeCloseTo(700, 9)
  })

  it('only takes the direction: a body half behind the Moon is placed on the same side', () => {
    const full = bodyPlace(0.6, 0.8, centre, 100, 0, stage)!
    const faint = bodyPlace(0.06, 0.08, centre, 100, 0, stage)!
    expect(faint.x).toBeCloseTo(full.x, 9)
    expect(faint.y).toBeCloseTo(full.y, 9)
    expect(Math.hypot(full.x - 500, full.y - 400)).toBeCloseTo(100, 9)
  })

  it('stops at the edge of the kept area when the ring runs off the stage', () => {
    const edge = bodyPlace(1, 0, centre, 5000, 0, stage)!
    expect(edge.x).toBeCloseTo(980, 9)
    expect(edge.y).toBeCloseTo(400, 9)
    const top = bodyPlace(0, 1, centre, 5000, 0, stage)!
    expect(top.y).toBeCloseTo(50, 9)
    const bottom = bodyPlace(0, -1, centre, 5000, 0, stage)!
    expect(bottom.y).toBeCloseTo(740, 9)
    // Towards a corner it stops at whichever edge comes first, still on the line from the centre.
    const corner = bodyPlace(1, 1, centre, 5000, 0, stage)!
    expect(corner.y).toBeCloseTo(50, 9)
    expect(corner.x).toBeCloseTo(850, 9)
  })

  it('keeps the whole body inside the kept area, wherever the Moon is drawn', () => {
    for (const where of [{ x: -300, y: 400 }, { x: 500, y: 2000 }, { x: 990, y: 10 }]) {
      for (const [across, up] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, -0.7]]) {
        const place = bodyPlace(across, up, where, 400, 20, stage)!
        expect(place.x - 20).toBeGreaterThanOrEqual(20 - 1e-9)
        expect(place.x + 20).toBeLessThanOrEqual(980 + 1e-9)
        expect(place.y - 20).toBeGreaterThanOrEqual(50 - 1e-9)
        expect(place.y + 20).toBeLessThanOrEqual(740 + 1e-9)
      }
    }
  })

  it('has no place when the body is straight ahead or straight behind', () => {
    expect(bodyPlace(0.01, -0.02, centre, 300, 10, stage)).toBeNull()
    expect(bodyPlace(0, 0, centre, 300, 10, stage)).toBeNull()
  })

  it('moves round the ring to clear what it must not cover, by as little as it can', () => {
    // The chosen Site's name is right where the body would be, on the right.
    const name: Rect = { left: 770, top: 385, right: 880, bottom: 415 }
    const place = bodyPlace(1, 0, centre, 300, 12, stage, [name])!
    // Still on the right of the Moon, turned a little off due east, and not on the name.
    expect(place.x).toBeGreaterThan(centre.x)
    expect(place.y).not.toBeCloseTo(400, 0)
    const nearestX = Math.min(name.right, Math.max(name.left, place.x))
    const nearestY = Math.min(name.bottom, Math.max(name.top, place.y))
    expect(Math.hypot(place.x - nearestX, place.y - nearestY)).toBeGreaterThanOrEqual(12)
    // A clear way is not turned at all.
    const elsewhere: Rect = { left: 100, top: 100, right: 200, bottom: 130 }
    const unmoved = bodyPlace(1, 0, centre, 300, 12, stage, [elsewhere])!
    expect([unmoved.x, unmoved.y]).toEqual([800, 400])
  })

  it('keeps clear of the other body too, so the Sun and the Earth never sit on each other', () => {
    const sun = bodyPlace(1, 0, centre, 300, 9, stage)!
    const box: Rect = { left: sun.x - 24, top: sun.y - 24, right: sun.x + 24, bottom: sun.y + 24 }
    const earth = bodyPlace(1, 0, centre, 300, 20, stage, [box])!
    expect(Math.hypot(earth.x - sun.x, earth.y - sun.y)).toBeGreaterThan(40)
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

describe('how big the Sun and the Earth are drawn', () => {
  it('draws the Earth bigger than the Sun, at every size of stage', () => {
    for (const side of [300, 375, 600, 900, 1400]) {
      const { sun, earth } = bodySizes(side)
      expect(earth).toBeGreaterThan(sun)
    }
  })

  it('stays readable on a phone and does not swell on a wide screen', () => {
    expect(bodySizes(200).sun).toBeGreaterThanOrEqual(6)
    expect(bodySizes(200).earth).toBeGreaterThanOrEqual(12)
    expect(bodySizes(5000).sun).toBeLessThanOrEqual(12)
    expect(bodySizes(5000).earth).toBeLessThanOrEqual(24)
  })
})
