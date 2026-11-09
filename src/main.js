// Lumen Gallery entry point: wires the toolbar, file loading, view options and shortcuts.

import { state, $, on, emit, GRID_STEPS, isOverlayOpen } from "./state.js"
import { settings, saveSettings, DEFAULTS } from "./settings.js"
import * as grid from "./grid.js"
import * as viewer from "./viewer.js"
import * as library from "./library.js"
import * as reading from "./reading.js"
import { buildItems, sniffSizes, filesFromFolderInput, isImage, isVideo, collator } from "./files.js"
import { toast, loader, setupRipple, openDialog, bindSettingsForm } from "./ui.js"
import { setupShortcuts } from "./shortcuts.js"
import { setupPwa } from "./pwa.js"

const body = document.body

// ---------------------------------------------------------------------------
// Loading files
// ---------------------------------------------------------------------------

let loadToken = 0
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))

/**
 * folder = null → loose files, appended to whatever is open (v1 behaviour).
 * folder = { name, handle?, parent?, source } → replaces the gallery with that folder.
 */
async function loadFiles(files, folder = null) {
  const media = files.filter((f) => isImage(f) || isVideo(f))
  if (!media.length) {
    toast("No images or videos found there.")
    return
  }
  reading.stopAutoScroll()
  viewer.closeViewer({ scroll: false })
  if (folder) clearAll({ quiet: true }) // bumps loadToken, so take ours afterwards
  library.disarmProgress() // don't overwrite saved progress until the user actually moves
  const token = ++loadToken

  loader.show(media.length)
  const frameCount =
    settings.videoFrames === "auto" ? GRID_STEPS[state.gridStepIndex].count : Number(settings.videoFrames)
  let items
  try {
    items = await buildItems(media, { frameCount, onProgress: (done) => loader.update(done) })
  } catch (error) {
    console.error(error)
    loader.hide()
    toast("Something went wrong while reading those files.")
    return
  }
  if (token !== loadToken) return

  // Loose files join whatever is open (v1 behaviour); an open folder keeps its name, favourites and progress.
  state.items = folder ? items : [...state.items, ...items]
  if (folder) state.folder = folder
  if (state.isRandomized) items.forEach((item) => (item.rank = Math.random()))
  if (state.currentIndex === -1) state.currentIndex = 0

  loader.rendering()
  await nextFrame()
  refreshView()
  window.scrollTo(0, 0)
  setTimeout(() => loader.hide(), 50)
  // Exact tile sizes stream in from file headers; resume waits for them (see goto-index).
  state.sizing = sniffSizes(items, { onBatch: grid.applySizes, isCancelled: () => token !== loadToken })
  if (folder) await library.onFolderOpened(folder)
}

library.setLoader(loadFiles)

function clearAll({ quiet = false } = {}) {
  loadToken++
  loader.hide() // a cancelled load may still be extracting video frames
  reading.stopAutoScroll()
  viewer.closeViewer({ scroll: false })
  state.objectUrls.forEach((url) => URL.revokeObjectURL(url))
  state.objectUrls = []
  state.items = []
  state.view = []
  state.currentIndex = -1
  state.folder = null
  state.favs = new Set()
  state.filter = ""
  state.favOnly = false
  $("filterInput").value = ""
  $("favOnlyBtn").classList.remove("selectedGridOption")
  grid.render()
  updateChrome()
  if (!quiet) library.renderRecents()
}

// ---------------------------------------------------------------------------
// View: filter, favourites-only, sort, shuffle
// ---------------------------------------------------------------------------

function refreshView() {
  const needle = state.filter.trim().toLowerCase()
  let view = state.items
  if (needle) view = view.filter((item) => item.name.toLowerCase().includes(needle))
  if (state.favOnly) view = view.filter((item) => state.favs.has(item.name))
  // Shuffle order is a stable random rank per item, so filtering or closing the viewer doesn't reshuffle.
  if (state.isRandomized) view = [...view].sort((a, b) => a.rank - b.rank)
  else if (state.sort === "date") view = [...view].sort((a, b) => a.lastModified - b.lastModified || collator.compare(a.name, b.name))
  else if (state.sort === "size") view = [...view].sort((a, b) => b.size - a.size)
  state.view = view
  if (state.currentIndex >= view.length) state.currentIndex = 0
  if (state.currentIndex === -1 && view.length) state.currentIndex = 0
  grid.render()
  updateChrome()
}

function toggleRandomize() {
  state.isRandomized = !state.isRandomized
  if (state.isRandomized) state.items.forEach((item) => (item.rank = Math.random()))
  $("randomize").classList.toggle("selectedGridOption", state.isRandomized)
  refreshView()
}

