import type { components } from '../../../api/schema'

export type SiteHazard = components['schemas']['SiteHazard']
export type HazardGridRef = components['schemas']['HazardGridRef']
export type HazardGrid = components['schemas']['HazardGrid']
export type HazardRun = components['schemas']['HazardRun']
export type HazardMethod = components['schemas']['HazardMethod']
export type HazardInterval = components['schemas']['HazardInterval']
export type HazardTradeOffPoint = components['schemas']['HazardTradeOffPoint']
export type Navigation = components['schemas']['Navigation']
export type ConfidenceLevel = components['schemas']['ConfidenceLevelName']

/** The coarse grids the Monte Carlo started from, in metres. */
export type CoarseGrid = 60 | 20
export const COARSE_GRIDS: readonly CoarseGrid[] = [60, 20]

/** The confidence levels of the Multiresolution runs, in the order the contract lists them. */
export const LEVELS: readonly ConfidenceLevel[] = ['P50', 'P90', 'P99']

/** The grid as the contract describes it, turned into numbers. Row 0 is the +y edge, column 0 the -x edge. */
export interface DecodedGrid {
  /** Cells per side. */
  n: number
  cellM: number
  spanM: number
  /** Mean height of each cell, in metres. */
  elevationM: Float32Array
  zMinM: number
  zMaxM: number
  /** 90th percentile of the 5 m slope inside each cell, in degrees. */
  slope5Deg: Float32Array
  slope20Deg: Float32Array
  slope60Deg: Float32Array
  /** NASA's slope error layer, in degrees. */
  slopeErrorDeg: Float32Array
  /** Local laser shot density, 0 to 1. */
  ldecDensity: Float32Array
  /** 1 where the cell holds a real laser shot. */
  ldecAny: Uint8Array
}
