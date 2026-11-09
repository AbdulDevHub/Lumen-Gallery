// Generates README screenshots, the Open Graph image and the GitHub social preview.
// All imagery is procedurally generated (no personal photos). Usage: npm run shots
import { chromium } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"

const PORT = 4190
const BASE = `http://localhost:${PORT}/`
const ART = "tests/fixtures/showcase"
const OUT = "assets/screenshots"

const server = spawn(process.execPath, ["tools/serve.mjs", ".", String(PORT)], { stdio: "ignore" })
await new Promise((r) => setTimeout(r, 600))
const browser = await chromium.launch()

try {
  await makeArt()
  await mkdir(OUT, { recursive: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(BASE)
  await page.waitForFunction(() => document.body.classList.contains("ready"))
  await page.mouse.move(700, 450)

  // --- Recents + Library on the start screen (folders live in the origin-private file system)
  const albums = (await readdir(ART)).filter((d) => !d.includes("."))
  await page.evaluate(
    async ({ albums, base }) => {
      const root = await navigator.storage.getDirectory()
      const lib = await root.getDirectoryHandle("Photos", { create: true })
      window.__dirs = {}
      for (const album of albums) {
        const dir = await lib.getDirectoryHandle(album, { create: true })
        const list = await (await fetch(`${base}tests/fixtures/showcase/${encodeURIComponent(album)}/index.json`)).json()
        for (const name of list) {
          const blob = await (await fetch(`${base}tests/fixtures/showcase/${encodeURIComponent(album)}/${encodeURIComponent(name)}`)).blob()
          const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
          await w.write(blob)
          await w.close()
        }
        window.__dirs[album] = dir
      }
      const { db } = await import("/src/db.js")
      await db.put("kv", lib, "libraryRoot")
    },
    { albums, base: BASE },
  )
  const recent = albums.slice(0, 4)
  for (const [i, album] of recent.entries()) {
    await page.evaluate((a) => window.lumen.library.openDirectory(window.__dirs[a]), album)
    await page.waitForTimeout(700)
    await page.evaluate(
      async ({ a, i }) => {
        const { updateFolder } = await import("/src/db.js")
        const count = window.lumen.state.items.length
        await updateFolder(a, { index: Math.min(count - 1, [17, 4, 22, 9][i] % count), lastOpened: Date.now() - [3, 50, 1500, 9000][i] * 60000 })
      },
      { a: album, i },
    )
  }
  await page.locator("#clearAll").click()
  await page.reload()
  await page.waitForFunction(() => document.body.classList.contains("ready"))
  await page.waitForTimeout(800)
  await page.mouse.move(1430, 890)
  await page.screenshot({ path: `${OUT}/start.png`, fullPage: true })
  await page.evaluate(async () => {
    const lib = await (await navigator.storage.getDirectory()).getDirectoryHandle("Photos")
    window.__dirs = {}
    for await (const d of lib.values()) window.__dirs[d.name] = d
  })

  // --- Grid
  await page.evaluate((a) => window.lumen.library.openDirectory(window.__dirs[a]), recent[0])
  await page.locator(".toast").first().waitFor()
  await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()))
  while ((await page.locator("#gridToggle").textContent()) !== "3") await page.locator("#gridToggle").click()
  await page.waitForTimeout(900)
  await page.mouse.move(1430, 600)
  await page.screenshot({ path: `${OUT}/grid.png` })
  const gridShot = await page.screenshot({ type: "jpeg", quality: 90 })

  // --- Viewer with filmstrip + info
  await page.locator(".tile").nth(4).click()
  await page.keyboard.press("i")
  await page.mouse.move(720, 880)
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/viewer.png` })
  await page.keyboard.press("i")
  await page.keyboard.press("x")

  // --- Settings & help
  await page.keyboard.press("?")
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/shortcuts.png` })
  await page.close()

  // --- OG image (1200x630) and GitHub social preview (1280x640)
  const icon = await readFile("icons/icon.svg", "utf8")
  const font = (await readFile("assets/fonts/inter-var.woff2")).toString("base64")
  const shot = gridShot.toString("base64")
  for (const [file, w, h] of [
    ["assets/og-image.png", 1200, 630],
    [`${OUT}/social-preview.png`, 1280, 640],
  ]) {
    const card = await browser.newPage({ viewport: { width: w, height: h } })
    await card.setContent(cardHtml({ icon, font, shot, w, h }))
    await card.waitForTimeout(300)
    await card.screenshot({ path: file })
    await card.close()
  }
  console.log("Screenshots, OG image and social preview written.")
} finally {
  await browser.close()
  server.kill()
}

