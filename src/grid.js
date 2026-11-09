// The gallery grid. Built for very large folders:
//  - every tile gets its aspect ratio up front (from file headers), so layout never jumps;
//  - only tiles within ~2 screens of the viewport have an image src (memory stays flat);
//  - GIFs show a still poster frame and only animate on hover (configurable).

import { state, $, emit, GRID_STEPS } from "./state.js"
import { settings } from "./settings.js"

const container = $("imageContainer")
let windowObserver = null
let hoveredTile = null

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function render() {
  windowObserver?.disconnect()
  container.textContent = ""
  hoveredTile = null
  for (const item of state.items) item.live = false

  if (state.view.length) {
    windowObserver = new IntersectionObserver(onWindowChange, {
      rootMargin: `${Math.round(window.innerHeight * 2)}px 0px`,
    })
    const fragment = document.createDocumentFragment()
    state.view.forEach((item, i) => fragment.appendChild(makeTile(item, i)))
    container.appendChild(fragment)
    for (const tile of container.children) windowObserver.observe(tile)
  }

  state.currentVisibleIndex = -1
  updateVisibleIndex(true)
}

function makeTile(item, i) {
  const tile = document.createElement("div")
  tile.className = "tile"
  if (item.isGif) tile.classList.add("is-gif")
  if (state.favs.has(item.name)) tile.classList.add("is-fav")
  tile.dataset.i = i
  item.tile = tile
  sizeTile(tile, item)
  const img = document.createElement("img")
  img.alt = item.name
  img.decoding = "async"
  img.draggable = false
  if (item.title) img.title = item.title
  tile.appendChild(img)
  return tile
}

function sizeTile(tile, item) {
  if (item.w && item.h) {
    tile.style.aspectRatio = `${item.w} / ${item.h}`
    tile.style.setProperty("--w", `${item.w}px`)
    tile.classList.remove("unsized")
  } else {
    tile.classList.add("unsized")
  }
}

/** Apply sizes that arrived from background header sniffing. */
export function applySizes(items) {
  for (const item of items) if (item.tile?.isConnected) sizeTile(item.tile, item)
}

export const tileAt = (i) => container.children[i] || null
const itemOf = (tile) => state.view[Number(tile.dataset.i)]

// ---------------------------------------------------------------------------
// Windowing: attach src near the viewport, release it far away
// ---------------------------------------------------------------------------

function onWindowChange(entries) {
  for (const entry of entries) {
    const item = itemOf(entry.target)
    if (!item) continue
    item.live = entry.isIntersecting
    if (entry.isIntersecting) attach(entry.target, item)
    else entry.target.firstChild.removeAttribute("src")
  }
}

function srcFor(tile, item) {
  if (!item.isGif) return item.url
  const mode = settings.gifMode
  if (mode === "visible" || (mode === "hover" && tile === hoveredTile)) return item.url
  if (item.poster) return item.poster
  if (item.posterFailed) return item.url
  requestPoster(item)
  return null
}

function attach(tile, item) {
  const img = tile.firstChild
  const src = srcFor(tile, item)
  if (!src) img.removeAttribute("src")
  else if (img.getAttribute("src") !== src) img.src = src
}

/** Re-evaluate every live tile (e.g. after the GIF setting changes). */
export function refreshLiveTiles() {
  for (const tile of container.children) {
    const item = itemOf(tile)
    if (item?.live) attach(tile, item)
  }
}

// Fix the aspect ratio for formats we couldn't sniff (AVIF, BMP, SVG, ...).
container.addEventListener(
  "load",
  (event) => {
    const img = event.target
    if (img.tagName !== "IMG") return
    const tile = img.parentElement
    const item = itemOf(tile)
    if (!item || !img.naturalWidth) return
    const ratio = img.naturalWidth / img.naturalHeight
    if (!item.w || Math.abs(item.w / item.h - ratio) > 0.01) {
      if (img.getAttribute("src") === item.url) {
        item.w = img.naturalWidth
        item.h = img.naturalHeight
      } else {
        item.h = Math.round((item.w || img.naturalWidth) / ratio)
        item.w ||= img.naturalWidth
      }
      sizeTile(tile, item)
    }
  },
  true,
)

// ---------------------------------------------------------------------------
// GIF posters (first frame, generated lazily, two at a time)
// ---------------------------------------------------------------------------

const posterQueue = []
let postersInFlight = 0

function requestPoster(item) {
  if (item.poster || item.posterPending || item.posterFailed) return
  item.posterPending = true
  posterQueue.push(item)
  pumpPosters()
}

/** Promise for a still frame of a GIF (used by the filmstrip too). */
export function ensurePoster(item) {
  if (item.poster || item.posterFailed) return Promise.resolve(item.poster)
  return makePoster(item).then(() => item.poster)
}

