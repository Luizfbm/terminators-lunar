import { expect, it } from 'vitest'
import { chargeSegments } from './chargeSegments'

it('shows descending charge in red segments, an unfilled zero interval, then recovery', () => {
  const parts = chargeSegments([1, .5, 0, 0, .25, 1], 1000, 5000)
  expect(parts.map(p => p.state)).toEqual(['discharging', 'discharging', 'empty', 'charging', 'charging'])
  expect(parts[2].line).toBe('40,100 60,100')
  expect(parts[2].area).toBe('40,100 40,100 60,100 60,100')
  expect(parts[3].line).toBe('60,100 80,75')
})

it('does not turn unavailable or invalid samples into an empty battery', () => {
  expect(chargeSegments([], 1, 5)).toEqual([])
  expect(chargeSegments([NaN, .5], 1, 5)).toEqual([])
  expect(chargeSegments([1, 0], 1, 0)).toEqual([])
})
