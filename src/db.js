// Minimal promise wrapper around IndexedDB.
// Stores:
//   folders: { name, handle?, count, index, itemName, pin?, pinName?, favs: string[], lastOpened, thumb?: Blob }
//   kv:      misc values (e.g. "libraryRoot" directory handle)
// Every call resolves to undefined (or []) if IndexedDB is unavailable, so callers never crash.

let dbPromise = null

function open() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open("lumen", 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("folders")) db.createObjectStore("folders", { keyPath: "name" })
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv")
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function run(store, mode, fn, fallback) {
  try {
    const db = await open()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const req = fn(tx.objectStore(store))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch (error) {
    console.warn("IndexedDB unavailable:", error)
    return fallback
  }
}

export const db = {
  get: (store, key) => run(store, "readonly", (s) => s.get(key)),
  put: (store, value, key) => run(store, "readwrite", (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  delete: (store, key) => run(store, "readwrite", (s) => s.delete(key)),
  all: (store) => run(store, "readonly", (s) => s.getAll(), []),
  clear: (store) => run(store, "readwrite", (s) => s.clear()),
}

// Folder updates are serialised so a progress save and a favourite toggle can't clobber each other.
let queue = Promise.resolve()

/** Read-modify-write a folder record. `patch` is an object or (current) => object. */
export function updateFolder(name, patch) {
  const job = queue.then(async () => {
    const current = (await db.get("folders", name)) || { name, favs: [], index: 0, count: 0, lastOpened: 0 }
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch), name }
    await db.put("folders", next)
    return next
  })
  queue = job.catch(() => {})
  return job
}
