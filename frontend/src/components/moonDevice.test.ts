import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSoftwareRenderer, moonIsLarge, rendererNameOf, softwareOnly, takesLargeMoon, type DeviceFacts } from './moonDevice'

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
