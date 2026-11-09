// Turning files into gallery items: filtering, natural sort, reading image sizes from
// file headers (so the grid can lay out before anything decodes), and video frames.

import { state } from "./state.js"

const IMAGE_EXT = /\.(jpe?g|jfif|pjpeg|png|apng|gif|webp|avif|bmp|svg|ico)$/i
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|mkv|ogv)$/i

export const isImage = (f) => f.type.startsWith("image/") || (!f.type && IMAGE_EXT.test(f.name))
export const isVideo = (f) => f.type.startsWith("video/") || (!f.type && VIDEO_EXT.test(f.name))
export const isGif = (f) => f.type === "image/gif" || /\.gif$/i.test(f.name)
const isMediaName = (name) => IMAGE_EXT.test(name) || VIDEO_EXT.test(name)

export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
export const byName = (a, b) => collator.compare(a.name, b.name)

/** Run `fn` over `list` with at most `limit` in flight. */
export async function pool(list, limit, fn) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++
      await fn(list[i], i)
    }
  })
  await Promise.all(workers)
}

// ---------------------------------------------------------------------------
// Collecting files
// ---------------------------------------------------------------------------

/** Top-level media files of a directory handle (sub-folders are ignored, as in v1). */
export async function filesFromDirectory(dirHandle, onProgress) {
  const handles = []
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file" && isMediaName(entry.name)) handles.push(entry)
  }
  const files = new Array(handles.length)
  let done = 0
  await pool(handles, 64, async (h, i) => {
    files[i] = await h.getFile()
    if (++done % 50 === 0) onProgress?.(done, handles.length)
  })
  return files.filter((f) => isImage(f) || isVideo(f))
}

/** Sub-directories of a directory handle, naturally sorted. */
export async function subdirectories(dirHandle) {
  const dirs = []
  for await (const entry of dirHandle.values()) if (entry.kind === "directory") dirs.push(entry)
  return dirs.sort(byName)
}

/** Files from <input webkitdirectory>: keep only files directly inside the chosen folder. */
export function filesFromFolderInput(fileList) {
  const files = [...fileList].filter((f) => f.webkitRelativePath.split("/").length === 2)
  const folderName = fileList[0]?.webkitRelativePath.split("/")[0] || null
  return { files: files.filter((f) => isImage(f) || isVideo(f)), folderName }
}

// ---------------------------------------------------------------------------
// Image dimensions from headers
// ---------------------------------------------------------------------------

async function bytes(file, start, length) {
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer())
}

/** Returns { w, h } or null. Reads only a few hundred bytes for PNG/GIF/WebP, and walks JPEG segments. */
export async function readDimensions(file) {
  try {
    const b = await bytes(file, 0, 64)
    const dv = new DataView(b.buffer)
    // PNG
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      return { w: dv.getUint32(16), h: dv.getUint32(20) }
    }
    // GIF
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
      return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) }
    }
    // WebP
    if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
      const kind = String.fromCharCode(b[12], b[13], b[14], b[15])
      if (kind === "VP8 ") return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff }
      if (kind === "VP8L") {
        const bits = dv.getUint32(21, true)
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
      }
      if (kind === "VP8X") {
        const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16))
        const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
        return { w, h }
      }
    }
    // JPEG
    if (b[0] === 0xff && b[1] === 0xd8) return await jpegDimensions(file)
  } catch {
    /* unreadable: fall back to measuring after load */
  }
  return null
}

async function jpegDimensions(file) {
  let pos = 2
  let orientation = 1
  for (let guard = 0; guard < 64 && pos < file.size; guard++) {
    const head = await bytes(file, pos, 12)
    if (head[0] !== 0xff) return null
    const marker = head[1]
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2
      continue
    }
    const len = (head[2] << 8) | head[3]
    // SOFn (excluding DHT C4, JPG C8, DAC CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = (head[5] << 8) | head[6]
      const w = (head[7] << 8) | head[8]
      // EXIF orientations 5-8 rotate by 90°, and browsers honour them.
      return orientation >= 5 ? { w: h, h: w } : { w, h }
    }
    if (marker === 0xe1 && orientation === 1) orientation = await exifOrientation(file, pos + 4, len - 2)
    pos += 2 + len
  }
  return null
}

async function exifOrientation(file, start, length) {
  try {
    const b = await bytes(file, start, Math.min(length, 512))
    if (String.fromCharCode(...b.slice(0, 4)) !== "Exif") return 1
    const t = 6 // TIFF header offset
    const dv = new DataView(b.buffer)
    const little = b[t] === 0x49
    const ifd = t + dv.getUint32(t + 4, little)
    const count = dv.getUint16(ifd, little)
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12
      if (entry + 10 > b.length) break
      if (dv.getUint16(entry, little) === 0x0112) return dv.getUint16(entry + 8, little)
    }
  } catch {
    /* ignore */
  }
  return 1
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

