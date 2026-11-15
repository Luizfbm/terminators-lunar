/**
 * Reads a 16-bit greyscale PNG into its numbers. A canvas only gives back 8 bits per channel, and
 * the height maps of the Moon (the requirement) carry 16, so the file is read here: the chunks, the
 * inflate (the browser's own DecompressionStream) and the five scanline filters of the PNG spec.
 */

export interface Grey16 {
  width: number
  height: number
  /** Row by row from the top left, one number from 0 to 65535 per pixel. */
  data: Uint16Array
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** Two bytes per pixel: the distance back to "the same byte of the pixel to the left". */
const BYTES_PER_PIXEL = 2

async function inflate(zlib: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([zlib as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function decodeGrey16(file: Uint8Array): Promise<Grey16> {
  if (SIGNATURE.some((byte, at) => file[at] !== byte)) throw new Error('not a PNG file')
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let width = 0
  let height = 0
  const parts: Uint8Array[] = []
  for (let at = 8; at + 8 <= file.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(file[at + 4], file[at + 5], file[at + 6], file[at + 7])
    const body = at + 8
    if (type === 'IHDR') {
      width = view.getUint32(body)
      height = view.getUint32(body + 4)
      const [depth, colour, , , interlace] = file.subarray(body + 8, body + 13)
      if (depth !== 16 || colour !== 0 || interlace !== 0) throw new Error('not a 16-bit greyscale PNG without interlace')
    } else if (type === 'IDAT') {
      parts.push(file.subarray(body, body + length))
    } else if (type === 'IEND') {
      break
    }
    at = body + length + 4
  }
  if (width === 0 || height === 0 || parts.length === 0) throw new Error('PNG without a header or without pixels')

  const packed = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let filled = 0
  for (const part of parts) {
    packed.set(part, filled)
    filled += part.length
  }
  const raw = await inflate(packed)
  const stride = width * BYTES_PER_PIXEL
  if (raw.length !== height * (stride + 1)) throw new Error('PNG pixels do not match its size')

  // Undo each row's filter in place. `left`, `up` and `corner` are zero off the edge of the image.
  const rows = new Uint8Array(height * stride)
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)]
    const from = row * (stride + 1) + 1
    const to = row * stride
    for (let at = 0; at < stride; at++) {
      const left = at >= BYTES_PER_PIXEL ? rows[to + at - BYTES_PER_PIXEL] : 0
      const up = row > 0 ? rows[to + at - stride] : 0
      const corner = row > 0 && at >= BYTES_PER_PIXEL ? rows[to + at - stride - BYTES_PER_PIXEL] : 0
      let predicted = 0
      if (filter === 1) predicted = left
      else if (filter === 2) predicted = up
      else if (filter === 3) predicted = (left + up) >> 1
      else if (filter === 4) {
        // Paeth: whichever of the three neighbours is closest to left + up - corner.
        const guess = left + up - corner
        const toLeft = Math.abs(guess - left)
        const toUp = Math.abs(guess - up)
        const toCorner = Math.abs(guess - corner)
        predicted = toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`)
      rows[to + at] = (raw[from + at] + predicted) & 0xff
    }
  }

  // PNG keeps the high byte first.
  const data = new Uint16Array(width * height)
  for (let at = 0; at < data.length; at++) data[at] = (rows[at * 2] << 8) | rows[at * 2 + 1]
  return { width, height, data }
}
