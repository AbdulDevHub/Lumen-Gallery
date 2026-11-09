// Renders icons/icon.svg to the PNG sizes the extension, browsers and the PWA need.
import { chromium } from "@playwright/test"
import { readFile } from "node:fs/promises"

const svg = await readFile("icons/icon.svg", "utf8")
const sizes = { "icon-16.png": 16, "icon-32.png": 32, "icon-48.png": 48, "icon-128.png": 128, "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 }
const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size] of Object.entries(sizes)) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`)
  await page.screenshot({ path: `icons/${name}`, omitBackground: true })
}
// Maskable: full-bleed background with the artwork inside the 80% safe zone.
await page.setViewportSize({ width: 512, height: 512 })
await page.setContent(`<style>html,body{margin:0;background:#16130f}div{display:grid;place-items:center;width:512px;height:512px}svg{width:410px;height:410px}</style><div>${svg}</div>`)
await page.screenshot({ path: "icons/icon-maskable-512.png" })
await browser.close()
console.log("Icons written to icons/")