let nextId = 1

// Object URLs and file metadata are read lazily: for 4000 files, creating every URL costs
// ~2s and the first `size`/`lastModified` read costs ~3s (a disk stat per file).
const itemProto = {
  get size() {
    return this._size ?? this.file.size
  },
  get lastModified() {
    return this._lastModified ?? this.file.lastModified
  },
  get url() {
    if (!this._url) {
      this._url = URL.createObjectURL(this.file)
      state.objectUrls.push(this._url)
    }
    return this._url
  },
}

function makeItem(file, extra = {}) {
  return Object.assign(Object.create(itemProto), {
    id: nextId++,
    file,
    _url: null,
    name: file.name,
    path: file.webkitRelativePath || file.name,
    _size: null,
    _lastModified: null,
    type: file.type,
    isGif: isGif(file),
    w: 0,
    h: 0,
    poster: null, // still frame URL for GIFs (made lazily by grid.js)
    ...extra,
  })
}

/**
 * Builds items in natural name order. Videos expand into evenly spaced frames at their sorted
 * position. Image sizes are filled in afterwards by `sniffSizes` so the grid can show at once.
 */
export async function buildItems(files, { frameCount = 1, onProgress } = {}) {
  const sorted = [...files].sort(byName)
  const slots = new Array(sorted.length)
  let done = 0
  const tick = () => onProgress?.(++done, sorted.length)

  const images = []
  const videos = []
  sorted.forEach((file, i) => (isVideo(file) ? videos : images).push([file, i]))

  for (const [file, i] of images) slots[i] = [makeItem(file)]
  if (images.length) onProgress?.((done += images.length), sorted.length)

  // Videos are sequential: each one seeks and captures frames.
  for (const [file, i] of videos) {
    slots[i] = await videoFrames(file, frameCount).catch((error) => {
      console.warn("Could not read video", file.name, error)
      return []
    })
    tick()
  }

  return slots.flat().filter(Boolean)
}

/**
 * Reads image sizes from file headers in the background, top of the folder first.
 * `onBatch(items)` is called with newly sized items (throttled). Stops when `isCancelled()`.
 */
export async function sniffSizes(items, { onBatch, isCancelled = () => false } = {}) {
  const todo = items.filter((item) => !item.w)
  let batch = []
  let lastFlush = performance.now()
  const flush = () => {
    if (batch.length && !isCancelled()) onBatch?.(batch)
    batch = []
    lastFlush = performance.now()
  }
  await pool(todo, 24, async (item) => {
    if (isCancelled()) return
    const dims = await readDimensions(item.file)
    if (dims && dims.w > 0 && dims.h > 0 && !item.w) {
      Object.assign(item, dims)
      batch.push(item)
    }
    if (performance.now() - lastFlush > 120) flush()
  })
  flush()
}

function waitFor(target, event, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), ms)
    target.addEventListener(
      event,
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
    target.addEventListener("error", () => reject(new Error("media error")), { once: true })
  })
}

function timestamps(duration, count) {
  if (count === 1) return [duration / 2]
  const interval = 1 / (count + 1)
  return Array.from({ length: count }, (_, i) => duration * ((i + 1) * interval))
}

async function videoFrames(file, count) {
  const video = document.createElement("video")
  video.muted = true
  video.preload = "metadata"
  const src = URL.createObjectURL(file)
  video.src = src
  try {
    await waitFor(video, "loadedmetadata")
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const base = file.name.replace(/\.[^/.]+$/, "")
    const items = []
    const times = timestamps(video.duration || 0, count)
    for (let i = 0; i < times.length; i++) {
      video.currentTime = times[i]
      await waitFor(video, "seeked")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.9))
      if (!blob) continue
      const frame = new File([blob], `${base} - Frame ${i + 1}.webp`, { type: "image/webp" })
      items.push(
        makeItem(frame, {
          w: canvas.width,
          h: canvas.height,
          _size: file.size,
          _lastModified: file.lastModified,
          title: base,
          videoName: file.name,
          frameTime: times[i],
          path: file.webkitRelativePath || file.name,
        }),
      )
    }
    return items
  } finally {
    URL.revokeObjectURL(src)
    video.removeAttribute("src")
    video.load()
  }
}

export const formatBytes = (n) => {
  if (!n) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

export const formatTime = (s) => {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}
