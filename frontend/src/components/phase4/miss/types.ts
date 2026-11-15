// The shapes of the two answers this panel reads, from the contract's generated types.

import type { components } from '../../../api/schema'

type Schemas = components['schemas']

export type Metrics = Schemas['Metrics']
export type MetricKey = keyof Metrics
export type ScatterPoint = Schemas['ScatterPoint']
export type ScatterRange = Schemas['ScatterRange']
export type ScatterResult = Schemas['ScatterResult']
export type SlopeStats = Schemas['SlopeStats']
export type PermanentShadow = Schemas['PermanentShadow']
export type TerrainResult = Schemas['TerrainResult']
