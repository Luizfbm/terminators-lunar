import type { HazardMeasured } from './hazardApi'

/** The share of the Landing ellipse the laser measured, or null when the API has none (no 5 m data). */
export function ellipseShare(measured: HazardMeasured): number | null {
  const share = measured.ellipse_fraction
  return typeof share === 'number' && Number.isFinite(share) ? share : null
}

/**
 * A share as the app writes a percentage (whole numbers). A share that is not zero never reads as
 * "0%": under half a percent it says "<1%", which is what the rounding would otherwise hide.
 */
export function shareText(fraction: number, formatPercent: (fraction: number) => string): string {
  if (fraction > 0 && fraction < 0.005) return `<${formatPercent(0.01)}`
  return formatPercent(fraction)
}

/** "Only" belongs to a minority: from half up, the line states the share without it. */
export const isMinority = (fraction: number): boolean => fraction < 0.5
