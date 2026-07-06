/**
 * Serializer registry dispatch tests: every format yields non-empty bytes
 * with the right MIME type and extension, and text formats are BOM-free
 * UTF-8. The lazy-import boundary is covered separately in
 * export-serialize-lazy.test.ts (module mocking would defeat these
 * real-serializer assertions).
 */

import { describe, expect, it } from 'vitest';

import {
  EXPORT_FORMAT_LIST,
  EXPORT_FORMATS,
  prepareConversation,
  serializeConversation,
  serializeMarkdown,
  serializeRtf,
  serializeText,
} from '../src/lib/export';
import { parseConversation } from '../src/lib/parser';
import { loadFixture } from './harness';

const prepared = prepareConversation(
  parseConversation(loadFixture('simple-text').raw).conversation,
);

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function startsWithBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && UTF8_BOM.every((byte, index) => bytes[index] === byte);
}

describe('serializeConversation', () => {
  it.each(EXPORT_FORMAT_LIST.map((info) => [info.format, info] as const))(
    'dispatches %s to its serializer with the right payload metadata',
    async (format, info) => {
      const payload = await serializeConversation(prepared, format);
      expect(payload.bytes).toBeInstanceOf(Uint8Array);
      expect(payload.bytes.length).toBeGreaterThan(0);
      expect(payload.mimeType).toBe(info.mimeType);
      expect(payload.extension).toBe(info.extension);
    },
  );

  it('encodes string formats as BOM-free UTF-8, byte-identical to the serializer output', async () => {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const expected = {
      markdown: serializeMarkdown(prepared),
      text: serializeText(prepared),
      rtf: serializeRtf(prepared),
    } as const;
    for (const [format, text] of Object.entries(expected)) {
      const payload = await serializeConversation(prepared, format as keyof typeof expected);
      expect(startsWithBom(payload.bytes)).toBe(false);
      expect(decoder.decode(payload.bytes)).toBe(text);
    }
  });

  it('produces the documented magic bytes for the binary formats', async () => {
    const docx = await serializeConversation(prepared, 'docx');
    // DOCX is a ZIP container: PK\x03\x04.
    expect(Array.from(docx.bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const pdf = await serializeConversation(prepared, 'pdf');
    // %PDF-
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('covers every registered format (registry and EXPORT_FORMATS stay in sync)', () => {
    expect(EXPORT_FORMAT_LIST.map((info) => info.format).sort()).toEqual(
      Object.keys(EXPORT_FORMATS).sort(),
    );
  });
});
