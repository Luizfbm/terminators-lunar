import type { VisibilityResult } from '../../api/client'

/** The drawing's own units: A4 portrait gives it about 180 mm of width, so 720 x 220 prints at 4 units per mm. */
export const FIGURE_WIDTH = 720
export const FIGURE_HEIGHT = 220
/** One path dot per this many timeline samples: enough to read the loop, light to print. */
const PATH_POINTS = 320
const TOP = 14
const BASE = FIGURE_HEIGHT - 26

export interface Figure {
  /** The Horizon mask as the points of a polyline, from north round to north. */
  ridge: string
  /** The ground under the mask, closed along the bottom. */
  terrain: string
  sunPath: { x: number; y: number }[]
  earthPath: { x: number; y: number }[]
  /** Where the four compass letters stand, left to right: N, E, S, W. */
  compass: { azimuthDeg: number; x: number }[]
  /** The elevation range the vertical axis covers, in degrees. */
  lowDeg: number
  highDeg: number
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * The Horizon mask with the Sun's and the Earth's paths over the Window, with no Cursor: the same
 * picture as the view from the ground, with the range fitted the same way (the mask, and how high
 * the Sun goes). A path dot is kept only where the body is inside the range drawn, so a body high
 * above the mask does not pile its dots on the edge.
 */
export function buildFigure(result: VisibilityResult): Figure {
  const mask = result.horizon.samples
  const samples = result.timeline.samples
  let low = 0
  let high = 0
  for (const point of mask) {
    low = Math.min(low, point.elevation_deg)
    high = Math.max(high, point.elevation_deg)
  }
  for (const sample of samples) high = Math.max(high, sample.sun.elevation_deg)
  low = Math.max(low, -3) - 0.5
  high += 1

  const scale = (BASE - TOP) / (high - low)
  const x = (azimuthDeg: number) => round((azimuthDeg / 360) * FIGURE_WIDTH)
  const y = (elevationDeg: number) => round(BASE - (Math.max(elevationDeg, low) - low) * scale)
  const hills = mask.map((point) => `${x(point.azimuth_deg)},${y(point.elevation_deg)}`).join(' ')
  const every = Math.max(1, Math.floor(samples.length / PATH_POINTS))
  const kept = samples.filter((_, index) => index % every === 0)
  const dots = (pick: (sample: (typeof samples)[number]) => { azimuth_deg: number; elevation_deg: number }) =>
    kept
      .map(pick)
      .filter((point) => point.elevation_deg >= low && point.elevation_deg <= high)
      .map((point) => ({ x: x(point.azimuth_deg), y: y(point.elevation_deg) }))

  return {
    ridge: hills,
    terrain: `0,${FIGURE_HEIGHT} ${hills} ${FIGURE_WIDTH},${FIGURE_HEIGHT}`,
    sunPath: dots((sample) => sample.sun),
    earthPath: dots((sample) => sample.earth),
    compass: [0, 90, 180, 270].map((azimuthDeg) => ({ azimuthDeg, x: x(azimuthDeg) })),
    lowDeg: low,
    highDeg: high,
  }
}
