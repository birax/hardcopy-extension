/**
 * Serializer registry: one entry point that turns a {@link PreparedConversation}
 * into download-ready bytes for any {@link ExportFormat}.
 *
 * Every serializer module is loaded with a **lazy dynamic `import()`**, so its
 * weight is only paid when that format is actually exported. This matters most
 * for PDF (pdf-lib plus ~1.6 MB of bundled fonts) and DOCX (the `docx`
 * library): the popup/probe path and non-PDF exports must never load them.
 *
 * NOTE on bundling: WXT's content-script build is a single-file IIFE that
 * would *inline* these dynamic imports, so this module must never be imported
 * statically from content-script code. Instead, wxt.config.ts builds it as a
 * standalone ESM bundle (`/serializers/serialize.js`, where the imports below
 * code-split properly into lazy chunks), and the content script loads that
 * bundle at export time via src/lib/flow/serializer-loader.ts.
 */

import type { ExportFormat } from './options';
import { EXPORT_FORMATS } from './options';
import type { PreparedConversation } from './prepare';

/** The finished export: bytes plus everything needed to download them. */
export interface ExportPayload {
  /** The serialized document. Text formats are UTF-8 without a BOM. */
  bytes: Uint8Array;
  /** MIME type for the download blob, e.g. `'application/pdf'`. */
  mimeType: string;
  /** File extension without the leading dot, e.g. `'pdf'`. */
  extension: string;
}

/**
 * Serialize a prepared conversation into download-ready bytes for `format`.
 *
 * String-producing serializers (Markdown, plain text, RTF) are encoded as
 * BOM-free UTF-8; binary serializers (DOCX, PDF) pass their bytes through
 * unchanged. Serializer failures propagate as thrown errors — the orchestrator
 * maps them to a `serializer-failure` outcome.
 */
export async function serializeConversation(
  prepared: PreparedConversation,
  format: ExportFormat,
): Promise<ExportPayload> {
  const { mimeType, extension } = EXPORT_FORMATS[format];
  const bytes = await serializeBytes(prepared, format);
  return { bytes, mimeType, extension };
}

/** Dispatch to the format's serializer module, loading it on demand. */
async function serializeBytes(
  prepared: PreparedConversation,
  format: ExportFormat,
): Promise<Uint8Array> {
  switch (format) {
    case 'markdown': {
      const { serializeMarkdown } = await import('./serializers/markdown');
      return encodeUtf8(serializeMarkdown(prepared));
    }
    case 'text': {
      const { serializeText } = await import('./serializers/text');
      return encodeUtf8(serializeText(prepared));
    }
    case 'rtf': {
      const { serializeRtf } = await import('./serializers/rtf');
      return encodeUtf8(serializeRtf(prepared));
    }
    case 'docx': {
      const { serializeDocx } = await import('./serializers/docx');
      return serializeDocx(prepared);
    }
    case 'pdf': {
      const { serializePdf } = await import('./serializers/pdf');
      return serializePdf(prepared);
    }
  }
}

/** Encode a serializer's string output as UTF-8 (never with a BOM). */
function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
