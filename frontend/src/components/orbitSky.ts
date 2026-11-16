import * as THREE from 'three'
import { earthAttitude, subLunarPoint } from '../domain/earthFace'
import { chooseLabels, PLANETS, pointLook, type Box, type LabelCandidate } from '../domain/planets'
import { toVector, type LatLon } from '../domain/sky'
import { BACKDROP_EARTH_DISTANCE, BACKDROP_SUN_DISTANCE, BACKDROP_NEAR, BACKDROP_FAR, discRadius, sphereRadius, moonHides } from '../domain/spaceScale'
import { planetBackdrop, planetWay } from './planetBackdrop'
import { earthMaterial, glowTexture, loadEarthMap, SUN } from './spaceBodies'

export interface OrbitSkyState {
  sun: LatLon | null
  earth?: LatLon | null
  cursorMs?: number
  sunRadiusDeg?: number
  earthRadiusDeg?: number
}

/** The pull's orbital backdrop, isolated from all landing renderers and scientific answers. */
export function orbitSky(renderer: THREE.WebGLRenderer, host: HTMLElement, labels: HTMLElement) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, BACKDROP_NEAR, BACKDROP_FAR)
  const sun = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: SUN }))
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, transparent: true }))
  const shade = earthMaterial()
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), shade)
  scene.add(sun, halo, earth)
  const planets = planetBackdrop(scene, renderer.getPixelRatio())
  let gone = false
  let earthMap: THREE.Texture | null = null
  loadEarthMap(shade, renderer.capabilities.getMaxAnisotropy(), () => gone, texture => { earthMap = texture })
  const vector = (place: LatLon) => new THREE.Vector3(...toVector(place.latitude_deg, place.longitude_deg))
  const validRadius = (radius: number | undefined): radius is number => radius !== undefined && Number.isFinite(radius) && radius > 0
  const hideLabels = () => { for (const child of labels.children) (child as HTMLElement).hidden = true }
  return {
    draw(mainCamera: THREE.PerspectiveCamera, state: OrbitSkyState, enabled: boolean, planetsOn: boolean, settled: boolean) {
      hideLabels()
      host.dataset.planets = ''
      host.dataset.planetNames = ''
      for (const body of ['sun', 'earth']) for (const axis of ['X', 'Y', 'R']) host.dataset[body + axis] = ''
      if (!enabled) return
      mainCamera.updateMatrixWorld()
      camera.quaternion.copy(mainCamera.quaternion)
      camera.aspect = mainCamera.aspect
      camera.fov = mainCamera.fov
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      const sunWay = state.sun ? vector(state.sun) : null
      const earthWay = state.earth ? vector(state.earth) : null
      sun.visible = halo.visible = !!sunWay && validRadius(state.sunRadiusDeg)
      if (sunWay && validRadius(state.sunRadiusDeg)) {
        const radius = discRadius(BACKDROP_SUN_DISTANCE, state.sunRadiusDeg)
        sun.position.copy(sunWay).multiplyScalar(BACKDROP_SUN_DISTANCE)
        sun.scale.setScalar(radius)
        sun.lookAt(0, 0, 0)
        halo.position.copy(sun.position).multiplyScalar(1.02)
        halo.scale.setScalar(radius * 14)
      }
      earth.visible = !!earthWay && !!sunWay && validRadius(state.earthRadiusDeg)
      if (earthWay && sunWay && validRadius(state.earthRadiusDeg)) {
        earth.position.copy(earthWay).multiplyScalar(BACKDROP_EARTH_DISTANCE)
        earth.scale.setScalar(sphereRadius(BACKDROP_EARTH_DISTANCE, state.earthRadiusDeg))
        shade.uniforms.sunDirection.value.copy(sunWay)
        if (state.cursorMs !== undefined) {
          const [x, y, z] = earthAttitude(subLunarPoint(state.cursorMs), 0, earthWay.clone().negate().toArray())
          earth.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)))
        }
      }
      planets.place(state.cursorMs, state.earth, state.sun)
      for (const [id, point] of planets.points) point.visible = planetsOn && planets.planets.some(p => p.id === id)
      renderer.render(scene, camera)

      const ahead = camera.getWorldDirection(new THREE.Vector3())
      const across = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const placed = (body: THREE.Object3D, way: THREE.Vector3 | null, radius: number) => {
        if (!body.visible || !way || way.dot(ahead) <= 0) return null
        if (moonHides(mainCamera.position.toArray(), way.clone().multiplyScalar(1e6).add(mainCamera.position).toArray())) return null
        const centre = body.position.clone().project(camera)
        const edge = body.position.clone().addScaledVector(across, radius).project(camera)
        const x = (centre.x + 1) / 2 * host.clientWidth, y = (1 - centre.y) / 2 * host.clientHeight
        if (x < 0 || x > host.clientWidth || y < 0 || y > host.clientHeight) return null
        return { x, y, r: Math.abs(edge.x - centre.x) / 2 * host.clientWidth }
      }
      const bounds: Box = { left: 8, top: 48, right: host.clientWidth - 8, bottom: host.clientHeight - 60 }
      const keepClear: Box[] = []
      if (settled) {
        const parent = host.getBoundingClientRect()
        for (const element of host.querySelectorAll<HTMLElement>('.globe-menu, .globe-menu-toggle, .globe__pin:not([hidden]), .globe__poles text, .globe-mark:not([hidden])')) {
          const r = element.getBoundingClientRect()
          if (r.width && r.height) keepClear.push({ left: r.left - parent.left - 4, right: r.right - parent.left + 4, top: r.top - parent.top - 4, bottom: r.bottom - parent.top + 4 })
        }
      }
      for (const [name, body, way] of [['sun', sun, sunWay], ['earth', earth, earthWay]] as const) {
        const spot = placed(body, way, body.scale.x)
        if (!spot) continue
        host.dataset[name + 'X'] = String(Math.round(spot.x))
        host.dataset[name + 'Y'] = String(Math.round(spot.y))
        host.dataset[name + 'R'] = spot.r.toFixed(2)
        const label = labels.querySelector<HTMLElement>(`[data-body="${name}"]`)!
        const box = { left: spot.x + spot.r + 8, right: spot.x + spot.r + 48, top: spot.y - 7, bottom: spot.y + 7 }
        label.hidden = !settled || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom || keepClear.some(r => r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top)
        label.style.left = `${box.left}px`; label.style.top = `${spot.y}px`
        if (!label.hidden) keepClear.push(box)
        keepClear.push({ left: spot.x - spot.r - 10, right: spot.x + spot.r + 10, top: spot.y - spot.r - 10, bottom: spot.y + spot.r + 10 })
      }
      const candidates: LabelCandidate[] = []
      for (const planet of planetsOn ? planets.planets : []) {
        const spot = placed(planets.points.get(planet.id)!, planetWay(planet), 0)
        if (!spot) continue
        candidates.push({ ...spot, id: planet.id, magnitude: planet.magnitude, gap: pointLook(planet.magnitude).sizePx / 2 + 4, width: planet.id.length * 6.4 + 2, height: 14 })
      }
      host.dataset.planets = candidates.map(p => p.id).join(',')
      const named = settled ? chooseLabels(candidates, bounds, keepClear) : new Map()
      host.dataset.planetNames = [...named.keys()].join(',')
      for (const { id } of PLANETS) {
        const label = labels.querySelector<HTMLElement>(`[data-planet="${id}"]`)!
        const spot = candidates.find(p => p.id === id), side = named.get(id)
        if (!spot || !side) continue
        label.hidden = false
        label.dataset.side = side
        label.style.left = `${spot.x + (side === 'right' ? spot.gap : -spot.gap)}px`
        label.style.top = `${spot.y}px`
        label.style.opacity = String(.55 + .45 * pointLook(spot.magnitude).brightness)
      }
    },
    dispose() {
      gone = true
      planets.dispose()
      earthMap?.dispose()
      for (const body of [sun, earth]) { body.geometry.dispose(); body.material.dispose() }
      halo.material.map?.dispose(); halo.material.dispose()
    },
  }
}
