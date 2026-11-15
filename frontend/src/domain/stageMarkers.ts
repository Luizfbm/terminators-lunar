/**
 * Where a far body, the Sun or the Earth, is marked on the stage of the Moon seen from orbit.
 *
 * Seen from a camera near the Moon the two are far outside the picture: the Moon fills it. So
 * each gets a marker on a ring just outside the Moon's disc, on the side where the body lies. The
 * marker says which way, not how far or how big.
 */

export interface StageBox {
  width: number
  height: number
  /** Room kept free along each edge, for the caption above and the view buttons below. */
  inset: { top: number; right: number; bottom: number; left: number }
}

/** Under this, the body is straight ahead of the camera or straight behind it, and has no side. */
const NO_SIDE = 0.05

/**
 * The marker's place, in pixels from the stage's top left. `across` and `up` are the body's
 * direction as the camera sees it, to its right and upwards; `centre` is where the Moon's centre
 * is drawn and `ringPx` how far from it the marker sits. A ring that runs off the stage is cut
 * short at the stage's edge, so the marker is always in view. null when the body has no side.
 */
export function bodyMarker(
  across: number,
  up: number,
  centre: { x: number; y: number },
  ringPx: number,
  stage: StageBox,
): { x: number; y: number } | null {
  const length = Math.hypot(across, up)
  if (length < NO_SIDE) return null
  // Screen y grows downwards.
  const dx = across / length
  const dy = -up / length
  const left = stage.inset.left
  const right = stage.width - stage.inset.right
  const top = stage.inset.top
  const bottom = stage.height - stage.inset.bottom
  // The Moon's centre can itself be off the kept area; start from the nearest point inside it.
  const from = { x: Math.min(right, Math.max(left, centre.x)), y: Math.min(bottom, Math.max(top, centre.y)) }
  const toEdge = (delta: number, low: number, high: number, at: number) => (delta > 0 ? (high - at) / delta : delta < 0 ? (low - at) / delta : Infinity)
  const reach = Math.max(0, Math.min(ringPx, toEdge(dx, left, right, from.x), toEdge(dy, top, bottom, from.y)))
  return { x: from.x + dx * reach, y: from.y + dy * reach }
}

/** How many pixels the Moon's radius takes on a stage `heightPx` tall, from a camera `distance` radii from its centre. */
export function moonRadiusPx(distance: number, fieldOfViewDeg: number, heightPx: number): number {
  // From inside the sphere's own radius there is no disc: the surface fills the picture.
  if (distance <= 1) return Infinity
  const limb = Math.asin(1 / distance)
  return ((heightPx / 2) * Math.tan(limb)) / Math.tan((fieldOfViewDeg * Math.PI) / 360)
}
