// Full-screen viewer: size modes, zoom, page input, filmstrip, info panel, slideshow, swipe.
// Size-mode and zoom behaviour are ported from v1 unchanged.

import { state, $, emit, on, isOverlayOpen } from "./state.js"
import { settings, saveSettings } from "./settings.js"
import { ensurePoster, scrollToIndex } from "./grid.js"
import { formatBytes, formatTime } from "./files.js"

const el = {
  overlay: $("overlay"),
  image: $("overlayImage"),
  lens: $("zoomLens"),
  sideMenu: $("sideMenu"),
  pageInfo: $("pageInfo"),
  pageTotal: $("pageTotal"),
  zoomModeBtn: $("zoomMode"),
  fullBtn: $("fullBtn"),
  eightyBtn: $("eightyBtn"),
  wideBtn: $("wideBtn"),
  autoBtn: $("autoBtn"),
  favBtn: $("favBtn"),
  slideshowBtn: $("slideshowBtn"),
  infoBtn: $("infoBtn"),
  infoPanel: $("infoPanel"),
  filmstrip: $("filmstrip"),
  slideshowBar: $("slideshowBar"),
}

let savedScroll = 0

// ---------------------------------------------------------------------------
// Open / close / navigate
// ---------------------------------------------------------------------------

export function openViewer(index) {
  if (!state.view.length) return
  state.currentIndex = Math.max(0, Math.min(index, state.view.length - 1))
  const item = state.view[state.currentIndex]

  if (!isOverlayOpen()) {
    savedScroll = window.scrollY
    document.body.classList.add("overlay-open")
    document.body.style.top = `-${savedScroll}px`
    el.overlay.classList.add("open")
    el.sideMenu.style.display = "block"
  }

  el.image.alt = item.name
  el.image.onload = () => {
    el.image.classList.remove("tall")
    if (el.image.getBoundingClientRect().height > window.innerHeight) el.image.classList.add("tall")
    if (state.isAutoMode) applyAutoSize()
  }
  el.image.src = item.url
  el.image.style.transform = "none"

  if (!state.isAutoMode) {
    el.image.classList.toggle("width-limited", state.isWidthLimited)
    el.image.classList.toggle("height-limited", state.isHeightLimited)
    el.overlay.classList.toggle("width-limited-mode", state.isWidthLimited)
    el.overlay.classList.toggle("height-limited-mode", state.isHeightLimited)
    if (state.isWidthLimited) el.overlay.scrollTop = 0
    if (state.isHeightLimited) el.overlay.scrollLeft = 0
  } else {
    el.overlay.scrollTop = 0
  }

  updatePageInfo()
  applyZoomMode()
  updateFavButton()
  if (!el.infoPanel.hidden) renderInfo()
  if (el.filmstrip.classList.contains("visible")) renderFilmstrip()
  restartSlideshowBar()
  preloadNeighbours()
  emit("viewer-index", state.currentIndex)
}

let scrollBackTimer = 0

/** Pass { scroll: false } when the gallery is about to be replaced. */
export function closeViewer({ scroll = true } = {}) {
  clearTimeout(scrollBackTimer)
  if (!isOverlayOpen()) return
  stopSlideshow()
  el.overlay.classList.remove("open", "width-limited-mode", "height-limited-mode")
  el.sideMenu.style.display = "none"
  el.sideMenu.classList.remove("visible")
  el.filmstrip.classList.remove("visible")

  el.image.removeAttribute("src")
  el.image.classList.remove("width-limited", "height-limited", "tall")
  el.image.style.transform = "none"
  el.lens.style.display = "none"

  document.body.classList.remove("overlay-open")
  document.body.style.top = ""
  window.scrollTo(0, savedScroll)

  // Bring the image that was open into view (short smooth scroll from where we were).
  if (scroll && state.currentIndex >= 0 && state.currentIndex < state.view.length) {
    const index = state.currentIndex
    scrollBackTimer = setTimeout(() => scrollToIndex(index), 50)
  }
  deactivateZoom()
  emit("viewer-closed")
}

export function showNext() {
  if (!state.view.length) return
  openViewer((state.currentIndex + 1) % state.view.length)
}

export function showPrevious() {
  if (!state.view.length) return
  openViewer((state.currentIndex - 1 + state.view.length) % state.view.length)
}

function preloadNeighbours() {
  for (const offset of [1, -1]) {
    const item = state.view[(state.currentIndex + offset + state.view.length) % state.view.length]
    if (item && !item.isGif) new Image().src = item.url
  }
}

