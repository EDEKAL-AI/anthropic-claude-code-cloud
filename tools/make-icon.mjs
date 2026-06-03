// Generates resources/icon.png (1024x1024 RGBA) with no image dependencies — a green
// rounded square with a white chat bubble. electron-builder derives .ico/.icns from it.
//   node tools/make-icon.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const GREEN = [37, 211, 102]
const WHITE = [255, 255, 255]

function roundedRectAlpha(x, y, x0, y0, x1, y1, r) {
  // distance into the rounded rectangle; returns coverage alpha 0..1 (1px antialias)
  const cx = Math.min(Math.max(x, x0 + r), x1 - r)
  const cy = Math.min(Math.max(y, y0 + r), y1 - r)
  const dx = x - cx
  const dy = y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (x < x0 || x > x1 || y < y0 || y > y1) return 0
  return Math.max(0, Math.min(1, r - dist + 0.5))
}

function circleAlpha(x, y, cx, cy, r) {
  const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
  return Math.max(0, Math.min(1, r - d + 0.5))
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

function blend(dst, src, a) {
  for (let i = 0; i < 3; i++) dst[i] = Math.round(dst[i] * (1 - a) + src[i] * a)
  dst[3] = Math.max(dst[3], Math.round(255 * a))
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1)
  raw[rowStart] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    const px = [0, 0, 0, 0]
    const bg = roundedRectAlpha(x, y, 40, 40, SIZE - 40, SIZE - 40, 200)
    if (bg > 0) blend(px, GREEN, bg)

    // chat bubble: white circle + small tail bottom-left
    const bubble = circleAlpha(x, y, 512, 470, 250)
    const tail = inTriangle(x, y, 360, 600, 360, 760, 520, 640) ? 1 : 0
    const w = Math.max(bubble, tail)
    if (w > 0) blend(px, WHITE, w)

    const o = rowStart + 1 + x * 4
    raw[o] = px[0]
    raw[o + 1] = px[1]
    raw[o + 2] = px[2]
    raw[o + 3] = px[3]
  }
}

// ---- minimal PNG encoder ----
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'resources')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'icon.png')
writeFileSync(outPath, png)
console.log(`Wrote ${outPath} (${png.length} bytes, ${SIZE}x${SIZE})`)
