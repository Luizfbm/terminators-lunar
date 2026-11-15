import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodeGrey16 } from './png16'

// A PNG is built here by hand, with a different filter on each row, and read back. The filters are
// applied by this test's own code, straight from the PNG specification, not by the decoder.

function crcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}
const CRC = crcTable()
function crc(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  out.set([...type].map((letter) => letter.charCodeAt(0)), 4)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)))
  return out
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Encodes `values` (row-major) as a 16-bit greyscale PNG, row `r` filtered with `filters[r]`. */
function encode(width: number, height: number, values: number[], filters: number[], idatParts = 1): Uint8Array {
  const stride = width * 2
  const plain = new Uint8Array(height * stride)
  values.forEach((value, at) => {
    plain[at * 2] = value >> 8
    plain[at * 2 + 1] = value & 0xff
  })
  const raw = new Uint8Array(height * (stride + 1))
  for (let row = 0; row < height; row++) {
    raw[row * (stride + 1)] = filters[row]
    for (let at = 0; at < stride; at++) {
      const here = plain[row * stride + at]
      const a = at >= 2 ? plain[row * stride + at - 2] : 0
      const b = row > 0 ? plain[(row - 1) * stride + at] : 0
      const c = row > 0 && at >= 2 ? plain[(row - 1) * stride + at - 2] : 0
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filters[row]]
      raw[row * (stride + 1) + 1 + at] = (here - predicted) & 0xff
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([16, 0, 0, 0, 0], 8)
  const packed = new Uint8Array(deflateSync(raw))
  const cut = Math.ceil(packed.length / idatParts)
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header)]
  for (let at = 0; at < packed.length; at += cut) parts.push(chunk('IDAT', packed.subarray(at, at + cut)))
  parts.push(chunk('IEND', new Uint8Array(0)))
  const file = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let at = 0
  for (const part of parts) {
    file.set(part, at)
    at += part.length
  }
  return file
}

describe('reading a 16-bit greyscale PNG', () => {
  const width = 5
  const height = 5
  // Values that cross byte boundaries, so a swapped byte order or a filter off by one shows.
  const values = Array.from({ length: width * height }, (_, at) => (at * 2731 + 255 * (at % 3) + 40000) % 65536)

  it('gives back every pixel, whatever filter each row was written with', async () => {
    const image = await decodeGrey16(encode(width, height, values, [0, 1, 2, 3, 4]))
    expect(image.width).toBe(width)
    expect(image.height).toBe(height)
    expect([...image.data]).toEqual(values)
  })

  it('reads pixels split across several IDAT chunks', async () => {
    const image = await decodeGrey16(encode(width, height, values, [4, 4, 3, 2, 1], 3))
    expect([...image.data]).toEqual(values)
  })

  it('keeps the two ends of the range apart: 0 and 65535', async () => {
    const image = await decodeGrey16(encode(2, 1, [0, 65535], [0]))
    expect([...image.data]).toEqual([0, 65535])
  })

  it('refuses a file that is not a PNG, and a PNG of another kind', async () => {
    await expect(decodeGrey16(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow('not a PNG')
    const eightBit = encode(1, 1, [7], [0])
    eightBit[8 + 8 + 8] = 8 // the bit depth, in the IHDR chunk
    await expect(decodeGrey16(eightBit)).rejects.toThrow('16-bit greyscale')
  })
})
