/**
 * The geometry of the view from the ground in 3D (the requirement): where a point of the sky is, seen
 * from the Observer, and how much the heights are stretched so a horizon a few degrees high can
 * be read.
 *
 * Axes: x is east, y is up, z is south, so north is -z. An azimuth is measured from north through
 * east, as everywhere else in the app.
 */

const RAD = Math.PI / 180

/** The most the heights are stretched: near the pole the whole sky that matters is a few degrees. */
export const MAX_STRETCH = 6
/** The elevation the highest thing in the scene is brought up to, when the scene is stretched. */
const TARGET_TOP_DEG = 30
/** No stretched elevation goes past this, so nothing wraps over the zenith. */
const LIMIT_DEG = 85
/** The Earth's angular radius seen from the Moon, in degrees. */
export const EARTH_RADIUS_DEG = 0.95

/**
 * The scale of a flat unit disc, facing the Observer `distance` away, that subtends the angular
 * radius `radiusDeg`: its edge is at atan(r / D), so r = D · tan. Used for the Sun.
 */
export const discScale = (radiusDeg: number, distance: number): number => distance * Math.tan((radiusDeg * Math.PI) / 180)

/**
 * The scale of a unit ball `distance` away whose silhouette subtends `radiusDeg`: the tangent lines
 * to a sphere make asin(ρ / D), so ρ = D · sin. Used for the Earth.
 */
export const ballScale = (radiusDeg: number, distance: number): number => distance * Math.sin((radiusDeg * Math.PI) / 180)

/**
 * The angular radius a body is drawn at: the one the answer gives for that sample, or, when the
 * answer has none (older answers, the mock), the mean radius we already have for it. A body is
 * never left out for lack of a radius. `stretch` is the same factor the heights get, so the disc
 * keeps the rule it had before: it is drawn `stretch` times its radius.
 */
export function bodyRadiusDeg(answered: number | undefined, meanDeg: number, stretch: number): number {
  const radius = answered !== undefined && Number.isFinite(answered) && answered > 0 ? answered : meanDeg
  return radius * stretch
}

/**
 * How many times the heights are stretched: enough to bring the highest ridge or the highest Sun
 * of the Window up to a readable height, never more than MAX_STRETCH, and never less than 1, so a
 * Site far from the pole, where the Sun climbs high, is drawn as it is.
 */
export function stretchFor(elevationsDeg: Iterable<number>): number {
  let top = 0
  for (const elevation of elevationsDeg) top = Math.max(top, elevation)
  if (top <= 0) return MAX_STRETCH
  return Math.min(MAX_STRETCH, Math.max(1, TARGET_TOP_DEG / top))
}

/** An elevation after stretching. Order is kept: what was higher is still higher. */
export function stretched(elevationDeg: number, stretch: number): number {
  return Math.max(-LIMIT_DEG, Math.min(LIMIT_DEG, elevationDeg * stretch))
}

/** The unit vector towards an azimuth and an elevation, both in degrees. */
export function direction(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const azimuth = azimuthDeg * RAD
  const elevation = elevationDeg * RAD
  const flat = Math.cos(elevation)
  return [flat * Math.sin(azimuth), Math.sin(elevation), -flat * Math.cos(azimuth)]
}

/** An azimuth brought into 0 to 360. */
export function wrapAzimuth(azimuthDeg: number): number {
  return ((azimuthDeg % 360) + 360) % 360
}

/** The shortest turn from one azimuth to another, in degrees, positive towards the east. */
export function turnBetween(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180
}

/**
 * Where each point of the ground goes in the scene: at its own azimuth and distance, at its
 * stretched elevation, and never above the engine's horizon in its direction. Where the height
 * map and the engine differ, the engine's horizon wins, so the picture cannot hide a Sun the
 * answer says is in view. Returns x, y, z for each point, in scene units of `unitM` metres.
 */
export function groundPositions(
  ground: { azimuthDeg: Float32Array; elevationDeg: Float32Array; distanceM: Float32Array },
  horizonDeg: (azimuthDeg: number) => number,
  stretch: number,
  unitM: number,
): Float32Array {
  const positions = new Float32Array(ground.azimuthDeg.length * 3)
  for (let at = 0; at < ground.azimuthDeg.length; at++) {
    const azimuth = ground.azimuthDeg[at]
    const elevation = Math.min(ground.elevationDeg[at], horizonDeg(azimuth) - HORIZON_CLEARANCE_DEG)
    const [x, y, z] = direction(azimuth, stretched(elevation, stretch))
    const distance = ground.distanceM[at] / unitM
    positions.set([x * distance, y * distance, z * distance], at * 3)
  }
  return positions
}

