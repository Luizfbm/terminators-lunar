import { describe, expect, it } from 'vitest'
import { chosenGlobeSite, customKey } from './chosenSite'

const CR01 = { id: 'CR01', name: 'Connecting Ridge CR01', latitude_deg: -89.45, longitude_deg: -137.3, region_id: 'CR' }
const HW01 = { id: 'HW01', name: 'Haworth HW01', latitude_deg: -87.2, longitude_deg: -5, region_id: 'HW' }
const SITES = [CR01, HW01]
const named = (point: { latitude_deg: number; longitude_deg: number }) => `Custom Site (${point.latitude_deg}, ${point.longitude_deg})`

describe('the Site the globe marks (the requirement)', () => {
  it('is the Site asked for at once, while the answer on screen is still about the last one', () => {
    // during a regression, before the implementation: the ring and the camera followed the answer, so a click on another
    // Site left both on the old one until the server had answered.
    expect(chosenGlobeSite('HW01', SITES, 'CR01', CR01, false, named)).toBe(HW01)
  })

  it('is the default Site when none is asked for', () => {
    expect(chosenGlobeSite(null, SITES, 'HW01', CR01, false, named)).toBe(HW01)
  })

  it('is a typed point at once, keyed by its coordinate and named for the screen', () => {
    const point = chosenGlobeSite({ latitudeDeg: -89.6, longitudeDeg: 0 }, SITES, 'CR01', CR01, false, named)
    expect(point).toEqual({ latitude_deg: -89.6, longitude_deg: 0, id: 'custom:-89.6,0', name: 'Custom Site (-89.6, 0)' })
  })

  it("keeps the answer's own name once the answer for that point is on screen", () => {
    const answered = { id: 'custom', name: 'Ponto personalizado', latitude_deg: -89.6, longitude_deg: 0 }
    expect(chosenGlobeSite({ latitudeDeg: -89.6, longitudeDeg: 0 }, SITES, 'CR01', answered, true, named)).toEqual({
      ...answered,
      id: customKey(answered),
    })
  })

  it('falls back to the answered Site while the list of Sites is still on its way', () => {
    expect(chosenGlobeSite('HW01', [], 'CR01', CR01, false, named)).toBe(CR01)
  })

  it('with nothing on its way is the Site of the answer on screen, even when the default in the list is another', () => {
    // Validation check: the mock answers the default Query (001) with its CR01 example.
    // The ring showed 001 from the list while the numbers were about CR01, and the picker's first
    // "other" Site was CR01, the one already answered, so a click on it changed nothing.
    const DEFAULT = { id: '001', name: 'Connecting Ridge (NASA site 001)', latitude_deg: -89.4661, longitude_deg: -136.949 }
    expect(chosenGlobeSite(null, [DEFAULT, HW01], '001', CR01, false, named, false)).toBe(CR01)
    // Asking for another Site still moves the ring at once.
    expect(chosenGlobeSite('HW01', [DEFAULT, HW01], '001', CR01, false, named, true)).toBe(HW01)
  })
})
