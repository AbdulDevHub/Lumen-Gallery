import { test, expect } from "@playwright/test"
import { openApp, loadBasicFiles, tileNames, BASIC_ORDER, BASIC_DIR } from "./helpers.mjs"

test("start screen renders without errors", async ({ page }) => {
  const errors = await openApp(page)
  await expect(page.locator("#startScreen")).toBeVisible()
  await expect(page.locator("h1")).toContainText("Lumen")
  await expect(page.locator("#imageContainer")).toBeHidden()
  expect(errors).toEqual([])
})

test("files load in natural order with header-sniffed sizes", async ({ page }) => {
  const errors = await openApp(page)
  await loadBasicFiles(page)
  expect(await tileNames(page)).toEqual(BASIC_ORDER)
  await expect(page.locator("#startScreen")).toBeHidden()
  await expect(page.locator(".tile.unsized")).toHaveCount(0)
  const ratios = await page.locator(".tile").evaluateAll((tiles) => tiles.map((t) => t.style.aspectRatio))
  expect(ratios.slice(0, 4)).toEqual(["800 / 600", "600 / 900", "400 / 2400", "3000 / 500"])
  expect(errors).toEqual([])
})

test("folder input ignores sub-folders and non-images", async ({ page }) => {
  await openApp(page)
  await page.setInputFiles("#folderInput", BASIC_DIR)
  await expect(page.locator(".tile")).toHaveCount(8)
  await expect(page.locator("#folderName")).toHaveText("Sample Set")
})

test("grid cycles 1 → 2 → 3 → 6 → 12 → 24 → 1", async ({ page }) => {
  await openApp(page)
  await loadBasicFiles(page)
  const btn = page.locator("#gridToggle")
  for (const [count, cls] of [
    ["2", "two-per-row"],
    ["3", "three-per-row"],
    ["6", "six-per-row"],
    ["12", "twelve-per-row"],
    ["24", "twenty-four-per-row"],
    ["1", "one-per-row"],
  ]) {
    await btn.click()
    await expect(btn).toHaveText(count)
    await expect(page.locator("#imageContainer")).toHaveClass(new RegExp(cls))
  }
})

test("v1 shortcuts still work", async ({ page }) => {
  await openApp(page)
  await loadBasicFiles(page)
  const container = page.locator("#imageContainer")

  await page.keyboard.press("g")
  await expect(container).toHaveClass(/no-gap/)
  await page.keyboard.press("g")
  await expect(container).not.toHaveClass(/no-gap/)

  await page.keyboard.press("s")
  await expect(page.locator("#randomize")).toHaveClass(/selectedGridOption/)
  await page.keyboard.press("s")

  await page.keyboard.press("-")
  await expect(container).toHaveAttribute("style", /max-width: 80%/)
  await page.keyboard.press("=")
  await expect(container).toHaveAttribute("style", /max-width: 90%/)

  await page.keyboard.press("h")
  await expect(page.locator("#buttonContainer")).toBeHidden()
  await page.keyboard.press("h")
  await expect(page.locator("#buttonContainer")).toBeVisible()

  // Arrow keys open the viewer, x closes it
  await page.keyboard.press("ArrowRight")
  await expect(page.locator("#overlay")).toHaveClass(/open/)
  await expect(page.locator("#pageInfo")).toHaveValue("2")
  await page.keyboard.press("ArrowRight")
  await expect(page.locator("#pageInfo")).toHaveValue("3")
  await page.keyboard.press("ArrowLeft")
  await expect(page.locator("#pageInfo")).toHaveValue("2")

  await page.keyboard.press("r")
  await expect(page.locator("#fullBtn")).toHaveClass(/selectedGridOption/)
  await page.keyboard.press("r")
  await expect(page.locator("#autoBtn")).toHaveClass(/selectedGridOption/)

  await page.keyboard.press("z")
  await expect(page.locator("#zoomMode")).toHaveClass(/zoom-active/)
  await page.keyboard.press("z")
  await page.mouse.move(700, 300)
  await page.mouse.move(705, 305)
  await expect(page.locator("#zoomLens")).toBeVisible()
  await page.keyboard.press("z")

  await page.keyboard.press("x")
  await expect(page.locator("#overlay")).not.toHaveClass(/open/)
})

