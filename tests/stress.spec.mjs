import { test, expect } from "@playwright/test"
import { openApp } from "./helpers.mjs"

// The real-world case: one folder of ~4000 images including GIFs.
test("4000-image folder stays bounded in memory and GIFs stay still", async ({ page }) => {
  test.setTimeout(120_000)
  const errors = await openApp(page)
  const started = Date.now()
  await page.setInputFiles("#folderInput", "tests/fixtures/stress/Big Folder")
  await expect(page.locator(".tile")).toHaveCount(4000, { timeout: 60_000 })
  await expect(page.locator("#geminiLoader")).not.toHaveClass(/active/)
  const loadMs = Date.now() - started
  console.log(`Loaded 4000 files in ${loadMs} ms`)

  // Jump deep while sizes are still streaming in: scroll anchoring must keep us there.
  await page.evaluate(() => window.lumen.library && document.querySelectorAll(".tile")[2500].scrollIntoView({ block: "start" }))
  // Every tile gets its exact size from file headers shortly after the grid appears.
  await expect(page.locator(".tile.unsized")).toHaveCount(0, { timeout: 60_000 })
  console.log(`All tiles sized after ${Date.now() - started} ms`)
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => window.lumen.state.currentVisibleIndex)
  console.log("Visible index after sizing (jumped to 2500):", after)
  expect(Math.abs(after - 2500)).toBeLessThanOrEqual(3)

  for (let step = 0; step < 3; step++) await page.locator("#gridToggle").click() // 6 per row
  const live = () => page.locator(".tile img[src]").count()
  const animatedGifs = () =>
    page.evaluate(() =>
      window.lumen.state.view.filter((item, i) => item.isGif && document.querySelectorAll(".tile img")[i].getAttribute("src") === item.url).length,
    )

  const samples = []
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), fraction)
    await page.waitForTimeout(300)
    samples.push(await live())
    expect(await animatedGifs()).toBe(0)
  }
  console.log("Live <img src> per scroll position:", samples)
  for (const n of samples) expect(n).toBeLessThan(400)

  // Jumping deep into the folder lands on the right tile (layout is exact).
  await page.locator("#mainPageInfo").fill("3000")
  await page.locator("#mainPageInfo").press("Enter")
  await expect.poll(() => page.evaluate(() => window.lumen.state.currentVisibleIndex), { timeout: 5000 }).toBeGreaterThan(2980)
  expect(errors).toEqual([])
})
