/**
 * Why `/terrain` answered 422, read from the problem document the contract defines. The `code`
 * tells the causes apart: `dem_too_coarse` when the DEM that covers the Site has no cell centre
 * inside the radius, `outside_coverage` when no DEM covers it. The `detail` is only read for the
 * pixel: "The DEM is too coarse for this radius: no cell centre of LDEM_128 (236.9 m) lies within
 * 100 m."
 */

export type TerrainProblem =
  /** The DEM that covers the Site has no pixel centre inside the radius; `resolutionM` is its pixel, when the detail names it. */
  | { kind: 'too_coarse'; resolutionM: number | null }
  /** No DEM reaches the Site (or its radius) at all. */
  | { kind: 'no_dem' }
  /** Any other problem: the panel's generic error handling applies. */
  | { kind: 'other' }

/** The pixel the engine names in parentheses, in metres: "(236.9 m)". */
const PIXEL = /\((\d+(?:\.\d+)?)\s*m\)/

export function terrainProblem(code: string, detail: string | undefined): TerrainProblem {
  if (code === 'outside_coverage') return { kind: 'no_dem' }
  if (code !== 'dem_too_coarse') return { kind: 'other' }
  const pixel = detail === undefined ? null : PIXEL.exec(detail)
  const resolutionM = pixel ? Number(pixel[1]) : null
  return { kind: 'too_coarse', resolutionM: resolutionM !== null && Number.isFinite(resolutionM) ? resolutionM : null }
}
