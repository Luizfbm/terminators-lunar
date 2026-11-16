import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonTier } from './moonBudget'
import { dressMoon, moonMaterial, type MoonDress, type MoonOptions } from './moonSurface'

// The fine patch of the pole (22.5 m per pixel, 8192² on a strong device) is the polar level's: not loaded
// when the page opens, loaded when the view reaches level 2, disposed when it leaves. Textures are stood in
// for by empty ones, the loader and `fetch` by stubs, and every disposal is counted.

const FINE_CAP = {
  sphere_radius_m: 1737400,
  size_px: 8192,
  x_min_m: -92160,
  y_max_m: 92160,
  metres_per_pixel: 22.5,
  files: { normal: 'south_pole_fine_normal.webp', normal_small: 'south_pole_fine_normal_4k.webp', albedo: 'south_pole_fine_albedo.webp' },
}
const CAP = {
  sphere_radius_m: 1737400,
  size_px: 4096,
  x_min_m: -304000,
  y_max_m: 304000,
  metres_per_pixel: 148.4375,
}

let asked: string[]
let textures: { url: string; texture: THREE.Texture }[]
let disposedTextures: Set<THREE.Texture>
let disposedGeometries: Set<THREE.BufferGeometry>
let disposedMaterials: Set<THREE.Material>
let dress: MoonDress | null

const fileOf = (url: string) => new URL(url, 'http://localhost').pathname.split('/').pop() as string
const askedFor = (prefix: string) => asked.filter((url) => fileOf(url).startsWith(prefix))
const polarMeshes = (scene: THREE.Scene) => scene.children.filter((child) => child.renderOrder === 2)
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  asked = []
  textures = []
  disposedTextures = new Set()
  disposedGeometries = new Set()
  disposedMaterials = new Set()
  dress = null
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((url: string, onLoad?: (texture: THREE.Texture) => void) => {
    asked.push(url)
    const texture = new THREE.Texture({ width: 512, height: 512 } as unknown as HTMLImageElement)
    textures.push({ url, texture })
    queueMicrotask(() => onLoad?.(texture))
    return texture
  }) as unknown as typeof THREE.TextureLoader.prototype.load)
  vi.spyOn(THREE.Texture.prototype, 'dispose').mockImplementation(function (this: THREE.Texture) {
    disposedTextures.add(this)
  })
  vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (this: THREE.BufferGeometry) {
    disposedGeometries.add(this)
  })
  vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (this: THREE.Material) {
    disposedMaterials.add(this)
  })
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url)
    const doc = fileOf(url).startsWith('south_pole_fine') ? FINE_CAP : CAP
    return { ok: true, json: async () => doc }
  })
})