function updateChrome() {
  const hasItems = state.items.length > 0
  body.classList.toggle("has-items", hasItems)
  $("folderName").textContent = state.folder?.name || "Files"
  $("folderChip").title = state.folder ? `Folder: ${state.folder.name}` : "Loose files"
  $("folderCount").textContent =
    state.view.length === state.items.length ? state.items.length : `${state.view.length} / ${state.items.length}`
  const hasSiblings = !!state.folder?.parent
  $("prevFolderBtn").hidden = !hasSiblings
  $("nextFolderBtn").hidden = !hasSiblings
  $("mainPageTotal").textContent = state.view.length
  reading.updateProgressBar()
}

function markAllFavourites() {
  state.view.forEach((item, i) => grid.markFavourite(i, state.favs.has(item.name)))
}

let filterTimer = 0
$("filterInput").addEventListener("input", (e) => {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    state.filter = e.target.value
    refreshView()
  }, 150)
})
$("favOnlyBtn").addEventListener("click", () => {
  state.favOnly = !state.favOnly
  $("favOnlyBtn").classList.toggle("selectedGridOption", state.favOnly)
  if (state.favOnly && !state.favs.size) toast("No favourites yet. Press L on an image to add one.")
  refreshView()
})
$("sortSelect").addEventListener("change", (e) => {
  state.sort = e.target.value
  if (state.isRandomized) toggleRandomize()
  else refreshView()
})

// ---------------------------------------------------------------------------
// Events between modules
// ---------------------------------------------------------------------------

on("visible", (index) => {
  const page = state.view.length && index >= 0 ? index + 1 : 0
  if (document.activeElement !== $("mainPageInfo")) $("mainPageInfo").value = page
  $("mainPageTotal").textContent = state.view.length
  if (!isOverlayOpen()) library.noteProgress(index)
})
on("viewer-index", (index) => library.noteProgress(index))
on("goto-index", (index) => {
  // Tiles above may still be getting their exact size; the browser's scroll anchoring
  // keeps this tile in place while they do.
  grid.scrollToIndex(index, "auto", "start")
  requestAnimationFrame(() => grid.updateVisibleIndex())
})
on("fav-toggled", ({ index, isFav }) => {
  grid.markFavourite(index, isFav)
  if (state.favOnly && !isFav && !isOverlayOpen()) refreshView()
})
on("favs-loaded", markAllFavourites)
on("viewer-closed", () => {
  if (state.favOnly) refreshView()
})
on("layout", () => {
  if (!settings.rememberLayout) return
  settings.layout = {
    ...settings.layout,
    gridStepIndex: state.gridStepIndex,
    containerWidth: state.containerWidth,
    hasGap: state.hasGap,
    isForceFillWidth: state.isForceFillWidth,
  }
  saveSettings()
})

// ---------------------------------------------------------------------------
// Toolbar & side menu
// ---------------------------------------------------------------------------

$("fileInput").addEventListener("click", (e) => (e.target.value = ""))
$("folderInput").addEventListener("click", (e) => (e.target.value = ""))
$("fileInput").addEventListener("change", (e) => loadFiles([...e.target.files]))
$("folderInput").addEventListener("change", (e) => {
  const { files, folderName } = filesFromFolderInput(e.target.files)
  if (!files.length) return toast("No images or videos directly inside that folder.")
  loadFiles(files, { name: folderName || "Folder", source: "input" })
})

$("openFolderBtn").addEventListener("click", library.pickFolder)
$("startOpenFolder").addEventListener("click", library.pickFolder)
$("chooseLibraryBtn").addEventListener("click", library.chooseLibrary)
$("clearAll").addEventListener("click", () => clearAll())
$("randomize").addEventListener("click", toggleRandomize)
$("gridToggle").addEventListener("click", grid.cycleGrid)
$("zoomIn").addEventListener("click", () => grid.changeContainerWidth(10))
$("zoomOut").addEventListener("click", () => grid.changeContainerWidth(-10))
$("mainZoomIn").addEventListener("click", () => grid.changeContainerWidth(10))
$("mainZoomOut").addEventListener("click", () => grid.changeContainerWidth(-10))
$("mainToggleGap").addEventListener("click", () => grid.setGap(!state.hasGap))
$("toggleImageFill").addEventListener("click", () => grid.setFillWidth(!state.isForceFillWidth))
$("spotlight").addEventListener("click", toggleSpotlight)
$("fullScreen").addEventListener("click", toggleFullScreen)
$("mainFullScreen").addEventListener("click", toggleFullScreen)
$("saveBtn").addEventListener("click", () => library.pinCurrent(state.currentIndex, $("saveBtn")))
$("settingsBtn").addEventListener("click", () => openDialog("settings"))
$("openHelpBtn").addEventListener("click", () => openDialog("shortcuts"))
$("prevFolderBtn").addEventListener("click", () => library.siblingFolder(-1))
$("nextFolderBtn").addEventListener("click", () => library.siblingFolder(1))
$("brandHome").addEventListener("click", (e) => {
  e.preventDefault()
  window.scrollTo({ top: 0, behavior: "smooth" })
})
$("forgetRecentsBtn").addEventListener("click", () =>
  toast("Forget all recent folders, progress and favourites?", {
    actions: [{ label: "Forget", run: library.forgetEverything }],
    timeout: 8000,
  }),
)

