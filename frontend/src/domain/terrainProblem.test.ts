import { describe, expect, it } from 'vitest'
import { en, pt } from '../components/phase4/miss/strings'
import { terrainProblem } from './terrainProblem'

// Validation check: with LDEM_128 (a 236.9 m pixel) and the default 100 m radius, `/terrain`
// answers 422 `dem_too_coarse`, and the screen said only that no 20 m map covers the Site.
const TOO_COARSE = 'The DEM is too coarse for this radius: no cell centre of LDEM_128 (236.9 m) lies within 100 m.'
const NO_DEM = 'No DEM covers 100 m around this Site (no DEM covers lat -45.0, lon 10.0).'

describe('terrainProblem', () => {
  it('reads the too-coarse 422 by its code and the pixel the detail names', () => {
    expect(terrainProblem('dem_too_coarse', TOO_COARSE)).toEqual({ kind: 'too_coarse', resolutionM: 236.9 })
  })

  it('still reads a too-coarse 422 when the detail does not name the pixel or is missing', () => {
    expect(terrainProblem('dem_too_coarse', 'The DEM is too coarse for this radius.')).toEqual({
      kind: 'too_coarse',
      resolutionM: null,
    })
    expect(terrainProblem('dem_too_coarse', undefined)).toEqual({ kind: 'too_coarse', resolutionM: null })
  })

  it('goes by the code, not by the words of the detail', () => {
    // The old contract sent both causes as outside_coverage and the text told them apart.
    expect(terrainProblem('outside_coverage', TOO_COARSE)).toEqual({ kind: 'no_dem' })
    expect(terrainProblem('dem_too_coarse', NO_DEM)).toEqual({ kind: 'too_coarse', resolutionM: null })
  })

  it('keeps the 422 with no DEM at all apart from the too-coarse one', () => {
    expect(terrainProblem('outside_coverage', NO_DEM)).toEqual({ kind: 'no_dem' })
    expect(terrainProblem('outside_coverage', undefined)).toEqual({ kind: 'no_dem' })
  })

  it('leaves every other problem to the generic error handling', () => {
    expect(terrainProblem('busy', TOO_COARSE)).toEqual({ kind: 'other' })
    expect(terrainProblem('network', undefined)).toEqual({ kind: 'other' })
  })
})

describe('the too-coarse sentences', () => {
  it('say the pixel and the radius in English and Portuguese, with the unit glued to the number', () => {
    const fill = (text: string) => text.replace('{resolution}', '237 m').replace('{radius}', '100 m')
    expect(fill(en['miss.slopeTooCoarse'])).toBe(
      'The map that covers this Site has pixels of about 237 m, coarser than the 100 m asked for, so its slope can’t be measured here.',
    )
    expect(fill(pt['miss.slopeTooCoarse'])).toBe(
      'O mapa que cobre este Local tem pixels de cerca de 237 m, mais grossos que os 100 m pedidos, então não dá para medir a inclinação aqui.',
    )
    expect(en['miss.slopeTooCoarseNoPixel']).not.toContain('{resolution}')
    expect(pt['miss.slopeTooCoarseNoPixel']).not.toContain('{resolution}')
  })
})
