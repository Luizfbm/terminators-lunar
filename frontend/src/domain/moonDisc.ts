/**
 * How many pixels the Moon's radius takes on a stage `heightPx` tall, from a camera `distance` radii from
 * its centre, with a vertical field of view of `fieldOfViewDeg`. The marks drawn over the Moon (the Equator,
 * the poles, the circle at 84° S) are sized as shares of it.
 */
export function moonRadiusPx(distance: number, fieldOfViewDeg: number, heightPx: number): number {
  // From inside the sphere's own radius there is no disc: the surface fills the picture.
  if (distance <= 1) return Infinity
  const limb = Math.asin(1 / distance)
  return ((heightPx / 2) * Math.tan(limb)) / Math.tan((fieldOfViewDeg * Math.PI) / 360)
}
