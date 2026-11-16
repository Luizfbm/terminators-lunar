import * as THREE from 'three'
import { planetMagnitudes, PLANETS, planetsInTheSky, pointLook, type PlanetId, type SkyPlanet } from '../domain/planets'
import type { LatLon } from '../domain/sky'

/**
 * The seven planets as points of light in the backdrop scene, behind the Moon (ADR 0007). Illustration
 * only: a planet is far under a pixel across, so each is a soft round point, as big and as strong as its
 * visual magnitude says (`pointLook`). They are drawn in the same scene as the Sun and the Earth and
 * seen by the same camera, so the Moon covers them where it is in front, as it covers those two.
 */

/** Beyond the Sun (500) and the Earth (400) of the backdrop, inside its far plane (1000). */
const PLANET_DISTANCE = 800

/** A soft round dot, drawn once into a small canvas: solid at the heart, fading out at the edge. */
function dotTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.9)')
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.25)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

export interface PlanetBackdrop {
  /** Where each planet is, as a unit vector in the globe's axes, and its magnitude: empty until `place` has the Cursor, the Sun and the Earth. */
  planets: readonly SkyPlanet[]
  /** The point of each planet, at its place in the backdrop, to project with the backdrop's camera. */
  points: ReadonlyMap<PlanetId, THREE.Points>
  /**
   * Puts the planets where they are at an instant, given where the answer puts the Earth and the Sun at
   * that same instant. With no instant, or either body missing, there is no frame to put them in, and
   * none is drawn. Cheap to call every frame: it works again only when the instant or the bodies change.
   */
  place: (ms: number | undefined, earth: LatLon | null | undefined, sun: LatLon | null | undefined) => void
  dispose: () => void
}

export function planetBackdrop(sky: THREE.Scene, pixelRatio: number): PlanetBackdrop {
  const texture = dotTexture()
  const shape = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
  const points = new Map<PlanetId, THREE.Points>()
  for (const planet of PLANETS) {
    const point = new THREE.Points(
      shape,
      new THREE.PointsMaterial({
        color: planet.colour,
        map: texture,
        size: 1,
        sizeAttenuation: false,
        transparent: true,
        depthWrite: false,
      }),
    )
    point.visible = false
    point.frustumCulled = false
    sky.add(point)
    points.set(planet.id, point)
  }

  let key = ''
  // A magnitude moves by hundredths in a day: it is asked once a day.
  let magnitudesDay = NaN
  let magnitudes: Record<PlanetId, number> | null = null
  const backdrop: PlanetBackdrop = {
    planets: [],
    points,
    place(ms, earth, sun) {
      if (ms === undefined || !earth || !sun) {
        key = ''
        backdrop.planets = []
        for (const point of points.values()) point.visible = false
        return
      }
      const next = `${ms}|${earth.latitude_deg}|${earth.longitude_deg}|${sun.latitude_deg}|${sun.longitude_deg}`
      if (next === key) return
      key = next
      const day = Math.floor(ms / 86_400_000)
      if (day !== magnitudesDay || !magnitudes) {
        magnitudesDay = day
        magnitudes = planetMagnitudes(ms)
      }
      const planets = planetsInTheSky(ms, earth, sun, magnitudes)
      // Nothing is drawn from numbers that are not numbers.
      backdrop.planets = planets.filter((planet) => planet.direction.every(Number.isFinite) && Number.isFinite(planet.magnitude))
      for (const [id, point] of points) {
        const planet = backdrop.planets.find((entry) => entry.id === id)
        point.visible = planet !== undefined
        if (!planet) continue
        const look = pointLook(planet.magnitude)
        const material = point.material as THREE.PointsMaterial
        material.size = look.sizePx * pixelRatio
        material.opacity = look.opacity
        point.position.set(...planet.direction).multiplyScalar(PLANET_DISTANCE)
      }
    },
    dispose() {
      for (const point of points.values()) {
        sky.remove(point)
        ;(point.material as THREE.Material).dispose()
      }
      shape.dispose()
      texture.dispose()
    },
  }
  return backdrop
}

/** A direction in the globe's axes as a three.js vector: the planets and the Sun and the Earth share them. */
export const planetWay = (planet: SkyPlanet): THREE.Vector3 => new THREE.Vector3(...planet.direction).normalize()
