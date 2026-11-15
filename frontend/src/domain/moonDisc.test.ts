import { describe, expect, it } from 'vitest'
import { moonRadiusPx } from './moonDisc'

describe('moonRadiusPx', () => {
  it('has no disc from inside the Moon, where the surface fills the picture', () => {
    expect(moonRadiusPx(1, 32, 600)).toBe(Infinity)
    expect(moonRadiusPx(0.5, 32, 600)).toBe(Infinity)
  })

  it('is the whole half-height when the limb touches the top of the picture', () => {
    // The limb is at asin(1/d) from the centre of the view: with half the field of view it just fills the height.
    const fov = 32
    const distance = 1 / Math.sin((fov * Math.PI) / 360)
    expect(moonRadiusPx(distance, fov, 600)).toBeCloseTo(300, 6)
  })

  it('shrinks as the camera goes away and grows with the stage', () => {
    expect(moonRadiusPx(10, 32, 600)).toBeLessThan(moonRadiusPx(5, 32, 600))
    expect(moonRadiusPx(5, 32, 1200)).toBeCloseTo(2 * moonRadiusPx(5, 32, 600), 9)
  })
})
