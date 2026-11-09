// Offline support for the web app (not used by the extension).
// Precache the app shell; serve cached files first and refresh them in the background.
const VERSION = "lumen-v2.0.0"
const SHELL = [
  "./",
  "index.html",
  "site.webmanifest",
  "styles/main.css",
  "styles/loader.css",
  "styles/effects.css",
  "assets/fonts/inter-var.woff2",
  "icons/icon.svg",
  "icons/icon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "src/main.js",
  "src/state.js",
  "src/settings.js",
  "src/db.js",
  "src/files.js",
  "src/grid.js",
  "src/viewer.js",
  "src/library.js",
  "src/reading.js",
  "src/ui.js",
  "src/shortcuts.js",
  "src/pwa.js",
]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Network first (so a deploy is picked up immediately), cache as the offline fallback.
self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          const copy = response.clone()
          event.waitUntil(caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {}))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true })
        if (cached) return cached
        if (request.mode === "navigate") return caches.match("index.html")
        return Response.error()
      }),
  )
})
