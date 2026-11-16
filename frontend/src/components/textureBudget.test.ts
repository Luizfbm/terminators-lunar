import { afterEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { fitTexture, textureSize } from './textureBudget'

afterEach(() => vi.unstubAllGlobals())
it('caps square and global map allocations without upscaling smaller images', () => {
  expect(textureSize(8192, 8192, 2048)).toEqual({ width: 2048, height: 2048 })
  expect(textureSize(8192, 4096, 1024)).toEqual({ width: 1024, height: 512 })
  expect(textureSize(512, 128, 1024)).toEqual({ width: 512, height: 128 })
  expect(() => textureSize(1, 2, 0)).toThrow()
})
it('replaces the image before upload while preserving texture colour semantics', () => {
  const drawImage = vi.fn()
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) }
  vi.stubGlobal('document', { createElement: () => canvas })
  const source = { width: 8192, height: 4096 }
  const texture = new THREE.Texture(source)
  texture.colorSpace = THREE.SRGBColorSpace
  expect(fitTexture(texture, 2048)).toBe(true)
  expect(texture.image).toBe(canvas)
  expect(drawImage).toHaveBeenCalledWith(source, 0, 0, 2048, 1024)
  expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
  expect(source.width).toBe(8192)
})
it('refuses an oversized upload when a resize canvas is unavailable', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
  expect(fitTexture(new THREE.Texture({ width: 8192, height: 8192 }), 1024)).toBe(false)
})
