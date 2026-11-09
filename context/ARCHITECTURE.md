# Architecture

How Lumen Gallery's modules fit together and where data lives. Read before moving code between modules.
Keep this in sync when you add a module (also add it to `sw.js` SHELL and, if it is a new top-level path, `tools/files.mjs`).

## Delivery
- `index.html` + `src/*.js` (native ES modules, no bundler) + `styles/*.css` are the app.
- `tools/files.mjs` lists what ships. `tools/package.mjs` → `dist/site` (Pages: adds sw.js, robots, sitemap, 404, OG image) and `dist/extension` (adds manifest.json, background.js, LICENSE).
- `src/pwa.js` registers `sw.js` only on https and not on localhost or `chrome-extension:`.

## Modules (src/)
| Module | Owns |
| --- | --- |
| `state.js` | Shared `state`, `$`, tiny event bus (`on`/`emit`), `GRID_STEPS` |
| `settings.js` | Preferences in localStorage (`lumen.settings`), guarded access |
| `db.js` | IndexedDB `lumen`: `folders` (keyPath name), `kv` (`libraryRoot`); serialised `updateFolder` |
| `files.js` | File filtering, natural sort, items (lazy `url`/`size`/`lastModified`), header size sniffing, video frames |
| `grid.js` | Tiles, src windowing (IntersectionObserver, 2-screen margin), GIF posters, visible index, layout toggles |
| `viewer.js` | Overlay: v1 size modes and zoom, page input, filmstrip, info, slideshow, swipe |
| `library.js` | Picker/permissions, Recents UI, Library, progress/pin/favourite persistence, `[`/`]` siblings, v1 bookmark migration |
| `reading.js` | Progress bar, auto-scroll |
| `ui.js` | Toasts, ripple, loader, settings/help dialog |
| `shortcuts.js` | Key dispatch (ignores inputs and modifier keys) |
| `main.js` | Wiring: loadFiles/clearAll/refreshView, toolbar, drag & drop, spotlight/fullscreen, init |

## Data flow
pick/drop/input → `files.js` builds items (no I/O) → `main.refreshView` (filter/sort/shuffle → `state.view`) → `grid.render`
→ `sniffSizes` streams exact aspect ratios to `grid.applySizes` → scroll emits `visible` → `library.noteProgress` (debounced IDB write).
Progress is stored as the index in the name-ordered `state.items` plus `itemName`; resume matches by name first.

## Performance notes (measured, 4000 files)
- Reading `file.size`/`lastModified` costs a disk stat per file (~3 s total), so item metadata is lazy.
- Creating all object URLs up front costs ~2 s, so `item.url` is a lazy getter.
- Header sniffing runs after first render (24 concurrent reads); scroll anchoring keeps jumps stable while sizes arrive.

## Known limitations
- Folder records are keyed by folder name, so two different folders with the same name share progress and favourites
  (same as v1 bookmarks). Fix later by keying on a generated id matched with `handle.isSameEntry`.

## Events
`visible`, `viewer-index`, `viewer-closed`, `open-index`, `goto-index`, `toggle-fav`, `fav-toggled`, `favs-changed`, `favs-loaded`, `layout`.
