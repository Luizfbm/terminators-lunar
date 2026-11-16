import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSoftwareRenderer, moonIsLarge, moonTier, rendererNameOf, softwareOnly, takesLargeMoon, type DeviceFacts } from './moonDevice'

const strong: DeviceFacts = { finePointer: true, maxTextureSize: 16384, rendererName: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' }
const hardware = () => false
const refused = () => true

describe('which device takes the 8192 px Moon', () => {
  it('a fine pointer, a texture limit of 8192 and hardware rendering take it', () => {
    expect(takesLargeMoon(strong, hardware)).toBe(true)
    expect(takesLargeMoon({ ...strong, maxTextureSize: 8192 }, hardware)).toBe(true)
  })

  it('SwiftShader does not, whatever else is true of it', () => {
    const swiftShader = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'
    expect(takesLargeMoon({ ...strong, rendererName: swiftShader }, hardware)).toBe(false)
  })

  it.each(['llvmpipe (LLVM 15.0.7, 256 bits)', 'Mesa Lavapipe', 'Microsoft Basic Render Driver', 'Apple Software Renderer', 'Google SwiftShader'])(
    'a software renderer is weak: %s',
    (name) => {
      expect(isSoftwareRenderer(name)).toBe(true)
      expect(takesLargeMoon({ ...strong, rendererName: name }, hardware)).toBe(false)
    },
  )

  it.each(['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)', 'Apple M2', 'Mali-G78', null, ''])(
    'a hardware or unnamed renderer is not taken for software: %s',
    (name) => expect(isSoftwareRenderer(name)).toBe(false),
  )

  it('a coarse pointer (a phone or a tablet) does not, even on a strong GPU', () => {
    expect(takesLargeMoon({ ...strong, finePointer: false }, hardware)).toBe(false)
  })

  it('a texture limit below 8192 does not', () => {
    expect(takesLargeMoon({ ...strong, maxTextureSize: 4096 }, hardware)).toBe(false)
  })

  it('a browser that refuses a context in software does not, even when it hides the renderer name', () => {
    expect(takesLargeMoon({ ...strong, rendererName: null }, refused)).toBe(false)
  })

  it('opens the probe context only when the cheaper facts already say yes', () => {
    const probe = vi.fn(() => false)
    takesLargeMoon({ ...strong, finePointer: false }, probe)
    takesLargeMoon({ ...strong, maxTextureSize: 4096 }, probe)
    takesLargeMoon({ ...strong, rendererName: 'SwiftShader' }, probe)
    expect(probe).not.toHaveBeenCalled()
    takesLargeMoon(strong, probe)
    expect(probe).toHaveBeenCalledTimes(1)
  })
})

describe('reading the device', () => {
  afterEach(() => vi.unstubAllGlobals())

  const glWith = (name: string | null, maxTexture = 16384) => {
    const info = { UNMASKED_RENDERER_WEBGL: 0x9246 }
    return {
      MAX_TEXTURE_SIZE: 0x0d33,
      getExtension: (extension: string) => (extension === 'WEBGL_debug_renderer_info' && name !== null ? info : null),
      getParameter: (parameter: number) => (parameter === 0x9246 ? name : parameter === 0x0d33 ? maxTexture : null),
    } as unknown as WebGL2RenderingContext
  }
  const stubBrowser = (coarse: boolean, hardwareContext: boolean) => {
    vi.stubGlobal('window', { matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' ? coarse : false }) })
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: (_kind: string, options?: { failIfMajorPerformanceCaveat?: boolean }) =>
          options?.failIfMajorPerformanceCaveat && !hardwareContext ? null : { getExtension: () => null },
      }),
    })
  }

  it('reads the unmasked renderer name, or null when the browser hides it', () => {
    expect(rendererNameOf(glWith('SwiftShader driver'))).toBe('SwiftShader driver')
    expect(rendererNameOf(glWith(null))).toBeNull()
  })

  it('hardware + fine pointer + 8192 gives the large Moon', () => {
    stubBrowser(false, true)
    expect(moonIsLarge(glWith('ANGLE (Apple, Apple M2)'))).toBe(true)
  })

  it('SwiftShader gives the small Moon', () => {
    stubBrowser(false, true)
    expect(moonIsLarge(glWith('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)'))).toBe(false)
  })

  it('a coarse pointer gives the small Moon', () => {
    stubBrowser(true, true)
    expect(moonIsLarge(glWith('ANGLE (Apple, Apple M2)'))).toBe(false)
  })

  it('a texture limit of 4096 gives the small Moon', () => {
    stubBrowser(false, true)
    expect(moonIsLarge(glWith('ANGLE (Apple, Apple M2)', 4096))).toBe(false)
  })

  it('failIfMajorPerformanceCaveat refusing gives the small Moon, with no name to go by', () => {
    stubBrowser(false, false)
    expect(softwareOnly()).toBe(true)
    expect(moonIsLarge(glWith(null))).toBe(false)
  })

  it('a probe that throws counts as software, never as a crash', () => {
    vi.stubGlobal('document', { createElement: () => { throw new Error('no DOM') } })
    expect(softwareOnly()).toBe(true)
  })
})

describe('the tier of the page’s own context', () => {
  afterEach(() => vi.unstubAllGlobals())
  const gl = {
    MAX_TEXTURE_SIZE: 0x0d33,
    getExtension: () => null,
    getParameter: () => 16384,
  } as unknown as WebGL2RenderingContext

  it('graphics=low is the low tier whatever the hardware, and no probe context is opened', () => {
    const createElement = vi.fn()
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('document', { createElement })
    expect(moonTier(gl, true)).toBe('low')
    expect(createElement).not.toHaveBeenCalled()
  })

  it('a strong device asked for the sharp Moon is the strong tier, a refused hardware probe the weak one', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ getExtension: () => null }) }) })
    expect(moonTier(gl, false, true)).toBe('strong')
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
    expect(moonTier(gl, false, true)).toBe('weak')
  })

  it('a strong device that did not ask stays on the 2048 px images, and is not even probed', () => {
    // Found on 15/11/2026: a desktop Radeon with 16384 px textures was the strong tier, took 936 MiB at
    // level 2 and lost its context (GL_OUT_OF_MEMORY, then the browser blocked the page). The texture
    // limit is a width, not free memory, so no device gets the 8192 px images without ?graphics=high.
    const createElement = vi.fn(() => ({ getContext: () => ({ getExtension: () => null }) }))
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('document', { createElement })
    expect(moonTier(gl, false)).toBe('weak')
    expect(moonTier(gl, false, false)).toBe('weak')
    expect(createElement).not.toHaveBeenCalled()
  })
})
