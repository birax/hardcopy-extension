// Compose the store promo/icon assets from the design masters (issue #20).
//
//   pnpm store:assets
//
// Everything is generated from assets/design/icon.svg plus SVG layouts
// defined here, rasterized with sharp at 2× and downscaled to the exact
// store dimensions — reproducible, no hand-edited PNGs. The listing
// *screenshots* are generated separately (`pnpm store:screenshots`, see
// e2e/store-screenshots.store.ts).
//
// Outputs (committed, under assets/store/):
//   cws-small-tile-440x280.png       — Chrome Web Store small promo tile (required)
//   cws-marquee-1400x560.png         — Chrome Web Store marquee tile (optional slot)
//   cws-store-icon-128.png           — CWS listing icon: 96×96 art + 16 px padding
//   edge-small-promo-tile-440x280.png— Edge Partner Center small promo tile
//   edge-store-logo-300x300.png      — Edge Partner Center store logo
//   apple-app-icon-1024.png          — App Store icon (full-bleed, Apple masks corners)
//
// Branding rules (ADR 0004 + docs/design/design-system.md): brand-first
// wordmark, "Claude" only as a nominative descriptor, teal/ink palette only,
// no Anthropic motifs. Text uses widely available sans-serif faces because
// librsvg (sharp's SVG rasterizer) resolves fonts from the host system.

import { Buffer } from 'node:buffer';
import console from 'node:console';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets/store');

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const INK = '#17252b';
const INK_SECONDARY = '#42555c';
const TEAL = '#0a5b55';
const TEAL_DARK = '#07443f';

const masterSvg = await readFile(join(root, 'assets/design/icon.svg'), 'utf8');

/** The master icon's inner markup, for nesting into a layout SVG. */
function iconInner() {
  const open = masterSvg.indexOf('>', masterSvg.indexOf('<svg'));
  const close = masterSvg.lastIndexOf('</svg>');
  return masterSvg.slice(open + 1, close);
}

/** The master icon as a nested <svg> placed at (x, y) sized `size`. */
function iconAt(x, y, size) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 128 128">${iconInner()}</svg>`;
}

/** Small promo tile, 440×280 — used for both CWS and Edge. */
function smallTileSvg() {
  return `<svg viewBox="0 0 440 280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#e9f2f0"/>
    </linearGradient>
  </defs>
  <rect width="440" height="280" fill="url(#bg)"/>
  ${iconAt(174, 40, 92)}
  <text x="220" y="197" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="700" letter-spacing="-0.5" fill="${INK}">Hardcopy</text>
  <text x="220" y="232" text-anchor="middle" font-family="${FONT}" font-size="16.5" fill="${INK_SECONDARY}">Export chats from Claude to Markdown, PDF &amp; Word</text>
</svg>`;
}

/** Marquee tile, 1400×560 — CWS optional hero slot. */
function marqueeSvg() {
  const formats = ['Markdown', 'PDF', 'Word (DOCX)', 'RTF', 'Plain text'];
  let x = 344;
  const chips = formats
    .map((label) => {
      const width = Math.round(label.length * 11.5 + 40);
      const chip = `<rect x="${x}" y="368" width="${width}" height="44" rx="22" fill="#ffffff" fill-opacity="0.14"/>
  <text x="${x + width / 2}" y="396" text-anchor="middle" font-family="${FONT}" font-size="20" fill="#ffffff">${label}</text>`;
      x += width + 16;
      return chip;
    })
    .join('\n  ');
  return `<svg viewBox="0 0 1400 560" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TEAL}"/>
      <stop offset="1" stop-color="${TEAL_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="1400" height="560" fill="url(#bg)"/>
  <!-- Oversized mark as a quiet backdrop motif on the right -->
  <g opacity="0.08">${iconAt(1020, 60, 440)}</g>
  <rect x="124" y="164" width="184" height="184" rx="40" fill="#ffffff" fill-opacity="0.1"/>
  ${iconAt(140, 180, 152)}
  <text x="344" y="252" font-family="${FONT}" font-size="86" font-weight="700" letter-spacing="-1.5" fill="#ffffff">Hardcopy</text>
  <text x="346" y="316" font-family="${FONT}" font-size="27" fill="#d7eae7">Export chats from Claude — fully in your browser, nothing leaves your machine</text>
  ${chips}
</svg>`;
}

await mkdir(outDir, { recursive: true });

/** Rasterize an SVG layout at 2× and downscale to width×height. */
async function render(svg, width, height, out) {
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(width, height)
    .png()
    .toFile(join(outDir, out));
  console.log(`assets/store/${out} (${width}×${height})`);
}

await render(smallTileSvg(), 440, 280, 'cws-small-tile-440x280.png');
await render(smallTileSvg(), 440, 280, 'edge-small-promo-tile-440x280.png');
await render(marqueeSvg(), 1400, 560, 'cws-marquee-1400x560.png');

// Edge store logo: the full mark at 300×300.
await sharp(Buffer.from(masterSvg), { density: (72 * 300) / 128 })
  .resize(300, 300)
  .png()
  .toFile(join(outDir, 'edge-store-logo-300x300.png'));
console.log('assets/store/edge-store-logo-300x300.png (300×300)');

// CWS listing icon: 96×96 art centered on a 128×128 transparent canvas
// (Chrome's "Supplying Images" guidance for icons with strong silhouettes).
const art96 = await sharp(Buffer.from(masterSvg), { density: (72 * 96) / 128 })
  .resize(96, 96)
  .png()
  .toBuffer();
await sharp({
  create: { width: 128, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: art96, left: 16, top: 16 }])
  .png()
  .toFile(join(outDir, 'cws-store-icon-128.png'));
console.log('assets/store/cws-store-icon-128.png (128×128, 96×96 art + padding)');

// App Store icon: 1024×1024, full bleed and fully opaque — Apple applies its
// own corner mask, so the tile's rounded corners become a square here.
const appleSvg = masterSvg.replace('rx="28"', 'rx="0"');
await sharp(Buffer.from(appleSvg), { density: (72 * 1024) / 128 })
  .resize(1024, 1024)
  .flatten({ background: TEAL })
  .png()
  .toFile(join(outDir, 'apple-app-icon-1024.png'));
console.log('assets/store/apple-app-icon-1024.png (1024×1024)');
