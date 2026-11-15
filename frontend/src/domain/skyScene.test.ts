import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n/i18n'
import { direction, groundPositions, HORIZON_CLEARANCE_DEG, horizonFaceShade, MAX_STRETCH, stretched, stretchFor, groundCaption, groundSpacing, sunlitShare, sunOnGround, turnBetween, wrapAzimuth } from './skyScene'

const close = (a: number[], b: number[]) => a.forEach((value, index) => expect(value).toBeCloseTo(b[index], 9))

describe('the direction of a point of the sky', () => {
  it('puts north at -z, east at +x and the zenith at +y', () => {
    close(direction(0, 0), [0, 0, -1])
    close(direction(90, 0), [1, 0, 0])
    close(direction(180, 0), [0, 0, 1])
    close(direction(270, 0), [-1, 0, 0])
    close(direction(123, 90), [0, 1, 0])
  })

  it('has east on the right hand of someone facing north, as on the ground', () => {
    // Facing north (-z) with up at +y, the right hand is north cross up.
    const [nx, ny, nz] = direction(0, 0)
    const up = [0, 1, 0]
    const right = [ny * up[2] - nz * up[1], nz * up[0] - nx * up[2], nx * up[1] - ny * up[0]]
    close(right, direction(90, 0))
  })

  it('is always one unit long', () => {
    for (const [azimuth, elevation] of [[37, 12], [200, -40], [359, 85]]) {
      const [x, y, z] = direction(azimuth, elevation)
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12)
    }
  })

  it('raises the point by the sine of its elevation', () => {
    expect(direction(45, 30)[1]).toBeCloseTo(0.5, 12)
    expect(direction(45, -30)[1]).toBeCloseTo(-0.5, 12)
  })
})

describe('how much the heights are stretched', () => {
  it('stretches a polar sky, a few degrees high, as far as it goes', () => {
    expect(stretchFor([-2, 1.5, 3.2])).toBe(MAX_STRETCH)
  })

  it('brings a taller horizon up to 30 degrees and no further', () => {
    expect(stretchFor([2, 10])).toBeCloseTo(3, 12)
    expect(stretched(10, stretchFor([2, 10]))).toBeCloseTo(30, 12)
  })

  it('leaves a Site where the Sun climbs high as it is', () => {
    // Apollo 11: the Sun nearly reaches the zenith.
    expect(stretchFor([4, 89])).toBe(1)
  })

  it('still stretches when nothing rises above the horizon', () => {
    expect(stretchFor([-5, -1])).toBe(MAX_STRETCH)
    expect(stretchFor([])).toBe(MAX_STRETCH)
  })

  it('keeps the order of heights, so what hides the Sun still hides it', () => {
    const stretch = stretchFor([1.5, 3.2])
    expect(stretched(1.4, stretch)).toBeLessThan(stretched(1.5, stretch))
    expect(stretched(-0.1, stretch)).toBeLessThan(stretched(0, stretch))
  })

  it('never carries a point over the zenith or under the nadir', () => {
    expect(stretched(60, 6)).toBe(85)
    expect(stretched(-60, 6)).toBe(-85)
  })
})

describe('azimuths', () => {
  it('wrap into 0 to 360', () => {
    expect(wrapAzimuth(370)).toBe(10)
    expect(wrapAzimuth(-10)).toBe(350)
    expect(wrapAzimuth(360)).toBe(0)
  })

  it('turn the short way round', () => {
    expect(turnBetween(350, 10)).toBe(20)
    expect(turnBetween(10, 350)).toBe(-20)
    expect(turnBetween(0, 180)).toBe(-180)
    expect(turnBetween(90, 90)).toBe(0)
  })
})

