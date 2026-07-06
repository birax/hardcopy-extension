# Store assets

Inventory of everything under `assets/store/`, which store slot each file
fills, and how to regenerate it (issue #20). The listing text that goes with
these files is in [listing-copy.md](listing-copy.md); the design rules they
were composed under are in
[docs/design/design-system.md](../design/design-system.md) and
[ADR 0004](../decisions/0004-name-and-brand-hardcopy.md) (brand palette only,
no Anthropic branding, synthetic fixture content only).

## Inventory

| File | Store | Slot | Spec |
| --- | --- | --- | --- |
| `screenshots/01-popup-ready.png` | CWS, AMO, Edge | Screenshot 1 | 1280×800 PNG |
| `screenshots/02-saved-to-downloads.png` | CWS, AMO, Edge | Screenshot 2 | 1280×800 PNG |
| `screenshots/03-markdown-export.png` | CWS, AMO, Edge | Screenshot 3 | 1280×800 PNG |
| `screenshots/04-options.png` | CWS, AMO, Edge | Screenshot 4 | 1280×800 PNG |
| `screenshots/05-dark-mode.png` | CWS, AMO, Edge | Screenshot 5 (dark theme) | 1280×800 PNG |
| `cws-small-tile-440x280.png` | CWS | Small promo tile (required) | 440×280 PNG |
| `cws-marquee-1400x560.png` | CWS | Marquee promo tile (optional) | 1400×560 PNG |
| `cws-store-icon-128.png` | CWS | Listing icon | 128×128 PNG, 96×96 art + 16 px padding |
| `edge-store-logo-300x300.png` | Edge | Store logo (required) | 300×300 PNG |
| `edge-small-promo-tile-440x280.png` | Edge | Small promo tile | 440×280 PNG |
| `apple-app-icon-1024.png` | App Store | App icon | 1024×1024 PNG, opaque, full bleed |

The extension package icons (16/32/48/96/128, wired into the manifest) are a
separate pipeline: `public/icon/*.png`, regenerated with `pnpm icons` — see
[docs/design/README.md](../design/README.md). Apple per-platform screenshots
are captured from the packaged Safari app at submission time and are not
kept here.

## Sources

Nothing in `assets/store/` is hand-edited. The sources of truth are:

- `assets/design/icon.svg` — the master mark (tiles, logos, app icon)
- `scripts/generate-store-assets.mjs` — SVG layouts for the promo tiles and
  the icon derivatives, rasterized with sharp
- `e2e/store-screenshots.store.ts` + `e2e/store/composition.ts` — the
  screenshot compositions, rendered against the real built extension and the
  mocked claude.ai from the E2E harness (`e2e/fixtures.ts`), using only the
  synthetic garden-planning fixture (`tests/fixtures/simple-text.json`)
- Captions and captions' order — `CAPTIONS` in
  `e2e/store-screenshots.store.ts`, mirrored in
  [listing-copy.md](listing-copy.md)

## Regenerating

Tiles, logos and icons (sharp only, fast):

```sh
pnpm store:assets
```

Screenshots (builds the extension if needed, then drives Chromium through
`playwright.store.config.ts`; deliberately **not** part of `pnpm test:e2e`
or CI):

```sh
pnpm store:screenshots
```

Notes:

- Screenshots render each composition at 2× (`HARDCOPY_STORE_SCALE=2`) and
  downscale to exactly 1280×800, so text is supersampled and crisp.
- Both pipelines resolve fonts from the host system (`system-ui` in the
  compositions, Helvetica/Arial in the SVG tiles). The committed PNGs were
  generated on macOS; regenerating on another OS produces slightly different
  type rendering, so regenerate the whole set together rather than mixing.
- After changing the popup, options page, or design tokens, rerun
  `pnpm store:screenshots` and eyeball all five images before committing.
