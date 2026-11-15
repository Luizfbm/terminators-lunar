// "Check in JPL Horizons": a link that lets anyone redo the Sun's and the Earth's position at the Cursor.
//
// The query is built the same way as the validation that already checks the engine against Horizons
// (validation/fetch_horizons.py), so what Horizons prints is directly comparable with the answer.
//
// Horizons API documentation: https://ssd-api.jpl.nasa.gov/doc/horizons.html
//   - base URL https://ssd.jpl.nasa.gov/api/horizons.api, `format=text` returns a readable page;
//   - COMMAND is the target body: 10 is the Sun, 399 is the Earth;
//   - EPHEM_TYPE=OBSERVER with CENTER='coord@301' is a topocentric observer on the Moon (body 301),
//     located by COORD_TYPE='GEODETIC' and SITE_COORD='east longitude (deg), latitude (deg), altitude (km)',
//     the altitude above the Moon's reference sphere (radius 1737.4 km, echoed by Horizons);
//   - TLIST is a list of single-quoted instants; TIME_TYPE=UT reads and prints them in UT;
//   - QUANTITIES=4 is "Apparent AZ & EL"; APPARENT=AIRLESS means no refraction.
// Horizons manual (site coordinates, `coord @ body`, geodetic input as east longitude, latitude, altitude in km):
//   https://ssd.jpl.nasa.gov/horizons/manual.html

export type HorizonsBody = 'sun' | 'earth'

/** Where Horizons answers. The validation fetches from the same address. */
export const HORIZONS_API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'

/** Horizons' target codes: the Sun is 10, the Earth is 399. */
const COMMAND: Record<HorizonsBody, string> = { sun: '10', earth: '399' }

export interface HorizonsObserver {
  /** The Site's latitude in degrees, north positive. */
  latitudeDeg: number
  /** The Site's longitude in degrees, east positive. */
  longitudeDeg: number
  /** The Observer height, in metres above the ground. */
  heightM: number
}

const pad = (value: number) => String(value).padStart(2, '0')

/** "2026-11-15 04:30": the minute Horizons is asked about, in UT. A TLIST instant is read to the minute. */
function horizonsInstant(ms: number): string {
  const at = new Date(ms)
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())} ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`
}

/**
 * The Horizons address that prints the body's azimuth and elevation, seen from the Site on the Moon at the
 * Observer height, at one instant (milliseconds since the epoch, read as UT to the minute).
 */
export function horizonsUrl(body: HorizonsBody, observer: HorizonsObserver, instantMs: number): string {
  const params = new URLSearchParams({
    format: 'text',
    COMMAND: COMMAND[body],
    OBJ_DATA: 'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER: 'coord@301',
    COORD_TYPE: 'GEODETIC',
    // East longitude, latitude, altitude in km: the order Horizons documents.
    SITE_COORD: `${observer.longitudeDeg},${observer.latitudeDeg},${(observer.heightM / 1000).toFixed(4)}`,
    TLIST: `'${horizonsInstant(instantMs)}'`,
    QUANTITIES: '4',
    APPARENT: 'AIRLESS',
    TIME_TYPE: 'UT',
  })
  return `${HORIZONS_API_URL}?${params.toString()}`
}
