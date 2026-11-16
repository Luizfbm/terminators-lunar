import { afterEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { dressMoon } from './moonSurface'
import cap from '../../public/moon/south_cap.json'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function loader() {
  const pending: { file: string; texture: THREE.Texture; finish: () => void }[] = []
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, loaded) => {
    const texture = new THREE.Texture({ width: 512, height: 512 })
    pending.push({ file: url, texture, finish: () => loaded?.(texture) })
    return texture
  })
  return pending
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

it('does not reattach textures after disposal when their Promise settles late', async () => {
  const pending = loader()
  const material = new THREE.MeshStandardMaterial()
  const colour = vi.fn()
  const dispose = dressMoon(new THREE.Scene(), material, 1, false, undefined, colour, false)
  pending.forEach(item => item.finish())
  dispose()
  await flush()
  expect(material.map).toBeNull()
  expect(material.normalMap).toBeNull()
  expect(colour).not.toHaveBeenCalled()
})
it('does not start polar image loads after a late metadata response on a disposed scene', async () => {
  const pending = loader()
  let release: (value: unknown) => void = () => {}
  const delayed = new Promise(resolve => { release = resolve })
  vi.stubGlobal('fetch', vi.fn(() => delayed))
  const dispose = dressMoon(new THREE.Scene(), new THREE.MeshStandardMaterial(), 1, false)
  dispose()
  release({ ok: true, json: async () => cap })
  await flush()
  expect(pending).toHaveLength(2)
})
it('removes polar meshes and releases owned textures on scene teardown', async () => {
  const pending = loader()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => cap })))
  const scene = new THREE.Scene()
  const dispose = dressMoon(scene, new THREE.MeshStandardMaterial(), 1, false)
  await flush()
  const released = pending.map(item => vi.spyOn(item.texture, 'dispose'))
  pending.forEach(item => item.finish())
  await flush()
  expect(scene.children).toHaveLength(2)
  dispose()
  expect(scene.children).toHaveLength(0)
  released.forEach(spy => expect(spy).toHaveBeenCalledOnce())
})

it('loads polar overlays only on demand in light orbit, once, and never after disposal', async () => {
  loader()
  const fetcher=vi.fn(async () => ({ ok:true, json:async () => cap }))
  vi.stubGlobal('fetch',fetcher)
  const dispose=dressMoon(new THREE.Scene(),new THREE.MeshStandardMaterial(),1,false,undefined,undefined,false,1024)
  expect(fetcher).not.toHaveBeenCalled()
  dispose.loadPolar();dispose.loadPolar()
  await flush()
  expect(fetcher).toHaveBeenCalledTimes(2)
  dispose();dispose.loadPolar()
  expect(fetcher).toHaveBeenCalledTimes(2)
})
