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