function cardHtml({ icon, font, shot, w, h }) {
  return `<!doctype html><style>
  @font-face{font-family:Inter;src:url(data:font/woff2;base64,${font}) format("woff2");font-weight:100 900}
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#141311;font-family:Inter;color:#f4efe6}
  .glow{position:absolute;inset:0;background:radial-gradient(600px 400px at 18% 20%,#f3c66944,transparent 70%),radial-gradient(500px 420px at 80% 90%,#fc357b2e,transparent 70%)}
  .copy{position:absolute;left:72px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;gap:18px}
  .logo{width:84px;height:84px}
  h1{margin:0;font-size:68px;line-height:1;font-weight:800;letter-spacing:-.045em}
  h1 span{background:linear-gradient(120deg,#ffdc93,#f3c669 45%,#ff8f6b);-webkit-background-clip:text;color:transparent}
  p{margin:0;font-size:25px;line-height:1.35;color:#c9c2b6}
  ul{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 0;padding:0;list-style:none}
  li{padding:7px 14px;border-radius:999px;background:#f3c6691f;color:#ffdc93;font-weight:600;font-size:17px}
  .shot{position:absolute;left:${Math.round(w * 0.47)}px;top:70px;width:${Math.round(w * 0.62)}px;border-radius:18px;
    box-shadow:0 30px 80px #000c,0 0 0 1px #ffffff1a;transform:perspective(1400px) rotateY(-12deg) rotateX(4deg);transform-origin:left center}
  </style><div class="glow"></div>
  <img class="shot" src="data:image/jpeg;base64,${shot}">
  <div class="copy"><div class="logo">${icon}</div>
  <h1><span>Lumen</span> Gallery</h1>
  <p>A private, offline gallery for your image &amp; video folders.</p>
  <ul><li>Nothing uploaded</li><li>Resume where you left off</li><li>Thousands of images</li></ul></div>`
}

// ---------------------------------------------------------------------------
// Procedural landscape art, rendered in the browser and saved as fixtures.
// ---------------------------------------------------------------------------
async function makeArt() {
  if (existsSync(`${ART}/.done`)) return
  const page = await browser.newPage()
  await page.goto(BASE + "404") // any same-origin page
  const albums = {
    "Iceland 2023": { count: 18, palettes: ["night", "aurora", "dawn"] },
    Wallpapers: { count: 24, palettes: ["sunset", "night", "desert", "aurora"] },
    "Patagonia Trip": { count: 14, palettes: ["dawn", "forest", "sunset"] },
    "Design References": { count: 12, palettes: ["desert", "sunset", "dawn"] },
    "Japan 2021": { count: 16, palettes: ["sunset", "dawn", "night"] },
    "Lisbon Weekend": { count: 10, palettes: ["desert", "dawn"] },
    Screenshots: { count: 8, palettes: ["forest", "night"] },
    "Norway 2024": { count: 20, palettes: ["aurora", "forest", "night"] },
  }
  for (const [album, spec] of Object.entries(albums)) {
    await mkdir(`${ART}/${album}`, { recursive: true })
    const names = []
    for (let i = 0; i < spec.count; i++) {
      const portrait = i % 5 === 3
      const palette = spec.palettes[i % spec.palettes.length]
      const seed = album.length * 101 + i * 7919
      const data = await page.evaluate(paint, { w: portrait ? 900 : 1500, h: portrait ? 1300 : 960, seed, palette })
      const name = `${album.split(" ")[0]} ${String(i + 1).padStart(2, "0")}.jpg`
      await writeFile(`${ART}/${album}/${name}`, Buffer.from(data, "base64"))
      names.push(name)
    }
    await writeFile(`${ART}/${album}/index.json`, JSON.stringify(names))
  }
  await writeFile(`${ART}/.done`, "1")
  await page.close()
}