// ---------------------------------------------------------------------------
// Page info input
// ---------------------------------------------------------------------------

export function updatePageInfo() {
  if (isOverlayOpen()) {
    el.pageInfo.value = state.view.length ? state.currentIndex + 1 : 0
    el.pageTotal.textContent = state.view.length
  }
}

function commitPageInput() {
  const page = parseInt(el.pageInfo.value.trim(), 10)
  if (!isNaN(page) && page >= 1 && page <= state.view.length) openViewer(page - 1)
  else updatePageInfo()
}

el.pageInfo.addEventListener("click", () => el.pageInfo.select())
el.pageInfo.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    commitPageInput()
    el.pageInfo.blur()
  } else if (e.key === "Escape") {
    updatePageInfo()
    el.pageInfo.blur()
  }
})
el.pageInfo.addEventListener("blur", commitPageInput)

// ---------------------------------------------------------------------------
// Size modes (v1 behaviour)
// ---------------------------------------------------------------------------

function applyAutoSize() {
  const ratio = el.image.naturalWidth / el.image.naturalHeight
  const isLandscape = ratio >= 1.2
  const isVeryWide = ratio >= 3.5

  if (isVeryWide) {
    el.image.classList.remove("width-limited")
    el.image.classList.add("height-limited")
    el.overlay.classList.remove("width-limited-mode")
    el.overlay.classList.add("height-limited-mode")
    el.overlay.scrollLeft = 0
  } else {
    el.image.classList.remove("height-limited")
    el.image.classList.toggle("width-limited", !isLandscape)
    el.overlay.classList.remove("height-limited-mode")
    el.overlay.classList.toggle("width-limited-mode", !isLandscape)
    if (!isLandscape) el.overlay.scrollTop = 0
  }
}

const MODES = {
  full: { widthLimited: false, heightLimited: false, autoMode: false, button: el.fullBtn },
  eighty: { widthLimited: true, heightLimited: false, autoMode: false, button: el.eightyBtn },
  wide: { widthLimited: false, heightLimited: true, autoMode: false, button: el.wideBtn },
  auto: { widthLimited: false, heightLimited: false, autoMode: true, button: el.autoBtn },
}

export function setSizeMode(mode, { persist = true } = {}) {
  const selected = MODES[mode] || MODES.auto
  for (const m of Object.values(MODES)) m.button.classList.remove("selectedGridOption")
  selected.button.classList.add("selectedGridOption")
  state.isAutoMode = selected.autoMode
  state.isWidthLimited = selected.widthLimited
  state.isHeightLimited = selected.heightLimited

  if (mode === "auto") {
    if (el.image.naturalWidth) applyAutoSize()
  } else {
    el.image.classList.remove("width-limited", "height-limited")
    el.overlay.classList.remove("width-limited-mode", "height-limited-mode")
    el.image.classList.toggle("width-limited", selected.widthLimited)
    el.image.classList.toggle("height-limited", selected.heightLimited)
    el.overlay.classList.toggle("width-limited-mode", selected.widthLimited)
    el.overlay.classList.toggle("height-limited-mode", selected.heightLimited)
    if (selected.widthLimited) el.overlay.scrollTop = 0
    if (selected.heightLimited) el.overlay.scrollLeft = 0
  }
  updatePageInfo()
  if (persist) {
    settings.layout.overlayMode = mode
    saveSettings()
  }
}

export function toggleFullOrAuto() {
  setSizeMode(el.fullBtn.classList.contains("selectedGridOption") ? "auto" : "full")
}

el.fullBtn.addEventListener("click", () => setSizeMode("full"))
el.eightyBtn.addEventListener("click", () => setSizeMode("eighty"))
el.wideBtn.addEventListener("click", () => setSizeMode("wide"))
el.autoBtn.addEventListener("click", () => setSizeMode("auto"))

// ---------------------------------------------------------------------------
// Zoom (v1 behaviour; click-zoom no longer also advances to the next image)
// ---------------------------------------------------------------------------

const ZOOM_CURSORS = ["default", "zoom-in", "crosshair"]

