/**
 * PDF serializer (issue #12): renders a {@link PreparedConversation} to PDF
 * bytes with pdf-lib, bundled subset fonts, and the pure layout engine in
 * `./pdf/layout`.
 *
 * Import this module lazily (`await import(...)`) — it pulls in pdf-lib and
 * ~1.6 MB of font data, which must only load when a PDF export runs.
 *
 * Glyph safety: pdf-lib throws when asked to draw a code point the embedded
 * font has no glyph for. Every string is therefore passed through
 * {@link buildShaper}'s sanitizer before measurement or drawing: code points
 * missing from the face's character set (most emoji, CJK — see
 * src/assets/fonts/README.md) are replaced with a visible placeholder (`□`,
 * or `?` when the face lacks it) and zero-width/control characters are
 * stripped, so hostile input renders visibly instead of crashing.
 *
 * Determinism: creation/modification dates come from the conversation
 * metadata when present, else from the injectable `now` option, and fonts are
 * embedded under fixed names — so identical inputs yield identical bytes
 * (snapshot-testable, per the acceptance criteria).
 */

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

import type { PreparedConversation } from '../prepare';
import { loadPdfFontBytes } from './pdf/fonts';
import { layoutConversation } from './pdf/layout';
import type { PdfFontFace, PdfTextShaper } from './pdf/layout';

/** Knobs for {@link serializePdf}; only affects PDF metadata. */
export interface PdfSerializeOptions {
  /**
   * Timestamp for the PDF CreationDate/ModDate fields when the conversation
   * metadata does not provide one. Inject a fixed date for deterministic
   * output; defaults to the current time.
   */
  now?: Date;
}

/** Every code point we strip rather than substitute (invisible controls). */
const STRIPPED_CODE_POINTS = new Set<number>([
  0x200b, // zero-width space
  0x200c, // zero-width non-joiner
  0x200d, // zero-width joiner (emoji sequences)
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
  0x2060, // word joiner
  0xfe0e, // variation selector-15
  0xfe0f, // variation selector-16
  0xfeff, // BOM / zero-width no-break space
]);

/** Placeholder candidates for missing glyphs, in preference order. */
const REPLACEMENT_CANDIDATES = ['□', '�', '?'];

/**
 * Serialize a prepared conversation to PDF bytes.
 *
 * Render items are laid out verbatim in order (A4, word-wrapped, paginated,
 * page-numbered); metadata is set to the conversation title with producer and
 * creator `"Hardcopy"`.
 */
export async function serializePdf(
  prepared: PreparedConversation,
  options: PdfSerializeOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const bytes = loadPdfFontBytes();
  const fonts: Record<PdfFontFace, PDFFont> = {
    regular: await doc.embedFont(bytes.regular, { subset: true, customName: 'Hardcopy-NotoSans' }),
    bold: await doc.embedFont(bytes.bold, { subset: true, customName: 'Hardcopy-NotoSans-Bold' }),
    italic: await doc.embedFont(bytes.italic, {
      subset: true,
      customName: 'Hardcopy-NotoSans-Italic',
    }),
    mono: await doc.embedFont(bytes.mono, { subset: true, customName: 'Hardcopy-JetBrainsMono' }),
  };

  const layout = layoutConversation(prepared, buildShaper(fonts));

  for (const laidOut of layout.pages) {
    const page = doc.addPage([layout.setup.pageWidth, layout.setup.pageHeight]);
    const pageHeight = layout.setup.pageHeight;
    for (const rect of laidOut.rects) {
      page.drawRectangle({
        x: rect.x,
        y: pageHeight - rect.y - rect.height,
        width: rect.width,
        height: rect.height,
        color: rgb(rect.color.r, rect.color.g, rect.color.b),
      });
    }
    for (const text of laidOut.texts) {
      page.drawText(text.text, {
        x: text.x,
        y: pageHeight - text.baseline,
        size: text.size,
        font: fonts[text.face],
        color: rgb(text.color.r, text.color.g, text.color.b),
      });
    }
  }

  applyMetadata(doc, prepared, options.now ?? new Date());
  return doc.save();
}

/** Build the glyph-safe shaper the layout engine measures and wraps with. */
function buildShaper(fonts: Record<PdfFontFace, PDFFont>): PdfTextShaper {
  const characterSets = new Map<PdfFontFace, Set<number>>();
  const replacements = new Map<PdfFontFace, string>();
  for (const [face, font] of Object.entries(fonts) as [PdfFontFace, PDFFont][]) {
    const set = new Set(font.getCharacterSet());
    characterSets.set(face, set);
    const replacement = REPLACEMENT_CANDIDATES.find((candidate) =>
      set.has(candidate.codePointAt(0) as number),
    );
    replacements.set(face, replacement ?? '?');
  }

  return {
    sanitize(text: string, face: PdfFontFace): string {
      const set = characterSets.get(face) as Set<number>;
      const replacement = replacements.get(face) as string;
      let out = '';
      for (const char of text.normalize('NFC')) {
        const codePoint = char.codePointAt(0) as number;
        if (STRIPPED_CODE_POINTS.has(codePoint)) {
          continue;
        }
        if (codePoint === 0x09) {
          out += '    '; // expand stray tabs; fonts rarely carry a tab glyph
          continue;
        }
        if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
          continue; // other control characters are dropped
        }
        out += set.has(codePoint) ? char : replacement;
      }
      return out;
    },
    measure(text: string, face: PdfFontFace, size: number): number {
      return fonts[face].widthOfTextAtSize(text, size);
    },
  };
}

/** Set the PDF Info dictionary (title, producer, deterministic dates). */
function applyMetadata(doc: PDFDocument, prepared: PreparedConversation, now: Date): void {
  doc.setTitle(prepared.title);
  doc.setProducer('Hardcopy');
  doc.setCreator('Hardcopy');

  const metadata = prepared.items.find((item) => item.kind === 'metadata');
  const created = parseDate(metadata?.createdAt?.iso) ?? now;
  const updated = parseDate(metadata?.updatedAt?.iso) ?? created;
  doc.setCreationDate(created);
  doc.setModificationDate(updated);
}

/** Parse an ISO timestamp, returning `undefined` for absent/invalid input. */
function parseDate(iso: string | undefined): Date | undefined {
  if (iso === undefined) {
    return undefined;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