/** How far under the engine's horizon the ground is held, so the crest line stays in front of it. */
export const HORIZON_CLEARANCE_DEG = 0.02

/**
 * How bright the terrain that closes the horizon in a direction looks from the Observer, as a
 * share of its own colour. What the Observer sees of it is a slope that rises away from them: it
 * is taken to face halfway between straight up and straight back at the Observer. It is lit like
 * the ground around it, by the light the scene uses: `sunlight` for a surface square to the Sun
 * with its whole disc in view, and `skylight` for a surface facing straight up with no Sun. So
 * it is in sunlight when the Sun is behind the Observer, dim when the Sun is to one side, and in
 * its own shadow when the Sun is beyond it, which is when it is about to hide the Sun.
 */
export function horizonFaceShade(
  azimuthDeg: number,
  sun: { azimuthDeg: number; elevationDeg: number; fraction: number },
  light: { sunlight: number; skylight: number },
): number {
  const rad = Math.PI / 180
  const lean = Math.SQRT1_2
  // The slope's outward direction: `lean` up, and `lean` back towards the Observer.
  const towardsSun = Math.cos((azimuthDeg - sun.azimuthDeg) * rad)
  const facing = lean * Math.sin(sun.elevationDeg * rad) - lean * towardsSun * Math.cos(sun.elevationDeg * rad)
  // Light from above reaches a tilted slope in proportion to how much sky it faces.
  const sky = light.skylight * (0.5 + 0.5 * lean)
  return Math.min(1, sky + light.sunlight * sun.fraction * Math.max(0, facing))
}

/**
 * The sunlight on the ground at the Cursor (the requirement): it comes from where the Sun is in the
 * scene, at its stretched elevation like the stretched relief it falls on, so a slope facing the
 * Sun catches it at a grazing angle and one turned away does not. Its strength is the share of the
 * Sun's disc the engine finds above the Horizon mask: when the answer says the Sun is behind the
 * relief, no sunlight reaches the ground at all.
 */
export function sunOnGround(
  sun: { azimuthDeg: number; elevationDeg: number; fraction: number },
  stretch: number,
): { direction: [number, number, number]; share: number } {
  return { direction: direction(sun.azimuthDeg, stretched(sun.elevationDeg, stretch)), share: Math.max(0, Math.min(1, sun.fraction)) }
}

/** The sunlight a surface with this unit normal gets, as a share of a surface square to a whole Sun. */
export function sunlitShare(normal: readonly [number, number, number], light: { direction: readonly [number, number, number]; share: number }): number {
  const [x, y, z] = light.direction
  return light.share * Math.max(0, normal[0] * x + normal[1] * y + normal[2] * z)
}

/**
 * How finely the ground near the Site is known and how finely it is drawn: the DEM's own cell, and
 * the metres between the points of the mesh, which a phone takes every other point of.
 */
export interface GroundSpacing {
  measuredM: number
  drawnM: number
  /** The DEM, named only when the ground comes from the engine's grid (`/terrain/heights`) rather than a published polar map. */
  product?: string
}

export const groundSpacing = (metresPerPixel: number, stride: number): GroundSpacing => ({ measuredM: metresPerPixel, drawnM: metresPerPixel * stride })

/**
 * The caption's sentences about the ground: what LOLA measured, at the DEM's own cell, and only
 * when the mesh is coarser than that, how finely this device draws it. Nothing at all for the
 * silhouette.
 */
export function groundCaption(
  spacing: GroundSpacing | null,
  i18n: { t: (key: 'sky.caption.ground' | 'sky.caption.drawn' | 'sky.caption.product', params?: Record<string, string>) => string; formatNumber: (value: number) => string },
): string[] {
  if (!spacing) return []
  const metres = (value: number) => i18n.formatNumber(Math.round(value))
  const parts = [i18n.t('sky.caption.ground', { metres: metres(spacing.measuredM) })]
  if (spacing.product) parts.push(i18n.t('sky.caption.product', { product: spacing.product }))
  if (Math.round(spacing.drawnM) > Math.round(spacing.measuredM)) parts.push(i18n.t('sky.caption.drawn', { metres: metres(spacing.drawnM) }))
  return parts
}
