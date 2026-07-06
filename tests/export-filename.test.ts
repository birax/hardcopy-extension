import { describe, expect, it } from 'vitest';

import {
  buildExportFilename,
  DEFAULT_CONVERSATION_TITLE,
  DEFAULT_FILENAME_TEMPLATE,
  EXPORT_FORMATS,
} from '../src/lib/export';
import type { ExportFormat } from '../src/lib/export';
import { MAX_BASENAME_LENGTH } from '../src/lib/filename';

const DATE = '2026-06-25T19:40:07.882064Z';

describe('buildExportFilename', () => {
  it('renders the default template as "{title} - {date}.{ext}"', () => {
    expect(DEFAULT_FILENAME_TEMPLATE).toBe('{title} - {date}.{ext}');
    expect(
      buildExportFilename({ title: 'Birthday cake ideas', date: DATE, format: 'markdown' }),
    ).toBe('Birthday cake ideas - 2026-06-25.md');
  });

  it('uses the correct extension for every format', () => {
    const formats = Object.keys(EXPORT_FORMATS) as ExportFormat[];
    for (const format of formats) {
      const filename = buildExportFilename({ title: 'Notes', date: DATE, format });
      expect(filename).toBe(`Notes - 2026-06-25.${EXPORT_FORMATS[format].extension}`);
    }
  });

  it('accepts a Date object for the date', () => {
    const filename = buildExportFilename({
      title: 'Notes',
      date: new Date('2026-01-02T03:04:05Z'),
      format: 'text',
    });
    expect(filename).toBe('Notes - 2026-01-02.txt');
  });

  it('falls back to today for missing or unparsable dates', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(buildExportFilename({ title: 'Notes', format: 'markdown' })).toBe(`Notes - ${today}.md`);
    expect(buildExportFilename({ title: 'Notes', date: 'not-a-date', format: 'markdown' })).toBe(
      `Notes - ${today}.md`,
    );
  });

  it('preserves emoji and non-ASCII titles', () => {
    expect(buildExportFilename({ title: '🎂 Cake ideas 🎉', date: DATE, format: 'markdown' })).toBe(
      '🎂 Cake ideas 🎉 - 2026-06-25.md',
    );
    expect(buildExportFilename({ title: 'Résumé — 履歴書', date: DATE, format: 'pdf' })).toBe(
      'Résumé — 履歴書 - 2026-06-25.pdf',
    );
  });

  it('strips path separators and other illegal filesystem characters', () => {
    expect(
      buildExportFilename({ title: 'notes/2026\\draft: "final"?', date: DATE, format: 'text' }),
    ).toBe('notes 2026 draft final - 2026-06-25.txt');
  });

  it('falls back to a friendly title for empty or unusable titles', () => {
    for (const title of [undefined, '', '   ', '???', '...', 'CON']) {
      expect(buildExportFilename({ title, date: DATE, format: 'markdown' })).toBe(
        `${DEFAULT_CONVERSATION_TITLE} - 2026-06-25.md`,
      );
    }
  });

  it('keeps a title that is literally "conversation"', () => {
    expect(buildExportFilename({ title: 'conversation', date: DATE, format: 'markdown' })).toBe(
      'conversation - 2026-06-25.md',
    );
  });

  it('caps very long titles while keeping the date-stamped stem and extension valid', () => {
    const filename = buildExportFilename({ title: 'x'.repeat(500), date: DATE, format: 'docx' });
    expect(filename.endsWith('.docx')).toBe(true);
    expect(filename.length).toBeLessThanOrEqual(MAX_BASENAME_LENGTH + '.docx'.length);
    expect(filename.startsWith('xxx')).toBe(true);
  });

  it('supports custom templates', () => {
    expect(
      buildExportFilename({
        title: 'Notes',
        date: DATE,
        format: 'markdown',
        template: '{date} - {title}.{ext}',
      }),
    ).toBe('2026-06-25 - Notes.md');
  });

  it('appends the extension when a custom template omits it', () => {
    expect(
      buildExportFilename({ title: 'Notes', date: DATE, format: 'markdown', template: '{title}' }),
    ).toBe('Notes.md');
  });

  it('sanitizes what a custom template produces', () => {
    expect(
      buildExportFilename({
        title: 'Notes',
        date: DATE,
        format: 'markdown',
        template: 'claude/{title}.{ext}',
      }),
    ).toBe('claude Notes.md');
    // A template that renders to nothing still yields a usable name.
    expect(
      buildExportFilename({ title: 'Notes', date: DATE, format: 'markdown', template: '.{ext}' }),
    ).toBe('conversation.md');
  });
});