describe('where the real ground goes in the scene', () => {
  const RAD = Math.PI / 180
  // Four points: north and low, east and high, south above the engine's horizon, west far away.
  const ground = {
    azimuthDeg: new Float32Array([0, 90, 180, 270]),
    elevationDeg: new Float32Array([-2, 1, 3, -0.5]),
    distanceM: new Float32Array([1000, 2000, 500, 40_000]),
  }
  // The engine's horizon: 2 degrees up all round.
  const horizon = () => 2
  const seen = (positions: Float32Array, at: number) => {
    const [x, y, z] = positions.subarray(at * 3, at * 3 + 3)
    const distance = Math.hypot(x, y, z)
    return { azimuth: ((Math.atan2(x, -z) / RAD) + 360) % 360, elevation: Math.asin(y / distance) / RAD, distance }
  }

  it('keeps each point at its azimuth and its distance, in scene units', () => {
    const positions = groundPositions(ground, horizon, 1, 100)
    ;[0, 90, 180, 270].forEach((azimuth, at) => expect(seen(positions, at).azimuth).toBeCloseTo(azimuth, 3))
    expect(seen(positions, 0).distance).toBeCloseTo(10, 4)
    expect(seen(positions, 3).distance).toBeCloseTo(400, 3)
  })

  it('stretches the elevation of the ground like everything else in the sky', () => {
    const positions = groundPositions(ground, horizon, 6, 100)
    expect(seen(positions, 0).elevation).toBeCloseTo(-12, 3)
    expect(seen(positions, 1).elevation).toBeCloseTo(6, 3)
  })

  it('never lets the ground rise above the engine\'s horizon: where they differ, the horizon wins', () => {
    const positions = groundPositions(ground, horizon, 6, 100)
    // The point 3 degrees up stands where the horizon is 2: it is held just under it.
    expect(seen(positions, 2).elevation).toBeCloseTo(stretched(2 - HORIZON_CLEARANCE_DEG, 6), 3)
    for (let at = 0; at < 4; at++) expect(seen(positions, at).elevation).toBeLessThan(stretched(2, 6))
  })
})

describe('the face of the terrain that closes the horizon', () => {
  const light = { sunlight: 1, skylight: 0.16 }
  const sun = (azimuthDeg: number, fraction = 1) => ({ azimuthDeg, elevationDeg: 8, fraction })

  it('is in its own shadow where the Sun is beyond it, and lit where the Sun is behind the Observer', () => {
    const beyond = horizonFaceShade(264, sun(264), light)
    const behind = horizonFaceShade(84, sun(264), light)
    const side = horizonFaceShade(354, sun(264), light)
    expect(behind).toBeGreaterThan(side)
    expect(side).toBeGreaterThan(beyond)
    expect(behind).toBeLessThanOrEqual(1)
    // Beyond it, only the light from above is left: the slope faces 85% of the sky.
    expect(beyond).toBeCloseTo(0.16 * (0.5 + 0.5 * Math.SQRT1_2), 9)
  })

  it('side on to a low Sun, is lit about as much as flat ground beside it', () => {
    // Flat ground under a Sun 8 degrees up: the sine of 8 degrees of sunlight, and the whole sky.
    const flat = 0.16 + Math.sin((8 * Math.PI) / 180)
    const side = horizonFaceShade(354, sun(264), light)
    expect(Math.abs(side - flat)).toBeLessThan(0.08)
  })

  it('goes round north without a jump', () => {
    expect(horizonFaceShade(359, sun(180), light)).toBeCloseTo(horizonFaceShade(1, sun(180), light), 9)
    expect(horizonFaceShade(0, sun(180), light)).toBeGreaterThan(horizonFaceShade(90, sun(180), light))
  })

  it('dims with the Sun\'s disc, down to the same faint light everywhere', () => {
    const full = horizonFaceShade(84, sun(264), light)
    const half = horizonFaceShade(84, sun(264, 0.5), light)
    const none = horizonFaceShade(84, sun(264, 0), light)
    expect(half).toBeLessThan(full)
    expect(none).toBeLessThan(half)
    expect(none).toBeCloseTo(horizonFaceShade(264, sun(264, 0), light), 9)
    expect(none).toBeGreaterThan(0)
  })
})

