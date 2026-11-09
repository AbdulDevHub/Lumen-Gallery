# AGENTS.md

Read by AI coding agents before working on this repo. It holds the terse, project-specific rules and commands.
Plain-language overview lives in `README.md`; progress and deeper docs live in `context/`.
After any meaningful change to this project, update this file, `context/PROGRESS_TRACKER.md`, and the
"Project Overview" section of `README.md` to reflect the current state — do this proactively, without being asked.

## Project overview
Lumen Gallery: a private, offline image & video folder viewer that ships as BOTH a Chrome MV3 extension
and a GitHub Pages web app/PWA from the same static files (no build step).

## Tech stack
- Vanilla HTML/CSS/JS, native ES modules in `src/`, no runtime dependencies, no bundler.
- Storage: `localStorage` (settings), IndexedDB (folder handles, progress, favourites) via `src/db.js`.
- Browser APIs: File System Access (`showDirectoryPicker`), IntersectionObserver, `createImageBitmap`, Service Worker (site only).
- Dev only: Node 22, `@playwright/test`.

## Commands
- Install: `npm install` (then `npx playwright install chromium` once)
- Serve locally: `npm run serve` → http://localhost:4173/
- Test: `npm test` (generates fixtures into `tests/fixtures/` then runs Playwright)
- Package: `npm run package` → `dist/site/` (Pages) and `dist/extension/` (zip this)
- Verify: npm test

## Conventions & constraints
- Everything must work offline and inside an extension page: no remote scripts/fonts/CDNs, no inline `<script>` (MV3 CSP). `ld+json` blocks are fine.
- Shipped files are listed ONCE in `tools/files.mjs`; add new runtime files there or they won't deploy.
- Service worker / PWA code must stay inert on `chrome-extension:` (see `src/pwa.js`).
- Never remove or remap existing shortcuts (`x r z s g h f b + = - ← →`); only add new ones in `src/shortcuts.js`.
- Grid must stay fast for ~4000-image folders with GIFs: keep src windowing + GIF posters in `src/grid.js`.
- Public copy (README, meta, FAQ, UI) stays neutral: photos, art, image folders. No niche reading-genre wording; `tests/site.spec.mjs` enforces the banned word list.
- Test images: generated fixtures only (or the user's `OneDrive\Pictures`); public screenshots use generated art only.
- Commits: gitmoji + conventional type (see the user's `gitmoji-commit` skill).

## Boundaries
- `manifest.json` is the extension manifest; the PWA manifest is `site.webmanifest`. Don't merge them.
- `assets/fonts/` and `icons/` are vendored/generated binaries; regenerate icons with `npm run icons`.

## Where to look for more
- `README.md` — user-facing overview, install, shortcuts.
- `context/PROGRESS_TRACKER.md` — current state and session log.
- `context/ARCHITECTURE.md` — module map and data flow.
- `context/UI_TOKENS.md` — design tokens.
