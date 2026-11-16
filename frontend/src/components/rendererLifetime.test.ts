import { expect, it, vi } from 'vitest'
import type { WebGLRenderer } from 'three'
import { ownRenderer, releaseRenderer } from './rendererLifetime'
const renderer = (canvas = {} as HTMLCanvasElement) => ({ domElement: canvas, dispose: vi.fn(), forceContextLoss: vi.fn() })
it('releases the context after teardown', async () => {
  const value = renderer()
  ownRenderer(value as unknown as WebGLRenderer)
  releaseRenderer(value as unknown as WebGLRenderer)
  expect(value.dispose).toHaveBeenCalledOnce()
  await Promise.resolve()
  expect(value.forceContextLoss).toHaveBeenCalledOnce()
})
it('does not destroy the replacement context on StrictMode effect replay', async () => {
  const first = renderer()
  const next = renderer(first.domElement)
  ownRenderer(first as unknown as WebGLRenderer)
  releaseRenderer(first as unknown as WebGLRenderer)
  ownRenderer(next as unknown as WebGLRenderer)
  await Promise.resolve()
  expect(first.forceContextLoss).not.toHaveBeenCalled()
  releaseRenderer(next as unknown as WebGLRenderer)
  await Promise.resolve()
  expect(next.forceContextLoss).toHaveBeenCalledOnce()
})
