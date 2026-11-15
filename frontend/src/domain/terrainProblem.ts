/**
 * Why `/terrain` answered 422, read from the problem document the contract defines (`code` and
 * `detail`). Both causes carry the code `outside_coverage`, so the `detail` is the only field that
 * tells them apart: "The DEM is too coarse for this radius: no cell centre of LDEM_128 (236.9 m)
 * lies within 100 m." against "No DEM covers 100 m around this Site (...)".
 */

export type TerrainProblem =
  /** The DEM that covers the Site has no pixel centre inside the radius; `resolutionM` is its pixel, when the detail names it. */
  | { kind: 'too_coarse'; resolutionM: number | null }
  /** No DEM reaches the Site (or its radius) at all. */
  | { kind: 'no_dem' }
  /** Any other problem: the panel's generic error handling applies. */
  | { kind: 'other' }

const TOO_COARSE = /too coarse/i
/** The pixel the engine names in parentheses, in metres: "(236.9 m)". */
const PIXEL = /\((\d+(?:\.\d+)?)\s*m\)/

export function terrainProblem(code: string, detail: string | undefined): TerrainProblem {
  if (code !== 'outside_coverage') return { kind: 'other' }
  if (detail === undefined || !TOO_COARSE.test(detail)) return { kind: 'no_dem' }
  const pixel = PIXEL.exec(detail)
  const resolutionM = pixel ? Number(pixel[1]) : null
  return { kind: 'too_coarse', resolutionM: resolutionM !== null && Number.isFinite(resolutionM) ? resolutionM : null }
}