afterEach(() => {
  dress?.dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function openMoon(tier: MoonTier, options: Partial<MoonOptions> = {}) {
  const scene = new THREE.Scene()
  dress = dressMoon(scene, moonMaterial(), 1, { tier, ...options })
  // The whole-Moon pair and the cap are level 1's: they come first, whatever the device.
  await vi.waitFor(() => expect(scene.children.length).toBe(1))
  return { scene, dress }
}

describe('the fine patch of the pole belongs to the polar level', () => {
  it('opening the Moon asks for no south_pole_fine file, only the whole Moon and the cap', async () => {
    await openMoon('strong')
    await settle()
    expect(askedFor('south_pole_fine')).toEqual([])
    expect(askedFor('moon_color_4k')).toHaveLength(1)
    expect(askedFor('south_cap')).not.toHaveLength(0)
  })

  it('reaching the polar level loads the 8192 px normal and the albedo, and puts the patch over the Moon', async () => {
    const { scene, dress } = await openMoon('strong')
    dress.setPolar(true)
    await vi.waitFor(() => expect(polarMeshes(scene)).toHaveLength(1))
    expect(askedFor('south_pole_fine').map(fileOf)).toEqual(['south_pole_fine.json', 'south_pole_fine_normal.webp', 'south_pole_fine_albedo.webp'])
  })

  it('a weak device takes the 4096 px normal at the polar level', async () => {
    const { scene, dress } = await openMoon('weak')
    dress.setPolar(true)
    await vi.waitFor(() => expect(polarMeshes(scene)).toHaveLength(1))
    expect(askedFor('south_pole_fine').map(fileOf)).toEqual(['south_pole_fine.json', 'south_pole_fine_normal_4k.webp', 'south_pole_fine_albedo.webp'])
    expect(askedFor('moon_color_8k')).toEqual([])
  })

  it('asking twice for the polar level loads the patch once', async () => {
    const { scene, dress } = await openMoon('strong')
    dress.setPolar(true)
    dress.setPolar(true)
    await vi.waitFor(() => expect(polarMeshes(scene)).toHaveLength(1))
    dress.setPolar(true)
    await settle()
    expect(askedFor('south_pole_fine.json')).toHaveLength(1)
    expect(polarMeshes(scene)).toHaveLength(1)
  })

  it('leaving the polar level takes the patch off the scene and disposes its two textures, its geometry and its material', async () => {
    const { scene, dress } = await openMoon('strong')
    await settle()
    const before = { textures: disposedTextures.size, geometries: disposedGeometries.size, materials: disposedMaterials.size }
    dress.setPolar(true)
    await vi.waitFor(() => expect(polarMeshes(scene)).toHaveLength(1))
    // Still there while the view is at the level.
    expect(disposedTextures.size).toBe(before.textures)
    const patch = polarMeshes(scene)[0] as THREE.Mesh
    dress.setPolar(false)
    expect(polarMeshes(scene)).toHaveLength(0)
    expect(disposedTextures.size - before.textures).toBe(2)
    expect(disposedGeometries.size - before.geometries).toBe(1)
    expect(disposedMaterials.size - before.materials).toBe(1)
    expect(disposedGeometries.has(patch.geometry)).toBe(true)
    expect(disposedMaterials.has(patch.material as THREE.Material)).toBe(true)
    for (const { url, texture } of textures.filter(({ url }) => fileOf(url).startsWith('south_pole_fine'))) {
      expect(disposedTextures.has(texture), url).toBe(true)
    }
    // The level 1 cap stays.
    expect(scene.children).toHaveLength(1)
  })

  it('going back and forth does not pile anything up: each entry is disposed in full on leaving', async () => {
    const { scene, dress } = await openMoon('strong')
    await settle()
    const before = { textures: disposedTextures.size, geometries: disposedGeometries.size, materials: disposedMaterials.size }
    const entries = 5
    for (let entry = 1; entry <= entries; entry++) {
      dress.setPolar(true)
      await vi.waitFor(() => expect(polarMeshes(scene)).toHaveLength(1))
      expect(scene.children).toHaveLength(2)
      dress.setPolar(false)
      expect(scene.children).toHaveLength(1)
    }
    expect(askedFor('south_pole_fine.json')).toHaveLength(entries)
    expect(disposedTextures.size - before.textures).toBe(2 * entries)
    expect(disposedGeometries.size - before.geometries).toBe(entries)
    expect(disposedMaterials.size - before.materials).toBe(entries)
  })

  it('leaving before the patch has arrived disposes what arrives late and never shows it', async () => {
    const { scene, dress } = await openMoon('strong')
    await settle()
    dress.setPolar(true)
    dress.setPolar(false)
    await settle()
    await settle()
    expect(polarMeshes(scene)).toHaveLength(0)
    expect(scene.children).toHaveLength(1)
    // Whatever was asked for in the meantime is not left holding video memory.
    for (const { url, texture } of textures.filter(({ url }) => fileOf(url).startsWith('south_pole_fine'))) {
      expect(disposedTextures.has(texture), url).toBe(true)
    }
  })

  it('freeing the Moon disposes the patch of the polar level too, and the level 1 cap', async () => {
    const { scene, dress } = await openMoon('strong')
    dress.setPolar(true)
    await vi.waitFor(() => expect(polarMeshes(scene)).toHaveLength(1))
    dress.dispose()
    expect(scene.children).toHaveLength(0)
    for (const { url, texture } of textures) expect(disposedTextures.has(texture), url).toBe(true)
    // Nothing is loaded after that, whatever the view says.
    const asking = asked.length
    dress.setPolar(true)
    await settle()
    expect(asked).toHaveLength(asking)
  })
})

describe('the 148 m cap belongs to level 1, except on the low tier', () => {
  it.each(['strong', 'weak'] as const)('the %s tier has the cap on the Moon before the polar level, and keeps it when the level is left', async (tier) => {
    const { scene, dress } = await openMoon(tier)
    expect(askedFor('south_cap_normal')).toHaveLength(1)
    dress.setPolar(true)
    await vi.waitFor(() => expect(polarMeshes(scene)).toHaveLength(1))
    dress.setPolar(false)
    expect(scene.children).toHaveLength(1)
    expect(scene.children[0].renderOrder).toBe(1)
    // The cap's own textures are level 1's: leaving level 2 does not free them.
    for (const { url, texture } of textures.filter(({ url }) => fileOf(url).startsWith('south_cap'))) {
      expect(disposedTextures.has(texture), url).toBe(false)
    }
  })

  it('the low tier opens with the whole Moon only: no south_cap, no south_pole_fine', async () => {
    dress = dressMoon(new THREE.Scene(), moonMaterial(), 1, { tier: 'low' })
    await settle()
    await settle()
    expect(askedFor('south_cap')).toEqual([])
    expect(askedFor('south_pole_fine')).toEqual([])
    expect(askedFor('moon_color_4k')).toHaveLength(1)
  })

  it('the low tier gets the cap and the fine pole together at the polar level, and frees both on leaving', async () => {
    const scene = new THREE.Scene()
    dress = dressMoon(scene, moonMaterial(), 1, { tier: 'low' })
    await settle()
    dress.setPolar(true)
    await vi.waitFor(() => expect(scene.children).toHaveLength(2))
    expect(askedFor('south_cap_normal')).toHaveLength(1)
    expect(askedFor('south_pole_fine_normal_4k')).toHaveLength(1)
    dress.setPolar(false)
    expect(scene.children).toHaveLength(0)
    for (const { url, texture } of textures.filter(({ url }) => /^south_/.test(fileOf(url)))) {
      expect(disposedTextures.has(texture), url).toBe(true)
    }
  })
})

describe('the polar callback follows the fine patch', () => {
  it('says true when the patch is on the Moon and false when it is freed, and says nothing for a patch that never showed', async () => {
    const told: boolean[] = []
    const { scene, dress } = await openMoon('weak', { onPolar: (shown) => told.push(shown) })
    expect(told).toEqual([])
    dress.setPolar(true)
    await vi.waitFor(() => expect(polarMeshes(scene)).toHaveLength(1))
    expect(told).toEqual([true])
    dress.setPolar(false)
    expect(told).toEqual([true, false])
    dress.setPolar(true)
    dress.setPolar(false)
    await settle()
    await settle()
    expect(told).toEqual([true, false])
  })
})
