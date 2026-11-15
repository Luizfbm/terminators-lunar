/**
 * Where a far body, the Sun or the Earth, is drawn on the stage of the Moon seen from orbit.
 *
 * Seen from a camera near the Moon the two are far outside the picture: the Moon fills it. So
 * each is drawn as a body in the scene with its distance and size compressed to fit the framing,
 * on a ring just outside the Moon's disc, on the side where the body lies. The place says which
 * way, not how far or how big.
 */

export interface StageBox {
  width: number
  height: number
  /** Room kept free along each edge, for the caption above and the view buttons below. */
  inset: { top: number; right: number; bottom: number; left: number }
}

/** A rectangle on the stage, in pixels from its top left. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Under this, the body is straight ahead of the camera or straight behind it, and has no side. */
const NO_SIDE = 0.05
/** How far a body is turned aside, a step at a time, to clear what it would cover. */
const TURN_STEP_DEG = 10
/** Room kept between a body and what it keeps clear of, in pixels. */
const CLEARANCE_PX = 6

/** The first point along the ray from `at` that leaves the box, as a share of the unit direction; Infinity if it never does. */
const toEdge = (delta: number, low: number, high: number, at: number) => (delta > 0 ? (high - at) / delta : delta < 0 ? (low - at) / delta : Infinity)

/** Whether a disc of `radius` around (x, y) comes within `gap` of the rectangle. */
function touches(x: number, y: number, radius: number, rect: Rect, gap: number): boolean {
  const nearestX = Math.min(rect.right, Math.max(rect.left, x))
  const nearestY = Math.min(rect.bottom, Math.max(rect.top, y))
  return Math.hypot(x - nearestX, y - nearestY) < radius + gap
}

/**
 * The body's place, in pixels from the stage's top left. `across` and `up` are the body's
 * direction as the camera sees it, to its right and upwards; `centre` is where the Moon's centre
 * is drawn and `ringPx` how far from it the body sits. `radiusPx` is how big the body is drawn: it
 * is kept whole inside the stage's kept area. A ring that runs off the stage is cut short at the
 * stage's edge, so the body is always in view. null when the body has no side.
 *
 * `avoid` lists what the body must not cover, such as the chosen Site's dot and name. If it would,
 * it is moved round the ring, to the nearest side that is clear: the direction turns by as little
 * as it must.
 */
export function bodyPlace(
  across: number,
  up: number,
  centre: { x: number; y: number },
  ringPx: number,
  radiusPx: number,
  stage: StageBox,
  avoid: readonly Rect[] = [],
): { x: number; y: number } | null {
  const length = Math.hypot(across, up)
  if (length < NO_SIDE) return null
  // Screen y grows downwards.
  const angle = Math.atan2(-up / length, across / length)
  const left = stage.inset.left + radiusPx
  const right = stage.width - stage.inset.right - radiusPx
  const top = stage.inset.top + radiusPx
  const bottom = stage.height - stage.inset.bottom - radiusPx
  // The Moon's centre can itself be off the kept area; start from the nearest point inside it.
  const from = { x: Math.min(right, Math.max(left, centre.x)), y: Math.min(bottom, Math.max(top, centre.y)) }
  const at = (turn: number) => {
    const dx = Math.cos(angle + turn)
    const dy = Math.sin(angle + turn)
    const reach = Math.max(0, Math.min(ringPx, toEdge(dx, left, right, from.x), toEdge(dy, top, bottom, from.y)))
    return { x: from.x + dx * reach, y: from.y + dy * reach }
  }
  const clear = (place: { x: number; y: number }) => avoid.every((rect) => !touches(place.x, place.y, radiusPx, rect, CLEARANCE_PX))
  const first = at(0)
  if (clear(first)) return first
  // Alternately to either side of the true direction, a step further each time.
  const step = (TURN_STEP_DEG * Math.PI) / 180
  for (let turned = 1; turned * step <= Math.PI; turned++) {
    for (const sign of [1, -1]) {
      const place = at(sign * turned * step)
      if (clear(place)) return place
    }
  }
  return first
}

/** How many pixels the Moon's radius takes on a stage `heightPx` tall, from a camera `distance` radii from its centre. */
export function moonRadiusPx(distance: number, fieldOfViewDeg: number, heightPx: number): number {
  // From inside the sphere's own radius there is no disc: the surface fills the picture.
  if (distance <= 1) return Infinity
  const limb = Math.asin(1 / distance)
  return ((heightPx / 2) * Math.tan(limb)) / Math.tan((fieldOfViewDeg * Math.PI) / 360)
}

/**
 * How big the Sun and the Earth are drawn, in pixels of radius, on a stage `sidePx` across at its
 * shorter side. Not to scale, but the Earth is the bigger of the two, as it is in the sky of the
 * Moon, and both stay readable on a phone without swelling on a wide screen.
 */
export function bodySizes(sidePx: number): { sun: number; earth: number } {
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
  return { sun: clamp(sidePx * 0.022, 6, 12), earth: clamp(sidePx * 0.04, 12, 24) }
}
