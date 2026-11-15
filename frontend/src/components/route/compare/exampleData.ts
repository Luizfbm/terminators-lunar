import { readFileSync } from 'node:fs'
import type { HazardGrid, RouteComparison } from './types'

// Read at run time, not imported: the web image has only frontend/ and its build type-checks this
// file (see src/buildContext.test.ts). Only the tests of this folder use it.
function example<T>(name: string): T {
  const file = JSON.parse(readFileSync(new URL(`../../../../../contract/examples/${name}`, import.meta.url), 'utf8')) as { value: T }
  return file.value
}

/** AR06 with VIPER at 60 m, P90, Sun fraction 0.5: the real output of Eduardo's engine, from the contract. */
export const routeExample: RouteComparison = example<RouteComparison>('route-ar06.example.json')

/** The 10 x 10 km grid of the DM1 tile around AR06. */
export const gridExample: HazardGrid = example<HazardGrid>('hazard-grid-ar06.example.json')
