import { expect, it } from 'vitest'
import { solarPathDirections } from './solarPath'
import { direction } from './skyScene'

it('separates solar dots across repeated cycles using measured directions only', () => {
  const samples = Array.from({ length: 1440 }, (_, i) => ({ sun: { azimuth_deg: i / 2, elevation_deg: 1 } }))
  const dots = solarPathDirections(samples)
  expect(dots.length).toBeGreaterThan(100)
  expect(dots.length).toBeLessThan(150)
  const measured = samples.map(s => direction(s.sun.azimuth_deg, s.sun.elevation_deg).join(','))
  for (const dot of dots) expect(measured).toContain(dot.join(','))
  for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
    const dot = dots[i].reduce((n, v, k) => n + v * dots[j][k], 0)
    expect(Math.acos(Math.min(1, dot)) * 180 / Math.PI).toBeGreaterThanOrEqual(2.499)
  }
})
