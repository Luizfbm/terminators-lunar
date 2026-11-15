/**
 * How the terrain returns the Sun's light: a mix of Lommel-Seeliger, the law for dry
 * regolith, and Lambert, in the form of the Lunar-Lambert function of planetary photometry:
 *
 *   light = (1 - weight) * μ0  +  weight * exposure * μ0 / (μ0 + μ)
 *
 * `μ0` is the cosine of the Sun's angle from the surface's normal and `μ` the cosine of the eye's.
 * Lambert alone goes as `μ0`. Lommel-Seeliger alone goes as `μ0 / (μ0 + μ)`; seen from the ground,
 * `μ` is about 0.02 and a lit slope returns nearly the same light whatever its tilt, so with no cast
 * shadows in this scene the stretched hills would be drawn flat. The Lambert share gives the slope
 * its shading back.
 *
 * What is chosen, and not fitted to anything measured:
 * - `weight` (how much of the light is Lommel-Seeliger): picked so a 10° slope facing the Sun keeps
 *   about 80% of the contrast it has under Lambert, at the Sun's height in this app (about 8°).
 * - `exposure` (the scale of the Lommel-Seeliger part): picked so flat ground under that Sun, seen
 *   from the Observer, is as bright as it was under Lambert, so the lights keep their strength.
 *   Under a high Sun the ground comes out dimmer than under Lambert.
 * The terrain's shader (`components/regolith.ts`) does the same sum in GLSL, from these constants.
 */
export const LUNAR_LAMBERT = { weight: 0.3, exposure: 0.16 } as const

export function lunarLambert(cosIncidence: number, cosEmission: number, mix: { weight: number; exposure: number } = LUNAR_LAMBERT): number {
  const sun = Math.min(1, Math.max(0, cosIncidence))
  if (sun === 0) return 0
  const eye = Math.min(1, Math.max(0.001, cosEmission))
  return (1 - mix.weight) * sun + (mix.weight * mix.exposure * sun) / (sun + eye)
}
