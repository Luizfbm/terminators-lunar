import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { regolithChunk, regolithMaterial, SHADOW_FLOOR } from './regolith'

describe('the terrain material', () => {
  it('swaps the Lambert sum in three for the Lunar-Lambert one, and fails loudly if three has changed that line', () => {
    const chunk = regolithChunk()
    expect(chunk).toContain('0.700000 + 0.048000 / ( dotNL + max( dotNV, 0.001 ) )')
    expect(chunk).not.toBe(THREE.ShaderChunk.lights_lambert_pars_fragment)
    expect(() => regolithChunk('void RE_Direct_Lambert() {}')).toThrow(/no longer has the line/)
  })

  it('patches the shader of the material that uses it, and of no other', () => {
    const own = regolithMaterial({ color: 0x888888 })
    const shader = { fragmentShader: '#include <lights_lambert_pars_fragment>\nvoid main() {}' } as THREE.WebGLProgramParametersWithUniforms
    own.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer)
    expect(shader.fragmentShader).toContain('dotNV')
    expect(new THREE.MeshLambertMaterial().onBeforeCompile).not.toBe(own.onBeforeCompile)
  })

  it('leaves a neutral floor: no blue sky, a small light', () => {
    expect(SHADOW_FLOOR).toBeGreaterThan(0)
    expect(SHADOW_FLOOR).toBeLessThan(0.2)
  })
})