function paint({ w, h, seed, palette }) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const P = {
    sunset: { sky: ["#2b1b3d", "#8e3b5c", "#f08a4b", "#ffd28a"], sun: "#fff1c4", layers: ["#5a2a45", "#3d1f38", "#26152a", "#140c18"], stars: false },
    night: { sky: ["#050a1a", "#0d1c3d", "#1c3b66", "#3b6a8f"], sun: "#e8f1ff", layers: ["#1b2d4a", "#13213a", "#0c162a", "#060c18"], stars: true },
    dawn: { sky: ["#3a3f6b", "#9b7fb0", "#f2a7a0", "#fde3c4"], sun: "#fff6e0", layers: ["#6d6a92", "#4c4a72", "#33324f", "#1e1d33"], stars: false },
    desert: { sky: ["#3d2a1e", "#b5653a", "#f2b56b", "#fde6b0"], sun: "#fff8dc", layers: ["#a45a33", "#7a3f24", "#55291a", "#2e160e"], stars: false },
    forest: { sky: ["#0e2a2a", "#1f5552", "#5e9c86", "#cfe6c4"], sun: "#f7ffe8", layers: ["#2c5a4a", "#1d4337", "#122d25", "#081a15"], stars: false },
    aurora: { sky: ["#030712", "#0b2540", "#0f5a5a", "#2a8f6e"], sun: "#e0fff4", layers: ["#103040", "#0b2230", "#071721", "#030c12"], stars: true },
  }[palette]
  const c = Object.assign(document.createElement("canvas"), { width: w, height: h })
  const g = c.getContext("2d")
  const sky = g.createLinearGradient(0, 0, 0, h * 0.75)
  P.sky.forEach((col, i) => sky.addColorStop(i / (P.sky.length - 1), col))
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  if (P.stars) {
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.8})`
      g.fillRect(rnd() * w, rnd() * h * 0.6, rnd() * 2 + 0.5, rnd() * 2 + 0.5)
    }
  }
  if (palette === "aurora") {
    for (let b = 0; b < 3; b++) {
      const grad = g.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, "rgba(80,255,180,0)")
      grad.addColorStop(0.5, `rgba(${80 + b * 60},255,${180 - b * 20},0.25)`)
      grad.addColorStop(1, "rgba(160,90,255,0)")
      g.fillStyle = grad
      g.beginPath()
      for (let x = 0; x <= w; x += 10) g.lineTo(x, h * (0.18 + b * 0.07) + Math.sin(x / 140 + b + rnd()) * 40)
      for (let x = w; x >= 0; x -= 10) g.lineTo(x, h * (0.32 + b * 0.07) + Math.sin(x / 120 + b) * 30)
      g.fill()
    }
  }
  const sx = w * (0.25 + rnd() * 0.5)
  const sy = h * (0.25 + rnd() * 0.2)
  const r = Math.min(w, h) * (0.05 + rnd() * 0.05)
  const glow = g.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 6)
  glow.addColorStop(0, P.sun + "aa")
  glow.addColorStop(1, P.sun + "00")
  g.fillStyle = glow
  g.fillRect(0, 0, w, h)
  g.fillStyle = P.sun
  g.beginPath()
  g.arc(sx, sy, r, 0, Math.PI * 2)
  g.fill()
  P.layers.forEach((col, li) => {
    const base = h * (0.45 + li * 0.13)
    const amp = h * (0.16 - li * 0.025)
    const f1 = 0.002 + rnd() * 0.004
    const f2 = 0.008 + rnd() * 0.01
    const ph = rnd() * 10
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, h)
    for (let x = 0; x <= w; x += 4) {
      const y = base - Math.abs(Math.sin(x * f1 + ph)) * amp - Math.sin(x * f2 + ph * 2) * amp * 0.25
      g.lineTo(x, y)
    }
    g.lineTo(w, h)
    g.fill()
    const fog = g.createLinearGradient(0, base - amp, 0, h)
    fog.addColorStop(0, "rgba(255,255,255,0)")
    fog.addColorStop(1, `rgba(255,255,255,${0.04 * (3 - li)})`)
    g.fillStyle = fog
    g.fillRect(0, base - amp, w, h)
  })
  return c.toDataURL("image/jpeg", 0.86).split(",")[1]
}