describe('the sunlight on the ground at the Cursor', () => {
  // The answer for Connecting Ridge CR01 in the contract: the Sun goes in and out of view.
  const example = JSON.parse(readFileSync(new URL('../../../contract/examples/visibility-cr01.example.json', import.meta.url), 'utf8')) as {
    value: { timeline: { samples: { sun: { azimuth_deg: number; elevation_deg: number; fraction: number } }[] } }
  }
  const samples = example.value.timeline.samples.map(({ sun }) => ({ azimuthDeg: sun.azimuth_deg, elevationDeg: sun.elevation_deg, fraction: sun.fraction }))
  const stretch = 6
  /** The unit normal of a slope tilted `slopeDeg` that faces downhill towards `azimuthDeg`. */
  const slope = (azimuthDeg: number, slopeDeg: number): [number, number, number] => direction(azimuthDeg, 90 - slopeDeg)

  it('is none at all, on any slope, when the answer says the Sun is behind the relief', () => {
    const hidden = samples.filter((sun) => sun.fraction === 0)
    expect(hidden.length).toBeGreaterThan(0)
    for (const sun of hidden) {
      const light = sunOnGround(sun, stretch)
      for (const facing of [0, 90, 180, 270, sun.azimuthDeg]) expect(sunlitShare(slope(facing, 20), light)).toBe(0)
    }
  })

  it('lights the slope that faces the Sun and leaves the one turned away dark', () => {
    for (const sun of samples.filter((one) => one.fraction > 0.5)) {
      const light = sunOnGround(sun, stretch)
      const towards = sunlitShare(slope(sun.azimuthDeg, 20), light)
      const away = sunlitShare(slope(sun.azimuthDeg + 180, 20), light)
      // At a grazing Sun the slope turned to it gets several times the light of flat ground.
      expect(towards).toBeGreaterThan(2 * sunlitShare([0, 1, 0], light))
      expect(away).toBe(0)
    }
  })

  it('follows the Sun as the Cursor moves: the brightest slope turns with it', () => {
    const lit = samples.filter((sun) => sun.fraction > 0.5)
    const first = lit[0]
    const later = lit.find((sun) => Math.abs(turnBetween(first.azimuthDeg, sun.azimuthDeg)) > 45)
    expect(later).toBeDefined()
    for (const sun of [first, later!]) {
      const light = sunOnGround(sun, stretch)
      let best = 0
      for (let azimuth = 0; azimuth < 360; azimuth++) if (sunlitShare(slope(azimuth, 20), light) > sunlitShare(slope(best, 20), light)) best = azimuth
      expect(Math.abs(turnBetween(best, sun.azimuthDeg))).toBeLessThanOrEqual(1)
    }
  })

  it('comes from where the Sun is drawn, and dims with the share of its disc in view', () => {
    const sun = { azimuthDeg: 130, elevationDeg: 1.2, fraction: 0.4 }
    const light = sunOnGround(sun, stretch)
    direction(130, stretched(1.2, stretch)).forEach((part, at) => expect(light.direction[at]).toBeCloseTo(part, 12))
    expect(light.share).toBe(0.4)
    expect(sunlitShare(light.direction, light)).toBeCloseTo(0.4, 12)
  })
})

describe('the caption’s sentences about the ground', () => {
  // during a regression, implementation check: on a phone (every other point of the 20 m DEM) the caption said
  // LOLA measured the ground every 40 m, and then that nothing smaller than that is measured. The
  // DEM is 20 m: the 40 m is only how the mesh is drawn.
  const en = createI18n('en', 'en-GB')
  const pt = createI18n('pt', 'pt-BR')

  it('names the DEM’s own cell as the measurement, and the coarser drawing apart, on a phone', () => {
    const phone = groundSpacing(20, 2)
    expect(phone).toEqual({ measuredM: 20, drawnM: 40 })
    const [measured, drawn, ...rest] = groundCaption(phone, en)
    expect(measured).toContain('every 20\u00a0m.')
    expect(measured).not.toContain('40')
    expect(drawn).toBe('Drawn every 40\u00a0m on this device.')
    expect(rest).toEqual([])
    const [medido, desenhado] = groundCaption(phone, pt)
    expect(medido).toContain('a cada 20\u00a0m.')
    expect(desenhado).toBe('Desenhado a cada 40\u00a0m neste aparelho.')
  })

  it('says nothing of the drawing where every point of the DEM is drawn', () => {
    expect(groundCaption(groundSpacing(20, 1), en)).toEqual([en.t('sky.caption.ground', { metres: '20' })])
    // The wider map's cell, rounded to the metre like any length in the caption.
    expect(groundCaption(groundSpacing(148.4375, 1), en)).toEqual([en.t('sky.caption.ground', { metres: '148' })])
  })

  it('has no sentence for the silhouette', () => {
    expect(groundCaption(null, pt)).toEqual([])
  })

  it('names the real cell and the DEM where the ground is the engine’s grid away from the pole', () => {
    // Phase C, 15/11/2026: away from the pole the ground comes from /terrain/heights; LDEM_128's
    // cell is 236.9 m, and the caption must say 237 m, not the 90 m of the polar map.
    const grid = { ...groundSpacing(236.9, 1), product: 'LDEM_128' }
    expect(groundCaption(grid, en)).toEqual([en.t('sky.caption.ground', { metres: '237' }), en.t('sky.caption.product', { product: 'LDEM_128' })])
    const [, , desenhado] = groundCaption({ ...groundSpacing(59.2, 2), product: 'SLDEM2015_512' }, pt)
    expect(desenhado).toBe('Desenhado a cada 118 m neste aparelho.')
  })
})
