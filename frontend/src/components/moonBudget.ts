import { textureSize } from './textureBudget'

/**
 * The Moon's video memory, in one place: which images each device tier loads, how far each is fitted,
 * and what that costs. A texture of w x h pixels takes w x h x 4 bytes (RGBA) and a third more for the
 * mipmaps three builds for every map here: 4/3, written 1.33.
 *
 * Three tiers (`moonDevice.ts` decides which one a device is in):
 *   strong  only when the link asks with `?graphics=high`, on a fine pointer, MAX_TEXTURE_SIZE of 8192 or
 *           more and hardware rendering: the images as they are served, the 8192 px whole-Moon pair included;
 *   weak    everyone else, which is every visitor who did not ask: every image fitted to 2048 px;
 *   low     `?graphics=low`: every image fitted to 1024 px, and the polar cap only at level 2.
 *
 * Two levels: 1 is Explore the Moon (the orbit), 2 is South Pole in detail (the map). What each loads:
 *   level 1  the whole-Moon colour and relief (4096 px first, then the 8192 px pair on a strong tier, which
 *            replaces them) and the 148 m polar cap (south_cap), except on the low tier;
 *   level 2  adds the 22.5 m fine pole (south_pole_fine normal and albedo), and on the low tier the cap too.
 *            Leaving level 2 frees them again.
 *
 * Why the cap stays at level 1 on the strong tier: it costs 170 MiB there, the orbit camera can come to
 * 1.04 radii where 148 m per pixel is on screen, and the strong tier's level 1 stays under
 * `LEVEL1_CEILING_MIB`, about half of the 937 MiB the Moon took for everyone before any budget.
 */

export type MoonTier = 'strong' | 'weak' | 'low'
export type MoonLevel = 1 | 2

/** The longest side, in pixels, an image of the Moon may have on the GPU, by tier. */
export const TIER_LIMIT_PX: Record<MoonTier, number> = { strong: 8192, weak: 2048, low: 1024 }

/** The limit the loader fits images to: the tier's, and never above what the GPU can hold. */
export const textureLimitFor = (tier: MoonTier, maxTextureSize: number): number => Math.min(maxTextureSize, TIER_LIMIT_PX[tier])

/** Whether the tier takes the 8192 px whole-Moon pair, and the 8192 px normal of the fine pole. */
export const takesLargeImages = (tier: MoonTier): boolean => tier === 'strong'

/** Whether the 148 m cap is loaded at level 1. The low tier waits for level 2. */
export const capAtLevel1 = (tier: MoonTier): boolean => tier !== 'low'

/** What any tier's level 1 may take at most, in MiB. */
export const LEVEL1_CEILING_MIB = 512

export const MIPMAP_FACTOR = 1.33
const MIB = 1024 * 1024

/** Video memory of one texture with mipmaps, in bytes. */
export const textureBytes = (width: number, height: number): number => Math.round(width * height * 4 * MIPMAP_FACTOR)

type Size = readonly [number, number]

// The sizes `deploy/globe_assets.py` writes, as served.
const MOON_4K: Size = [4096, 2048] // moon_color_4k, moon_normal_4k
const MOON_8K: Size = [8192, 4096] // moon_color_8k, moon_normal_8k
const CAP: Size = [4096, 4096] // south_cap_normal, south_cap_albedo
const FINE_NORMAL: Size = [8192, 8192] // south_pole_fine_normal
const FINE_NORMAL_SMALL: Size = [4096, 4096] // south_pole_fine_normal_4k, for everyone but the strong tier
const FINE_ALBEDO: Size = [4096, 4096] // south_pole_fine_albedo

/** The images on the GPU at a level, as served (before fitting). */
export function moonImages(tier: MoonTier, level: MoonLevel): Size[] {
  const whole: Size[] = takesLargeImages(tier) ? [MOON_8K, MOON_8K] : [MOON_4K, MOON_4K]
  const cap: Size[] = [CAP, CAP]
  const fine: Size[] = [takesLargeImages(tier) ? FINE_NORMAL : FINE_NORMAL_SMALL, FINE_ALBEDO]
  if (level === 1) return capAtLevel1(tier) ? [...whole, ...cap] : whole
  return [...whole, ...cap, ...fine]
}

/** Estimated MiB of video memory at a level, with every image fitted the way `fitTexture` fits it. */
export function moonVramMiB(tier: MoonTier, level: MoonLevel, maxTextureSize = 16384): number {
  const limit = textureLimitFor(tier, maxTextureSize)
  let bytes = 0
  for (const [width, height] of moonImages(tier, level)) {
    const fitted = textureSize(width, height, limit)
    bytes += textureBytes(fitted.width, fitted.height)
  }
  return bytes / MIB
}

/**
 * The strong tier swaps its 4096 px whole-Moon pair for the 8192 px one: until the swap is done both
 * are on the GPU, so level 1 peaks that much above its steady figure.
 */
export const STRONG_SWAP_PEAK_MIB = (textureBytes(...MOON_4K) * 2) / MIB

const table = (tier: MoonTier) => ({ level1: moonVramMiB(tier, 1), level2: moonVramMiB(tier, 2) })

/** Estimated MiB of video memory the Moon takes, by tier and level. */
export const MOON_VRAM_MIB = { strong: table('strong'), weak: table('weak'), low: table('low') } as const

/**
 * What the Moon took before any budget, for every device: the strong tier's images, the fine pole's
 * included, all loaded when the page opened. It is the strong tier's level 2 figure.
 */
export const UNBUDGETED_MIB = MOON_VRAM_MIB.strong.level2
