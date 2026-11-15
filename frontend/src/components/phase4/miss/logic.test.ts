import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compassIndex } from '../../../domain/sky'
import { bandOf, headline, isSteady, worstIndex, worstNight } from './logic'
import type { ScatterResult } from './types'

// Read at run time, not imported: the web image has only frontend/ and its build
// type-checks this file (see src/buildContext.test.ts).
const example: { value: unknown } = JSON.parse(
  readFileSync(new URL('../../../../../contract/examples/visibility-scatter-001.example.json', import.meta.url), 'utf8'),
)

const scatter = example.value as ScatterResult

describe('the Landing scatter in words', () => {
  // Read off the contract's example by hand: point 16 is the outer ring at 270°, 250 m west.
  it('names the point that loses the Sun and the Earth together, as the API marks it', () => {
    const head = headline(scatter)
    expect(head.kind).toBe('drop')
    if (head.kind !== 'drop') return
    expect(head.point.distance_m).toBe(250)
    expect(head.point.azimuth_deg).toBe(270)
    expect(compassIndex(head.point.azimuth_deg)).toBe(6)
    expect(head.to).toBe(0)
    expect(head.from).toBeCloseTo(329.06, 2)
    expect(worstIndex(scatter, 'sun_and_earth_hours')).toBe(16)
  })

  it('finds the longest night at its worst point, where the Site has none', () => {
    const night = worstNight(scatter)
    expect(night?.point.azimuth_deg).toBe(300)
    expect(night?.from).toBe(0)
    expect(night?.to).toBeCloseTo(398.47, 2)
    // More night is worse, so the worst point of the night is the band's maximum.
    expect(worstIndex(scatter, 'lcsp_hours')).toBe(17)
  })

  it('computes the same band the API sent', () => {
    expect(bandOf(scatter.points)).toEqual(scatter.band)
  })

  it('calls a miss that changes nothing steady, and says nothing about a night', () => {
    const site = scatter.points[0]
    const points = scatter.points.map((point) => ({ ...point, metrics: site.metrics }))
    const same: ScatterResult = { ...scatter, points, band: bandOf(points) }
    expect(headline(same)).toEqual({ kind: 'steady' })
    expect(worstNight(same)).toBeNull()
    expect(isSteady(same.band.mean_sun_fraction, 'mean_sun_fraction')).toBe(true)
  })

  it('says the Site is already the worst when every point around it does better', () => {
    const points = scatter.points.map((point, index) =>
      index === 0 ? { ...point, metrics: { ...point.metrics, sun_and_earth_hours: 0 } } : point,
    )
    const head = headline({ ...scatter, points, band: bandOf(points) })
    expect(head.kind).toBe('siteWorst')
  })
})
