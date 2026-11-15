import { describe, expect, it } from 'vitest'
import { belowHorizonMask } from './bodyGuide'

// A ridge 3° high to the north-east, the rest of the horizon at 0.5°.
const mask = [
  { azimuth_deg: 0, elevation_deg: 0.5 },
  { azimuth_deg: 45, elevation_deg: 3 },
  { azimuth_deg: 90, elevation_deg: 0.5 },
  { azimuth_deg: 180, elevation_deg: 0.5 },
  { azimuth_deg: 270, elevation_deg: 0.5 },
]

describe('whether a body is below the Horizon mask', () => {
  it('is below when its elevation is under the mask at its azimuth', () => {
    expect(belowHorizonMask({ azimuth_deg: 45, elevation_deg: 2 }, mask)).toBe(true)
  })

  it('is above when it clears the mask at its azimuth', () => {
    expect(belowHorizonMask({ azimuth_deg: 45, elevation_deg: 3.5 }, mask)).toBe(false)
  })

  it('judges by the mask where the body is, not by the highest ridge', () => {
    // 2° is under the 3° ridge to the north-east, but over the 0.5° horizon to the south.
    expect(belowHorizonMask({ azimuth_deg: 180, elevation_deg: 2 }, mask)).toBe(false)
  })

  it('is not below exactly on the mask', () => {
    expect(belowHorizonMask({ azimuth_deg: 180, elevation_deg: 0.5 }, mask)).toBe(false)
  })

  it('wraps through north for an azimuth past the last sample', () => {
    expect(belowHorizonMask({ azimuth_deg: 359, elevation_deg: 0.2 }, mask)).toBe(true)
    expect(belowHorizonMask({ azimuth_deg: 359, elevation_deg: 0.8 }, mask)).toBe(false)
  })

  it('keeps a Sun in a lunar eclipse above the horizon: no light left does not mean below', () => {
    // The Earth covers the Sun, so the answer's fraction is 0, but the Sun's centre is 4° up over a 3° ridge.
    const eclipsed = { azimuth_deg: 45, elevation_deg: 4, fraction: 0 }
    expect(belowHorizonMask(eclipsed, mask)).toBe(false)
  })

  it('still calls a Sun behind the ridge below, whatever its fraction says', () => {
    const dark = { azimuth_deg: 45, elevation_deg: 1, fraction: 0 }
    const lit = { azimuth_deg: 45, elevation_deg: 1, fraction: 0.6 }
    expect(belowHorizonMask(dark, mask)).toBe(true)
    expect(belowHorizonMask(lit, mask)).toBe(true)
  })
})
