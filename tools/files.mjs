// Single source of truth for what ships. Paths are relative to the repo root.
// Directories are copied recursively.

/** Files used by both the website and the extension. */
export const SHARED = [
  "index.html",
  "src",
  "styles",
  "assets/fonts",
  "icons",
  "site.webmanifest", // linked from index.html; harmless in the extension
]

/** Website / PWA only (inert or meaningless inside the extension). */
export const SITE_ONLY = [
  "404.html",
  "sw.js",
  "robots.txt",
  "sitemap.xml",
  "assets/og-image.png",
]

/** Extension only. */
export const EXTENSION_ONLY = ["manifest.json", "background.js", "LICENSE"]

/** Files inside SHARED dirs that should not ship in the extension. */
export const EXTENSION_EXCLUDE = ["src/pwa.js.map"]
