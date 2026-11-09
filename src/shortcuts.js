// Keyboard shortcuts. v1 keys (x r z s g h f b + = - ← →) keep their meaning; the rest are new.

import { $, isOverlayOpen } from "./state.js"

/** handlers: { [key]: (event) => void }. Letter keys are matched case-insensitively. */
export function setupShortcuts(handlers) {
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if ($("settingsDialog").open) return
    const target = event.target
    if (target.closest?.("input, textarea, select, [contenteditable='true']")) {
      if (event.key === "Escape") target.blur()
      return
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const handler = handlers[key]
    if (!handler) return
    // Space / arrows would also scroll the page behind the viewer.
    if (key === "/" || (isOverlayOpen() && key.startsWith("Arrow"))) event.preventDefault()
    handler(event)
  })
}
