import { describe, expect, it } from 'vitest'
import { MOON_VRAM_MIB, textureBytes } from './moonBudget'

describe('the Moon’s estimated video memory', () => {
  it('is width x height x 4 bytes, a third more for the mipmaps', () => {
    expect(textureBytes(1024, 1024)).toBe(Math.round(1024 * 1024 * 4 * 1.33))
    expect(textureBytes(8192, 8192) / 1024 ** 2).toBeCloseTo(340.5, 1)
    expect(textureBytes(4096, 2048) / 1024 ** 2).toBeCloseTo(42.6, 1)
  })

  it('puts the strong tier at the 940 MiB the textures took before the budget', () => {
    expect(MOON_VRAM_MIB.strong.level2).toBeGreaterThan(930)
    expect(MOON_VRAM_MIB.strong.level2).toBeLessThan(945)
  })

  it('figures per tier and level, in MiB', () => {
    expect(MOON_VRAM_MIB.weak.level1).toBeCloseTo(255.4, 1)
    expect(MOON_VRAM_MIB.weak.level2).toBeCloseTo(425.6, 1)
    expect(MOON_VRAM_MIB.strong.level1).toBeCloseTo(510.7, 1)
    expect(MOON_VRAM_MIB.strong.level2).toBeCloseTo(936.3, 1)
  })

  it('a weak device at the polar level stays under half of the strong one', () => {
    expect(MOON_VRAM_MIB.weak.level2).toBeLessThan(MOON_VRAM_MIB.strong.level2 / 2 + 1)
  })

  it('the polar level adds to the orbit one, on both tiers', () => {
    for (const tier of [MOON_VRAM_MIB.weak, MOON_VRAM_MIB.strong]) expect(tier.level2).toBeGreaterThan(tier.level1)
  })
})