// Main page counter input (v1 behaviour)
const mainPageInfo = $("mainPageInfo")
function commitMainPage() {
  const page = parseInt(mainPageInfo.value.trim(), 10)
  if (!isNaN(page) && page >= 1 && page <= state.view.length) grid.scrollToIndex(page - 1)
  else mainPageInfo.value = state.currentVisibleIndex >= 0 ? state.currentVisibleIndex + 1 : 0
}
mainPageInfo.addEventListener("click", () => mainPageInfo.select())
mainPageInfo.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "Escape") {
    if (e.key === "Escape") mainPageInfo.value = state.currentVisibleIndex + 1
    else commitMainPage()
    mainPageInfo.blur()
  }
})
mainPageInfo.addEventListener("blur", commitMainPage)

// ---------------------------------------------------------------------------
// Spotlight, fullscreen, scroll-to-top, side menus, scroll remap, cursor (v1)
// ---------------------------------------------------------------------------

function toggleSpotlight() {
  const bar = $("buttonContainer")
  const isHidden = bar.style.display === "none"
  bar.style.display = isHidden ? "" : "none"
  body.style.overflow = isHidden ? "auto" : "hidden"
  body.classList.toggle("spotlight", !isHidden)
}

function toggleFullScreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen().catch(() => {})
}
document.addEventListener("fullscreenchange", () => {
  const icon = document.fullscreenElement ? "#i-minimize" : "#i-maximize"
  for (const id of ["fullScreen", "mainFullScreen"]) $(id).querySelector("use").setAttribute("href", icon)
})

let lastScrollTop = 0
let scrollRaf = 0
window.addEventListener(
  "scroll",
  () => {
    if (scrollRaf) return
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0
      const top = window.scrollY
      $("scrollToTopBtn").classList.toggle("visible", top >= 50 && top < lastScrollTop)
      lastScrollTop = Math.max(top, 0)
      if (!isOverlayOpen()) {
        grid.updateVisibleIndex()
        reading.updateProgressBar()
      }
    })
  },
  { passive: true },
)
$("scrollToTopBtn").addEventListener("click", () => window.scrollTo(0, 0))

function setupSideMenuToggle(menu) {
  let raf = 0
  document.addEventListener("mousemove", (e) => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      const r = menu.getBoundingClientRect()
      const show =
        e.clientX < 50 || (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)
      menu.classList.toggle("visible", show)
    })
  })
}

function setupHorizontalScrollRemapper() {
  window.addEventListener(
    "wheel",
    (e) => {
      if (!isOverlayOpen() && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        window.scrollBy(0, e.deltaX)
      }
    },
    { passive: false },
  )
  const overlay = $("overlay")
  overlay.addEventListener(
    "wheel",
    (e) => {
      if (overlay.classList.contains("height-limited-mode")) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault()
          e.stopPropagation()
          overlay.scrollBy(e.deltaY, 0)
        }
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        e.stopPropagation()
        overlay.scrollBy(0, e.deltaX)
      }
    },
    { passive: false },
  )
}

let idleTimer = 0
function resetIdle() {
  body.classList.remove("cursor-hidden")
  clearTimeout(idleTimer)
  if (settings.cursorHideMs > 0) idleTimer = setTimeout(() => body.classList.add("cursor-hidden"), settings.cursorHideMs)
}
document.addEventListener("mousemove", resetIdle)
document.addEventListener("mousedown", resetIdle)

// ---------------------------------------------------------------------------
// Drag and drop (files, or a folder → goes into Recents when the browser allows)
// ---------------------------------------------------------------------------

const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files")
let dragDepth = 0
window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return
  dragDepth++
  body.classList.add("dragging")
})
window.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return
  if (--dragDepth <= 0) {
    dragDepth = 0
    body.classList.remove("dragging")
  }
})
window.addEventListener("dragover", (e) => {
  if (hasFiles(e)) e.preventDefault()
})
// Progress only starts saving once the user does something after a folder opens.
for (const type of ["wheel", "touchstart", "keydown", "mousedown"]) {
  window.addEventListener(type, library.armProgress, { passive: true, capture: true })
}

