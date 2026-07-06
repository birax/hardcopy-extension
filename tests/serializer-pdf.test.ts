import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { prepareConversation, resolveExportOptions } from '../src/lib/export';
import type { PreparedConversation } from '../src/lib/export';
import { parseConversation } from '../src/lib/parser';
import { serializePdf } from '../src/lib/export/serializers/pdf';
import { loadFixture, loadFixtures } from './harness';

/** Fixed clock so runs are byte-for-byte reproducible. */
const NOW = new Date('2026-07-06T12:00:00Z');

const EVERYTHING = {
  includeThinking: true,
  includeToolUse: true,
  includeToolResults: true,
  includeArtifacts: true,
  includeAttachments: true,
  includeTimestamps: true,
  includeConversationMetadata: true,
  branches: 'all',
} as const;

async function roundTrip(prepared: PreparedConversation): Promise<PDFDocument> {
  const bytes = await serializePdf(prepared, { now: NOW });
  expect(bytes.length).toBeGreaterThan(0);
  // Sanity: it is a PDF file, not merely bytes.
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-');
  return PDFDocument.load(bytes, { updateMetadata: false });
}

describe('serializePdf fixtures', () => {
  for (const fixture of loadFixtures()) {
    for (const [label, overrides] of [
      ['everything on', EVERYTHING],
      ['defaults', {}],
    ] as const) {
      it(`renders ${fixture.name} (${label}) to a loadable PDF`, async () => {
        const { conversation } = parseConversation(fixture.raw);
        const prepared = prepareConversation(conversation, overrides);
        const doc = await roundTrip(prepared);

        expect(doc.getPageCount()).toBeGreaterThan(0);
        expect(doc.getTitle()).toBe(prepared.title);
        expect(doc.getProducer()).toBe('Hardcopy');
        expect(doc.getCreator()).toBe('Hardcopy');
        for (const page of doc.getPages()) {
          expect(page.getWidth()).toBeCloseTo(595.28, 1);
          expect(page.getHeight()).toBeCloseTo(841.89, 1);
        }
      });
    }
  }

  it('produces byte-identical output across runs with the same inputs', async () => {
    for (const name of ['simple-text', 'branched-tree', 'unknown-block']) {
      const { conversation } = parseConversation(loadFixture(name).raw);
      const prepared = prepareConversation(conversation, EVERYTHING);
      const first = await serializePdf(prepared, { now: NOW });
      const second = await serializePdf(prepared, { now: NOW });
      expect(second.length, name).toBe(first.length);
      expect(Buffer.from(second).equals(Buffer.from(first)), `${name} bytes drifted`).toBe(true);
    }
  });

  it('takes the PDF creation/modification dates from conversation metadata', async () => {
    const fixture = loadFixture('simple-text');
    const { conversation } = parseConversation(fixture.raw);
    const prepared = prepareConversation(conversation, EVERYTHING);
    const doc = await roundTrip(prepared);

    // PDF date strings have second resolution; compare at that granularity.
    const seconds = (date: Date | undefined): number | undefined =>
      date === undefined ? undefined : Math.floor(date.getTime() / 1000);
    const raw = fixture.raw as { created_at: string; updated_at: string };
    expect(seconds(doc.getCreationDate())).toBe(seconds(new Date(raw.created_at)));
    expect(seconds(doc.getModificationDate())).toBe(seconds(new Date(raw.updated_at)));
  });

  it('falls back to the injected clock when metadata dates are unparseable', async () => {
    const prepared: PreparedConversation = {
      options: resolveExportOptions(),
      title: 'Bad dates',
      items: [
        {
          kind: 'metadata',
          title: 'Bad dates',
          createdAt: { iso: 'not-a-date', display: 'not-a-date' },
          updatedAt: undefined,
        },
      ],
    };
    const doc = await roundTrip(prepared);
    expect(doc.getCreationDate()?.getTime()).toBe(NOW.getTime());
    expect(doc.getModificationDate()?.getTime()).toBe(NOW.getTime());
  });

  it('falls back to the injected clock when metadata is excluded', async () => {
    const { conversation } = parseConversation(loadFixture('simple-text').raw);
    const prepared = prepareConversation(conversation, {
      includeConversationMetadata: false,
    });
    const doc = await roundTrip(prepared);
    expect(doc.getCreationDate()?.getTime()).toBe(NOW.getTime());
    expect(doc.getModificationDate()?.getTime()).toBe(NOW.getTime());
  });
});

describe('serializePdf glyph safety', () => {
  const hostile = (text: string): PreparedConversation => ({
    options: resolveExportOptions(),
    title: 'Hostile content',
    items: [
      {
        kind: 'message',
        sender: 'human',
        senderLabel: 'Human',
        timestamp: undefined,
        blocks: [{ kind: 'text', text }],
      },
    ],
  });

  const cases: [string, string][] = [
    ['emoji', 'Deploy shipped 🎉🚀 with 👍🏽 all around'],
    ['emoji in code', '```\nconst party = "🎉";\n```'],
    ['CJK', '你好世界 — こんにちは — 안녕하세요'],
    ['astral plane', 'Math bold: 𝕳𝖆𝖗𝖉𝖈𝖔𝖕𝖞 and 𓀀 hieroglyphs'],
    ['lone surrogate', 'broken \ud83d input'],
    ['control characters', 'null\u0000 bell\u0007 escape\u001b tab\there.'],
    ['zero-width and BOM', '﻿zero​width‍ joiners‎'],
    ['RTL text', 'مرحبا بالعالم and עולם'],
    ['combining marks', 'é å ñ (decomposed)'],
    ['very long emoji run', '🌍'.repeat(500)],
  ];

  for (const [label, text] of cases) {
    it(`never crashes on ${label}`, async () => {
      const doc = await roundTrip(hostile(text));
      expect(doc.getPageCount()).toBeGreaterThan(0);
    });
  }

  it('renders hostile content in titles and sender labels too', async () => {
    const prepared: PreparedConversation = {
      options: resolveExportOptions(),
      title: '🔥 Ünïcode 你好 title',
      items: [
        {
          kind: 'metadata',
          title: '🔥 Ünïcode 你好 title',
          createdAt: { iso: '2026-07-01T08:15:52Z', display: '2026-07-01 08:15 UTC' },
          updatedAt: undefined,
        },
        {
          kind: 'message',
          sender: '🤖',
          senderLabel: '🤖',
          timestamp: undefined,
          blocks: [{ kind: 'text', text: 'body' }],
        },
      ],
    };
    const doc = await roundTrip(prepared);
    // The (unsanitized) metadata title is preserved verbatim.
    expect(doc.getTitle()).toBe('🔥 Ünïcode 你好 title');
  });

  it('paginates a very long conversation and stays loadable', async () => {
    const longText = Array.from(
      { length: 120 },
      (_, i) => `Paragraph ${i} with enough words to wrap across the content width of the page.`,
    ).join('\n\n');
    const doc = await roundTrip(hostile(longText));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
