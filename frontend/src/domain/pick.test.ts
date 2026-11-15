import { describe, expect, it } from 'vitest'
import { bubbleOnLeft, landPlace, latLonOfVector } from './pick'
import { toVector } from './sky'

describe('the point of the globe under the cursor', () => {
  it('gives back the latitude and longitude a vector was made from, all round the Moon', () => {
    for (const lat of [-89.9, -84.79, -45, 0, 0.67, 30, 89.9]) {
      for (const lon of [-179.5, -90, -17.5, 0, 23.47, 90, 179.5]) {
        const [x, y, z] = toVector(lat, lon)
        const back = latLonOfVector(x * 1.37, y * 1.37, z * 1.37)
        expect(back.latitude_deg).toBeCloseTo(lat, 9)
        expect(back.longitude_deg).toBeCloseTo(lon, 9)
      }
    }
  })

  it('rounds the place to a thousandth of a degree and names the Site only when there is one', () => {
    expect(landPlace({ latitude_deg: -84.79061234, longitude_deg: 29.19569 })).toEqual({ lat: -84.791, lon: 29.196 })
    expect(landPlace({ latitude_deg: -84.7906, longitude_deg: 29.1957 }, 'IM2')).toEqual({ lat: -84.791, lon: 29.196, siteId: 'IM2' })
  })

  it('turns the bubble to the left when it would not fit on the right of the dot', () => {
    expect(bubbleOnLeft(500, 20, 120, 1000)).toBe(false)
    expect(bubbleOnLeft(900, 20, 120, 1000)).toBe(true)
    expect(bubbleOnLeft(845, 20, 120, 1000)).toBe(false)
    expect(bubbleOnLeft(846, 20, 120, 1000)).toBe(true)
  })
})
