import { describe, expect, it } from 'vitest'
import { HIT_PX, hitRadius, MARKERS, nearestMarker, nearSide } from './markers'
import { toVector } from './sky'

describe('the dots of the two layers', () => {
  // Regression (2026-11-15): the dots were spheres 0.004 Moon radii across, grey on the grey Moon, about
  // 0.7 px on screen from the orbit view, so neither Sites nor Lunar Missions showed anything.
  it('have a size on screen of several pixels, larger for the missions, which carry a name', () => {
    expect(MARKERS.sites.sizePx).toBeGreaterThanOrEqual(6)
    expect(MARKERS.missions.sizePx).toBeGreaterThanOrEqual(MARKERS.sites.sizePx)
    expect(MARKERS.missions.sizePx).toBeLessThanOrEqual(12)
  })

  it('keep missions white and the two layers visually distinct', () => {
    expect(MARKERS.missions.color).toBe(0xffffff)
    expect(MARKERS.sites.color).not.toBe(MARKERS.missions.color)
    for (const marker of [MARKERS.sites, MARKERS.missions]) {
      const r = (marker.color >> 16) & 0xff
      const g = (marker.color >> 8) & 0xff
      const b = marker.color & 0xff
      // Both layers remain legible over the surface.
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeGreaterThan(150)
      expect(marker.css).toBe(`#${marker.color.toString(16).padStart(6, '0')}`)
    }
  })
})

describe('which side of the Moon a point is on', () => {
  const eye = (lat: number, lon: number, distance: number) => toVector(lat, lon).map((value) => value * distance) as [number, number, number]

  it('sees the point under the camera and not the one opposite', () => {
    expect(nearSide(toVector(10, 20), eye(10, 20, 5))).toBe(true)
    expect(nearSide(toVector(-10, -160), eye(10, 20, 5))).toBe(false)
  })

  // Regression (2026-11-15): the old test (cosine over 0.15) let dots just behind the limb through from
  // five Moon radii, where the horizon is at a cosine of 0.2.
  it('puts the limb where the tangent from the camera touches the sphere', () => {
    const camera = eye(0, 0, 5)
    // Cosine 0.18 from five radii: behind the limb, though over 0.15.
    const behind = (Math.acos(0.18) * 180) / Math.PI
    expect(nearSide(toVector(0, behind), camera)).toBe(false)
    const before = (Math.acos(0.25) * 180) / Math.PI
    expect(nearSide(toVector(0, before), camera)).toBe(true)
  })
})

describe('the dot a click lands on', () => {
  const dots = [
    { id: 'A', x: 100, y: 100 },
    { id: 'B', x: 106, y: 100 },
    { id: 'C', x: 300, y: 300 },
  ]

  it('is the nearest within the radius', () => {
    expect(nearestMarker(dots, { x: 104, y: 100 }, 8)?.id).toBe('B')
    expect(nearestMarker(dots, { x: 101, y: 101 }, 8)?.id).toBe('A')
  })

  it('is none when every dot is further than the radius: the free point stays a free point', () => {
    expect(nearestMarker(dots, { x: 200, y: 200 }, 8)).toBeNull()
    expect(nearestMarker(dots, { x: 109, y: 109 }, HIT_PX.mouse)).toBeNull()
    expect(nearestMarker([], { x: 0, y: 0 }, 100)).toBeNull()
  })

  it('takes a finger a little further than a mouse', () => {
    expect(hitRadius('touch')).toBeGreaterThan(hitRadius('mouse'))
    expect(hitRadius('pen')).toBe(HIT_PX.mouse)
    expect(hitRadius(undefined)).toBe(HIT_PX.mouse)
  })
})
