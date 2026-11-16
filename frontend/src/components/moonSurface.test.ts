import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { lunarLambert } from '../domain/regolith'
import { MOON_SUN_STRENGTH, moonMaterial } from './moonSurface'

describe('the globe at level 1 is lit as dry regolith, like the ground view', () => {
  it('is a regolith surface: three’s Lambert shader patched with the Lunar-Lambert sum', () => {
    const material = moonMaterial()
    expect(material).toBeInstanceOf(THREE.MeshLambertMaterial)
    const shader = { fragmentShader: '#include <lights_lambert_pars_fragment>\nvoid main() {}' } as THREE.WebGLProgramParametersWithUniforms
    material.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer)
    expect(shader.fragmentShader).toContain('0.700000 + 0.048000 / ( dotNL + max( dotNV, 0.001 ) )')
    expect(material.customProgramCacheKey()).toMatch(/^regolith-lunar-lambert-/)
  })

  it('keeps the grey it had, and takes colour and relief like before', () => {
    const material = moonMaterial()
    expect(material.color.getHex()).toBe(0x9a9891)
    material.map = new THREE.Texture()
    material.normalMap = new THREE.Texture()
    material.normalScale.set(1.6, 1.6)
    expect(material.normalScale.x).toBe(1.6)
  })

  it('raises the Sun so the sub-solar point seen from above keeps the brightness it had under Lambert (3.2)', () => {
    expect(MOON_SUN_STRENGTH * lunarLambert(1, 1)).toBeCloseTo(3.2, 10)
    expect(MOON_SUN_STRENGTH).toBeGreaterThan(3.2)
    expect(MOON_SUN_STRENGTH).toBeLessThan(3.2 * 1.5)
  })
})

import { afterEach, vi } from 'vitest'
import { dressMoon } from './moonSurface'
// The shape of public/moon/south_cap.json. That folder is built on the VPS and is not in git, so
// a test cannot import the real file.
const cap = { sphere_radius_m: 1737400, size_px: 512, x_min_m: -378000, y_max_m: 378000, metres_per_pixel: 1476 }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function loader() {
  const pending: { file: string; texture: THREE.Texture; finish: () => void }[] = []
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((url, loaded) => {
    const texture = new THREE.Texture({ width: 512, height: 512 } as unknown as HTMLImageElement)
    pending.push({ file: url, texture, finish: () => loaded?.(texture) })
    return texture
  })
  return pending
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

it('does not reattach textures after disposal when their Promise settles late', async () => {
  const pending = loader()
  const material = new THREE.MeshLambertMaterial()
  const colour = vi.fn()
  const dress = dressMoon(new THREE.Scene(), material, 1, { tier: 'low', onColour: colour })
  pending.forEach(item => item.finish())
  dress.dispose()
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
  const dress = dressMoon(new THREE.Scene(), new THREE.MeshLambertMaterial(), 1, { tier: 'weak' })
  dress.dispose()
  release({ ok: true, json: async () => cap })
  await flush()
  expect(pending).toHaveLength(2)
})
it('removes polar meshes and releases owned textures on scene teardown', async () => {
  const pending = loader()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => cap })))
  const scene = new THREE.Scene()
  const dress = dressMoon(scene, new THREE.MeshLambertMaterial(), 1, { tier: 'weak' })
  await flush()
  const released = pending.map(item => vi.spyOn(item.texture, 'dispose'))
  pending.forEach(item => item.finish())
  await flush()
  expect(scene.children).toHaveLength(1)
  dress.dispose()
  expect(scene.children).toHaveLength(0)
  released.forEach(spy => expect(spy).toHaveBeenCalledOnce())
})

it('loads polar overlays only on demand on the low tier, once, and never after disposal', async () => {
  loader()
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => cap }))
  vi.stubGlobal('fetch', fetcher)
  const dress = dressMoon(new THREE.Scene(), new THREE.MeshLambertMaterial(), 1, { tier: 'low' })
  expect(fetcher).not.toHaveBeenCalled()
  dress.setPolar(true); dress.setPolar(true)
  await flush()
  expect(fetcher).toHaveBeenCalledTimes(2)
  dress.dispose(); dress.setPolar(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

describe('every image is fitted to its tier before the first upload', () => {
  const drawn: { width: number; height: number }[] = []
  const stubCanvas = () => {
    drawn.length = 0
    vi.stubGlobal('document', {
      createElement: () => {
        const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => drawn.push({ width: canvas.width, height: canvas.height }) }) }
        return canvas
      },
    })
  }
  const loaderOf = (width: number, height: number) => {
    const made: THREE.Texture[] = []
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, loaded) => {
      const texture = new THREE.Texture({ width, height } as unknown as HTMLImageElement)
      made.push(texture)
      queueMicrotask(() => loaded?.(texture))
      return texture
    })
    return made
  }

  it('the weak tier fits a 4096 x 2048 Moon to 2048 x 1024', async () => {
    stubCanvas()
    loaderOf(4096, 2048)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    const material = new THREE.MeshLambertMaterial()
    const dress = dressMoon(new THREE.Scene(), material, 1, { tier: 'weak' })
    await vi.waitFor(() => expect(material.map).not.toBeNull())
    expect(drawn.length).toBeGreaterThanOrEqual(2)
    expect(drawn.every(size => size.width === 2048 && size.height === 1024)).toBe(true)
    dress.dispose()
  })

  it('the low tier fits to 1024 x 512', async () => {
    stubCanvas()
    loaderOf(4096, 2048)
    const material = new THREE.MeshLambertMaterial()
    const dress = dressMoon(new THREE.Scene(), material, 1, { tier: 'low' })
    await vi.waitFor(() => expect(material.map).not.toBeNull())
    expect(drawn.every(size => size.width === 1024 && size.height === 512)).toBe(true)
    dress.dispose()
  })

  it('the strong tier leaves a 4096 x 2048 image and the 8192 x 4096 one as they are, then swaps in the 8k pair', async () => {
    stubCanvas()
    const made = loaderOf(8192, 4096)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    const material = new THREE.MeshLambertMaterial()
    const sizes: string[] = []
    const dress = dressMoon(new THREE.Scene(), material, 1, { tier: 'strong', onColour: size => sizes.push(size) })
    await vi.waitFor(() => expect(sizes).toEqual(['4k', '8k']))
    expect(drawn).toEqual([])
    expect(made.length).toBeGreaterThanOrEqual(4)
    dress.dispose()
  })

  it('the tier’s limit never goes above the GPU’s: a 4096 px GPU fits the strong tier to 4096', async () => {
    stubCanvas()
    loaderOf(8192, 4096)
    const material = new THREE.MeshLambertMaterial()
    const dress = dressMoon(new THREE.Scene(), material, 1, { tier: 'strong', maxTextureSize: 4096 })
    await vi.waitFor(() => expect(material.map).not.toBeNull())
    expect(drawn.every(size => size.width === 4096 && size.height === 2048)).toBe(true)
    dress.dispose()
  })
})
