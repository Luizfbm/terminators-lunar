import { describe, expect, it } from 'vitest'
import { capLatLon, capPoint, isCapProjection } from './cap'

// The numbers of the published south_cap.json (PGDA product 90, LDEM_80S_80MPP_ADJ).
const CAP = { sphere_radius_m: 1_737_400, size_px: 4096, x_min_m: -304_000, y_max_m: 304_000, metres_per_pixel: 148.4375 }

describe('the south-pole cap', () => {
  it('has the pole at its centre', () => {
    const centre = capPoint(CAP, CAP.size_px / 2, CAP.size_px / 2)
    expect(centre).toEqual({ x: 0, y: 0 })
    expect(capLatLon(centre.x, centre.y, CAP.sphere_radius_m).latitude_deg).toBeCloseTo(-90, 9)
  })

  it('reaches the latitude the file states at the middle of a side', () => {
    // south_cap.json: edge_latitude_deg_at_side_midpoints = -80.0002, computed by the script that built it.
    const top = capPoint(CAP, CAP.size_px / 2, 0)
    expect(capLatLon(top.x, top.y, CAP.sphere_radius_m).latitude_deg).toBeCloseTo(-80.0002, 4)
  })

  it('points 0° up, 90°E right, 180° down and 90°W left', () => {
    const lon = (x: number, y: number) => capLatLon(x, y, CAP.sphere_radius_m).longitude_deg
    expect(lon(0, 1000)).toBeCloseTo(0, 9)
    expect(lon(1000, 0)).toBeCloseTo(90, 9)
    expect(Math.abs(lon(0, -1000))).toBeCloseTo(180, 9)
    expect(lon(-1000, 0)).toBeCloseTo(-90, 9)
  })

  it('puts Site 001 on the pixel its coordinates give by the stereographic formula', () => {
    // Connecting Ridge 001: 89.4661°S 136.949°W. rho = 2R tan(45° + lat/2), x = rho sin(lon), y = rho cos(lon).
    const rho = 2 * CAP.sphere_radius_m * Math.tan(((45 - 89.4661 / 2) * Math.PI) / 180)
    const x = rho * Math.sin((-136.949 * Math.PI) / 180)
    const y = rho * Math.cos((-136.949 * Math.PI) / 180)
    const back = capLatLon(x, y, CAP.sphere_radius_m)
    expect(back.latitude_deg).toBeCloseTo(-89.4661, 6)
    expect(back.longitude_deg).toBeCloseTo(-136.949, 6)
  })

  it('accepts only a document with every number', () => {
    expect(isCapProjection(CAP)).toBe(true)
    expect(isCapProjection({ ...CAP, metres_per_pixel: '148' })).toBe(false)
    expect(isCapProjection('<!doctype html>')).toBe(false)
    expect(isCapProjection(null)).toBe(false)
  })
})
