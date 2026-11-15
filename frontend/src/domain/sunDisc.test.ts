import { describe, expect, it } from 'vitest'
import { readSunFraction } from './sunDisc'

describe('readSunFraction', () => {
  it('reads 0 as hidden and 1 as fully up', () => {
    expect(readSunFraction(0)).toEqual({ kind: 'hidden' })
    expect(readSunFraction(1)).toEqual({ kind: 'full' })
  })

  it('rounds the share of the disc to a whole percent', () => {
    expect(readSunFraction(0.3)).toEqual({ kind: 'partial', percent: 30 })
    expect(readSunFraction(0.304)).toEqual({ kind: 'partial', percent: 30 })
    expect(readSunFraction(0.306)).toEqual({ kind: 'partial', percent: 31 })
    expect(readSunFraction(0.5)).toEqual({ kind: 'partial', percent: 50 })
  })

  it('never calls a partly hidden Sun 0% or 100%', () => {
    expect(readSunFraction(0.001)).toEqual({ kind: 'partial', percent: 1 })
    expect(readSunFraction(0.004)).toEqual({ kind: 'partial', percent: 1 })
    expect(readSunFraction(0.996)).toEqual({ kind: 'partial', percent: 99 })
    expect(readSunFraction(0.9999)).toEqual({ kind: 'partial', percent: 99 })
  })

  it('clamps values outside 0 to 1 and treats a missing number as hidden', () => {
    expect(readSunFraction(-0.2)).toEqual({ kind: 'hidden' })
    expect(readSunFraction(1.3)).toEqual({ kind: 'full' })
    expect(readSunFraction(Number.NaN)).toEqual({ kind: 'hidden' })
  })
})
