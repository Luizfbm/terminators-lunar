/**
 * The Moon's video memory, estimated. A texture of w x h pixels takes w x h x 4 bytes (RGBA) and a third
 * more for its mipmaps, which three builds for every map here: 4/3, written 1.33.
 *
 * The sizes are the ones `deploy/globe_assets.py` writes:
 *   moon_color / moon_normal   4k = 4096 x 2048,  8k = 8192 x 4096
 *   south_cap_normal / albedo  4096 x 4096                          (every level)
 *   south_pole_fine_normal     8192 x 8192 (strong) or 4096 x 4096 (weak, `_4k`)
 *   south_pole_fine_albedo     4096 x 4096                          (level 2 only)
 *
 * A weak device (`moonDevice.ts`) takes the 4k pair. The fine pole is loaded only at level 2 (the map,
 * "South Pole in detail") and freed when the view leaves it. While the swap from the 4k to the 8k pair
 * happens the 4k pair is still there, so the strong tier peaks that much above its figure for a moment.
 */
export const MIPMAP_FACTOR = 1.33
const MIB = 1024 * 1024

/** Video memory of one texture with mipmaps, in bytes. */
export const textureBytes = (width: number, height: number): number => Math.round(width * height * 4 * MIPMAP_FACTOR)

type Size = readonly [number, number]
const mib = (...sizes: Size[]): number => sizes.reduce((sum, [w, h]) => sum + textureBytes(w, h), 0) / MIB

const PAIR_4K: Size[] = [[4096, 2048], [4096, 2048]]
const PAIR_8K: Size[] = [[8192, 4096], [8192, 4096]]
const CAP: Size[] = [[4096, 4096], [4096, 4096]]
const FINE_ALBEDO: Size = [4096, 4096]

/** Estimated MiB of video memory the Moon takes, by device tier and level (1: Explore the Moon, 2: South Pole in detail). */
export const MOON_VRAM_MIB = {
  weak: {
    level1: mib(...PAIR_4K, ...CAP),
    level2: mib(...PAIR_4K, ...CAP, [4096, 4096], FINE_ALBEDO),
  },
  strong: {
    level1: mib(...PAIR_8K, ...CAP),
    level2: mib(...PAIR_8K, ...CAP, [8192, 8192], FINE_ALBEDO),
  },
} as const
