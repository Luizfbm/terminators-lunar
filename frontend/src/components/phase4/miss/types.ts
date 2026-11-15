// The shapes of the two answers this panel reads, from the contract's generated types.

import type { components } from '../../../api/schema'

type Schemas = components['schemas']

export type Metrics = Schemas['Metrics']
// The metrics the Landing scatter's band covers: the main six, not the Earth by any part of its disc.
export type MetricKey = keyof ScatterResult['band']
export type ScatterPoint = Schemas['ScatterPoint']
export type ScatterRange = Schemas['ScatterRange']
export type ScatterResult = Schemas['ScatterResult']
export type SlopeStats = Schemas['SlopeStats']
export type PermanentShadow = Schemas['PermanentShadow']
export type TerrainResult = Schemas['TerrainResult']
