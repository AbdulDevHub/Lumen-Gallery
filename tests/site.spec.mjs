import { test, expect } from "@playwright/test"
import { readFile, readdir } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { openApp } from "./helpers.mjs"

test("image header sniffing handles JPEG and WebP", async ({ page }) => {
  await openApp(page)
  const dims = await page.evaluate(async () => {
    const { readDimensions } = await import("/src/files.js")
    const canvas = Object.assign(document.createElement("canvas"), { width: 321, height: 123 })
    canvas.getContext("2d").fillRect(0, 0, 10, 10)
    const out = {}
    for (const type of ["image/jpeg", "image/webp", "image/png"]) {
      const blob = await new Promise((r) => canvas.toBlob(r, type, 0.9))
      out[type] = await readDimensions(new File([blob], "x", { type }))
    }
    return out
  })
  for (const d of Object.values(dims)) expect(d).toEqual({ w: 321, h: 123 })
})

test("SEO: head tags, JSON-LD and visible FAQ agree", async ({ page }) => {
  await openApp(page)
  const title = await page.title()
  expect(title.length).toBeLessThanOrEqual(65)
  const description = await page.locator('meta[name="description"]').getAttribute("content")
  expect(description.length).toBeGreaterThan(70)
  expect(description.length).toBeLessThanOrEqual(160)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://abduldevhub.github.io/Lumen-Gallery/")
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /og-image\.png$/)
  await expect(page.locator("h1")).toHaveCount(1)

  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())
  const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage").mainEntity.map((q) => q.name)
  const visible = await page.locator("[data-panel=faq] summary").allTextContents()
  expect(visible).toEqual(faq)
})

// The owner wants the project described neutrally; banned words are stored reversed so they
// don't appear in the repo themselves.
const BANNED = ["cimoc", "agnam", "awhnam", "nootbew"].map((w) => [...w].reverse().join(""))

test("public copy stays neutral", async () => {
  const files = ["index.html", "README.md", "AGENTS.md", "site.webmanifest", "manifest.json", "package.json", ".github/RELEASE_NOTES.md"]
  for (const file of [...files, ...(await readdir("context")).map((f) => `context/${f}`)]) {
    const text = (await readFile(file, "utf8")).toLowerCase()
    for (const word of BANNED) expect(text.includes(word), `${file} mentions a banned word`).toBe(false)
  }
})

test("service worker precaches every module and nothing missing", async () => {
  const sw = await readFile("sw.js", "utf8")
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\])/)[1].replace(/,\s*\]/, "]"))
  for (const file of shell.filter((f) => f !== "./")) expect(existsSync(file), file).toBe(true)
  for (const mod of await readdir("src")) expect(shell, mod).toContain(`src/${mod}`)
})

test("packaged extension contains only runtime files", async () => {
  execFileSync(process.execPath, ["tools/package.mjs"])
  const files = await readdir("dist/extension", { recursive: true })
  expect(files).toContain("manifest.json")
  expect(files).toContain("background.js")
  expect(files.some((f) => /tests|tools|node_modules|sw\.js|README/.test(f))).toBe(false)
  const manifest = JSON.parse(await readFile("dist/extension/manifest.json", "utf8"))
  for (const icon of Object.values(manifest.icons)) expect(existsSync(`dist/extension/${icon}`), icon).toBe(true)
  const site = await readdir("dist/site", { recursive: true })
  for (const f of ["index.html", "sw.js", "robots.txt", "sitemap.xml", "site.webmanifest"]) expect(site).toContain(f)
})