window.addEventListener("drop", async (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth = 0
  body.classList.remove("dragging")
  // DataTransfer items must be read synchronously, before any await.
  const entries = [...e.dataTransfer.items].filter((i) => i.kind === "file")
  const handlePromises = entries.map((i) => i.getAsFileSystemHandle?.().catch(() => null) ?? null)
  const fsEntries = entries.map((i) => i.webkitGetAsEntry?.() ?? null)
  const files = [...e.dataTransfer.files]

  const handles = (await Promise.all(handlePromises)).filter(Boolean)
  const dir = handles.find((h) => h.kind === "directory")
  if (dir) return library.openDirectory(dir)
  const dirEntry = fsEntries.find((en) => en?.isDirectory)
  if (dirEntry) return loadFiles(await readEntryFiles(dirEntry), { name: dirEntry.name, source: "input" })
  loadFiles(files)
})

async function readEntryFiles(dirEntry) {
  const reader = dirEntry.createReader()
  const all = []
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    all.push(...batch)
  }
  const fileEntries = all.filter((en) => en.isFile)
  return Promise.all(fileEntries.map((en) => new Promise((resolve, reject) => en.file(resolve, reject))))
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

const activeIndex = () => (isOverlayOpen() ? state.currentIndex : state.currentVisibleIndex)

setupShortcuts({
  x: viewer.closeViewer,
  Escape: () => {
    if (isOverlayOpen()) viewer.closeViewer()
    else if (reading.isAutoScrolling()) reading.stopAutoScroll()
  },
  ArrowRight: viewer.showNext,
  ArrowLeft: viewer.showPrevious,
  r: viewer.toggleFullOrAuto,
  z: viewer.toggleZoomMode,
  s: toggleRandomize,
  g: () => grid.setGap(!state.hasGap),
  h: toggleSpotlight,
  f: toggleFullScreen,
  b: () => library.pinCurrent(activeIndex(), isOverlayOpen() ? $("saveBtn") : null),
  "+": () => grid.changeContainerWidth(10),
  "=": () => grid.changeContainerWidth(10),
  "-": () => grid.changeContainerWidth(-10),
  // new in v2
  p: viewer.toggleSlideshow,
  i: () => {
    if (isOverlayOpen()) return viewer.toggleInfo()
    if (!state.view.length) return
    viewer.openViewer(Math.max(0, state.currentVisibleIndex))
    viewer.toggleInfo(true)
  },
  l: () => {
    const index = isOverlayOpen() ? state.currentIndex : grid.hoveredIndex() >= 0 ? grid.hoveredIndex() : state.currentVisibleIndex
    if (index >= 0) library.toggleFavourite(index)
  },
  a: reading.toggleAutoScroll,
  ",": () => reading.changeAutoScrollSpeed(-1),
  ".": () => reading.changeAutoScrollSpeed(1),
  "[": () => library.siblingFolder(-1),
  "]": () => library.siblingFolder(1),
  "/": () => {
    if (!state.items.length) return
    if ($("buttonContainer").style.display === "none") toggleSpotlight()
    $("filterInput").focus()
  },
  o: library.pickFolder,
  "?": () => openDialog("shortcuts"),
})

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function applyBackground() {
  body.dataset.bg = settings.background
}

function applySavedLayout() {
  const layout = settings.rememberLayout ? settings.layout : DEFAULTS.layout
  state.hasGap = layout.hasGap
  state.isForceFillWidth = layout.isForceFillWidth
  grid.applyContainerWidth(layout.containerWidth)
  grid.applyGridStep(Math.min(layout.gridStepIndex, GRID_STEPS.length - 1))
  grid.setGap(layout.hasGap)
  grid.setFillWidth(layout.isForceFillWidth)
  viewer.setSizeMode(layout.overlayMode || "auto", { persist: false })
}

async function init() {
  applyBackground()
  applySavedLayout()
  setupRipple()
  setupSideMenuToggle($("sideMenu"))
  setupSideMenuToggle($("mainSideMenu"))
  setupHorizontalScrollRemapper()
  resetIdle()
  bindSettingsForm((key) => {
    if (key === "gifMode") grid.refreshLiveTiles()
    if (key === "background") applyBackground()
    if (key === "cursorHideMs") resetIdle()
    if (key === "rememberLayout" && settings.rememberLayout) emit("layout")
  })
  setupPwa((files) => loadFiles(files))
  updateChrome()
  await library.migrateLegacyBookmarks()
  library.renderRecents()
  library.renderLibrary()
  body.classList.add("ready")
}

init()

// Handy for debugging and tests.
window.lumen = { state, settings, loadFiles, refreshView, library }
