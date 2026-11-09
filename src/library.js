// Folders: opening (picker, input fallback, drop), Recent folders, the Library root,
// automatic progress saving + resume, pins, favourites, and previous/next folder.

import { state, $, emit, on } from "./state.js"
import { settings, storageGet, storageSet } from "./settings.js"
import { db, updateFolder } from "./db.js"
import { filesFromDirectory, subdirectories } from "./files.js"
import { toast, timeAgo } from "./ui.js"

export const canPickDirectories = () => typeof window.showDirectoryPicker === "function"

/** Set by main.js: (files, folderInfo) => Promise<void> that loads items into the gallery. */
let loadIntoGallery = async () => {}
export function setLoader(fn) {
  loadIntoGallery = fn
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

async function ensureReadPermission(handle) {
  const opts = { mode: "read" }
  if ((await handle.queryPermission?.(opts)) === "granted") return true
  try {
    return (await handle.requestPermission?.(opts)) === "granted"
  } catch {
    return false // e.g. no user activation
  }
}

// ---------------------------------------------------------------------------
// Opening folders
// ---------------------------------------------------------------------------

export async function pickFolder() {
  if (!canPickDirectories()) {
    $("folderInput").click()
    return
  }
  let handle
  try {
    handle = await window.showDirectoryPicker({ id: "lumen-folder", mode: "read" })
  } catch (error) {
    if (error.name !== "AbortError") {
      console.warn(error)
      $("folderInput").click() // picker blocked (e.g. system folder): fall back
    }
    return
  }
  await openDirectory(handle)
}

let openSeq = 0

/** Opens a directory handle. `parent` is the Library root when opened from the Library. */
export async function openDirectory(handle, { parent = null } = {}) {
  const seq = ++openSeq // the most recent click wins, even if an older folder is slower to read
  if (!(await ensureReadPermission(handle))) {
    toast(`Permission to read “${handle.name}” was not granted.`)
    return
  }
  let files
  try {
    files = await filesFromDirectory(handle)
  } catch (error) {
    console.warn(error)
    toast(`Couldn't read “${handle.name}”. It may have been moved or deleted.`)
    return
  }
  if (seq !== openSeq) return
  if (!files.length) {
    toast(`No images or videos directly inside “${handle.name}”.`)
    return
  }
  if (!parent) parent = await libraryParentOf(handle)
  if (seq !== openSeq) return
  await loadIntoGallery(files, { name: handle.name, handle, parent, source: "handle" })
}

/** If the folder lives directly in the Library root, remember that so [ and ] work. */
async function libraryParentOf(handle) {
  const root = await db.get("kv", "libraryRoot")
  if (!root || (await root.queryPermission?.({ mode: "read" })) !== "granted") return null
  try {
    for await (const entry of root.values()) {
      if (entry.kind === "directory" && entry.name === handle.name && (await entry.isSameEntry(handle))) return root
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Called by main.js after a folder's items are on screen. */
export async function onFolderOpened(folder) {
  if (!folder || state.folder !== folder) return
  const count = state.items.length
  const record = await updateFolder(folder.name, (cur) => ({
    handle: folder.handle || cur.handle || null,
    count,
    lastOpened: Date.now(),
    legacy: false,
  }))
  if (state.folder !== folder) return // the user switched folders meanwhile
  state.favs = new Set(record.favs || [])
  emit("favs-changed")
  if (state.favs.size) emit("favs-loaded")
  maybeOfferResume(record)
  saveThumbnail(folder.name, state.items.find((i) => !i.isGif) || state.items[0])
  renderRecents()
}

function indexOfName(name) {
  return name ? state.view.findIndex((item) => item.name === name) : -1
}

function maybeOfferResume(record) {
  if (!settings.resumePrompt) return
  const actions = []
  const resumeAt = pickIndex(record.itemName, record.index)
  if (resumeAt > 0) actions.push({ label: `Resume at ${resumeAt + 1}`, run: () => emit("goto-index", resumeAt) })
  const pinAt = pickIndex(record.pinName, record.pin)
  if (pinAt >= 0 && record.pin !== undefined && pinAt !== resumeAt) {
    actions.push({ label: `Pinned page ${pinAt + 1}`, run: () => emit("goto-index", pinAt) })
  }
  if (actions.length) toast(`Welcome back to “${record.name}”`, { actions, timeout: 12000 })
}

function pickIndex(name, index) {
  const byName = indexOfName(name)
  if (byName >= 0) return byName
  return Number.isInteger(index) && index >= 0 && index < state.view.length ? index : -1
}

// ---------------------------------------------------------------------------
// Progress (auto-saved), pins, favourites
// ---------------------------------------------------------------------------

let saveTimer = 0
let armed = false
export const disarmProgress = () => {
  armed = false
  clearTimeout(saveTimer)
}
export const armProgress = () => {
  armed = true
}

export function noteProgress(index) {
  if (!armed || !state.folder || index < 0 || state.isRandomized) return
  clearTimeout(saveTimer)
  const name = state.folder.name
  const item = state.view[index]
  if (!item) return
  // Stored against the full, name-ordered list so filters and sorting don't skew it.
  const fullIndex = state.items.indexOf(item)
  saveTimer = setTimeout(() => {
    updateFolder(name, { index: fullIndex, itemName: item.name, lastOpened: Date.now() })
  }, 700)
}

export async function pinCurrent(index, button) {
  if (!state.folder) {
    toast("Pins are saved per folder. Open a folder to use them.")
    return
  }
  const item = state.view[index]
  if (!item) {
    toast("No image to pin.")
    return
  }
  await updateFolder(state.folder.name, { pin: state.items.indexOf(item), pinName: item.name })
  if (button) {
    button.classList.add("saved")
    setTimeout(() => button.classList.remove("saved"), 1000)
  }
  toast(`Pinned page ${index + 1} of “${state.folder.name}”`)
}

export async function toggleFavourite(index) {
  const item = state.view[index]
  if (!item) return
  const isFav = !state.favs.has(item.name)
  if (isFav) state.favs.add(item.name)
  else state.favs.delete(item.name)
  emit("fav-toggled", { index, isFav })
  emit("favs-changed")
  if (state.folder) await updateFolder(state.folder.name, { favs: [...state.favs] })
  toast(isFav ? "Added to favourites" : "Removed from favourites", { timeout: 1500 })
}

// ---------------------------------------------------------------------------
// Thumbnails for Recent cards
// ---------------------------------------------------------------------------

async function saveThumbnail(folderName, item) {
  if (!item) return
  try {
    const bitmap = await createImageBitmap(item.file, { resizeWidth: 360, resizeQuality: "medium" })
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = Math.min(bitmap.height, 270)
    canvas.getContext("2d").drawImage(bitmap, 0, 0)
    bitmap.close()
    const thumb = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.8))
    if (thumb) await updateFolder(folderName, { thumb })
    renderRecents()
  } catch {
    /* thumbnails are optional */
  }
}

// ---------------------------------------------------------------------------
// Recent folders UI
// ---------------------------------------------------------------------------

let thumbUrls = []

export async function renderRecents() {
  const list = $("recentList")
  const records = (await db.all("folders")).filter((r) => r.lastOpened || r.legacy).sort((a, b) => b.lastOpened - a.lastOpened)
  thumbUrls.forEach((u) => URL.revokeObjectURL(u))
  thumbUrls = []
  $("recentSection").hidden = records.length === 0
  list.replaceChildren(...records.slice(0, 12).map(recentCard))
}

function recentCard(record) {
  const card = document.createElement("article")
  card.className = "card"
  const open = document.createElement("button")
  open.className = "card-open"
  open.title = record.handle ? `Open “${record.name}”` : `Choose “${record.name}” again to reopen it`

  const thumb = document.createElement("div")
  thumb.className = "card-thumb"
  if (record.thumb) {
    const url = URL.createObjectURL(record.thumb)
    thumbUrls.push(url)
    thumb.style.backgroundImage = `url("${url}")`
  } else {
    thumb.innerHTML = '<svg class="icon icon-lg"><use href="#i-folder" /></svg>'
  }

  const meta = document.createElement("div")
  meta.className = "card-meta"
  const title = document.createElement("strong")
  title.textContent = record.name
  const sub = document.createElement("span")
  const page = (record.index || 0) + 1
  const parts = []
  if (record.count) parts.push(`${page} / ${record.count}`)
  if (record.lastOpened) parts.push(timeAgo(record.lastOpened))
  if (!record.handle) parts.push("choose again")
  sub.textContent = parts.join(" · ")
  meta.append(title, sub)

  const bar = document.createElement("div")
  bar.className = "card-progress"
  bar.style.setProperty("--p", record.count ? Math.min(1, page / record.count) : 0)

  open.append(thumb, meta, bar)
  open.addEventListener("click", () => openRecord(record))

  const remove = document.createElement("button")
  remove.className = "card-remove icon-btn icon-btn-sm"
  remove.title = "Remove from recents"
  remove.setAttribute("aria-label", `Remove ${record.name} from recents`)
  remove.innerHTML = '<svg class="icon"><use href="#i-x" /></svg>'
  remove.addEventListener("click", async () => {
    await updateFolder(record.name, { lastOpened: 0, legacy: false })
    renderRecents()
  })

  card.append(open, remove)
  return card
}

async function openRecord(record) {
  if (record.handle) return openDirectory(record.handle)
  toast(`Choose “${record.name}” to reopen it.`)
  pickFolder()
}

// ---------------------------------------------------------------------------
// Library (a parent folder whose sub-folders are listed and navigable with [ ])
// ---------------------------------------------------------------------------

export async function chooseLibrary() {
  if (!canPickDirectories()) {
    toast("The Library needs Chrome, Edge or another Chromium browser.")
    return
  }
  try {
    const root = await window.showDirectoryPicker({ id: "lumen-library", mode: "read" })
    await db.put("kv", root, "libraryRoot")
    await renderLibrary({ request: true })
  } catch (error) {
    if (error.name !== "AbortError") console.warn(error)
  }
}

export async function renderLibrary({ request = false } = {}) {
  const section = $("librarySection")
  const list = $("libraryList")
  section.hidden = !canPickDirectories()
  if (section.hidden) return
  const root = await db.get("kv", "libraryRoot")
  const hint = $("libraryHint")
  $("chooseLibraryBtn").textContent = root ? "Change" : "Choose library folder"
  $("libraryName").textContent = root ? root.name : "Library"
  list.replaceChildren()
  if (!root) {
    hint.hidden = false
    return
  }
  hint.hidden = true

  let permission = await root.queryPermission({ mode: "read" })
  if (permission !== "granted" && request) permission = (await ensureReadPermission(root)) ? "granted" : "denied"
  if (permission !== "granted") {
    const unlock = document.createElement("button")
    unlock.className = "btn btn-ghost"
    unlock.innerHTML = `<svg class="icon"><use href="#i-library-big" /></svg><span>Show folders in “${escapeHtml(root.name)}”</span>`
    unlock.addEventListener("click", () => renderLibrary({ request: true }))
    list.append(unlock)
    return
  }

  const [dirs, records] = await Promise.all([subdirectories(root), db.all("folders")])
  const progress = new Map(records.map((r) => [r.name, r]))
  list.replaceChildren(
    ...dirs.map((dir) => {
      const rec = progress.get(dir.name)
      const btn = document.createElement("button")
      btn.className = "folder-card"
      btn.title = `Open “${dir.name}”`
      const label = document.createElement("span")
      label.textContent = dir.name
      btn.innerHTML = '<svg class="icon"><use href="#i-folder" /></svg>'
      btn.append(label)
      if (rec?.count) {
        const pct = document.createElement("small")
        const p = Math.min(1, ((rec.index || 0) + 1) / rec.count)
        pct.textContent = p >= 0.999 ? "done" : `${Math.round(p * 100)}%`
        btn.append(pct)
        btn.classList.toggle("is-done", p >= 0.999)
        btn.classList.add("is-started")
      }
      btn.addEventListener("click", () => openDirectory(dir, { parent: root }))
      return btn
    }),
  )
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// While a folder is still loading, further [ / ] presses count from it, not the old one.
let pendingFolder = null

/** Previous (-1) / next (+1) sibling folder within the Library root. */
export async function siblingFolder(direction) {
  const parent = state.folder?.parent
  if (!parent) {
    toast(
      canPickDirectories()
        ? "Choose a Library folder on the start screen to jump between folders."
        : "Jumping between folders needs Chrome, Edge or another Chromium browser.",
    )
    return
  }
  if (!(await ensureReadPermission(parent))) return
  const dirs = await subdirectories(parent)
  const index = dirs.findIndex((d) => d.name === (pendingFolder || state.folder.name))
  const target = dirs[index + direction]
  if (!target) {
    toast(direction > 0 ? "This is the last folder." : "This is the first folder.")
    return
  }
  pendingFolder = target.name
  try {
    await openDirectory(target, { parent })
  } finally {
    if (pendingFolder === target.name) pendingFolder = null
  }
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

/** One-time import of v1 bookmarks ({ folderName: page }) from localStorage. */
export async function migrateLegacyBookmarks() {
  if (storageGet("lumen.migrated")) return
  try {
    const old = JSON.parse(storageGet("galleryBookmarks") || "{}")
    for (const [name, page] of Object.entries(old)) {
      const existing = await db.get("folders", name)
      if (!existing) await db.put("folders", { name, index: page - 1, pin: page - 1, count: 0, favs: [], lastOpened: 0, legacy: true })
    }
  } catch {
    /* ignore malformed data */
  }
  storageSet("lumen.migrated", "1")
}

export async function forgetEverything() {
  await db.clear("folders") // the Library root (kv) is a setting, not history: keep it
  state.favs = new Set()
  emit("favs-changed")
  renderRecents()
  renderLibrary()
  toast("Recent folders, progress and favourites were cleared.")
}

on("toggle-fav", (index) => toggleFavourite(index))
