import { describe, expect, it } from 'vitest'
import { STEPS, INK, stepOf } from './scale'

// Colour-vision deficiency simulation, Machado, Oliveira & Fernandes 2009, severity 1.0, applied in
// linear sRGB. Two neighbouring steps must stay apart for every viewer: at least 1.5:1 in WCAG
// luminance contrast and 15 in CIE76 ΔE.
const MACHADO = {
  none: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const clamp = (c: number) => Math.min(1, Math.max(0, c))
const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

function simulate(hex: string, matrix: number[][]): number[] {
  const linear = parse(hex).map(toLinear)
  return matrix.map((row) => clamp(toGamma(row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])))
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: number[], b: number[]): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

function lab(rgb: number[]): number[] {
  const [r, g, b] = rgb.map(toLinear)
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}

const deltaE = (a: number[], b: number[]) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))

describe('the calendar scale', () => {
  for (const [name, matrix] of Object.entries(MACHADO)) {
    it(`keeps neighbouring steps apart for ${name} vision`, () => {
      const seen = STEPS.map((hex) => simulate(hex, matrix))
      for (let i = 1; i < seen.length; i++) {
        expect(contrast(seen[i - 1], seen[i])).toBeGreaterThanOrEqual(1.5)
        expect(deltaE(seen[i - 1], seen[i])).toBeGreaterThanOrEqual(15)
      }
    })
  }

  it('gets lighter at every step, so greyscale keeps the order', () => {
    const light = STEPS.map((hex) => luminance(parse(hex)))
    for (let i = 1; i < light.length; i++) expect(light[i]).toBeGreaterThan(light[i - 1])
  })

  it('puts readable ink on every step (4.5:1)', () => {
    STEPS.forEach((hex, i) => expect(contrast(parse(hex), parse(INK[i]))).toBeGreaterThanOrEqual(4.5))
  })

  it('bins shares by 20 %, with 1 in the top step', () => {
    expect([0, 0.19, 0.2, 0.59, 0.8, 1].map(stepOf)).toEqual([0, 0, 1, 2, 4, 4])
  })
})
