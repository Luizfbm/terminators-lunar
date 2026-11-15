/** A point on the stage, in pixels from its top left corner. */
export interface Spot {
  x: number
  y: number
}

/** How far out along the pole's own line the letter stands, in radii of the Moon. */
export const POLE_LETTER_RADII = 1.17
/** The letter is full strength while its pole is no further than this behind the middle of the disc, and fainter beyond. */
const FAINT_BEHIND = -0.18

/** What is drawn for one pole: the letter, the dot on the Moon when the pole faces the eye, and how strong it is. */
export interface PoleMark {
  letter: Spot
  /** The pole itself on the Moon, joined to the letter by a stroke; null when the pole is on the far side. */
  dot: Spot | null
  opacity: number
}

/**
 * The mark of a pole of the Moon on the stage. The letter belongs to
 * the pole and to nothing else: it stands on the pole's own line, `POLE_LETTER_RADII` out from the
 * Moon's centre, so it turns with the Moon. It is drawn when the pole faces the eye, and when the pole
 * is behind the Moon but the letter, projected, is still outside the disc. It is fainter once the pole
 * is well behind. The dot and the stroke are only for a pole that faces the eye.
 *
 * `pole` and `letter` are the projected places of the pole and of the point on its line; `facing` says
 * whether the pole is on the near side; `depth` is the pole's component along the way to the camera
 * (1 straight at the eye, -1 straight away); `radius` is the disc's radius in pixels.
 */
export function poleMark(pole: Spot, letter: Spot, facing: boolean, depth: number, centre: Spot, radius: number): PoleMark | null {
  if (!Number.isFinite(radius)) return null
  const outside = Math.hypot(letter.x - centre.x, letter.y - centre.y) > radius
  if (!facing && !outside) return null
  return { letter, dot: facing ? pole : null, opacity: depth > FAINT_BEHIND ? 1 : 0.6 }
}

/** A round thing on the stage that a letter must not cover: the Sun's disc or the Earth's. */
export interface Disc extends Spot {
  r: number
}

/** A rectangle on the stage, in pixels from its top left corner. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Whether a letter of a pole, as a square `half` pixels from its centre to each side, keeps clear of the discs
 * (the Sun and the Earth in the sky behind the Moon) and of the rectangles (the menu on the left of the globe).
 * A letter that does not is not drawn: the marks of the Moon never cover what is behind it.
 */
export function letterClear(letter: Spot, half: number, discs: readonly Disc[], boxes: readonly Rect[]): boolean {
  for (const disc of discs) {
    // The distance from the disc's centre to the nearest point of the letter's square.
    const dx = Math.max(Math.abs(disc.x - letter.x) - half, 0)
    const dy = Math.max(Math.abs(disc.y - letter.y) - half, 0)
    if (Math.hypot(dx, dy) < disc.r) return false
  }
  for (const box of boxes) {
    if (letter.x + half > box.left && letter.x - half < box.right && letter.y + half > box.top && letter.y - half < box.bottom) return false
  }
  return true
}
