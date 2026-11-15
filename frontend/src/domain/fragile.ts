/**
 * Fragile result: the hours of a Window in which the Sun or the Earth passes so close to the Horizon
 * mask that a small error in the DEM would change whether that hour counts. It is the cheap, direct
 * warning, worked out from the answer itself; the Uncertainty band (ADR 0003) measures the same
 * error by running DEM clones.
 */
import { maskElevationAt } from './sky'

/**
 * How close counts as fragile, in degrees between the centre of the body and the Horizon mask: 0.5°.
 * Decided by Luiz on 15/11/2026 (issue 67). It is a science decision: never adjust it to change a result.
 */
export const FRAGILE_CLEARANCE_DEG = 0.5

/** What the rule reads of a `/visibility` answer: the Window's end, the timeline and the Horizon mask. */
export interface FragileInput {
  query: { end: string }
  timeline: {
    step_minutes: number
    samples: readonly {
      t: string
      sun: { azimuth_deg: number; elevation_deg: number }
      earth: { azimuth_deg: number; elevation_deg: number }
    }[]
  }
  horizon: { samples: readonly { azimuth_deg: number; elevation_deg: number }[] }
}

/** Hours of the Window in which each body's centre is within the limit of the Horizon mask. */
export interface FragileHours {
  sun: number
  earth: number
}

const HOUR_MS = 3_600_000

/**
 * For every step of the timeline, the clearance of each body is its centre's elevation minus the
 * Horizon mask's elevation at the body's azimuth (read as the Sky does: the nearest mask sample, going
 * round through north). A step counts, for its whole length, when the clearance is under the limit on
 * either side: a body just below the mask counts as much as one just above it. A step is the time to
 * the next sample, and the sample at the Window's end counts for nothing.
 */
export function fragileHours(result: FragileInput): FragileHours {
  const { samples, step_minutes } = result.timeline
  const mask = result.horizon.samples
  const endMs = Date.parse(result.query.end)
  const stepMs = step_minutes * 60_000
  const total = { sun: 0, earth: 0 }
  for (const sample of samples) {
    const length = Math.min(stepMs, endMs - Date.parse(sample.t))
    if (length <= 0) continue
    for (const body of ['sun', 'earth'] as const) {
      const { azimuth_deg, elevation_deg } = sample[body]
      const clearance = elevation_deg - maskElevationAt(mask, azimuth_deg)
      if (Math.abs(clearance) < FRAGILE_CLEARANCE_DEG) total[body] += length
    }
  }
  return { sun: total.sun / HOUR_MS, earth: total.earth / HOUR_MS }
}
