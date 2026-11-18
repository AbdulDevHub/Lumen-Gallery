# Progress Tracker

Running log of where Lumen Gallery stands, for whoever (human or AI agent) picks up next.
Update "Current state", "In progress" and "Next steps" after each meaningful change, and add a dated
entry to the session log (newest first). Collapse stale entries into "Earlier history" rather than deleting.

## Current state
- v2.0.0: renamed Gallery Viewer → Lumen Gallery. Same static files ship as the GitHub Pages site/PWA and the MV3 extension.
- Recent folders + Library (File System Access, handles in IndexedDB), auto-saved progress, resume toast, pins (`b`), favourites (`l`).
- Large-folder performance: lazy object URLs and file metadata, background header sniffing, src windowing, GIF posters.
- Viewer: v1 size modes and zoom, plus filmstrip, info panel, slideshow, swipe.
- Start screen: fits the window (no page scroll on desktop); Recents scroll inside their own area. Library is a left column of cover cards with up/down scroll arrows; covers for never-opened folders are made lazily (IntersectionObserver, 2 at a time, cached in the folder record). Logo returns to the start screen; clicking the drop zone opens a folder. No hero/brand text (h1 is screen-reader only).
- Settings dialog: Settings (two-column), Shortcuts (two-column), Features (card grid + GitHub/extension links, version, credits). FAQ and About tabs and the FAQPage JSON-LD were removed.
- Toolbar: logo returns to start (Clear button removed). Folder chip opens a menu of Library siblings (or recent folders); sort is a custom menu with Reverse order. Shared popover code in `src/menu.js`.
- 25 Playwright tests (`npm test`), including a 4000-image stress test and a packaged-extension check.

## In progress
- Nothing.

## Next steps
- Optional: verify the site in Google Search Console (needs the owner's login).
- Upload `assets/screenshots/social-preview.png` as the repo's social preview (GitHub Settings → General).
- Ideas: play the actual video in the viewer; per-folder sort memory; keyboard focus order audit.

## Session log
- 2026-11-17: Start-screen cleanup from the owner's marked-up screenshot: removed the toolbar "Lumen" text, hero, drop-zone buttons and feature chips; Library moved to a left column; footer links moved into the Settings dialog. README screenshots regenerated.
  Follow-up: logo sized to match buttons and returns to start; full-width drop zone; Recents scroll area; lazy Library covers.
  Follow-up 2: Recents in a panel; sideways wheel scrolls Recents/Library panels; grid, zoom, shuffle, spotlight and Clear buttons hidden until a gallery is open. README/screenshots on hold until the owner asks.
  Follow-up 3: image-less folders hidden from Library, folder menu and [ ]; condensed dialog; custom sort/folder menus; Clear removed. Tests: hardened slideshow and pin tests; folder tests can time out at 6 workers on a busy machine.
  Follow-up 4: favourites-only button moved beside Shuffle; Settings "Buttons to show" toggles (favourites only, shuffle, hide toolbar, zoom, favourite, info, slideshow; settings keys btn*, applied by applyOptionalButtons in settings.js); info panel has a gold outline.
  Follow-up 5: toolbar order search → folder nav → sort; viewer side menu kept as flex (was display:block, collapsing gaps); filmstrip reserves thumb widths and centres the current image; images-per-row number centred.
  Follow-up 6: side menus: original size and position, solid 2px gold outline with a soft shadow so it reads over busy images (66px wide to keep button padding), less rounded (22px); prev / folder / next joined into one segmented control (.folder-nav).
  Follow-up 7: drop zone fills the free height while there are no recent folders.
  Note: another project's http-server sometimes holds port 4173, and `reuseExistingServer` then runs the tests against it (all time out). Stop it or run Playwright with a copied config on another port.
- 2026-11-09: v2 upgrade. Modular rewrite (src/), performance work (4000 files: ~15 s → ~2 s to first grid), Recents/Library/resume,
  reading and browsing tools, visual refresh, PWA + SEO, README, Pages and release workflows, repo renamed to Lumen-Gallery.
  Decisions: no zip/CBZ support; public wording stays neutral (banned list in tests/site.spec.mjs); spotlight (`h`) keeps v1's scroll lock;
  click-zoom no longer also advances to the next image.
