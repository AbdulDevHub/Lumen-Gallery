// Generates synthetic test images (no personal files). Output: tests/fixtures/{basic,stress}
import { deflateSync } from "node:zlib"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"

const VERSION = "3"
const OUT = "tests/fixtures"

// ---------- PNG ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** color(x, y) -> [r, g, b] */
export function png(w, h, color) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  let o = 0
  for (let y = 0; y < h; y++) {
    raw[o++] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b] = color(x, y)
      raw[o++] = r
      raw[o++] = g
      raw[o++] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

// ---------- animated GIF (4-colour palette) ----------
function lzw(minCodeSize, indices) {
  const clearCode = 1 << minCodeSize
  const eoi = clearCode + 1
  let next = eoi + 1
  let size = minCodeSize + 1
  let table = new Map()
  const out = []
  let cur = 0
  let bits = 0
  const emit = (code) => {
    cur |= code << bits
    bits += size
    while (bits >= 8) {
      out.push(cur & 255)
      cur >>>= 8
      bits -= 8
    }
  }
  emit(clearCode)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = (prefix << 8) | k
    const hit = table.get(key)
    if (hit !== undefined) {
      prefix = hit
      continue
    }
    emit(prefix)
    if (next === 4096) {
      emit(clearCode)
      next = eoi + 1
      size = minCodeSize + 1
      table = new Map()
    } else {
      if (next >= 1 << size) size++
      table.set(key, next++)
    }
    prefix = k
  }
  emit(prefix)
  emit(eoi)
  if (bits > 0) out.push(cur & 255)
  return out
}

/** frames: array of (x, y) -> palette index 0..3; palette: four [r, g, b] */
export function gif(w, h, palette, frames, delayCs = 20) {
  const bytes = [...Buffer.from("GIF89a"), w & 255, w >> 8, h & 255, h >> 8, 0x91, 0, 0]
  for (const [r, g, b] of palette) bytes.push(r, g, b)
  bytes.push(0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0"), 3, 1, 0, 0, 0)
  for (const frame of frames) {
    bytes.push(0x21, 0xf9, 4, 0, delayCs & 255, delayCs >> 8, 0, 0)
    bytes.push(0x2c, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0)
    const idx = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) idx[y * w + x] = frame(x, y)
    const data = lzw(2, idx)
    bytes.push(2)
    for (let i = 0; i < data.length; i += 255) {
      const block = data.slice(i, i + 255)
      bytes.push(block.length, ...block)
    }
    bytes.push(0)
  }
  bytes.push(0x3b)
  return Buffer.from(bytes)
}

const hsl = (h, s, l) => {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}
const gradient = (w, h, hue) => (x, y) => hsl((hue + (x / w) * 60) % 360, 0.6, 0.25 + (y / h) * 0.4)
const blinkGif = (w, h, hue) =>
  gif(w, h, [hsl(hue, 0.7, 0.3), hsl(hue, 0.7, 0.6), [255, 255, 255], [0, 0, 0]], [
    (x, y) => ((x >> 4) + (y >> 4)) % 2,
    (x, y) => (((x >> 4) + (y >> 4)) % 2) + 1,
    (x) => (x < w / 2 ? 3 : 1),
  ])

async function main() {
  const marker = join(OUT, ".version")
  if ((await readFile(marker, "utf8").catch(() => "")) === VERSION) return console.log("Fixtures up to date")

  const basic = join(OUT, "basic", "Sample Set")
  await mkdir(join(basic, "sub"), { recursive: true })
  const files = {
    "img 1.png": png(800, 600, gradient(800, 600, 20)),
    "img 2.png": png(600, 900, gradient(600, 900, 80)),
    "img 3.png": png(400, 2400, gradient(400, 2400, 140)),
    "img 4.png": png(3000, 500, gradient(3000, 500, 200)),
    "img 5.gif": blinkGif(300, 200, 260),
    "img 6.png": png(700, 700, gradient(700, 700, 300)),
    "img 7.gif": blinkGif(200, 300, 40),
    "img 10.png": png(640, 480, gradient(640, 480, 330)),
    "notes.txt": Buffer.from("not an image"),
    "sub/hidden.png": png(50, 50, () => [255, 0, 0]),
  }
  for (const [name, buf] of Object.entries(files)) await writeFile(join(basic, name), buf)

  const stress = join(OUT, "stress", "Big Folder")
  await mkdir(stress, { recursive: true })
  const jobs = []
  for (let i = 1; i <= 4000; i++) {
    const hue = (i * 37) % 360
    const isGif = i % 20 === 0
    jobs.push(
      writeFile(
        join(stress, `item ${i}.${isGif ? "gif" : "png"}`),
        isGif ? blinkGif(64, 64, hue) : png(64, 48 + (i % 5) * 20, () => hsl(hue, 0.6, 0.45)),
      ),
    )
  }
  await Promise.all(jobs)
  await writeFile(marker, VERSION)
  console.log("Fixtures generated")
}

await main()
