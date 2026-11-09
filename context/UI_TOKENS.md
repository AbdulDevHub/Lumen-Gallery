# UI Tokens

Design variables for Lumen Gallery. The source of truth is the `:root` block in `styles/main.css`; this file explains intent.
Change the CSS first, then update this table.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#141311` (`#000` with Background: Black) | Page background |
| `--surface` / `--surface-2` | translucent warm greys | Glass bars, buttons |
| `--surface-solid` | `#1e1c1a` | Cards |
| `--border` / `--border-gold` | 8% white / 40% gold | Hairlines / emphasis |
| `--text` / `--muted` / `--faint` | `#f4efe6` / `#aaa397` / `#6f6a62` | Text levels |
| `--gold` / `--gold-2` / `--gold-3` | `#f3c669` / `#ffdc93` / `#e3a948` | Brand accent, primary buttons (gradient), selection |
| `--gold-ink` | `#221705` | Text on gold |
| `--pink` | `#fc357b` | Destructive (Clear) |
| `--radius` | 14px (buttons 12px, cards 14px, dialog 20px) | Corners |
| Font | Inter variable (vendored woff2) | All UI |

Rules: dark-only UI. Selected toggles use an inset 2px gold ring (`.selectedGridOption`). Icons are Lucide symbols in the inline sprite (`#i-name`), sized by `.icon`. Motion respects `prefers-reduced-motion`.
