// The shapes of the two answers the safety circle reads, from the contract's generated types.

import type { components } from '../../../api/schema'

type Schemas = components['schemas']

export type SiteHazard = Schemas['SiteHazard']
export type HazardRun = Schemas['HazardRun']
export type HazardMethod = Schemas['HazardMethod']
export type HazardAround = Schemas['HazardAround']
