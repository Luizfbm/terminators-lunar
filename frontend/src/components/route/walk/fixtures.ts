import { readFileSync } from 'node:fs'
import type { HazardGrid, RouteComparison } from './types'

// The contract's own examples, which are real outputs of Eduardo's bundle and planner (AR06, VIPER, 60 m, P90):
// the tests read them as the API would answer.
const example = <T>(file: string): T =>
  (JSON.parse(readFileSync(new URL(`../../../../../contract/examples/${file}`, import.meta.url), 'utf8')) as { value: T }).value

export const exampleGrid = () => example<HazardGrid>('hazard-grid-ar06.example.json')
export const exampleRoute = () => example<RouteComparison>('route-ar06.example.json')
