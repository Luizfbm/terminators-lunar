import * as THREE from 'three'
import { dashAlong, dashPattern, onStageLength, type ScreenPoint } from '../domain/sunDashes'

/** A dot of the dash is this many CSS pixels wide, and the next one starts this far on: they run into one dash. */
const DOT_PX = 2.5
const DOT_STEP_PX = 1.5
/** Beyond this many stage widths or heights from the middle, a sample is as good as off the path: its picture is wild. */
const WILD = 3
/** Room for the dashes: a sample is at most one, and a dash is at most this many dots. */
const MAX_DOTS = 12
/** Dimmer than the Sun's disc, which is the brightest thing on the sky. */
const DASH_BRIGHTNESS = 0.7

/**
 * The Sun's path over the sky of a landing view, as dashes a fixed number of screen pixels apart.
 * It is the engine's own samples (`setPath` takes their positions), drawn as dashes laid on them
 * again whenever the camera or the stage changes: the trajectory itself is never touched.
 */
export function sunDashes(colour: number) {
  const material = new THREE.PointsMaterial({ color: new THREE.Color(colour).multiplyScalar(DASH_BRIGHTNESS), size: DOT_PX, sizeAttenuation: false })
  const dashes = new THREE.Points(new THREE.BufferGeometry(), material)
  // Its dots are placed every frame the picture changes; the bounds of its first, empty state would hide them.
  dashes.frustumCulled = false
  let path: readonly THREE.Vector3[] = []
  let positions = new Float32Array(0)
  let drawnFor = ''
  const eye = new THREE.Vector3()

  return {
    object: dashes,
    /** The samples of the path, in the scene's own units, in order. */
    setPath(samples: readonly THREE.Vector3[]) {
      path = samples
      positions = new Float32Array(samples.length * MAX_DOTS * 3)
      dashes.geometry.dispose()
      dashes.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3))
      dashes.geometry.setDrawRange(0, 0)
      drawnFor = ''
    },
    /**
     * Lays the dashes for the camera as it is now, on a stage `width` by `height` CSS pixels at `devicePixelRatio`.
     * The camera's matrices are current. A picture already drawn is not drawn again.
     */
    update(camera: THREE.Camera, width: number, height: number, devicePixelRatio: number) {
      const key = `${camera.matrixWorldInverse.elements.join(',')}|${camera.projectionMatrix.elements.join(',')}|${width}x${height}@${devicePixelRatio}`
      if (key === drawnFor) return
      drawnFor = key
      const points: ScreenPoint[] = path.map((sample) => {
        eye.copy(sample).applyMatrix4(camera.matrixWorldInverse)
        // In front of the eye: the camera looks down its own -z.
        if (eye.z >= 0) return { x: 0, y: 0, visible: false }
        eye.applyMatrix4(camera.projectionMatrix)
        const x = ((eye.x + 1) / 2) * width
        const y = ((1 - eye.y) / 2) * height
        const wild = Math.abs(x - width / 2) > WILD * width || Math.abs(y - height / 2) > WILD * height
        return { x, y, visible: !wild }
      })
      const pattern = dashPattern(onStageLength(points, width, height), devicePixelRatio)
      let count = 0
      for (const dash of dashAlong(points, pattern)) {
        const centre = path[dash.index]
        const before = dash.back > 0 ? path[dash.index - 1] : centre
        const after = dash.ahead > 0 ? path[dash.index + 1] : centre
        const from = centre.clone().lerp(before, dash.back)
        const to = centre.clone().lerp(after, dash.ahead)
        // The dots along it, a step apart, at least two so a short dash is still a dash.
        const dots = Math.max(2, Math.min(MAX_DOTS, Math.round(pattern.dashPx / DOT_STEP_PX) + 1))
        for (let dot = 0; dot < dots; dot++) {
          const spot = from.clone().lerp(to, dot / (dots - 1))
          positions[count * 3] = spot.x
          positions[count * 3 + 1] = spot.y
          positions[count * 3 + 2] = spot.z
          count++
        }
      }
      dashes.geometry.attributes.position.needsUpdate = true
      dashes.geometry.setDrawRange(0, count)
    },
    dispose() {
      dashes.geometry.dispose()
      material.dispose()
    },
  }
}
