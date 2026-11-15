import type { Vec3 } from './sky'

/**
 * How the dots of the two layers are drawn on the globe: a fixed size on screen, in CSS pixels, whatever
 * the zoom, and a light colour with a dark edge so they read over the grey Moon. The two layers have
 * colours of their own, and neither is the Sun's amber, the Earth's blue or the orange of "Land".
 */
export const MARKERS = {
  sites: { color: 0x5ef2c8, css: '#5ef2c8', sizePx: 7 },
  missions: { color: 0xffffff, css: '#ffffff', sizePx: 7 },
} as const

/**
 * How close to the middle of a dot the pointer must be for a click to land on that Site instead of on the
 * ground under it: a little more than the dot, so a free point is never swapped for a Site far away.
 */
export const HIT_PX = { mouse: 8, touch: 14 } as const

export const hitRadius = (pointerType: string | null | undefined): number => (pointerType === 'touch' ? HIT_PX.touch : HIT_PX.mouse)

/**
 * Whether a point of the unit sphere, given by its direction `unit`, faces a camera at `eye` (in Moon
 * radii, from the centre): the camera is above the point's tangent plane by more than `margin`. A point
 * behind the limb is neither drawn, labelled nor picked.
 */
export function nearSide(unit: Vec3, eye: Vec3, margin = 0.01): boolean {
  return unit[0] * eye[0] + unit[1] * eye[1] + unit[2] * eye[2] > 1 + margin
}

export interface ScreenMarker {
  id: string
  x: number
  y: number
}

/** The marker nearest to `at` within `radius` pixels, or null. On a tie the first one wins. */
export function nearestMarker<T extends ScreenMarker>(markers: readonly T[], at: { x: number; y: number }, radius: number): T | null {
  let best: T | null = null
  let bestDistance = radius
  for (const marker of markers) {
    const distance = Math.hypot(marker.x - at.x, marker.y - at.y)
    if (distance <= bestDistance && (best === null || distance < bestDistance)) {
      best = marker
      bestDistance = distance
    }
  }
  return best
}

/** Compact map label; the full catalog name remains available on hover and to assistive technology. */
export const missionLabel = (name: string): string => name.split(" (")[0].replace(/ landing point$/i, "")
