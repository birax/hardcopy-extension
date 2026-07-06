/**
 * Lazy-import boundary tests for the serializer registry: the heavy modules
 * (PDF with its bundled fonts, DOCX) must not be evaluated until their format
 * is actually exported.
 *
 * Mechanism: vi.mock factories run when the mocked module is *first
 * imported*, so a flag set inside the factory records the exact moment the
 * registry pulls the module in. (The packaged build enforces the same
 * boundary physically — see wxt.config.ts, which splits each serializer into
 * its own chunk under serializers/.)
 */

import { describe, expect, it, vi } from 'vitest';

import { prepareConversation } from '../src/lib/export/prepare';
import { serializeConversation } from '../src/lib/export/serialize';
import { parseConversation } from '../src/lib/parser';
import { loadFixture } from './harness';

const evaluated = vi.hoisted(() => ({ pdf: false, docx: false }));

vi.mock('../src/lib/export/serializers/pdf', () => {
  evaluated.pdf = true;
  return { serializePdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])) };
});

vi.mock('../src/lib/export/serializers/docx', () => {
  evaluated.docx = true;
  return { serializeDocx: vi.fn(async () => new Uint8Array([0x50, 0x4b])) };
});

const prepared = prepareConversation(
  parseConversation(loadFixture('simple-text').raw).conversation,
);

describe('serializer registry lazy-import boundary', () => {
  it('leaves pdf and docx unevaluated for text-format exports', async () => {
    await serializeConversation(prepared, 'markdown');
    await serializeConversation(prepared, 'text');
    await serializeConversation(prepared, 'rtf');
    expect(evaluated.pdf).toBe(false);
    expect(evaluated.docx).toBe(false);
  });

  it('loads docx only when a docx export runs', async () => {
    expect(evaluated.docx).toBe(false);
    const payload = await serializeConversation(prepared, 'docx');
    expect(evaluated.docx).toBe(true);
    expect(evaluated.pdf).toBe(false);
    expect(Array.from(payload.bytes)).toEqual([0x50, 0x4b]);
  });

  it('loads pdf only when a pdf export runs', async () => {
    expect(evaluated.pdf).toBe(false);
    const payload = await serializeConversation(prepared, 'pdf');
    expect(evaluated.pdf).toBe(true);
    expect(Array.from(payload.bytes)).toEqual([0x25, 0x50, 0x44, 0x46]);
  });
});
