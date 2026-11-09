// Installable web app bits. Inert inside the Chrome extension and on localhost.

import { isExtension } from "./state.js"

export function setupPwa(openFiles) {
  if (isExtension()) return

  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname)
  if ("serviceWorker" in navigator && location.protocol === "https:" && !isLocal) {
    navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Service worker failed:", error))
  }

  // "Open with Lumen Gallery" from the OS when installed (file_handlers in site.webmanifest).
  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files?.length) return
      const files = await Promise.all(params.files.map((handle) => handle.getFile()))
      openFiles(files)
    })
  }
}
