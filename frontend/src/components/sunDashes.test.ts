import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { direction, GROUND_FIELD_OF_VIEW_DEG } from '../domain/skyScene'
import { dashPattern, MIN_GAP_IN_DASHES } from '../domain/sunDashes'
import { sunDashes } from './sunDashes'

const BODIES = 20000

/**
 * The Sun's path over a Window as the Sky builds it: 320 samples (PATH_POINTS) along the arc the Sun sweeps in the Window,
 * a degree or so up and down. The default Window on screen is ten days, so a third of the way round: 0.4 degrees a sample.
 */
const loop = (sweepDeg = 360) =>
  Array.from({ length: 320 }, (_, at) => new THREE.Vector3(...direction((at / 320) * sweepDeg, 1.5 * Math.sin((at / 320) * Math.PI * 6))).multiplyScalar(BODIES))

const camera = (yaw: number, pitch: number, width: number, height: number) => {
  const view = new THREE.PerspectiveCamera(GROUND_FIELD_OF_VIEW_DEG, width / height, 0.02, 60000)
  view.position.set(0, 0, 0)
  view.lookAt(new THREE.Vector3(...direction(yaw, pitch)).multiplyScalar(10))
  view.updateMatrixWorld()
  return view
}

const dots = (dashes: ReturnType<typeof sunDashes>) => {
  const position = dashes.object.geometry.getAttribute('position')
  const count = dashes.object.geometry.drawRange.count
  return Array.from({ length: count }, (_, at) => new THREE.Vector3().fromBufferAttribute(position, at))
}

const onScreen = (point: THREE.Vector3, view: THREE.Camera, width: number, height: number) => {
  const local = point.clone().applyMatrix4(view.matrixWorldInverse)
  const ndc = local.clone().applyMatrix4(view.projectionMatrix)
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height, front: local.z < 0 }
}

/** The dots of a dash run together (a step of 1.5 px); the next dash starts a gap away. Splits the dots into dashes. */
const asDashes = (points: { x: number; y: number }[]) => {
  const dashes: { x: number; y: number }[][] = []
  points.forEach((point, at) => {
    const before = points[at - 1]
    if (!before || Math.hypot(point.x - before.x, point.y - before.y) > 4) dashes.push([point])
    else dashes[dashes.length - 1].push(point)
  })
  return dashes
}

const stages = [
  { name: 'a desktop', width: 1440, height: 723, dpr: 1 },
  { name: 'a retina laptop', width: 1440, height: 723, dpr: 2 },
  { name: 'a phone', width: 390, height: 506, dpr: 3 },
]

describe('the Sun path dashes in the sky of a landing view (issue 150)', () => {
  for (const stage of stages) {
    for (const sweep of [360, 122, 40]) it(`keeps a clear gap between dashes on ${stage.name}, for a path of ${sweep} degrees, looking any way round the horizon, level and tilted`, () => {
      const path = loop(sweep)
      const dashes = sunDashes(0xf5bd3a)
      dashes.setPath(path)
      let drawn = 0
      for (const pitch of [-10, 8, 30, 55, 70]) {
        for (let yaw = 0; yaw < 360; yaw += 30) {
          const view = camera(yaw, pitch, stage.width, stage.height)
          dashes.update(view, stage.width, stage.height, stage.dpr)
          const seen = dots(dashes)
            .map((dot) => onScreen(dot, view, stage.width, stage.height))
            .filter((dot) => dot.front)
          const runs = asDashes(seen)
          drawn += runs.length
          // The gap the pattern asks for, in this stage's pixels, as a floor: whatever is on screen is at least this far from the next dash.
          const wanted = dashPattern(0, stage.dpr)
          const floor = Math.min(wanted.gapPx, wanted.dashPx * MIN_GAP_IN_DASHES) - 1.5
          runs.forEach((run, at) => {
            if (at === 0) return
            const last = runs[at - 1][runs[at - 1].length - 1]
            const first = run[0]
            expect(Math.hypot(first.x - last.x, first.y - last.y), `yaw ${yaw} pitch ${pitch}`).toBeGreaterThanOrEqual(floor)
          })
        }
      }
      expect(drawn).toBeGreaterThan(sweep === 40 ? 10 : 50)
      dashes.dispose()
    })
  }

  it('is what the bug asked for: drawn as before, one dot per sample, the path ran together to a few px in the default Window', () => {
    const path = loop(122)
    let closest = Infinity
    let farthest = 0
    for (const pitch of [8, 30, 55, 70]) {
      for (let yaw = 0; yaw < 360; yaw += 30) {
        const view = camera(yaw, pitch, 1440, 723)
        const seen = path.map((point) => onScreen(point, view, 1440, 723))
        seen.forEach((point, at) => {
          const before = seen[at - 1]
          if (!before || !point.front || !before.front || Math.abs(point.x) > 1440 || Math.abs(point.y) > 723) return
          const step = Math.hypot(point.x - before.x, point.y - before.y)
          closest = Math.min(closest, step)
          farthest = Math.max(farthest, step)
        })
      }
    }
    // Dots 2 px wide, a few px apart: a dotted line that reads as a solid one. The dashes keep at least their gap.
    expect(closest).toBeLessThan(6)
    expect(dashPattern(0, 1).gapPx).toBeGreaterThan(closest * 1.5)
    expect(farthest).toBeGreaterThan(closest)
  })

  it('lays its dots on the path between its own samples and leaves the samples as they were', () => {
    const path = loop()
    const before = path.map((point) => point.clone())
    const dashes = sunDashes(0xf5bd3a)
    dashes.setPath(path)
    const view = camera(120, 8, 1440, 723)
    dashes.update(view, 1440, 723, 2)
    expect(path.length).toBe(before.length)
    path.forEach((point, at) => expect(point.equals(before[at])).toBe(true))
    const segments = path.slice(1).map((end, at) => new THREE.Line3(path[at], end))
    const target = new THREE.Vector3()
    const found = dots(dashes)
    expect(found.length).toBeGreaterThan(0)
    for (const dot of found) {
      const nearest = Math.min(...segments.map((segment) => segment.closestPointToPoint(dot, true, target).distanceTo(dot)))
      expect(nearest).toBeLessThan(2)
    }
    dashes.dispose()
  })

  it('draws the same dashes again for the same view, and new ones once the view or the stage changes', () => {
    const dashes = sunDashes(0xf5bd3a)
    dashes.setPath(loop())
    const view = camera(0, 8, 1000, 600)
    dashes.update(view, 1000, 600, 1)
    const first = dots(dashes).map((dot) => dot.toArray().join())
    dashes.update(view, 1000, 600, 1)
    expect(dots(dashes).map((dot) => dot.toArray().join())).toEqual(first)
    dashes.update(view, 400, 240, 1)
    expect(dots(dashes).length).not.toBe(first.length)
    dashes.dispose()
  })

  it('draws nothing for a path with no samples', () => {
    const dashes = sunDashes(0xf5bd3a)
    dashes.setPath([])
    dashes.update(camera(0, 8, 1000, 600), 1000, 600, 2)
    expect(dots(dashes)).toEqual([])
    dashes.dispose()
  })
})
