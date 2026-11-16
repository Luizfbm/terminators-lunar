import { describe, expect, it } from 'vitest'
import {
  capAtLevel1,
  LEVEL1_CEILING_MIB,
  MOON_VRAM_MIB,
  moonImages,
  moonVramMiB,
  STRONG_SWAP_PEAK_MIB,
  takesLargeImages,
  textureBytes,
  textureLimitFor,
  TIER_LIMIT_PX,
  UNBUDGETED_MIB,
} from './moonBudget'

describe('the Moon’s estimated video memory', () => {
  it('is width x height x 4 bytes, a third more for the mipmaps', () => {
    expect(textureBytes(1024, 1024)).toBe(Math.round(1024 * 1024 * 4 * 1.33))
    expect(textureBytes(8192, 8192) / 1024 ** 2).toBeCloseTo(340.5, 1)
    expect(textureBytes(4096, 2048) / 1024 ** 2).toBeCloseTo(42.6, 1)
  })

  it('puts the strong tier at the 937 MiB the textures took before any budget, at the polar level', () => {
    expect(UNBUDGETED_MIB).toBeGreaterThan(930)
    expect(UNBUDGETED_MIB).toBeLessThan(945)
    expect(MOON_VRAM_MIB.strong.level2).toBe(UNBUDGETED_MIB)
  })

  it('figures per tier and level, in MiB', () => {
    expect(MOON_VRAM_MIB.strong.level1).toBeCloseTo(510.7, 1)
    expect(MOON_VRAM_MIB.strong.level2).toBeCloseTo(936.3, 1)
    expect(MOON_VRAM_MIB.weak.level1).toBeCloseTo(63.8, 1)
    expect(MOON_VRAM_MIB.weak.level2).toBeCloseTo(106.4, 1)
    expect(MOON_VRAM_MIB.low.level1).toBeCloseTo(5.3, 1)
    expect(MOON_VRAM_MIB.low.level2).toBeCloseTo(26.6, 1)
  })

  it('the polar level adds to the orbit one, on every tier', () => {
    for (const tier of Object.values(MOON_VRAM_MIB)) expect(tier.level2).toBeGreaterThan(tier.level1)
  })

  it('a weaker tier never takes more than a stronger one, at either level', () => {
    for (const level of ['level1', 'level2'] as const) {
      expect(MOON_VRAM_MIB.weak[level]).toBeLessThan(MOON_VRAM_MIB.strong[level])
      expect(MOON_VRAM_MIB.low[level]).toBeLessThan(MOON_VRAM_MIB.weak[level])
    }
  })

  it('keeps every tier’s level 1 under the ceiling, the swap peak of the strong tier included', () => {
    for (const tier of Object.values(MOON_VRAM_MIB)) expect(tier.level1).toBeLessThanOrEqual(LEVEL1_CEILING_MIB)
    expect(STRONG_SWAP_PEAK_MIB).toBeCloseTo(85.1, 1)
    expect(MOON_VRAM_MIB.strong.level1 + STRONG_SWAP_PEAK_MIB).toBeLessThan(UNBUDGETED_MIB * 0.65)
  })

  it('a weak device at the polar level stays under a quarter of the strong one', () => {
    expect(MOON_VRAM_MIB.weak.level2).toBeLessThan(MOON_VRAM_MIB.strong.level2 / 4)
  })

  it('level 1 on the strong tier saves the whole fine pole against before: 425 MiB', () => {
    expect(UNBUDGETED_MIB - MOON_VRAM_MIB.strong.level1).toBeCloseTo(textureBytes(8192, 8192) / 1024 ** 2 + textureBytes(4096, 4096) / 1024 ** 2, 0)
  })
})

describe('which images a tier loads, and how far they are fitted', () => {
  it('only the strong tier takes the 8192 px images; the cap waits for the polar level only on the low tier', () => {
    expect(takesLargeImages('strong')).toBe(true)
    expect(takesLargeImages('weak')).toBe(false)
    expect(takesLargeImages('low')).toBe(false)
    expect(capAtLevel1('strong')).toBe(true)
    expect(capAtLevel1('weak')).toBe(true)
    expect(capAtLevel1('low')).toBe(false)
  })

  it('limits are 8192, 2048 and 1024 px, and never above what the GPU can hold', () => {
    expect(TIER_LIMIT_PX).toEqual({ strong: 8192, weak: 2048, low: 1024 })
    expect(textureLimitFor('strong', 16384)).toBe(8192)
    expect(textureLimitFor('weak', 16384)).toBe(2048)
    expect(textureLimitFor('low', 16384)).toBe(1024)
    expect(textureLimitFor('strong', 4096)).toBe(4096)
  })

  it('the strong tier at level 2 holds the 8192² fine normal and the 8192 x 4096 whole-Moon pair, as before', () => {
    const sizes = moonImages('strong', 2).map(([w, h]) => `${w}x${h}`)
    expect(sizes).toEqual(['8192x4096', '8192x4096', '4096x4096', '4096x4096', '8192x8192', '4096x4096'])
  })

  it('the low tier has only the whole-Moon pair at level 1, and the cap arrives with the fine pole', () => {
    expect(moonImages('low', 1)).toHaveLength(2)
    expect(moonImages('low', 2)).toHaveLength(6)
  })

  it('a GPU limit below the tier’s lowers the figure', () => {
    expect(moonVramMiB('strong', 2, 4096)).toBeLessThan(MOON_VRAM_MIB.strong.level2)
    expect(moonVramMiB('weak', 2, 16384)).toBe(MOON_VRAM_MIB.weak.level2)
  })
})