export function toggleZoomMode() {
  state.zoomMode = (state.zoomMode + 1) % 3
  el.zoomModeBtn.classList.toggle("zoom-active", state.zoomMode > 0)
  el.zoomModeBtn.querySelector("use").setAttribute("href", state.zoomMode === 2 ? "#i-scan-search" : "#i-zoom-in")
  el.zoomModeBtn.title = ["Zoom: off (Z)", "Zoom: click to zoom (Z)", "Zoom: magnifying lens (Z)"][state.zoomMode]
  applyZoomMode()
}

function applyZoomMode() {
  deactivateZoom()
  el.image.style.cursor = ZOOM_CURSORS[state.zoomMode]
  if (state.zoomMode === 2) {
    el.image.addEventListener("mousemove", moveLens)
    el.image.addEventListener("mouseenter", showLens)
    el.image.addEventListener("mouseleave", hideLens)
  }
  el.lens.style.display = "none"
}

function deactivateZoom() {
  el.image.removeEventListener("mousemove", moveLens)
  el.image.removeEventListener("mouseenter", showLens)
  el.image.removeEventListener("mouseleave", hideLens)
  el.lens.style.display = "none"
  el.image.style.transform = "none"
}

function clickZoom(event) {
  if (el.image.style.cursor === "zoom-in") {
    const rect = el.image.getBoundingClientRect()
    el.image.style.transformOrigin = `${event.clientX - rect.left}px ${event.clientY - rect.top}px`
    el.image.style.transform = "scale(2)"
    el.image.style.cursor = "zoom-out"
  } else {
    el.image.style.transform = "none"
    el.image.style.transformOrigin = "center center"
    el.image.style.cursor = "zoom-in"
  }
}

function moveLens(event) {
  const rect = el.image.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const size = 175
  const scale = 2
  Object.assign(el.lens.style, {
    width: `${size}px`,
    height: `${size}px`,
    left: `${event.clientX - size / 2}px`,
    top: `${event.clientY - size / 2}px`,
    display: "block",
    backgroundImage: `url("${el.image.src}")`,
    backgroundSize: `${el.image.width * scale}px ${el.image.height * scale}px`,
    backgroundPosition: `-${x * scale - size / 2}px -${y * scale - size / 2}px`,
  })
}
const showLens = () => (el.lens.style.display = "block")
const hideLens = () => (el.lens.style.display = "none")

el.zoomModeBtn.addEventListener("click", toggleZoomMode)

// ---------------------------------------------------------------------------
// Clicks, swipes
// ---------------------------------------------------------------------------

el.overlay.addEventListener("click", (event) => {
  if (event.target === el.overlay) closeViewer()
})

el.image.addEventListener("click", (event) => {
  event.stopPropagation()
  if (state.zoomMode === 1) clickZoom(event)
  else showNext()
})

let swipe = null
el.overlay.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") swipe = { x: e.clientX, y: e.clientY, t: Date.now() }
})
el.overlay.addEventListener("pointerup", (e) => {
  if (!swipe || e.pointerType === "mouse") return
  const dx = e.clientX - swipe.x
  const dy = e.clientY - swipe.y
  const quick = Date.now() - swipe.t < 600
  swipe = null
  if (quick && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0) showNext()
    else showPrevious()
  }
})

// ---------------------------------------------------------------------------
// Favourite button
// ---------------------------------------------------------------------------

export function updateFavButton() {
  const item = state.view[state.currentIndex]
  el.favBtn.classList.toggle("fav-on", !!item && state.favs.has(item.name))
}
el.favBtn.addEventListener("click", () => emit("toggle-fav", state.currentIndex))
on("favs-changed", updateFavButton)

// ---------------------------------------------------------------------------
// Info panel
// ---------------------------------------------------------------------------

export function toggleInfo(force) {
  el.infoPanel.hidden = force === undefined ? !el.infoPanel.hidden : !force
  el.infoBtn.classList.toggle("selectedGridOption", !el.infoPanel.hidden)
  if (!el.infoPanel.hidden) renderInfo()
}

function renderInfo() {
  const item = state.view[state.currentIndex]
  if (!item) return
  const rows = [
    ["Name", item.name],
    ["Position", `${state.currentIndex + 1} of ${state.view.length}`],
    ["Dimensions", item.w ? `${item.w} × ${item.h}` : "—"],
    ["File size", formatBytes(item.size)],
    ["Modified", item.lastModified ? new Date(item.lastModified).toLocaleString() : "—"],
    ["Type", item.videoName ? `Frame of ${item.videoName} at ${formatTime(item.frameTime)}` : item.type || "—"],
    ["Folder", state.folder?.name || "Loose files"],
  ]
  el.infoPanel.replaceChildren(
    ...rows.map(([k, v]) => {
      const row = document.createElement("div")
      const dt = document.createElement("span")
      const dd = document.createElement("strong")
      dt.textContent = k
      dd.textContent = v
      row.append(dt, dd)
      return row
    }),
  )
}
el.infoBtn.addEventListener("click", () => toggleInfo())