function pumpPosters() {
  while (postersInFlight < 2 && posterQueue.length) {
    const item = posterQueue.shift()
    if (!item.live && !item.forcePoster) {
      item.posterPending = false // scrolled away before we got to it
      continue
    }
    postersInFlight++
    makePoster(item).finally(() => {
      postersInFlight--
      item.posterPending = false
      const i = state.view.indexOf(item)
      const tile = tileAt(i)
      if (tile && item.live) attach(tile, item)
      pumpPosters()
    })
  }
}

/** One poster per item, however many callers ask at once. */
export function makePoster(item) {
  item.posterPromise ||= createPoster(item)
  return item.posterPromise
}

async function createPoster(item, maxWidth = 1600) {
  try {
    const bitmap = await createImageBitmap(item.file)
    if (!item.w) {
      item.w = bitmap.width
      item.h = bitmap.height
      if (item.tile?.isConnected) sizeTile(item.tile, item)
    }
    const scale = Math.min(1, maxWidth / bitmap.width)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.85))
    if (!blob) throw new Error("toBlob failed")
    item.poster = URL.createObjectURL(blob)
    state.objectUrls.push(item.poster)
  } catch {
    item.posterFailed = true
  }
}

// Hover: animate GIFs, and remember which tile is under the pointer (for the L shortcut).
container.addEventListener("pointerover", (event) => {
  const tile = event.target.closest?.(".tile")
  if (!tile || tile === hoveredTile) return
  const previous = hoveredTile
  hoveredTile = tile
  if (previous) {
    const prevItem = itemOf(previous)
    if (prevItem?.isGif && prevItem.live) attach(previous, prevItem)
  }
  const item = itemOf(tile)
  if (item?.isGif && item.live) attach(tile, item)
})
container.addEventListener("pointerleave", () => {
  const previous = hoveredTile
  hoveredTile = null
  const item = previous && itemOf(previous)
  if (item?.isGif && item.live) attach(previous, item)
})

export const hoveredIndex = () => (hoveredTile ? Number(hoveredTile.dataset.i) : -1)

// ---------------------------------------------------------------------------
// Visible index (drives the page counter, progress saving and auto-scroll)
// ---------------------------------------------------------------------------

export function updateVisibleIndex(force = false) {
  let index = -1
  if (state.view.length) {
    const y = window.innerHeight * 0.4
    for (const x of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const el = document.elementFromPoint(window.innerWidth * x, y)?.closest?.(".tile")
      if (el) {
        index = Number(el.dataset.i)
        break
      }
    }
    if (index === -1) {
      const rect = container.getBoundingClientRect()
      if (rect.top > y) index = 0
      else if (rect.bottom < y) index = state.view.length - 1
      else index = state.currentVisibleIndex
    }
  }
  if (force || index !== state.currentVisibleIndex) {
    state.currentVisibleIndex = index
    emit("visible", index)
  }
}

export function scrollToIndex(index, behavior = "smooth", block = "center") {
  tileAt(index)?.scrollIntoView({ behavior, block })
}

export function markFavourite(index, isFav) {
  tileAt(index)?.classList.toggle("is-fav", isFav)
}

// ---------------------------------------------------------------------------
// Layout controls (ported from v1)
// ---------------------------------------------------------------------------

export function applyGridStep(index) {
  state.gridStepIndex = index
  const step = GRID_STEPS[index]
  container.className = `image-container ${step.className}`
  // Gap and natural-width are independent toggles (natural width only matters at 1 per row).
  container.classList.toggle("no-gap", !state.hasGap)
  container.classList.toggle("actual-width", !state.isForceFillWidth)
  const btn = $("gridToggle")
  btn.textContent = step.count
  btn.classList.add("selectedGridOption")
  emit("layout")
}

export function cycleGrid() {
  applyGridStep((state.gridStepIndex + 1) % GRID_STEPS.length)
  requestAnimationFrame(() => updateVisibleIndex())
}

export function changeContainerWidth(delta) {
  const current = state.containerWidth || 90
  state.containerWidth = delta > 0 ? Math.min(current + 10, 100) : Math.max(current - 10, 10)
  container.style.maxWidth = `${state.containerWidth}%`
  emit("layout")
}

export function applyContainerWidth(width) {
  state.containerWidth = width
  container.style.maxWidth = `${width}%`
}

export function setGap(hasGap) {
  state.hasGap = hasGap
  container.classList.toggle("no-gap", !hasGap)
  $("mainToggleGap").classList.toggle("selectedGridOption", hasGap)
  emit("layout")
}

export function setFillWidth(fill) {
  state.isForceFillWidth = fill
  container.classList.toggle("actual-width", !fill)
  $("toggleImageFill").classList.toggle("selectedGridOption", fill)
  emit("layout")
}

// Opening the viewer from a tile.
container.addEventListener("click", (event) => {
  const tile = event.target.closest(".tile")
  if (tile) emit("open-index", Number(tile.dataset.i))
})
