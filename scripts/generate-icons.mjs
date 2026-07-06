// Rasterize the Hardcopy icon SVGs into the PNGs the extension and stores need.
//
//   pnpm icons
//
// Sources (hand-written masters — edit these, never the PNGs):
//   assets/design/icon.svg     — full mark (text lines), used for 32 px and up
//   assets/design/icon-16.svg  — simplified mark, used only for 16 px
//
// Outputs (committed, because stores and the manifest need them in-tree):
//   public/icon/{16,32,48,96,128}.png — wired into the manifest by WXT
//   assets/design/icon-512.png        — future store listing asset
//
// See docs/design/README.md.

import console from 'node:console';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const master = await readFile(join(root, 'assets/design/icon.svg'));
const small = await readFile(join(root, 'assets/design/icon-16.svg'));

/** @type {Array<[Buffer, number, string]>} */
const jobs = [
  [small, 16, 'public/icon/16.png'],
  [master, 32, 'public/icon/32.png'],
  [master, 48, 'public/icon/48.png'],
  [master, 96, 'public/icon/96.png'],
  [master, 128, 'public/icon/128.png'],
  [master, 512, 'assets/design/icon-512.png'],
];

await mkdir(join(root, 'public/icon'), { recursive: true });

for (const [svg, size, out] of jobs) {
  // density scales the SVG rasterization so edges stay crisp at every size
  // (default 72 dpi is tuned to the 128 px viewBox).
  await sharp(svg, { density: (72 * size) / 128 })
    .resize(size, size)
    .png()
    .toFile(join(root, out));
  console.log(`${out} (${size}×${size})`);
}
