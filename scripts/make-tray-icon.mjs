/**
 * Generates resources/tray.png — the system-tray icon.
 *
 * Written as a script rather than committing an opaque binary: the icon is a
 * few lines of geometry, and this way it can be tweaked and regenerated instead
 * of being a file nobody can edit.
 *
 * The glyph is a rounded "vault door": a square outline with a dot in the
 * middle. Drawn in white with alpha, which reads correctly on both the dark
 * Windows taskbar and a light one.
 *
 *   node scripts/make-tray-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SIZE = 32
const OUTPUT = join(process.cwd(), 'resources', 'tray.png')

/** Signed distance to a rounded rectangle, used for crisp antialiased edges. */
function roundedRectDistance(x, y, halfWidth, halfHeight, radius) {
  const dx = Math.abs(x) - (halfWidth - radius)
  const dy = Math.abs(y) - (halfHeight - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  const inside = Math.min(Math.max(dx, dy), 0)
  return outside + inside - radius
}

/** 0..1 coverage from a signed distance, giving a 1px antialiased edge. */
function coverage(distance) {
  return Math.min(Math.max(0.5 - distance, 0), 1)
}

function buildPixels() {
  const rows = []

  for (let y = 0; y < SIZE; y += 1) {
    // One filter byte per scanline (0 = no filter).
    const row = [0]

    for (let x = 0; x < SIZE; x += 1) {
      const cx = x - SIZE / 2 + 0.5
      const cy = y - SIZE / 2 + 0.5

      // Ring: the vault door outline.
      const outer = roundedRectDistance(cx, cy, 13, 13, 4)
      const inner = roundedRectDistance(cx, cy, 9.5, 9.5, 2.5)
      const ring = Math.min(coverage(outer), 1 - coverage(inner))

      // Dot: the handle in the middle.
      const dot = coverage(Math.hypot(cx, cy) - 3.5)

      const alpha = Math.round(Math.min(Math.max(ring, dot), 1) * 255)
      row.push(255, 255, 255, alpha)
    }

    rows.push(Buffer.from(row))
  }

  return Buffer.concat(rows)
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData) >>> 0)

  return Buffer.concat([length, typeAndData, crc])
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type: RGBA
ihdr[10] = 0 // deflate
ihdr[11] = 0 // adaptive filtering
ihdr[12] = 0 // no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(buildPixels(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync(join(process.cwd(), 'resources'), { recursive: true })
writeFileSync(OUTPUT, png)
console.log(`wrote ${OUTPUT} (${png.length} bytes, ${SIZE}x${SIZE})`)
