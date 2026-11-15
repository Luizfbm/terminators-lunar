/** How the Sun fraction at the Cursor is read out: the Sun is hidden, fully up, or this share of its disc is in view. */
export type SunDiscReading =
  | { kind: 'hidden' }
  | { kind: 'full' }
  | {
      kind: 'partial'
      /** Whole percent, 1 to 99: a Sun that is partly in view never reads as 0% or 100%. */
      percent: number
    }

/**
 * Turns a Sun fraction (0 to 1) into what the Cursor shows. Exactly 0 is hidden (behind the
 * Horizon mask, or in a lunar eclipse) and exactly 1 is fully up. In between the share is rounded
 * to a whole percent, but never to 0 or 100: a sliver of the disc is not "hidden" and a nick out
 * of it is not "fully up". Anything outside 0 to 1, or not a number, is clamped to the nearest end.
 */
export function readSunFraction(fraction: number): SunDiscReading {
  if (!Number.isFinite(fraction) || fraction <= 0) return { kind: 'hidden' }
  if (fraction >= 1) return { kind: 'full' }
  return { kind: 'partial', percent: Math.min(99, Math.max(1, Math.round(fraction * 100))) }
}
