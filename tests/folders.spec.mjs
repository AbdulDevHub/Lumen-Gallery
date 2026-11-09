import { test, expect } from "@playwright/test"
import { openApp, makeOpfsFolder, basicUrls } from "./helpers.mjs"

// Folder handles from the Origin Private File System behave like picked folders
// (storable in IndexedDB, always "granted"), so Recents and Library can be tested headlessly.

test("opened folders appear in Recents and offer to resume", async ({ page }) => {
  const errors = await openApp(page)
  await makeOpfsFolder(page, "Trip", basicUrls())
  await page.evaluate(() => window.lumen.library.openDirectory(window.__dirs.Trip))
  await expect(page.locator(".tile")).toHaveCount(8)
  await expect(page.locator("#folderName")).toHaveText("Trip")

  // Read down to the 6th image (a real wheel event marks the user as reading) and let progress save.
  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 20)
  await page.evaluate(() => document.querySelectorAll(".tile")[5].scrollIntoView({ block: "center" }))
  await expect.poll(() => page.evaluate(() => window.lumen.state.currentVisibleIndex)).toBe(5)
  await page.waitForTimeout(1200)

  await page.reload()
  await page.waitForFunction(() => document.body.classList.contains("ready"))
  const card = page.locator("#recentList .card").first()
  await expect(card).toContainText("Trip")
  await expect(card).toContainText("6 / 8")

  await card.locator(".card-open").click()
  const resume = page.locator(".toast-action", { hasText: "Resume at 6" })
  await expect(resume).toBeVisible()
  await resume.click()
  await expect.poll(() => page.evaluate(() => window.lumen.state.currentVisibleIndex)).toBeGreaterThanOrEqual(4)
  expect(errors).toEqual([])
})

test("reopening a folder without reading does not reset its progress", async ({ page }) => {
  await openApp(page)
  await makeOpfsFolder(page, "Keep", basicUrls())
  await page.evaluate(async () => {
    const { db } = await import("/src/db.js")
    await db.put("folders", { name: "Keep", index: 6, itemName: "img 7.gif", count: 8, favs: [], lastOpened: 1 })
  })
  await page.evaluate(() => window.lumen.library.openDirectory(window.__dirs.Keep))
  await expect(page.locator(".toast-action", { hasText: "Resume at 7" })).toBeVisible()
  await page.waitForTimeout(1200)
  const record = await page.evaluate(async () => (await import("/src/db.js")).db.get("folders", "Keep"))
  expect(record.index).toBe(6)
})

test("pins and favourites persist per folder", async ({ page }) => {
  await openApp(page)
  await makeOpfsFolder(page, "Pins", basicUrls())
  await page.evaluate(() => window.lumen.library.openDirectory(window.__dirs.Pins))
  await page.locator(".tile").nth(2).click()
  await page.keyboard.press("b")
  await expect(page.locator(".toast")).toContainText("Pinned page 3")
  await page.keyboard.press("l")
  await page.keyboard.press("x")

  await page.reload()
  await page.waitForFunction(() => document.body.classList.contains("ready"))
  await page.locator("#recentList .card-open").first().click()
  await expect(page.locator(".toast-action", { hasText: "Pinned page 3" })).toBeVisible()
  await expect(page.locator(".tile").nth(2)).toHaveClass(/is-fav/)
})

test("v1 bookmarks are migrated into Recents", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("lumen.migrated")) localStorage.setItem("galleryBookmarks", JSON.stringify({ "Old Folder": 12 }))
  })
  await openApp(page)
  await expect(page.locator("#recentList")).toContainText("Old Folder")
  await expect(page.locator("#recentList")).toContainText("choose again")
})

test("Library lists sub-folders and [ ] jump between them", async ({ page }) => {
  await openApp(page)
  for (const name of ["Part 1", "Part 2", "Part 10"]) {
    await makeOpfsFolder(page, name, basicUrls(["img 1.png", "img 2.png"]), { parent: "Lib" })
  }
  await page.evaluate(async () => {
    const { db } = await import("/src/db.js")
    await db.put("kv", window.__dirs.Lib, "libraryRoot")
  })
  await page.reload()
  await page.waitForFunction(() => document.body.classList.contains("ready"))
  const cards = page.locator("#libraryList .folder-card")
  await expect(cards).toHaveText(["Part 1", "Part 2", "Part 10"])

  await cards.nth(1).click()
  await expect(page.locator("#folderName")).toHaveText("Part 2")
  await expect(page.locator("#nextFolderBtn")).toBeVisible()
  await page.keyboard.press("]")
  await expect(page.locator("#folderName")).toHaveText("Part 10")
  await page.keyboard.press("]")
  await expect(page.locator(".toast").last()).toContainText("last folder")
  await page.keyboard.press("[")
  await page.keyboard.press("[")
  await expect(page.locator("#folderName")).toHaveText("Part 1")
})
