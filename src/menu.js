// Small popover menus (sort order, folder picker) that match the app's look.
// Items: { label, value, checked?, kind?: "radio" | "check", hint? } or { separator: true } or { heading }.

let openMenu = null

/**
 * Attaches a menu to `button`. `getItems()` may be async; `onPick(item)` runs on choose.
 * Returns { close }.
 */
export function attachMenu(button, { getItems, onPick, label }) {
  button.addEventListener("click", async () => {
    if (openMenu?.button === button) return closeMenu()
    closeMenu()
    const items = await getItems()
    showMenu(button, items, onPick, label)
  })
  return { close: closeMenu }
}

function showMenu(button, items, onPick, label) {
  const pop = document.createElement("div")
  pop.className = "menu-pop"
  pop.setAttribute("role", "menu")
  if (label) pop.setAttribute("aria-label", label)

  for (const item of items) {
    if (item.separator) {
      pop.append(Object.assign(document.createElement("hr"), { className: "menu-sep" }))
      continue
    }
    if (item.heading) {
      pop.append(Object.assign(document.createElement("div"), { className: "menu-heading", textContent: item.heading }))
      continue
    }
    const el = document.createElement("button")
    el.type = "button"
    el.className = "menu-item"
    el.setAttribute("role", item.kind === "check" ? "menuitemcheckbox" : item.kind === "radio" ? "menuitemradio" : "menuitem")
    if (item.kind) el.setAttribute("aria-checked", String(!!item.checked))
    el.innerHTML = '<svg class="icon menu-tick"><use href="#i-check" /></svg>'
    const text = document.createElement("span")
    text.className = "menu-label"
    text.textContent = item.label
    el.append(text)
    if (item.hint) el.append(Object.assign(document.createElement("small"), { textContent: item.hint }))
    el.addEventListener("click", () => {
      closeMenu()
      onPick(item)
    })
    pop.append(el)
  }

  document.body.append(pop)
  const r = button.getBoundingClientRect()
  const width = Math.max(r.width, pop.offsetWidth)
  pop.style.minWidth = `${r.width}px`
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`
  pop.style.top = `${r.bottom + 6}px`
  pop.style.maxHeight = `${Math.max(160, innerHeight - r.bottom - 20)}px`

  button.setAttribute("aria-expanded", "true")
  openMenu = { button, pop }
  const current = pop.querySelector('[aria-checked="true"]') || pop.querySelector(".menu-item")
  current?.scrollIntoView({ block: "nearest" })
  current?.focus({ preventScroll: true })

  pop.addEventListener("keydown", (e) => {
    const all = [...pop.querySelectorAll(".menu-item")]
    const i = all.indexOf(document.activeElement)
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const next = all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]
      next?.focus()
    } else if (e.key === "Home") all[0]?.focus()
    else if (e.key === "End") all.at(-1)?.focus()
    else if (e.key === "Escape" || e.key === "Tab") {
      closeMenu()
      button.focus()
    } else return
    e.preventDefault()
    e.stopPropagation()
  })
  // Other shortcuts stay quiet while the menu has focus.
  pop.addEventListener("keydown", (e) => e.stopPropagation())
}

export function closeMenu() {
  if (!openMenu) return
  openMenu.button.setAttribute("aria-expanded", "false")
  openMenu.pop.remove()
  openMenu = null
}

document.addEventListener("pointerdown", (e) => {
  if (openMenu && !openMenu.pop.contains(e.target) && !openMenu.button.contains(e.target)) closeMenu()
})
window.addEventListener("resize", closeMenu)
window.addEventListener("scroll", (e) => {
  if (openMenu && !openMenu.pop.contains(e.target)) closeMenu()
}, true)