// ---------------------------------------------------------------------------
// Filmstrip (shown when the mouse nears the bottom edge; renders lazily)
// ---------------------------------------------------------------------------

const STRIP_RADIUS = 12

function renderFilmstrip() {
  const start = Math.max(0, state.currentIndex - STRIP_RADIUS)
  const end = Math.min(state.view.length, state.currentIndex + STRIP_RADIUS + 1)
  const buttons = []
  for (let i = start; i < end; i++) {
    const item = state.view[i]
    const btn = document.createElement("button")
    btn.className = "thumb" + (i === state.currentIndex ? " active" : "")
    btn.dataset.i = i
    btn.title = `${i + 1}. ${item.name}`
    const img = document.createElement("img")
    img.alt = ""
    img.decoding = "async"
    btn.appendChild(img)
    thumbFor(item).then((src) => src && (img.src = src))
    buttons.push(btn)
  }
  el.filmstrip.replaceChildren(...buttons)
  el.filmstrip.querySelector(".active")?.scrollIntoView({ inline: "center", block: "nearest" })
}

/** Small cached thumbnail (decoded once at ~160px tall) so the strip stays light for big images. */
function thumbFor(item) {
  item.thumbPromise ||= makeThumb(item)
  return item.thumbPromise
}

async function makeThumb(item) {
  try {
    const bitmap = await createImageBitmap(item.file, { resizeHeight: 160, resizeQuality: "medium" })
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext("2d").drawImage(bitmap, 0, 0)
    bitmap.close()
    const blob = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.8))
    item.thumb = URL.createObjectURL(blob)
    state.objectUrls.push(item.thumb)
    return item.thumb
  } catch {
    return item.isGif ? ensurePoster(item) : item.url
  }
}

el.filmstrip.addEventListener("click", (e) => {
  const btn = e.target.closest(".thumb")
  if (btn) openViewer(Number(btn.dataset.i))
})

let stripRaf = 0
document.addEventListener("mousemove", (e) => {
  if (!isOverlayOpen() || stripRaf) return
  stripRaf = requestAnimationFrame(() => {
    stripRaf = 0
    const near = e.clientY > window.innerHeight - 110
    const wasVisible = el.filmstrip.classList.contains("visible")
    el.filmstrip.classList.toggle("visible", near)
    if (near && !wasVisible) renderFilmstrip()
  })
})

// ---------------------------------------------------------------------------
// Slideshow
// ---------------------------------------------------------------------------

let slideshowTimer = 0

export const isSlideshowOn = () => !!slideshowTimer

export function toggleSlideshow() {
  if (slideshowTimer) return stopSlideshow()
  if (!state.view.length) return
  if (!isOverlayOpen()) openViewer(Math.max(0, state.currentVisibleIndex))
  slideshowTimer = setInterval(showNext, settings.slideshowSeconds * 1000)
  el.slideshowBtn.classList.add("selectedGridOption")
  el.slideshowBtn.querySelector("use").setAttribute("href", "#i-pause")
  el.slideshowBar.hidden = false
  restartSlideshowBar()
}

export function stopSlideshow() {
  if (!slideshowTimer) return
  clearInterval(slideshowTimer)
  slideshowTimer = 0
  el.slideshowBtn.classList.remove("selectedGridOption")
  el.slideshowBtn.querySelector("use").setAttribute("href", "#i-play")
  el.slideshowBar.hidden = true
}

function restartSlideshowBar() {
  if (!slideshowTimer) return
  // Navigating manually restarts the countdown.
  clearInterval(slideshowTimer)
  slideshowTimer = setInterval(showNext, settings.slideshowSeconds * 1000)
  const bar = el.slideshowBar.firstElementChild
  bar.style.animation = "none"
  void bar.offsetWidth
  bar.style.animation = `slideshow-progress ${settings.slideshowSeconds}s linear`
}

el.slideshowBtn.addEventListener("click", toggleSlideshow)
$("closeOverlayBtn").addEventListener("click", closeViewer)
on("open-index", (i) => openViewer(i))
