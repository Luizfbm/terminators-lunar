import type { MoonTier } from './moonBudget'

/**
 * Which tier of `moonBudget.ts` this device is in. Only a strong one takes the Moon's 8192 px images,
 * about 340 MiB of video memory for the colour and relief alone, and a weak device runs out of it: a lost
 * WebGL context, a grey globe. Strong means a fine pointer (a desktop or a laptop, not a phone), a
 * texture limit of at least 8192, and a graphics card that draws in hardware. A browser that draws in
 * software (SwiftShader, llvmpipe) accepts the images and then crawls decoding and uploading them.
 */

/** The smallest texture side the 8192 px images need. */
export const LARGE_MOON_PX = 8192

/** What the graphics driver calls itself when it draws on the CPU. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|lavapipe|softpipe|swrast|software|basic render/i

/** Whether a renderer name, as `WEBGL_debug_renderer_info` gives it, is a software rasteriser. */
export function isSoftwareRenderer(name: string | null | undefined): boolean {
  return Boolean(name) && SOFTWARE_RENDERER.test(name as string)
}

export interface DeviceFacts {
  /** The primary pointer is not a finger: `!matchMedia('(pointer: coarse)').matches`. */
  finePointer: boolean
  /** `gl.MAX_TEXTURE_SIZE`. */
  maxTextureSize: number
  /** The unmasked renderer name, or null when the browser does not say (Firefox hides it). */
  rendererName: string | null
}

/**
 * Whether the device takes the 8192 px images. `refusesHardware` is asked last, and only when the
 * cheaper facts already say yes, because it opens a context of its own.
 */
export function takesLargeMoon(facts: DeviceFacts, refusesHardware: () => boolean): boolean {
  if (!facts.finePointer) return false
  if (facts.maxTextureSize < LARGE_MOON_PX) return false
  if (isSoftwareRenderer(facts.rendererName)) return false
  return !refusesHardware()
}

/** The renderer name of a WebGL context, or null when the browser does not give it. */
export function rendererNameOf(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    if (!info) return null
    const name: unknown = gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
    return typeof name === 'string' ? name : null
  } catch {
    return null
  }
}

/**
 * Whether the browser refuses a context that is not in hardware: it asks for one with
 * `failIfMajorPerformanceCaveat`, which a software renderer does not get. Having no context at all
 * counts as refused. The probe context is released at once.
 */
export function softwareOnly(): boolean {
  try {
    const probe = document.createElement('canvas')
    const options: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true }
    const gl = (probe.getContext('webgl2', options) ?? probe.getContext('webgl', options)) as WebGLRenderingContext | WebGL2RenderingContext | null
    if (!gl) return true
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return false
  } catch {
    return true
  }
}

/** The decision for the page's own renderer context: reads the facts and asks `takesLargeMoon`. */
export function moonIsLarge(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  return takesLargeMoon(
    {
      finePointer: !window.matchMedia('(pointer: coarse)').matches,
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      rendererName: rendererNameOf(gl),
    },
    softwareOnly,
  )
}

/**
 * The tier of this device for the page's own renderer context. `?graphics=low` is the low tier whatever
 * the hardware, and then nothing is probed.
 */
export function moonTier(gl: WebGLRenderingContext | WebGL2RenderingContext, light: boolean): MoonTier {
  if (light) return 'low'
  return moonIsLarge(gl) ? 'strong' : 'weak'
}
