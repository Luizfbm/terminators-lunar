import type { WebGLRenderer } from 'three'

const owners = new WeakMap<HTMLCanvasElement, WebGLRenderer>()

/** A canvas can be reused immediately by React StrictMode or hot reload. */
export function ownRenderer(renderer: WebGLRenderer): void {
  owners.set(renderer.domElement, renderer)
}

/** Release buffers and the context, unless a replacement renderer already owns that canvas. */
export function releaseRenderer(renderer: WebGLRenderer): void {
  renderer.dispose()
  const canvas = renderer.domElement
  if (owners.get(canvas) !== renderer) return
  owners.delete(canvas)
  queueMicrotask(() => {
    if (!owners.has(canvas)) renderer.forceContextLoss()
  })
}
