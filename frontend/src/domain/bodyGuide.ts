import { maskElevationAt } from './sky'

/** Where a body is in the sky of the Site, as the answer gives it for one instant. */
export interface BodyAt {
  azimuth_deg: number
  elevation_deg: number
}

/**
 * Whether the body is below the Horizon mask: its elevation is lower than the mask's at its own
 * azimuth, the same comparison the rest of the app makes. The Sun's `fraction` is not the question:
 * it is also 0 in a lunar eclipse, when the Sun is above the mask and the Earth covers it.
 */
export function belowHorizonMask(body: BodyAt, mask: readonly { azimuth_deg: number; elevation_deg: number }[]): boolean {
  return body.elevation_deg < maskElevationAt(mask, body.azimuth_deg)
}
