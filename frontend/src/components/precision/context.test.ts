import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { VisibilityResult } from '../../api/client'
import { precisionContext } from './context'
const result = JSON.parse(readFileSync(new URL('../../../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8'))

const query = result.value.query as VisibilityResult['query']
describe('precision analysis context', () => {
  it('keeps the same analysis for an equivalent Query', () => {
    expect(precisionContext(structuredClone(query), 'map')).toBe(precisionContext(query, 'map'))
  })
  it('invalidates for a new point, Window, height or view', () => {
    const original = precisionContext(query, 'map')
    for (const changed of [
      { ...query, site: { ...query.site, longitude_deg: query.site.longitude_deg + 1 } },
      { ...query, start: '2027-01-01T00:00:00Z' },
      { ...query, end: '2027-02-01T00:00:00Z' },
      { ...query, observer_height_m: query.observer_height_m + 1 },
    ]) expect(precisionContext(changed, 'map')).not.toBe(original)
    expect(precisionContext(query, 'ground')).not.toBe(original)
  })
})