test("viewer page input, auto sizing and info panel", async ({ page }) => {
  await openApp(page)
  await loadBasicFiles(page)
  await page.locator(".tile").nth(0).click()
  await expect(page.locator("#overlay")).toHaveClass(/open/)
  await expect(page.locator("#pageTotal")).toHaveText("8")

  // Tall image → width limited; panorama → height limited
  await page.locator("#pageInfo").fill("3")
  await page.locator("#pageInfo").press("Enter")
  await expect(page.locator("#overlayImage")).toHaveClass(/width-limited/)
  await page.keyboard.press("ArrowRight")
  await expect(page.locator("#overlay")).toHaveClass(/height-limited-mode/)

  await page.keyboard.press("i")
  await expect(page.locator("#infoPanel")).toBeVisible()
  await expect(page.locator("#infoPanel")).toContainText("3000 × 500")
  await expect(page.locator("#infoPanel")).toContainText("4 of 8")
  await page.keyboard.press("Escape")
  await expect(page.locator("#overlay")).not.toHaveClass(/open/)
})

test("typing in the filter does not trigger shortcuts", async ({ page }) => {
  await openApp(page)
  await loadBasicFiles(page)
  await page.keyboard.press("/")
  await expect(page.locator("#filterInput")).toBeFocused()
  await page.keyboard.type("gif")
  await expect(page.locator(".tile")).toHaveCount(2)
  await expect(page.locator("#imageContainer")).not.toHaveClass(/no-gap/) // "g" was typed, not a shortcut
  await expect(page.locator("#folderCount")).toHaveText("2 / 8")
})

test("GIFs show a still poster in the grid and animate on hover", async ({ page }) => {
  await openApp(page)
  await loadBasicFiles(page)
  await page.locator("#gridToggle").click() // 2 per row so both GIFs are near the top
  const gif = page.locator(".tile.is-gif").first()
  await gif.scrollIntoViewIfNeeded()
  const urls = () =>
    page.evaluate(() => {
      const item = window.lumen.state.view.find((i) => i.isGif)
      const tile = document.querySelector(".tile.is-gif img")
      return { src: tile.getAttribute("src"), url: item.url, poster: item.poster }
    })
  await expect.poll(async () => (await urls()).poster).toBeTruthy()
  await page.mouse.move(5, 5)
  await expect.poll(async () => {
    const u = await urls()
    return u.src === u.poster
  }).toBe(true)
  await gif.hover()
  await expect.poll(async () => {
    const u = await urls()
    return u.src === u.url
  }).toBe(true)
})

test("favourites, favourites-only filter and sort", async ({ page }) => {
  await openApp(page)
  await loadBasicFiles(page)
  await page.locator(".tile").nth(1).hover()
  await page.keyboard.press("l")
  await expect(page.locator(".tile").nth(1)).toHaveClass(/is-fav/)
  await page.locator("#favOnlyBtn").click()
  await expect(page.locator(".tile")).toHaveCount(1)
  await page.locator("#favOnlyBtn").click()
  await page.locator("#sortSelect").selectOption("size")
  const sizes = await page.evaluate(() => window.lumen.state.view.map((i) => i.size))
  expect([...sizes].sort((a, b) => b - a)).toEqual(sizes)
})

test("slideshow advances and stops", async ({ page }) => {
  await openApp(page)
  await page.evaluate(() => (window.lumen.settings.slideshowSeconds = 1))
  await loadBasicFiles(page)
  await page.keyboard.press("p")
  await expect(page.locator("#overlay")).toHaveClass(/open/)
  await expect(page.locator("#pageInfo")).toHaveValue("2", { timeout: 3000 })
  await page.keyboard.press("p")
  await page.waitForTimeout(1300)
  await expect(page.locator("#pageInfo")).toHaveValue("2")
})

test("settings dialog opens with ? and changes GIF mode", async ({ page }) => {
  await openApp(page)
  await loadBasicFiles(page)
  await page.keyboard.press("?")
  await expect(page.locator("#settingsDialog")).toBeVisible()
  await expect(page.locator("[data-panel=shortcuts]")).toBeVisible()
  await page.locator(".tab[data-tab=settings]").click()
  await page.locator("select[name=gifMode]").selectOption("visible")
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lumen.settings")).gifMode)).toBe("visible")
  await page.keyboard.press("Escape")
  await expect(page.locator("#settingsDialog")).toBeHidden()
})

test("grid layout is remembered across reloads", async ({ page }) => {
  await openApp(page)
  await page.locator("#gridToggle").click()
  await page.locator("#gridToggle").click()
  await page.reload()
  await expect(page.locator("#gridToggle")).toHaveText("3")
})

test("clear returns to the start screen", async ({ page }) => {
  await openApp(page)
  await loadBasicFiles(page)
  await page.locator("#clearAll").click()
  await expect(page.locator("#startScreen")).toBeVisible()
  await expect(page.locator(".tile")).toHaveCount(0)
})
