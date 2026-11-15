import * as THREE from 'three'
import { LUNAR_LAMBERT } from '../domain/regolith'

/**
 * What is left on a surface no Sun reaches, as a light strength (the surface keeps this over pi of
 * its colour). It is neutral, not blue: the Moon has no sky to scatter light, and this stands in
 * for light bounced off the ground and the Earth. A visibility aid, not Earthshine: it does not
 * follow the Earth's phase or height. The one open product point of issue #250.
 */
export const SHADOW_FLOOR = 0.06

/** The line of three's Lambert shader that adds up the Sun's light on a surface, as it is in three 0.187. */
const LAMBERT_SUM = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );'

/**
 * The same line under the Lunar-Lambert mix (`domain/regolith.ts`): `irradiance` already carries
 * `μ0`, so the Lambert term is times one and the Lommel-Seeliger one times `exposure / (μ0 + μ)`, with
 * `μ` the cosine of the eye's angle from the normal (`dotNV`).
 */
const REGOLITH_SUM = `float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
	float regolithGain = ${(1 - LUNAR_LAMBERT.weight).toFixed(6)} + ${(LUNAR_LAMBERT.weight * LUNAR_LAMBERT.exposure).toFixed(6)} / ( dotNL + max( dotNV, 0.001 ) );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor ) * regolithGain;`

/** three's Lambert chunk with that line swapped for the Lunar-Lambert mix; throws if three has changed it, so an upgrade cannot silently go back to plain Lambert. */
export function regolithChunk(chunk: string = THREE.ShaderChunk.lights_lambert_pars_fragment): string {
  if (!chunk.includes(LAMBERT_SUM)) throw new Error('three’s Lambert shader no longer has the line the regolith law replaces')
  return chunk.replace(LAMBERT_SUM, REGOLITH_SUM)
}

/** A surface that reflects the Sun as dry regolith does (Lunar-Lambert, `domain/regolith.ts`), with the same colour, grain and relief maps as any other. */
export function regolithMaterial(parameters: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial(parameters)
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>', regolithChunk())
  }
  material.customProgramCacheKey = () => `regolith-lunar-lambert-${LUNAR_LAMBERT.weight}-${LUNAR_LAMBERT.exposure}`
  return material
}
