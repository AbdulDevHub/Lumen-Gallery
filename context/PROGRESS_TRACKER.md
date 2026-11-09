# Progress Tracker

Running log of where Lumen Gallery stands, for whoever (human or AI agent) picks up next.
Update "Current state", "In progress" and "Next steps" after each meaningful change, and add a dated
entry to the session log (newest first). Collapse stale entries into "Earlier history" rather than deleting.

## Current state
- v2.0.0: renamed Gallery Viewer → Lumen Gallery. Same static files ship as the GitHub Pages site/PWA and the MV3 extension.
- Recent folders + Library (File System Access, handles in IndexedDB), auto-saved progress, resume toast, pins (`b`), favourites (`l`).
- Large-folder performance: lazy object URLs and file metadata, background header sniffing, src windowing, GIF posters.
- Viewer: v1 size modes and zoom, plus filmstrip, info panel, slideshow, swipe.
- Settings & Help dialog (also holds the SEO-visible features/shortcuts/FAQ content).
- 23 Playwright tests (`npm test`), including a 4000-image stress test and a packaged-extension check.

## In progress
- Nothing.

## Next steps
- Optional: verify the site in Google Search Console (needs the owner's login).
- Upload `assets/screenshots/social-preview.png` as the repo's social preview (GitHub Settings → General).
- Ideas: play the actual video in the viewer; per-folder sort memory; keyboard focus order audit.

## Session log
- 2026-11-09: v2 upgrade. Modular rewrite (src/), performance work (4000 files: ~15 s → ~2 s to first grid), Recents/Library/resume,
  reading and browsing tools, visual refresh, PWA + SEO, README, Pages and release workflows, repo renamed to Lumen-Gallery.
  Decisions: no zip/CBZ support; public wording stays neutral (banned list in tests/site.spec.mjs); spotlight (`h`) keeps v1's scroll lock;
  click-zoom no longer also advances to the next image.
