// The contract's own examples, for the tests. Read at run time, not imported: the web image has only
// frontend/ and its build type-checks this file (see src/buildContext.test.ts).
import { readFileSync } from 'node:fs'
import type { HazardGrid, SiteHazard } from './types'

function example<T>(name: string): T {
  const file = readFileSync(new URL(`../../../../../contract/examples/${name}`, import.meta.url), 'utf8')
  return (JSON.parse(file) as { value: T }).value
}

export const hazardExample = (): SiteHazard => example<SiteHazard>('site-hazard-ar06.example.json')
export const gridExample = (): HazardGrid => example<HazardGrid>('hazard-grid-ar06.example.json')
