import { expect } from "@playwright/test"

export const BASIC_DIR = "tests/fixtures/basic/Sample Set"
export const BASIC_FILES = ["img 10.png", "img 3.png", "img 1.png", "img 5.gif", "img 2.png", "img 7.gif", "img 4.png", "img 6.png"]
export const BASIC_ORDER = ["img 1.png", "img 2.png", "img 3.png", "img 4.png", "img 5.gif", "img 6.png", "img 7.gif", "img 10.png"]

/** Opens the app and fails the test on any page error. */
export async function openApp(page) {
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  await page.goto("/")
  await page.waitForFunction(() => document.body.classList.contains("ready"))
  return errors
}

export async function loadBasicFiles(page) {
  await page.setInputFiles("#fileInput", BASIC_FILES.map((f) => `${BASIC_DIR}/${f}`))
  await expect(page.locator(".tile")).toHaveCount(8)
}

export const tileNames = (page) => page.locator(".tile img").evaluateAll((imgs) => imgs.map((i) => i.alt))

/**
 * Copies fixture files into the Origin Private File System and returns nothing; the
 * directory handle is stored on window.__dirs[name] so tests can open it like a picked folder.
 */
export async function makeOpfsFolder(page, name, files, { parent } = {}) {
  await page.evaluate(
    async ({ name, files, parent }) => {
      const root = await navigator.storage.getDirectory()
      const base = parent ? await root.getDirectoryHandle(parent, { create: true }) : root
      const dir = await base.getDirectoryHandle(name, { create: true })
      for (const [fileName, url] of files) {
        const blob = await (await fetch(url)).blob()
        const fh = await dir.getFileHandle(fileName, { create: true })
        const w = await fh.createWritable()
        await w.write(blob)
        await w.close()
      }
      window.__dirs ||= {}
      window.__dirs[name] = dir
      if (parent) window.__dirs[parent] = base
    },
    { name, files, parent },
  )
}

export const basicUrls = (names = BASIC_ORDER) =>
  names.map((n) => [n, `/tests/fixtures/basic/Sample%20Set/${encodeURIComponent(n)}`])
