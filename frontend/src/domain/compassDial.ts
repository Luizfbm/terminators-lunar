import { wrapAzimuth } from './skyScene'

/**
 * The round compass of the view from the ground (the requirement). The index at the top of the circle
 * is where the view faces; the ring turns under it, the other way from the view. Angles on the
 * dial are measured clockwise from the top, as azimuths are from north.
 */

/** A tick every 15°, the ones on the eight directions longer. */
export const DIAL_TICKS: readonly { azimuthDeg: number; major: boolean }[] = Array.from({ length: 24 }, (_, at) => ({
  azimuthDeg: at * 15,
  major: at % 3 === 0,
}))

/** The eight directions that carry a letter: north, north-east, east… */
export const DIAL_LETTERS: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315]

/** Where on the dial an azimuth sits while the view faces `yawDeg`: clockwise from the top. */
export function dialAngle(azimuthDeg: number, yawDeg: number): number {
  return wrapAzimuth(azimuthDeg - yawDeg)
}

/** The point of the dial, centred on 0,0 with y down as on a screen, for an azimuth at `radius`. */
export function onDial(azimuthDeg: number, yawDeg: number, radius: number): { x: number; y: number } {
  const angle = (dialAngle(azimuthDeg, yawDeg) * Math.PI) / 180
  return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) }
}

/** Which of the eight directions the view faces: 0 north, 1 north-east… 7 north-west. */
export function facingEighth(yawDeg: number): number {
  return Math.round(wrapAzimuth(yawDeg) / 45) % 8
}
