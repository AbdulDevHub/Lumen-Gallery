// Shared app state + a tiny event bus. Every module imports from here.

export const $ = (id) => document.getElementById(id)

export const state = {
  /** All loaded items in natural name order. See files.js `makeItem` for the shape. */
  items: [],
  /** Items currently shown (after filter / sort / shuffle). Indices in the UI refer to this. */
  view: [],
  /** Index into `view` shown in the viewer. */
  currentIndex: -1,
  /** Index into `view` of the tile nearest the reading line in the grid. */
  currentVisibleIndex: -1,
  /** { name, handle?, parent?, source: "handle" | "input" | "files" } or null for loose files. */
  folder: null,
  /** Favourite file names for the current folder. */
  favs: new Set(),

  // view options
  sort: "name",
  isRandomized: false,
  filter: "",
  favOnly: false,

  // viewer options (ported from v1)
  zoomMode: 0, // 0 off, 1 click zoom, 2 lens
  isWidthLimited: false,
  isHeightLimited: false,
  isAutoMode: true,

  // grid options
  gridStepIndex: 0,
  hasGap: true,
  isForceFillWidth: true,
  containerWidth: 90,

  /** Promise that settles when background size sniffing is done. */
  sizing: Promise.resolve(),

  /** Object URLs to revoke on clear. */
  objectUrls: [],
}

const listeners = new Map()
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, [])
  listeners.get(event).push(fn)
}
export function emit(event, detail) {
  for (const fn of listeners.get(event) || []) fn(detail)
}

export const GRID_STEPS = [
  { className: "one-per-row", count: 1 },
  { className: "two-per-row", count: 2 },
  { className: "three-per-row", count: 3 },
  { className: "six-per-row", count: 6 },
  { className: "twelve-per-row", count: 12 },
  { className: "twenty-four-per-row", count: 24 },
]

export const isOverlayOpen = () => $("overlay").classList.contains("open")

export const isExtension = () => location.protocol === "chrome-extension:"
