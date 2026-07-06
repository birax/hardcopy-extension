/**
 * Bundled font faces for PDF export (see src/assets/fonts/README.md for
 * provenance, licensing, and the Unicode strategy).
 *
 * The font bytes ship as generated base64 string modules — a deliberately
 * boring mechanism that behaves identically in the WXT/Vite browser build and
 * in Vitest under Node, with no bundler asset configuration. Because this
 * module sits behind the lazily-imported PDF serializer, the ~1.6 MB of font
 * data only loads when a PDF export actually runs (issue #12).
 */

import jetbrainsMonoRegular from '../../../../assets/fonts/jetbrains-mono-regular.b64';
import notoSansBold from '../../../../assets/fonts/noto-sans-bold.b64';
import notoSansItalic from '../../../../assets/fonts/noto-sans-italic.b64';
import notoSansRegular from '../../../../assets/fonts/noto-sans-regular.b64';
import type { PdfFontFace } from './layout';

/** Raw TTF bytes for each of the four bundled faces. */
export type PdfFontBytes = Readonly<Record<PdfFontFace, Uint8Array>>;

let cache: PdfFontBytes | undefined;

/**
 * Decode the bundled faces to TTF bytes (cached after the first call).
 *
 * - `regular` / `bold` / `italic` — Noto Sans v2.015 (OFL 1.1)
 * - `mono` — JetBrains Mono Regular v2.304 (OFL 1.1)
 */
export function loadPdfFontBytes(): PdfFontBytes {
  cache ??= Object.freeze({
    regular: decodeBase64(notoSansRegular),
    bold: decodeBase64(notoSansBold),
    italic: decodeBase64(notoSansItalic),
    mono: decodeBase64(jetbrainsMonoRegular),
  });
  return cache;
}

/** Base64 → bytes using `atob`, which both browsers and Node ≥ 16 provide. */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
