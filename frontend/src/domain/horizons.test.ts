import { describe, expect, it } from 'vitest'
import { HORIZONS_API_URL, horizonsUrl } from './horizons'

// Connecting Ridge 001 at the Observer height of 2 m, the first Site of the validation against Horizons.
const site = { latitudeDeg: -89.4661, longitudeDeg: -136.949, heightM: 2 }
const at = Date.UTC(2026, 1, 15, 20, 30)

const queryOf = (url: string) => Object.fromEntries(new URL(url).searchParams)

describe('horizonsUrl', () => {
  it('asks the Sun, from a topocentric observer on the Moon, for its azimuth and elevation', () => {
    const url = horizonsUrl('sun', site, at)
    expect(url.startsWith(`${HORIZONS_API_URL}?`)).toBe(true)
    expect(queryOf(url)).toEqual({
      format: 'text',
      COMMAND: '10',
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: 'coord@301',
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: '-136.949,-89.4661,0.0020',
      TLIST: "'2026-02-15 20:30'",
      QUANTITIES: '4',
      APPARENT: 'AIRLESS',
      TIME_TYPE: 'UT',
    })
  })

  it('asks the Earth with the same observer and instant, only the target changes', () => {
    const earth = queryOf(horizonsUrl('earth', site, at))
    expect(earth.COMMAND).toBe('399')
    expect({ ...earth, COMMAND: '10' }).toEqual(queryOf(horizonsUrl('sun', site, at)))
  })

  it('is encoded the way the validation encodes its own queries', () => {
    // validation/fetch_horizons.py (urllib.parse.urlencode): same keys in the same order, same escapes.
    expect(horizonsUrl('sun', site, at)).toBe(
      'https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=10&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=OBSERVER&CENTER=coord%40301&COORD_TYPE=GEODETIC&SITE_COORD=-136.949%2C-89.4661%2C0.0020&TLIST=%272026-02-15+20%3A30%27&QUANTITIES=4&APPARENT=AIRLESS&TIME_TYPE=UT',
    )
  })

  it('writes the Observer height in kilometres', () => {
    expect(queryOf(horizonsUrl('sun', { ...site, heightM: 10 }, at)).SITE_COORD).toBe('-136.949,-89.4661,0.0100')
    expect(queryOf(horizonsUrl('sun', { ...site, heightM: 0 }, at)).SITE_COORD).toBe('-136.949,-89.4661,0.0000')
  })

  it('puts east longitude first and keeps the signs as the Site has them', () => {
    expect(queryOf(horizonsUrl('sun', { latitudeDeg: -85.416, longitudeDeg: 31.8506, heightM: 2 }, at)).SITE_COORD).toBe('31.8506,-85.416,0.0020')
  })

  it('reads the instant in UT to the minute, with zeros padded', () => {
    expect(queryOf(horizonsUrl('sun', site, Date.UTC(2027, 0, 5, 3, 7, 59))).TLIST).toBe("'2027-01-05 03:07'")
    expect(queryOf(horizonsUrl('sun', site, Date.UTC(2025, 11, 31, 23, 59))).TLIST).toBe("'2025-12-31 23:59'")
  })
})
