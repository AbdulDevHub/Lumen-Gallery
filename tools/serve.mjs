// Tiny static server for local dev and Playwright. Usage: node tools/serve.mjs [root] [port]
import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize, resolve } from "node:path"

const root = resolve(process.argv[2] || ".")
const port = Number(process.argv[3] || process.env.PORT || 4173)
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
}

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname)
    // Mirror the GitHub Pages sub-path so URLs match production.
    path = path.replace(/^\/Lumen-Gallery(?=\/|$)/, "") || "/"
    let file = normalize(join(root, path))
    if (!file.startsWith(root)) throw Object.assign(new Error("forbidden"), { code: 403 })
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html")
    const body = await readFile(file)
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" })
    res.end(body)
  } catch (e) {
    res.writeHead(e.code === 403 ? 403 : 404, { "content-type": "text/plain" })
    res.end("not found")
  }
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}/`))
