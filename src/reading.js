// Reading helpers for long folders: a thin progress bar and hands-free auto-scroll.

import { $, state, isOverlayOpen } from "./state.js"
import { settings, saveSettings } from "./settings.js"
import { toast } from "./ui.js"

const bar = $("readProgress").firstElementChild
const pill = $("autoScrollPill")
const speedOut = $("autoSpeed")

export function updateProgressBar() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  const ratio = state.view.length && max > 0 ? Math.min(1, window.scrollY / max) : 0
  bar.style.transform = `scaleX(${ratio})`
}

// ---------------------------------------------------------------------------
// Auto-scroll
// ---------------------------------------------------------------------------

let raf = 0
let last = 0
let pausedUntil = 0
let carry = 0

export const isAutoScrolling = () => !!raf

export function toggleAutoScroll() {
  if (raf) return stopAutoScroll()
  if (!state.view.length || isOverlayOpen()) return
  last = performance.now()
  carry = 0
  raf = requestAnimationFrame(step)
  pill.hidden = false
  speedOut.textContent = settings.autoScrollSpeed
  $("autoScrollBtn").classList.add("selectedGridOption")
}

export function stopAutoScroll() {
  cancelAnimationFrame(raf)
  raf = 0
  pill.hidden = true
  $("autoScrollBtn").classList.remove("selectedGridOption")
}

function step(now) {
  const dt = Math.min(100, now - last)
  last = now
  if (now >= pausedUntil && !isOverlayOpen()) {
    carry += (settings.autoScrollSpeed * dt) / 1000
    const whole = Math.floor(carry)
    if (whole >= 1) {
      carry -= whole
      window.scrollBy(0, whole)
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      stopAutoScroll()
      toast("Reached the end of the folder.")
      return
    }
  }
  raf = requestAnimationFrame(step)
}

export function changeAutoScrollSpeed(direction) {
  const next = Math.round(settings.autoScrollSpeed * (direction > 0 ? 1.25 : 0.8))
  settings.autoScrollSpeed = Math.max(10, Math.min(1200, next))
  saveSettings()
  speedOut.textContent = settings.autoScrollSpeed
  if (!raf) toast(`Auto-scroll speed: ${settings.autoScrollSpeed} px/s`, { timeout: 1200 })
}

// Manual scrolling pauses auto-scroll briefly instead of fighting it.
const pause = () => {
  if (raf) pausedUntil = performance.now() + 1500
}
window.addEventListener("wheel", pause, { passive: true })
window.addEventListener("touchstart", pause, { passive: true })
window.addEventListener("mousedown", (e) => {
  if (!pill.contains(e.target)) pause()
})

$("autoScrollBtn").addEventListener("click", toggleAutoScroll)
$("autoStop").addEventListener("click", stopAutoScroll)
$("autoSlower").addEventListener("click", () => changeAutoScrollSpeed(-1))
$("autoFaster").addEventListener("click", () => changeAutoScrollSpeed(1))
