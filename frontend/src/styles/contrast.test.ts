import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * WCAG 1.4.11: graphical objects need 3:1 against the colours they touch. On the time strip a long
 * shadow is the bare track, so the track has to stand out from the page, and each band (Sun visible,
 * Earth visible, the light stripe of a Short shadow) has to stand out from the track.
 */
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')))

function token(name: string): string {
  const match = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`missing token --${name}`)
  return match[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function ratio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

describe('the time strip', () => {
  const bg = token('bg')
  const track = token('track')

  // Validation check: a long shadow at 1.53:1 vanished on a projector.
  it('keeps a long shadow, which is the bare track, at 3:1 or better against the page', () => {
    expect(ratio(track, bg)).toBeGreaterThanOrEqual(3)
  })

  it('keeps every band at 3:1 or better against the track', () => {
    for (const name of ['sun', 'earth', 'hatch']) {
      expect(ratio(token(name), track), name).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('text', () => {
  it('keeps body and secondary text at 4.5:1 or better on the page', () => {
    for (const name of ['fg', 'dim', 'sun', 'earth']) {
      expect(ratio(token(name), token('bg')), name).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('errors', () => {
  // Validation check: a bad custom point showed its message in the grey of the notes
  // and left the field's edge as it was. The error colour has to read as text and as an edge.
  it('keeps the error colour at 4.5:1 or better on the page, as text and on a field edge', () => {
    expect(ratio(token('error'), token('bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it('is not the grey of the notes', () => {
    expect(token('error')).not.toBe(token('dim'))
  })
})
