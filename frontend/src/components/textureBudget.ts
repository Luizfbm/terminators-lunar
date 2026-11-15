import type { Texture } from 'three'

/** Bound visual texture allocation, independently of the GPU's maximum supported dimension. */
export function textureSize(width: number, height: number, limit: number) {
  if (![width, height, limit].every(value => Number.isInteger(value) && value > 0)) {
    throw new RangeError('Texture dimensions and limit must be positive integers')
  }
  const scale = Math.min(1, limit / Math.max(width, height))
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) }
}

/** Resize display images before their first GPU upload. Measured DEM arrays never enter here. */
export function fitTexture(texture: Texture, limit: number): boolean {
  const source = texture.image as HTMLImageElement | HTMLCanvasElement
  const size = textureSize(source.width, source.height, limit)
  if (size.width === source.width && size.height === source.height) return true
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) return false // Never upload an oversized image if resizing is unavailable.
  context.drawImage(source, 0, 0, size.width, size.height)
  texture.image = canvas
  texture.needsUpdate = true
  return true
}
