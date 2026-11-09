// User preferences, persisted in localStorage. Storage can throw (private mode, blocked
// site data), so every access is guarded and the app works with defaults.

const KEY = "lumen.settings"

export const DEFAULTS = {
  gifMode: "hover", // hover | visible | still
  videoFrames: "auto", // auto (= images per row) | number as string
  slideshowSeconds: 4,
  autoScrollSpeed: 80, // px per second
  cursorHideMs: 5000,
  resumePrompt: true,
  background: "charcoal",
  rememberLayout: true,
  layout: { gridStepIndex: 0, containerWidth: 90, hasGap: true, isForceFillWidth: true, overlayMode: "auto" },
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}")
    return { ...DEFAULTS, ...saved, layout: { ...DEFAULTS.layout, ...(saved.layout || {}) } }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

export const settings = load()

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

export function storageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}
