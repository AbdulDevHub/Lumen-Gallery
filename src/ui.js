// Small UI helpers: toasts, ripple, loader, the Settings & Help dialog.

import { $ } from "./state.js"
import { settings, saveSettings } from "./settings.js"

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

/** toast("Saved") or toast("Welcome back", { actions: [{ label, run }], timeout }) */
export function toast(message, { actions = [], timeout = 3500 } = {}) {
  const host = $("toasts")
  const el = document.createElement("div")
  el.className = "toast"
  const text = document.createElement("span")
  text.textContent = message
  el.append(text)
  const dismiss = () => {
    el.classList.add("leaving")
    setTimeout(() => el.remove(), 250)
  }
  for (const action of actions) {
    const btn = document.createElement("button")
    btn.className = "toast-action"
    btn.textContent = action.label
    btn.addEventListener("click", () => {
      action.run()
      dismiss()
    })
    el.append(btn)
  }
  host.append(el)
  while (host.children.length > 3) host.firstElementChild.remove()
  if (timeout) setTimeout(dismiss, timeout)
  return dismiss
}

export function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 60) return "just now"
  const units = [
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Infinity, "year"],
  ]
  let value = s / 60
  for (const [size, name] of units) {
    if (value < size) {
      const n = Math.floor(value)
      return `${n} ${name}${n === 1 ? "" : "s"} ago`
    }
    value /= size
  }
  return ""
}

// ---------------------------------------------------------------------------
// Ripple (replaces the 3.4k-line Materialize bundle)
// ---------------------------------------------------------------------------

export function setupRipple() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
  document.addEventListener("pointerdown", (e) => {
    if (reduce.matches) return
    const target = e.target.closest?.(".btn, .icon-btn, .menu-button")
    if (!target) return
    const rect = target.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2
    const ripple = document.createElement("span")
    ripple.className = "ripple"
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`
    target.append(ripple)
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true })
  })
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export const loader = {
  show(total) {
    $("geminiLoader").classList.add("active")
    $("loaderTotal").textContent = total
    $("loaderCurrent").textContent = "0"
    document.querySelector(".loader-text").textContent = "LOADING IMAGES..."
    document.querySelector(".loader-progress").style.display = "block"
  },
  update(current, total) {
    $("loaderCurrent").textContent = current
    if (total !== undefined) $("loaderTotal").textContent = total
  },
  rendering() {
    document.querySelector(".loader-text").textContent = "RENDERING IMAGES..."
    document.querySelector(".loader-progress").style.display = "none"
  },
  hide() {
    $("geminiLoader").classList.remove("active")
  },
}

// ---------------------------------------------------------------------------
// Settings & Help dialog
// ---------------------------------------------------------------------------

const dialog = $("settingsDialog")

export function openDialog(tab = "settings") {
  selectTab(tab)
  if (!dialog.open) dialog.showModal()
}

function selectTab(name) {
  for (const tab of dialog.querySelectorAll(".tab")) tab.setAttribute("aria-selected", String(tab.dataset.tab === name))
  for (const panel of dialog.querySelectorAll(".tab-panel")) panel.hidden = panel.dataset.panel !== name
}

dialog.querySelector(".tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab")
  if (tab) selectTab(tab.dataset.tab)
})
// Click on the backdrop closes the dialog.
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close()
})

/** Binds the settings form to `settings`; `onChange(key)` lets modules react. */
export function bindSettingsForm(onChange) {
  const form = $("settingsForm")
  const outputs = {
    slideshowSeconds: (v) => `${v}s`,
    autoScrollSpeed: (v) => `${v} px/s`,
  }
  const sync = () => {
    for (const field of form.elements) {
      if (!field.name || !(field.name in settings)) continue
      if (field.type === "checkbox") field.checked = !!settings[field.name]
      else field.value = String(settings[field.name])
    }
    for (const out of form.querySelectorAll("output[data-for]")) out.textContent = outputs[out.dataset.for](settings[out.dataset.for])
  }
  form.addEventListener("input", (e) => {
    const field = e.target
    if (!field.name || !(field.name in settings)) return
    const old = settings[field.name]
    settings[field.name] =
      field.type === "checkbox" ? field.checked : typeof old === "number" ? Number(field.value) : field.value
    saveSettings()
    sync()
    onChange(field.name)
  })
  sync()
  return sync
}
