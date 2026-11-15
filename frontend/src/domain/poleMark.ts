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

/**
 * The Equator as runs of screen points, only the half turned to the eye. `faces` says whether each of
 * the points round the circle is on the near side. The run that wraps past the last point back to the
 * first is joined into one.
 */
export function visibleRuns(points: readonly Spot[], faces: readonly boolean[]): Spot[][] {
  const runs: Spot[][] = []
  let current: Spot[] = []
  points.forEach((point, at) => {
    if (faces[at]) current.push(point)
    else if (current.length) {
      runs.push(current)
      current = []
    }
  })
  if (current.length) {
    // The circle is closed: a run still open at the end continues the one that started at the beginning.
    if (runs.length && faces[0]) runs[0] = current.concat(runs[0])
    else runs.push(current)
  }
  return runs
}
