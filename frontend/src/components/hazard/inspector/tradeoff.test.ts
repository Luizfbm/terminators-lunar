import { describe, expect, it } from 'vitest'
import { hazardExample } from './examples'
import { falseAlarmRange, interpolateTradeOff, reductionPercent } from './tradeoff'

const run60 = hazardExample().runs[0]
const normal = run60.trade_off.normal
const multi = run60.trade_off.multiresolution

describe('the trade-off curve', () => {
  it('gives the contract’s own value at each point it has', () => {
    // Read off the contract's example, 60 m grid: 15% false alarm.
    expect(interpolateTradeOff(normal, 0.15)).toBe(0.044408)
    expect(interpolateTradeOff(multi, 0.15)).toBe(0.035903)
    expect(interpolateTradeOff(normal, 0.05)).toBe(0.145254)
    expect(interpolateTradeOff(multi, 0.3)).toBe(0.009949)
  })

  it('reads along a straight line between two points', () => {
    // 12.5% sits halfway between the 10% and 15% points.
    expect(interpolateTradeOff(normal, 0.125)).toBeCloseTo((0.075871 + 0.044408) / 2, 9)
    // 22% is 40% of the way from the 20% point to the 25% one.
    expect(interpolateTradeOff(multi, 0.22)).toBeCloseTo(0.022333 + 0.4 * (0.0147 - 0.022333), 9)
  })

  it('never extends the curve past its first and last point', () => {
    expect(interpolateTradeOff(normal, 0.04)).toBeNull()
    expect(interpolateTradeOff(normal, 0.31)).toBeNull()
    expect(interpolateTradeOff(multi, 0)).toBeNull()
    expect(interpolateTradeOff(multi, 1)).toBeNull()
    expect(interpolateTradeOff([], 0.1)).toBeNull()
    expect(interpolateTradeOff(normal, Number.NaN)).toBeNull()
  })

  it('does not depend on the order the points arrive in', () => {
    expect(interpolateTradeOff([...normal].reverse(), 0.125)).toBeCloseTo(interpolateTradeOff(normal, 0.125) as number, 12)
  })

  it('treats a slider value of whole percents as the same point as the curve’s fraction', () => {
    expect(interpolateTradeOff(normal, 15 / 100)).toBe(0.044408)
    expect(interpolateTradeOff(normal, 30 / 100)).toBe(0.012819)
  })
})

describe('the reduction', () => {
  it('is how much smaller the second number is, as a percent of the first', () => {
    expect(reductionPercent(0.044408, 0.035903)).toBeCloseTo(19.15, 2)
    expect(reductionPercent(0.5, 0.25)).toBe(50)
  })

  it('is negative when the second grew, and null when the first is zero', () => {
    expect(reductionPercent(0.1, 0.15)).toBeCloseTo(-50, 9)
    expect(reductionPercent(0, 0.1)).toBeNull()
  })
})

describe('the slider’s range', () => {
  it('is 5 to 30 percent for the contract’s curves', () => {
    expect(falseAlarmRange(normal, multi)).toEqual({ min: 5, max: 30 })
  })

  it('is the part both curves cover, and none when they do not meet', () => {
    expect(falseAlarmRange(normal.slice(1, 5), multi)).toEqual({ min: 10, max: 25 })
    expect(falseAlarmRange(normal.slice(0, 2), multi.slice(4))).toBeNull()
    expect(falseAlarmRange([], multi)).toBeNull()
  })
})
